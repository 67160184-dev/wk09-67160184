const request = require("supertest");
const app = require("./app");
const { generateToken } = require("./auth-helpers");
const { authorizeRole } = require("./middlewares/auth");

describe("RBAC middleware & Auth Middleware (Integration)", () => {
  test("ควรคืน 401 เมื่อ token ผิดรูปแบบ (แก้ไขตัวอักษรบางส่วน)", async () => {
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer invalid.token.here");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_TOKEN");
  });

  test("ควรคืน 403 เมื่อ role ไม่มีสิทธิ์เข้าถึง route", async () => {
    const studentToken = generateToken({
      id: 99,
      email: "student@example.com",
      role: "student",
    });

    const response = await request(app)
      .delete("/api/v1/students/1")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });
});

describe("authorizeRole middleware (Unit)", () => {
  test("ควรคืน 401 เมื่อ req.user ไม่มีค่า", () => {
    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    authorizeRole("admin")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "NO_TOKEN", message: "กรุณาเข้าสู่ระบบก่อนใช้งาน" },
    });
    expect(next).not.toHaveBeenCalled();
  });

  test("ควรเรียก next() เมื่อ role ของผู้ใช้มีสิทธิ์เข้าถึง", () => {
    const req = { user: { id: 1, role: "admin" } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    authorizeRole("admin", "teacher")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
