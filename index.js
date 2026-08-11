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

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  }),
);
app.use(morgan("dev"));
app.use(express.json({ limit: "10kb" }));

// ==========================================
// REST Endpoints (MySQL Database)
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
  const { name, major, email } = req.body;

  if (!name || !major || !email) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "กรุณาระบุข้อมูลให้ครบถ้วน" },
    });
  }

  try {
    const [result] = await pool.query(
      "INSERT INTO students (name, major, email) VALUES (?, ?, ?)",
      [name, major, email],
    );
    res.status(201).json({
      message: "เพิ่มข้อมูลสำเร็จ",
      data: { id: result.insertId, name, major, email },
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

// แบบฝึกหัดที่ 1: ดึงรายวิชาที่นักศึกษาลงทะเบียน (ใช้ JOIN)
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

// แบบฝึกหัดที่ 3: ยกเลิกการลงทะเบียนเรียน (ใช้ Transaction)
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

// Start Server (สั่งเริ่มเซิร์ฟเวอร์ท้ายสุด)
app.listen(PORT, () => {
  console.log(`Server กำลังทำงานที่พอร์ต ${PORT} (${process.env.NODE_ENV})`);
});
