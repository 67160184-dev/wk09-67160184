jest.mock("./cache", () => ({
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
    keys: jest.fn(),
    del: jest.fn(),
  },
  connectRedis: jest.fn(),
}));

jest.mock("./db");
const pool = require("./db");
const { redisClient } = require("./cache");
const request = require("supertest");
const app = require("./app");
const { generateToken, hashPassword } = require("./auth-helpers");

describe("Exercise 4: Branch Coverage for app.js (>= 70%)", () => {
  let adminToken;
  let studentToken;

  beforeAll(() => {
    adminToken = generateToken({ id: 1, email: "admin@example.com", role: "admin" });
    studentToken = generateToken({ id: 2, email: "student@example.com", role: "student" });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // Group 1: Authentication & Password branches
  // ============================================================
  describe("Auth Endpoints Branches", () => {
    test("POST /login ควรคืน 400 เมื่อขาด email หรือ password (branch L85)", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "test@example.com" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    test("POST /login ควรคืน 401 เมื่อรหัสผ่านไม่ถูกต้อง (branch L111)", async () => {
      const hashedPassword = await hashPassword("CorrectPass1!");
      pool.query.mockResolvedValueOnce([
        [{ id: 1, email: "user@example.com", password_hash: hashedPassword, role: "student" }],
      ]);

      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "user@example.com", password: "WrongPassword" });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    });

    test("PATCH /change-password ควรคืน 400 เมื่อไม่ระบุ oldPassword หรือ newPassword (branch L139)", async () => {
      const response = await request(app)
        .patch("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ oldPassword: "old" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    test("PATCH /change-password ควรคืน 404 เมื่อไม่พบผู้ใช้งานในระบบ (branch L153)", async () => {
      pool.query.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .patch("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ oldPassword: "old", newPassword: "new" });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("USER_NOT_FOUND");
    });

    test("PATCH /change-password ควรคืน 401 เมื่อรหัสผ่านเดิมไม่ถูกต้อง (branch L165)", async () => {
      const hashedPassword = await hashPassword("RealOldPass1!");
      pool.query.mockResolvedValueOnce([
        [{ id: 2, email: "student@example.com", password_hash: hashedPassword }],
      ]);

      const response = await request(app)
        .patch("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ oldPassword: "WrongOldPass", newPassword: "newPass123" });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    });

    test("PATCH /change-password ควรคืน 200 เมื่อเปลี่ยนรหัสผ่านสำเร็จ (branch L174-180)", async () => {
      const hashedPassword = await hashPassword("RealOldPass1!");
      pool.query.mockResolvedValueOnce([
        [{ id: 2, email: "student@example.com", password_hash: hashedPassword }],
      ]);
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const response = await request(app)
        .patch("/api/v1/auth/change-password")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ oldPassword: "RealOldPass1!", newPassword: "NewPass123!" });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("เปลี่ยนรหัสผ่านสำเร็จ");
    });
  });

  // ============================================================
  // Group 2: Students Query & Cache branches
  // ============================================================
  describe("GET /students Branches", () => {
    test("GET /students ควรคืนข้อมูลจาก cache เมื่อพบคีย์ใน cache (branch L207 true)", async () => {
      const cachedData = {
        data: [{ id: 1, name: "สมชาย" }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      redisClient.get.mockResolvedValueOnce(JSON.stringify(cachedData));

      const response = await request(app).get("/api/v1/students?page=1&limit=10");

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("สำเร็จ (จาก cache)");
      expect(response.body.data[0].name).toBe("สมชาย");
    });

    test("GET /students ควรดึงจากฐานข้อมูลและรองรับ major filter (branch L219 true, L207 false)", async () => {
      redisClient.get.mockResolvedValueOnce(null);
      pool.query.mockResolvedValueOnce([[{ id: 1, name: "สมชาย", major: "CS" }]]);
      pool.query.mockResolvedValueOnce([[{ total: 1 }]]);

      const response = await request(app).get("/api/v1/students?major=CS");

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("สำเร็จ (จากฐานข้อมูล)");
    });

    test("GET /students ควรดึงจากฐานข้อมูลเมื่อไม่ระบุ major (branch L203, L219 false)", async () => {
      redisClient.get.mockResolvedValueOnce(null);
      pool.query.mockResolvedValueOnce([[{ id: 1, name: "สมชาย" }]]);
      pool.query.mockResolvedValueOnce([[{ total: 1 }]]);

      const response = await request(app).get("/api/v1/students");

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("สำเร็จ (จากฐานข้อมูล)");
    });

    test("GET /students/:id ควรคืน 200 เมื่อพบข้อมูลนักศึกษา (branch L257 false)", async () => {
      pool.query.mockResolvedValueOnce([[{ id: 1, name: "สมหญิง" }]]);

      const response = await request(app).get("/api/v1/students/1");

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe("สมหญิง");
    });

    test("GET /students/:id ควรคืน 404 เมื่อไม่พบข้อมูลนักศึกษา (branch L257 true)", async () => {
      pool.query.mockResolvedValueOnce([[]]);

      const response = await request(app).get("/api/v1/students/999");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  // ============================================================
  // Group 3: Students Mutation branches (POST, PUT, DELETE)
  // ============================================================
  describe("Students Mutation Branches", () => {
    test("POST /students ควรคืน 400 เมื่อส่งข้อมูลไม่ครบ (branch L273 true)", async () => {
      const response = await request(app)
        .post("/api/v1/students")
        .send({ name: "สมชาย" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    test("POST /students ควรเพิ่มสำเร็จและล้าง cache เมื่อมี keys (branch L282, L286 true)", async () => {
      pool.query.mockResolvedValueOnce([{ insertId: 5 }]);
      redisClient.keys.mockResolvedValueOnce(["students:cache1", "students:cache2"]);
      redisClient.del.mockResolvedValueOnce(2);

      const response = await request(app)
        .post("/api/v1/students")
        .send({ name: "สมศักดิ์", major: "IT", email: "somsak@example.com", user_id: 2 });

      expect(response.status).toBe(201);
      expect(response.body.data.id).toBe(5);
      expect(redisClient.del).toHaveBeenCalled();
    });

    test("POST /students ควรคืน 409 เมื่อ email ซ้ำ ER_DUP_ENTRY (branch L296 true)", async () => {
      const err = new Error("Duplicate");
      err.code = "ER_DUP_ENTRY";
      pool.query.mockRejectedValueOnce(err);

      const response = await request(app)
        .post("/api/v1/students")
        .send({ name: "สมศักดิ์", major: "IT", email: "dup@example.com" });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("DUPLICATE_EMAIL");
    });

    test("PUT /students/:id ควรคืน 400 เมื่อข้อมูลไม่ครบ (branch L313 true)", async () => {
      const response = await request(app)
        .put("/api/v1/students/1")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ name: "สมชาย" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    test("PUT /students/:id ควรคืน 404 เมื่อไม่พบข้อมูลนิสิต (branch L328 true)", async () => {
      pool.query.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .put("/api/v1/students/999")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ name: "สมชาย", major: "CS" });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    test("PUT /students/:id ควรคืน 403 เมื่อไม่ใช่ admin และไม่ใช่เจ้าของข้อมูล (branch L337 true)", async () => {
      // studentToken มี user.id = 2 แต่ข้อมูล student มี user_id = 99
      pool.query.mockResolvedValueOnce([[{ id: 1, user_id: 99, name: "คนอื่น" }]]);

      const response = await request(app)
        .put("/api/v1/students/1")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ name: "สมชาย", major: "CS" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    test("PUT /students/:id ควรแก้ไขสำเร็จพร้อมอัปเดต email และล้าง cache (branch L346 true, L360 true)", async () => {
      // studentToken มี user.id = 2 และ student มี user_id = 2 (เจ้าของ)
      pool.query.mockResolvedValueOnce([[{ id: 1, user_id: 2, name: "เดิม" }]]);
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      redisClient.keys.mockResolvedValueOnce(["students:cache1"]);
      redisClient.del.mockResolvedValueOnce(1);
      pool.query.mockResolvedValueOnce([[{ id: 1, user_id: 2, name: "ใหม่", email: "new@example.com" }]]);

      const response = await request(app)
        .put("/api/v1/students/1")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ name: "ใหม่", major: "CS", email: "new@example.com" });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("แก้ไขข้อมูลสำเร็จ");
    });

    test("PUT /students/:id ควรแก้ไขสำเร็จโดยไม่อัปเดต email (branch L346 false, L360 false)", async () => {
      // adminToken มี role = admin สามารถแก้ไขได้เสมอ
      pool.query.mockResolvedValueOnce([[{ id: 1, user_id: 99, name: "เดิม" }]]);
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      redisClient.keys.mockResolvedValueOnce([]); // keys ว่าง ไม่เข้า del
      pool.query.mockResolvedValueOnce([[{ id: 1, user_id: 99, name: "ใหม่" }]]);

      const response = await request(app)
        .put("/api/v1/students/1")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "ใหม่", major: "CS" });

      expect(response.status).toBe(200);
    });

    test("PUT /students/:id ควรคืน 409 เมื่อ email ซ้ำ ER_DUP_ENTRY (branch L375 true)", async () => {
      pool.query.mockResolvedValueOnce([[{ id: 1, user_id: 2 }]]);
      const err = new Error("Duplicate");
      err.code = "ER_DUP_ENTRY";
      pool.query.mockRejectedValueOnce(err);

      const response = await request(app)
        .put("/api/v1/students/1")
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ name: "ใหม่", major: "CS", email: "dup@example.com" });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("DUPLICATE_EMAIL");
    });

    test("DELETE /students/:id ควรคืน 404 เมื่อไม่พบนิสิตที่จะลบ (branch L395 true)", async () => {
      pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

      const response = await request(app)
        .delete("/api/v1/students/999")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    test("DELETE /students/:id ควรลบสำเร็จเมื่อพบข้อมูลและล้าง cache (branch L395 false, L402 true)", async () => {
      pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      redisClient.keys.mockResolvedValueOnce(["students:cache1"]);
      redisClient.del.mockResolvedValueOnce(1);

      const response = await request(app)
        .delete("/api/v1/students/1")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("ลบข้อมูลสำเร็จ");
    });
  });

  // ============================================================
  // Group 4: Enrollments & Transactions branches
  // ============================================================
  describe("Enrollments Branches", () => {
    let mockConnection;

    beforeEach(() => {
      mockConnection = {
        beginTransaction: jest.fn().mockResolvedValue(),
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        query: jest.fn(),
        release: jest.fn(),
      };
      pool.getConnection.mockResolvedValue(mockConnection);
    });

    test("POST /students/:id/enrollments ควรคืน 404 เมื่อไม่พบวิชา (branch L429 true)", async () => {
      mockConnection.query.mockResolvedValueOnce([[]]);

      const response = await request(app)
        .post("/api/v1/students/1/enrollments")
        .send({ courseId: 999 });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("COURSE_NOT_FOUND");
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    test("POST /students/:id/enrollments ควรคืน 409 เมื่อที่นั่งเต็ม (branch L436 true)", async () => {
      mockConnection.query.mockResolvedValueOnce([[{ id: 101, seat_available: 0 }]]);

      const response = await request(app)
        .post("/api/v1/students/1/enrollments")
        .send({ courseId: 101 });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("SEAT_FULL");
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    test("POST /students/:id/enrollments ควรสำเร็จเมื่อที่นั่งว่าง (branch L429 false, L436 false, L454)", async () => {
      mockConnection.query.mockResolvedValueOnce([[{ id: 101, seat_available: 5 }]]);
      mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const response = await request(app)
        .post("/api/v1/students/1/enrollments")
        .send({ courseId: 101 });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe("ลงทะเบียนสำเร็จ");
      expect(mockConnection.commit).toHaveBeenCalled();
    });

    test("POST /students/:id/enrollments ควรคืน 409 เมื่อลงทะเบียนซ้ำ ER_DUP_ENTRY (branch L459 true)", async () => {
      mockConnection.query.mockResolvedValueOnce([[{ id: 101, seat_available: 5 }]]);
      const err = new Error("Already enrolled");
      err.code = "ER_DUP_ENTRY";
      mockConnection.query.mockRejectedValueOnce(err);

      const response = await request(app)
        .post("/api/v1/students/1/enrollments")
        .send({ courseId: 101 });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("ALREADY_ENROLLED");
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    test("GET /students/:id/courses ควรคืนรายวิชาที่ลงทะเบียน (L475)", async () => {
      pool.query.mockResolvedValueOnce([[{ id: 101, code: "CS101", title: "Intro to CS" }]]);

      const response = await request(app).get("/api/v1/students/1/courses");

      expect(response.status).toBe(200);
      expect(response.body.data[0].code).toBe("CS101");
    });

    test("DELETE /students/:id/enrollments/:courseId ควรคืน 404 เมื่อไม่พบประวัติลงทะเบียน (branch L502 true)", async () => {
      mockConnection.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

      const response = await request(app).delete("/api/v1/students/1/enrollments/101");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("ENROLLMENT_NOT_FOUND");
      expect(mockConnection.rollback).toHaveBeenCalled();
    });

    test("DELETE /students/:id/enrollments/:courseId ควรยกเลิกสำเร็จ (branch L502 false, L519)", async () => {
      mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
      mockConnection.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const response = await request(app).delete("/api/v1/students/1/enrollments/101");

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("ยกเลิกการลงทะเบียนสำเร็จ");
      expect(mockConnection.commit).toHaveBeenCalled();
    });
  });

  // ============================================================
  // Group 5: API v2, 404 Handler, and Error Handling Branches
  // ============================================================
  describe("API v2, 404 & Error Handling Branches", () => {
    test("GET /api/v2/students ควรคืนโครงสร้างใหม่ { items, count } (L542)", async () => {
      pool.query.mockResolvedValueOnce([[{ id: 1, name: "ทดสอบ" }]]);

      const response = await request(app).get("/api/v2/students");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("items");
      expect(response.body.count).toBe(1);
    });

    test("GET /api/invalid-route ควรคืน 404 ROUTE_NOT_FOUND (branch L568)", async () => {
      const response = await request(app).get("/api/invalid-route");

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
    });
  });
});
