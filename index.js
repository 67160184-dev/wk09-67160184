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

// นำเข้า Redis Cache
const { redisClient, connectRedis } = require("./cache");

// นำเข้า Helpers และ Middlewares สำหรับ Authentication & RBAC
const {
  hashPassword,
  verifyPassword,
  generateToken,
} = require("./auth-helpers");
const { authenticateToken, authorizeRole } = require("./middlewares/auth");

// นำเข้า Middleware สำหรับ Pagination และ Sorting (ส่วนที่ 3)
const { parsePagination, parseSort } = require("./middlewares/query-parser");

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
// API v1 Router — Students & Courses
// ==========================================
const v1Router = express.Router();

// GET: ดึงรายชื่อนักศึกษาทั้งหมด (พร้อม Cache, Pagination, Filtering, Sorting)
v1Router.get(
  "/students",
  parsePagination,
  parseSort,
  async (req, res, next) => {
    const { major } = req.query;
    const { page, limit, offset } = req.pagination;
    const { field, order } = req.sort;

    // สร้าง cache key ที่ครอบคลุมพารามิเตอร์ทั้งหมด
    const cacheKey = `students:p${page}:l${limit}:major${major || "all"}:sort${field}:${order}`;

    try {
      // ตรวจสอบ cache ก่อน
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return res.status(200).json({
          message: "สำเร็จ (จาก cache)",
          ...JSON.parse(cached),
        });
      }

      let baseQuery = "SELECT * FROM students";
      let countQuery = "SELECT COUNT(*) AS total FROM students";
      const params = [];

      if (major) {
        baseQuery += " WHERE major = ?";
        countQuery += " WHERE major = ?";
        params.push(major);
      }

      baseQuery += ` ORDER BY ${field} ${order} LIMIT ? OFFSET ?`;

      const [rows] = await pool.query(baseQuery, [...params, limit, offset]);
      const [[{ total }]] = await pool.query(countQuery, params);

      const payload = {
        data: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };

      // บันทึกลง cache พร้อม TTL 60 วินาที
      await redisClient.set(cacheKey, JSON.stringify(payload), { EX: 60 });

      res.status(200).json({ message: "สำเร็จ (จากฐานข้อมูล)", ...payload });
    } catch (err) {
      next(err);
    }
  },
);

// GET: ดึงข้อมูลนักศึกษารายบุคคล
v1Router.get("/students/:id", async (req, res, next) => {
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

// POST: เพิ่มข้อมูลนักศึกษาใหม่ (พร้อมล้าง Cache)
v1Router.post("/students", async (req, res, next) => {
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

    // ล้าง cache ทั้งหมดที่เกี่ยวกับ students เนื่องจากข้อมูลเปลี่ยนแปลงแล้ว
    const keys = await redisClient.keys("students:*");
    if (keys.length > 0) {
      await redisClient.del(keys);
    }

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

// PUT: แก้ไขข้อมูลนักศึกษา (Object-level Authorization)
v1Router.put(
  "/students/:id",
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

      // ล้าง cache หลังแก้ไขข้อมูล
      const keys = await redisClient.keys("students:*");
      if (keys.length > 0) {
        await redisClient.del(keys);
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

// DELETE: ลบข้อมูลนักศึกษา (เฉพาะ admin เท่านั้น)
v1Router.delete(
  "/students/:id",
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

      // ล้าง cache หลังลบข้อมูล
      const keys = await redisClient.keys("students:*");
      if (keys.length > 0) {
        await redisClient.del(keys);
      }

      res.status(200).json({ message: "ลบข้อมูลสำเร็จ" });
    } catch (err) {
      next(err);
    }
  },
);

// POST: ลงทะเบียนเรียน (พร้อม Transaction & Row Locking)
v1Router.post("/students/:id/enrollments", async (req, res, next) => {
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
v1Router.get("/students/:id/courses", async (req, res, next) => {
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
v1Router.delete(
  "/students/:id/enrollments/:courseId",
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

// เชื่อม v1Router กับ prefix /api/v1
app.use("/api/v1", v1Router);

// ==========================================
// API v2 Router — ปรับโครงสร้าง response ใหม่ (Versioning)
// ==========================================
const v2Router = express.Router();

// GET /api/v2/students — คืนค่าโครงสร้างใหม่ ไม่มี wrapper "message"
v2Router.get("/students", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT * FROM students");
    // v2 ปรับโครงสร้างผลลัพธ์ใหม่ ไม่มี wrapper "message" เหมือน v1
    res.status(200).json({ items: rows, count: rows.length });
  } catch (err) {
    next(err);
  }
});

// เชื่อม v2Router กับ prefix /api/v2
app.use("/api/v2", v2Router);

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

// Start Server — เชื่อม Redis ก่อน จึงค่อย listen
if (require.main === module) {
  connectRedis().then(() => {
    app.listen(PORT, () => {
      console.log(`Server กำลังทำงานที่พอร์ต ${PORT} (${process.env.NODE_ENV})`);
    });
  });
}

module.exports = app;
