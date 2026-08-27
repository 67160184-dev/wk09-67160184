require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const { graphqlHTTP } = require("express-graphql");

// นำเข้า Connection Pool จาก db.js
const pool = require("./db");
const schema = require("./schema");
const root = require("./resolvers");

// นำเข้า Helpers และ Middlewares สำหรับ Authentication & RBAC
const {
  hashPassword,
  verifyPassword,
  generateToken,
} = require("./auth-helpers");
const { authenticateToken, authorizeRole } = require("./middlewares/auth");

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares พื้นฐาน
app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  }),
);
app.use(morgan("dev"));
app.use(express.json({ limit: "10kb" }));

// ==========================================
// Authentication Endpoints (ส่วนที่ 2 & ส่วนต่อยอด)
// ==========================================

// POST: สมัครสมาชิกใหม่ (กำหนด role = 'student' เสมอ)
app.post("/api/v1/auth/register", async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "กรุณาระบุ email และ password",
      },
    });
  }

  try {
    const passwordHash = await hashPassword(password);
    const [result] = await pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'student')",
      [email, passwordHash],
    );

    res.status(201).json({
      message: "สมัครสมาชิกสำเร็จ",
      data: { id: result.insertId, email, role: "student" },
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: { code: "DUPLICATE_EMAIL", message: "อีเมลนี้มีอยู่ในระบบแล้ว" },
      });
    }
    next(err);
  }
});

// POST: เข้าสู่ระบบ และออก JWT
app.post("/api/v1/auth/login", async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "กรุณาระบุ email และ password",
      },
    });
  }

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    if (rows.length === 0) {
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        },
      });
    }

    const user = rows[0];
    const isPasswordValid = await verifyPassword(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        },
      });
    }

    const token = generateToken(user);
    res.status(200).json({ message: "เข้าสู่ระบบสำเร็จ", token });
  } catch (err) {
    next(err);
  }
});

// GET: ดูข้อมูลบัญชีของตนเอง (Protected Route)
app.get("/api/v1/auth/me", authenticateToken, (req, res) => {
  res.status(200).json({ message: "สำเร็จ", data: req.user });
});

// PATCH: เปลี่ยนรหัสผ่าน (แบบฝึกหัดต่อยอดที่ 1)
app.patch(
  "/api/v1/auth/change-password",
  authenticateToken,
  async (req, res, next) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "กรุณาระบุ oldPassword และ newPassword",
        },
      });
    }

    try {
      const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [
        req.user.id,
      ]);

      if (rows.length === 0) {
        return res.status(404).json({
          error: { code: "USER_NOT_FOUND", message: "ไม่พบข้อมูลผู้ใช้งาน" },
        });
      }

      const user = rows[0];
      const isOldPasswordValid = await verifyPassword(
        oldPassword,
        user.password_hash,
      );

      if (!isOldPasswordValid) {
        return res.status(401).json({
          error: {
            code: "INVALID_CREDENTIALS",
            message: "รหัสผ่านเดิมไม่ถูกต้อง",
          },
        });
      }

      const newPasswordHash = await hashPassword(newPassword);
      await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [
        newPasswordHash,
        req.user.id,
      ]);

      res.status(200).json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });
    } catch (err) {
      next(err);
    }
  },
);

// ==========================================
// REST Endpoints (Students & Courses - MySQL Database)
// ==========================================

// GET: ดึงรายชื่อนักศึกษาทั้งหมด
app.get("/api/v1/students", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM students");
    res.status(200).json({ message: "สำเร็จ", data: rows });
  } catch (err) {
    next(err);
  }
});

// GET: ดึงข้อมูลนักศึกษารายบุคคล
app.get("/api/v1/students/:id", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM students WHERE id = ?", [
      req.params.id,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "ไม่พบข้อมูลนักศึกษา" },
      });
    }

    res.status(200).json({ message: "สำเร็จ", data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST: เพิ่มข้อมูลนักศึกษาใหม่
app.post("/api/v1/students", async (req, res, next) => {
  const { name, major, email, user_id } = req.body;

  if (!name || !major || !email) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "กรุณาระบุข้อมูลให้ครบถ้วน" },
    });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO students (name, major, email, user_id) VALUES (?, ?, ?, ?)",
      [name, major, email, user_id || null],
    );
    res.status(201).json({
      message: "เพิ่มข้อมูลสำเร็จ",
      data: { id: result.insertId, name, major, email, user_id: user_id || null },
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: { code: "DUPLICATE_EMAIL", message: "อีเมลนี้มีอยู่ในระบบแล้ว" },
      });
    }
    next(err);
  }
});

// PUT: แก้ไขข้อมูลนักศึกษา (แบบฝึกหัดต่อยอดที่ 2: Object-level Authorization)
app.put(
  "/api/v1/students/:id",
  authenticateToken,
  async (req, res, next) => {
    const studentId = req.params.id;
    const { name, major, email } = req.body;

    if (!name || !major) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "กรุณาระบุ name และ major ให้ครบถ้วน",
        },
      });
    }

    try {
      const [rows] = await pool.query(
        "SELECT * FROM students WHERE id = ?",
        [studentId],
      );

      if (rows.length === 0) {
        return res.status(404).json({
          error: { code: "NOT_FOUND", message: "ไม่พบข้อมูลนิสิต" },
        });
      }

      const student = rows[0];

      // Object-level Authorization:
      // หากผู้ใช้ไม่ใช่ admin และ user_id ของนักศึกษาไม่ตรงกับ req.user.id ให้ปฏิเสธ (403)
      if (req.user.role !== "admin" && student.user_id !== req.user.id) {
        return res.status(403).json({
          error: {
            code: "FORBIDDEN",
            message: "คุณไม่มีสิทธิ์เข้าถึงหรือแก้ไขทรัพยากรนี้",
          },
        });
      }

      if (email) {
        await pool.query(
          "UPDATE students SET name = ?, major = ?, email = ? WHERE id = ?",
          [name, major, email, studentId],
        );
      } else {
        await pool.query(
          "UPDATE students SET name = ?, major = ? WHERE id = ?",
          [name, major, studentId],
        );
      }

      const [updatedRows] = await pool.query(
        "SELECT * FROM students WHERE id = ?",
        [studentId],
      );

      res.status(200).json({
        message: "แก้ไขข้อมูลสำเร็จ",
        data: updatedRows[0],
      });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          error: { code: "DUPLICATE_EMAIL", message: "อีเมลนี้มีอยู่ในระบบแล้ว" },
        });
      }
      next(err);
    }
  },
);

