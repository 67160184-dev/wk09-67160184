require("dotenv").config();
const http = require("http");
const pool = require("./db");
const app = require("./index");
const jwt = require("jsonwebtoken");

let server;
let port = 3001;

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port: port,
        path: options.path,
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const parsed = body ? JSON.parse(body) : {};
            resolve({ status: res.statusCode, headers: res.headers, body: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, raw: body });
          }
        });
      },
    );

    req.on("error", reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log("=================================================");
  console.log("🚀 เริ่มต้นการทดสอบระบบ Authentication & RBAC (Wk06)");
  console.log("=================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName, details = "") {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${details}`);
    }
  }

  // Start temporary test server
  await new Promise((resolve) => {
    server = app.listen(port, resolve);
  });

  try {
    // 0. Clean test data
    await pool.query("DELETE FROM users WHERE email IN ('student1@example.com', 'admin1@example.com', 'student2@example.com')");
    await pool.query("DELETE FROM students WHERE email IN ('test_stu1@example.com', 'test_stu2@example.com', 'delete_target@example.com')");

    // -------------------------------------------------------------------
    // Step 2.4 / Step 3.1: Register Users
    // -------------------------------------------------------------------
    console.log("--- 1. ทดสอบการสมัครสมาชิก (POST /api/v1/auth/register) ---");

    const regStudentRes = await request(
      { path: "/api/v1/auth/register", method: "POST" },
      { email: "student1@example.com", password: "Passw0rd!" },
    );
    assert(
      regStudentRes.status === 201 && regStudentRes.body.data.role === "student",
      "สมัครสมาชิก student1 สำเร็จและได้ role เป็น student",
      JSON.stringify(regStudentRes.body),
    );

    const regAdminRes = await request(
      { path: "/api/v1/auth/register", method: "POST" },
      { email: "admin1@example.com", password: "Passw0rd!" },
    );
    assert(
      regAdminRes.status === 201 && regAdminRes.body.data.role === "student",
      "สมัครสมาชิก admin1 สำเร็จ (เริ่มต้นได้ role เป็น student)",
      JSON.stringify(regAdminRes.body),
    );

    // Duplicate email check
    const regDupRes = await request(
      { path: "/api/v1/auth/register", method: "POST" },
      { email: "student1@example.com", password: "AnotherPassword123" },
    );
    assert(
      regDupRes.status === 409 && regDupRes.body.error.code === "DUPLICATE_EMAIL",
      "ปฏิเสธการสมัครอีเมลซ้ำด้วย Status 409 DUPLICATE_EMAIL",
    );

    // Password Hash verification in DB
    const [userRows] = await pool.query("SELECT * FROM users WHERE email = 'student1@example.com'");
    const userInDb = userRows[0];
    assert(
      userInDb && userInDb.password_hash.startsWith("$2b$") && userInDb.password_hash !== "Passw0rd!",
      "รหัสผ่านในฐานข้อมูลถูกเข้ารหัสด้วย bcrypt ($2b$) ไม่ใช่ plain text",
      userInDb ? userInDb.password_hash : "null",
    );

    // Promote admin1 to role admin directly in MySQL
    console.log("\n--- 2. ปรับบทบาท admin1 ให้เป็น admin ผ่าน Database ---");
    await pool.query("UPDATE users SET role = 'admin' WHERE email = 'admin1@example.com'");
    const [adminRows] = await pool.query("SELECT * FROM users WHERE email = 'admin1@example.com'");
    assert(
      adminRows[0].role === "admin",
      "ปรับ role ของ admin1 ในฐานข้อมูลเป็น 'admin' สำเร็จ",
    );

    // -------------------------------------------------------------------
    // Step 3.2: Login
    // -------------------------------------------------------------------
    console.log("\n--- 3. ทดสอบการเข้าสู่ระบบ (POST /api/v1/auth/login) ---");

    // Invalid password
    const loginFailRes = await request(
      { path: "/api/v1/auth/login", method: "POST" },
      { email: "student1@example.com", password: "WrongPassword" },
    );
    assert(
      loginFailRes.status === 401 && loginFailRes.body.error.code === "INVALID_CREDENTIALS",
      "ปฏิเสธรหัสผ่านผิดด้วย Status 401 INVALID_CREDENTIALS",
    );

    // Invalid email
    const loginNonExistRes = await request(
      { path: "/api/v1/auth/login", method: "POST" },
      { email: "nobody@example.com", password: "Passw0rd!" },
    );
    assert(
      loginNonExistRes.status === 401 && loginNonExistRes.body.error.code === "INVALID_CREDENTIALS",
      "ปฏิเสธอีเมลที่ไม่มีในระบบด้วย Status 401 INVALID_CREDENTIALS",
    );

    // Login student1
    const loginStudentRes = await request(
      { path: "/api/v1/auth/login", method: "POST" },
      { email: "student1@example.com", password: "Passw0rd!" },
    );
    const studentToken = loginStudentRes.body.token;
    assert(
      loginStudentRes.status === 200 && !!studentToken,
      "เข้าสู่ระบบ student1 สำเร็จและได้รับ JWT token",
    );

    // Login admin1
    const loginAdminRes = await request(
      { path: "/api/v1/auth/login", method: "POST" },
      { email: "admin1@example.com", password: "Passw0rd!" },
    );
    const adminToken = loginAdminRes.body.token;
    assert(
      loginAdminRes.status === 200 && !!adminToken,
      "เข้าสู่ระบบ admin1 สำเร็จและได้รับ JWT token",
    );

    // -------------------------------------------------------------------
    // Step 3.3 - 3.7: Protected Route & RBAC Tests (5 จุดตรวจสอบ)
    // -------------------------------------------------------------------
    console.log("\n--- 4. ทดสอบ 5 กรณีมาตรฐาน (Protected Route & RBAC) ---");

    // Case 1: No token -> 401 NO_TOKEN
    const noTokenRes = await request({ path: "/api/v1/auth/me", method: "GET" });
    assert(
      noTokenRes.status === 401 && noTokenRes.body.error.code === "NO_TOKEN",
      "กรณี 1: ไม่แนบ Token ตอบกลับด้วย 401 NO_TOKEN",
      JSON.stringify(noTokenRes.body),
    );

    // Case 2: Valid student token -> 200 OK
    const validTokenRes = await request({
      path: "/api/v1/auth/me",
      method: "GET",
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert(
      validTokenRes.status === 200 &&
        validTokenRes.body.data.email === "student1@example.com" &&
        validTokenRes.body.data.role === "student",
      "กรณี 2: Token ถูกต้อง เรียกดูข้อมูลตนเองได้ Status 200 พร้อมข้อมูลผู้ใช้",
      JSON.stringify(validTokenRes.body),
    );

    // Create a target student for DELETE test
    const [delTargetResult] = await pool.query(
      "INSERT INTO students (name, major, email) VALUES ('ทดสอบ ลบ', 'คอมพิวเตอร์', 'delete_target@example.com')",
    );
    const targetStudentId = delTargetResult.insertId;

    // Case 3: DELETE with student role -> 403 FORBIDDEN
    const delStudentRes = await request({
      path: `/api/v1/students/${targetStudentId}`,
      method: "DELETE",
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert(
      delStudentRes.status === 403 && delStudentRes.body.error.code === "FORBIDDEN",
      "กรณี 3: ลบข้อมูลด้วยบทบาท student ตอบกลับด้วย 403 FORBIDDEN",
      JSON.stringify(delStudentRes.body),
    );

    // Case 4: DELETE with admin role -> 200 OK
    const delAdminRes = await request({
      path: `/api/v1/students/${targetStudentId}`,
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      delAdminRes.status === 200 && delAdminRes.body.message === "ลบข้อมูลสำเร็จ",
      "กรณี 4: ลบข้อมูลด้วยบทบาท admin ตอบกลับด้วย 200 ลบข้อมูลสำเร็จ",
      JSON.stringify(delAdminRes.body),
    );

    // Case 5: Tampered token -> 401 INVALID_TOKEN
    const tamperedToken = studentToken.slice(0, -5) + "ABCDE";
    const tamperedRes = await request({
      path: "/api/v1/auth/me",
      method: "GET",
      headers: { Authorization: `Bearer ${tamperedToken}` },
    });
    assert(
      tamperedRes.status === 401 && tamperedRes.body.error.code === "INVALID_TOKEN",
      "กรณี 5: Token ถูกดัดแปลงตัวอักษร ตอบกลับด้วย 401 INVALID_TOKEN",
      JSON.stringify(tamperedRes.body),
    );

    // -------------------------------------------------------------------
    // Exercise 1: Change Password
    // -------------------------------------------------------------------
    console.log("\n--- 5. แบบฝึกหัดที่ 1: เปลี่ยนรหัสผ่าน (PATCH /api/v1/auth/change-password) ---");

    // Wrong old password
    const changeWrongRes = await request(
      {
        path: "/api/v1/auth/change-password",
        method: "PATCH",
        headers: { Authorization: `Bearer ${studentToken}` },
      },
      { oldPassword: "WrongCurrentPassword", newPassword: "NewSecretPass999!" },
    );
    assert(
      changeWrongRes.status === 401 && changeWrongRes.body.error.code === "INVALID_CREDENTIALS",
      "ปฏิเสธการเปลี่ยนรหัสผ่านเมื่อ oldPassword ไม่ถูกต้อง (401)",
    );

    // Correct old password
    const changeSuccessRes = await request(
      {
        path: "/api/v1/auth/change-password",
        method: "PATCH",
        headers: { Authorization: `Bearer ${studentToken}` },
      },
      { oldPassword: "Passw0rd!", newPassword: "NewSecretPass999!" },
    );
    assert(
      changeSuccessRes.status === 200 && changeSuccessRes.body.message === "เปลี่ยนรหัสผ่านสำเร็จ",
      "เปลี่ยนรหัสผ่านสำเร็จเมื่อ oldPassword ถูกต้อง (200)",
    );

    // Verify login with old password fails
    const oldLoginCheck = await request(
      { path: "/api/v1/auth/login", method: "POST" },
      { email: "student1@example.com", password: "Passw0rd!" },
    );
    assert(oldLoginCheck.status === 401, "รหัสผ่านเดิมใช้งานไม่ได้อีกต่อไป (401)");

    // Verify login with new password succeeds
    const newLoginCheck = await request(
      { path: "/api/v1/auth/login", method: "POST" },
      { email: "student1@example.com", password: "NewSecretPass999!" },
    );
    assert(newLoginCheck.status === 200 && !!newLoginCheck.body.token, "เข้าสู่ระบบด้วยรหัสผ่านใหม่สำเร็จ (200)");
    const updatedStudentToken = newLoginCheck.body.token;

    // -------------------------------------------------------------------
    // Exercise 2: Object-level Authorization (PUT /api/v1/students/:id)
    // -------------------------------------------------------------------
    console.log("\n--- 6. แบบฝึกหัดที่ 2: Object-level Authorization (PUT /api/v1/students/:id) ---");

    // Register student 2
    await request(
      { path: "/api/v1/auth/register", method: "POST" },
      { email: "student2@example.com", password: "Passw0rd!" },
    );
    const loginStu2 = await request(
      { path: "/api/v1/auth/login", method: "POST" },
      { email: "student2@example.com", password: "Passw0rd!" },
    );
    const student2Token = loginStu2.body.token;
    const [stu2User] = await pool.query("SELECT id FROM users WHERE email = 'student2@example.com'");
    const [stu1User] = await pool.query("SELECT id FROM users WHERE email = 'student1@example.com'");

    // Create student records with user_id linkage
    const [resStu1Rec] = await pool.query(
      "INSERT INTO students (name, major, email, user_id) VALUES ('นิสิต คนที่หนึ่ง', 'วิทยาการคอมพิวเตอร์', 'test_stu1@example.com', ?)",
      [stu1User[0].id],
    );
    const stu1RecordId = resStu1Rec.insertId;

    const [resStu2Rec] = await pool.query(
      "INSERT INTO students (name, major, email, user_id) VALUES ('นิสิต คนที่สอง', 'เทคโนโลยีสารสนเทศ', 'test_stu2@example.com', ?)",
      [stu2User[0].id],
    );
    const stu2RecordId = resStu2Rec.insertId;

    // Student 2 tries to edit Student 1's record -> Expect 403 FORBIDDEN
    const editOtherRes = await request(
      {
        path: `/api/v1/students/${stu1RecordId}`,
        method: "PUT",
        headers: { Authorization: `Bearer ${student2Token}` },
      },
      { name: "แฮกเกอร์ พยายามแก้ไข", major: "วิทยาการคอมพิวเตอร์" },
    );
    assert(
      editOtherRes.status === 403 && editOtherRes.body.error.code === "FORBIDDEN",
      "ผู้ใช้อื่นพยายามแก้ไขข้อมูลที่ไม่ใช่ของตนเอง ถูกปฏิเสธด้วย 403 FORBIDDEN",
      JSON.stringify(editOtherRes.body),
    );

    // Student 1 edits their OWN record -> Expect 200 OK
    const editOwnRes = await request(
      {
        path: `/api/v1/students/${stu1RecordId}`,
        method: "PUT",
        headers: { Authorization: `Bearer ${updatedStudentToken}` },
      },
      { name: "นิสิต คนที่หนึ่ง (แก้ไขแล้ว)", major: "ปัญญาประดิษฐ์" },
    );
    assert(
      editOwnRes.status === 200 && editOwnRes.body.data.name === "นิสิต คนที่หนึ่ง (แก้ไขแล้ว)",
      "เจ้าของข้อมูลแก้ไขข้อมูลของตนเองสำเร็จ (200)",
      JSON.stringify(editOwnRes.body),
    );

    // Admin edits Student 1's record -> Expect 200 OK (Admin Override)
    const adminEditRes = await request(
      {
        path: `/api/v1/students/${stu1RecordId}`,
        method: "PUT",
        headers: { Authorization: `Bearer ${adminToken}` },
      },
      { name: "นิสิต คนที่หนึ่ง (แอดมินแก้ไข)", major: "วิทยาการข้อมูล" },
    );
    assert(
      adminEditRes.status === 200 && adminEditRes.body.data.name === "นิสิต คนที่หนึ่ง (แอดมินแก้ไข)",
      "Admin สามารถแก้ไขข้อมูลของนิสิตคนใดก็ได้สำเร็จ (200 Override)",
    );

    // -------------------------------------------------------------------
    // Exercise 3: Token Expiration Test
    // -------------------------------------------------------------------
    console.log("\n--- 7. แบบฝึกหัดที่ 3: ทดสอบ Token หมดอายุ (Token Expiration) ---");
    const shortLivedToken = jwt.sign(
      { id: stu1User[0].id, email: "student1@example.com", role: "student" },
      process.env.JWT_SECRET,
      { expiresIn: "1s" },
    );

    console.log("⏳ กำลังรอให้ Token หมดอายุ (1.5 วินาที)...");
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const expiredTokenRes = await request({
      path: "/api/v1/auth/me",
      method: "GET",
      headers: { Authorization: `Bearer ${shortLivedToken}` },
    });
    assert(
      expiredTokenRes.status === 401 && expiredTokenRes.body.error.code === "INVALID_TOKEN",
      "Token ที่หมดอายุแล้วถูกปฏิเสธด้วย Status 401 INVALID_TOKEN",
      JSON.stringify(expiredTokenRes.body),
    );

    // -------------------------------------------------------------------
    // Exercise 4: Stateless Logout Limitation Proof
    // -------------------------------------------------------------------
    console.log("\n--- 8. แบบฝึกหัดที่ 4: พิสูจน์ข้อจำกัด Stateless Logout ---");
    // Generate valid token
    const statelessToken = jwt.sign(
      { id: stu1User[0].id, email: "student1@example.com", role: "student" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    // Simulated "Client Logout" (Client discards token from local storage)
    // Simulated attacker still possessing the token calls GET /auth/me
    const replayedRes = await request({
      path: "/api/v1/auth/me",
      method: "GET",
      headers: { Authorization: `Bearer ${statelessToken}` },
    });
    assert(
      replayedRes.status === 200 && replayedRes.body.data.email === "student1@example.com",
      "Token เดิมยังคงเข้าถึงได้ (Status 200) แม้ฝั่ง client จะจำลองการ logout แล้ว พิสูจน์ลักษณะ Stateless",
    );

    console.log("\n=================================================");
    console.log(`🎉 ผลการทดสอบทั้งหมด: ผ่าน ${passedTests}/${totalTests} การทดสอบ`);
    console.log("=================================================");

  } catch (error) {
    console.error("❌ เกิดข้อผิดพลาดระหว่างรันการทดสอบ:", error);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await pool.end();
    process.exit(0);
  }
}

runTests();