// DELETE: ลบข้อมูลนักศึกษา (ขั้นตอนที่ 2.6: RBAC เฉพาะ admin เท่านั้น)
app.delete(
  "/api/v1/students/:id",
  authenticateToken,
  authorizeRole("admin"),
  async (req, res, next) => {
    try {
      const [result] = await pool.query("DELETE FROM students WHERE id = ?", [
        req.params.id,
      ]);
      if (result.affectedRows === 0) {
        return res.status(404).json({
          error: { code: "NOT_FOUND", message: "ไม่พบข้อมูลนิสิต" },
        });
      }
      res.status(200).json({ message: "ลบข้อมูลสำเร็จ" });
    } catch (err) {
      next(err);
    }
  },
);

// POST: ลงทะเบียนเรียน (พร้อม Transaction & Row Locking)
app.post("/api/v1/students/:id/enrollments", async (req, res, next) => {
  const studentId = req.params.id;
  const { courseId } = req.body;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // ล็อกข้อมูลวิชาเพื่อตรวจสอบที่นั่งว่าง
    const [courseRows] = await connection.query(
      "SELECT * FROM courses WHERE id = ? FOR UPDATE",
      [courseId],
    );

    if (courseRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        error: { code: "COURSE_NOT_FOUND", message: "ไม่พบรายวิชาที่ระบุ" },
      });
    }

    if (courseRows[0].seat_available <= 0) {
      await connection.rollback();
      return res.status(409).json({
        error: { code: "SEAT_FULL", message: "ที่นั่งเต็มแล้ว" },
      });
    }

    // บันทึกการลงทะเบียน
    await connection.query(
      "INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)",
      [studentId, courseId],
    );

    // ตัดจำนวนที่นั่งว่างลง 1
    await connection.query(
      "UPDATE courses SET seat_available = seat_available - 1 WHERE id = ?",
      [courseId],
    );

    await connection.commit();
    res.status(201).json({ message: "ลงทะเบียนสำเร็จ" });
  } catch (err) {
    await connection.rollback();
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: {
          code: "ALREADY_ENROLLED",
          message: "นักศึกษาลงทะเบียนรายวิชานี้ไปแล้ว",
        },
      });
    }
    next(err);
  } finally {
    connection.release();
  }
});

// GET: ดึงรายวิชาที่นักศึกษาลงทะเบียน (ใช้ JOIN)
app.get("/api/v1/students/:id/courses", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT courses.* FROM courses
       JOIN enrollments ON courses.id = enrollments.course_id
       WHERE enrollments.student_id = ?`,
      [req.params.id],
    );
    res.status(200).json({ message: "สำเร็จ", data: rows });
  } catch (err) {
    next(err);
  }
});

// DELETE: ยกเลิกการลงทะเบียนเรียน (ใช้ Transaction)
app.delete(
  "/api/v1/students/:id/enrollments/:courseId",
  async (req, res, next) => {
    const { id: studentId, courseId } = req.params;
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [result] = await connection.query(
        "DELETE FROM enrollments WHERE student_id = ? AND course_id = ?",
        [studentId, courseId],
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({
          error: {
            code: "ENROLLMENT_NOT_FOUND",
            message: "ไม่พบประวัติการลงทะเบียน",
          },
        });
      }

      // คืนจำนวนที่นั่งว่างกลับมา 1
      await connection.query(
        "UPDATE courses SET seat_available = seat_available + 1 WHERE id = ?",
        [courseId],
      );

      await connection.commit();
      res.status(200).json({ message: "ยกเลิกการลงทะเบียนสำเร็จ" });
    } catch (err) {
      await connection.rollback();
      next(err);
    } finally {
      connection.release();
    }
  },
);

// ==========================================
// GraphQL Endpoint (จากสัปดาห์ที่ 2)
// ==========================================
app.use(
  "/graphql",
  graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true,
  }),
);

// ==========================================
// Middlewares ท้ายสุด (404 & Error Handling)
// ==========================================

// 404: ไม่พบ route ที่ร้องขอ (ต้องวางไว้หลัง Route ทั้งหมด)
app.use((req, res) => {
  res.status(404).json({
    error: { code: "ROUTE_NOT_FOUND", message: "ไม่พบเส้นทางที่ร้องขอ" },
  });
});

// Error-handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);

  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    error: {
      code: statusCode === 500 ? "INTERNAL_SERVER_ERROR" : err.type || "ERROR",
      message:
        statusCode === 500
          ? "เกิดข้อผิดพลาดที่ไม่คาดคิดภายในระบบ"
          : err.message,
    },
  });
});

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server กำลังทำงานที่พอร์ต ${PORT} (${process.env.NODE_ENV})`);
  });
}

module.exports = app;
