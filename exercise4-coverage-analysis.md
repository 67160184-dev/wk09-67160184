# แบบฝึกหัดที่ 4: ตั้งเป้า Coverage และวิเคราะห์ผลลัพธ์


---

## เป้าหมาย

ตั้งเป้าหมาย **Branch Coverage ≥ 70%** สำหรับไฟล์ `app.js` ทั้งไฟล์  
ไฟล์ทดสอบที่สร้างขึ้น: `app-coverage.test.js`

---

## ผลลัพธ์ Coverage

| รอบ | จำนวน Test Cases | Branch Coverage | บรรลุเป้าหมาย? |
|-----|-----------------|-----------------|---------------|
| ก่อนเพิ่ม (Baseline) | 12 | ~22% | ❌ |
| หลังเพิ่ม Group 1 (Auth) | 18 | ~42% | ❌ |
| หลังเพิ่ม Group 2 (GET /students) | 23 | ~58% | ❌ |
| หลังเพิ่ม Group 3 (Students CRUD) | 32 | ~72% | ✅ |
| หลังเพิ่ม Group 4+5 (ทั้งหมด) | **41** (31 cases ใน app-coverage.test.js) | **83.72%** | ✅ |

> **สรุป: เพิ่ม test ทั้งหมด 31 กรณี** ใน `app-coverage.test.js` จึงบรรลุเป้าหมาย (ได้ 83.72%)

---

## รายละเอียด Test ที่เพิ่มและ Branch ที่ครอบคลุม

### Group 1: Auth Endpoints Branches (6 test cases)

| # | Test Case | Branch ที่ครอบคลุม (บรรทัดใน app.js) |
|---|-----------|--------------------------------------|
| 1 | POST /login คืน 400 เมื่อขาด email/password | L85–L91: `if (!email || !password)` → true |
| 2 | POST /login คืน 401 เมื่อรหัสผ่านไม่ถูกต้อง | L111–L117: `if (!isPasswordValid)` → true |
| 3 | PATCH /change-password คืน 400 เมื่อขาด field | L139–L145: `if (!oldPassword || !newPassword)` → true |
| 4 | PATCH /change-password คืน 404 เมื่อไม่พบผู้ใช้ | L153–L156: `if (rows.length === 0)` → true |
| 5 | PATCH /change-password คืน 401 เมื่อรหัสผ่านเดิมผิด | L165–L171: `if (!isOldPasswordValid)` → true |
| 6 | PATCH /change-password คืน 200 เมื่อสำเร็จ | L174–L180: เส้นทาง success (update password hash) |

---

### Group 2: GET /students Branches (5 test cases)

| # | Test Case | Branch ที่ครอบคลุม (บรรทัดใน app.js) |
|---|-----------|--------------------------------------|
| 7 | GET /students คืนจาก cache เมื่อพบ key | L207–L212: `if (cached)` → true |
| 8 | GET /students ดึงจาก DB + มี major filter | L219–L222: `if (major)` → true |
| 9 | GET /students ดึงจาก DB ไม่มี major filter | L219: `if (major)` → false |
| 10 | GET /students/:id คืน 200 เมื่อพบข้อมูล | L257: `if (rows.length === 0)` → false |
| 11 | GET /students/:id คืน 404 เมื่อไม่พบข้อมูล | L257–L260: `if (rows.length === 0)` → true |

---

### Group 3: Students Mutation Branches (11 test cases)

| # | Test Case | Branch ที่ครอบคลุม (บรรทัดใน app.js) |
|---|-----------|--------------------------------------|
| 12 | POST /students คืน 400 เมื่อข้อมูลไม่ครบ | L273–L276: `if (!name || !major || !email)` → true |
| 13 | POST /students สำเร็จ + ล้าง cache เมื่อมี keys | L286–L289: `if (keys.length > 0)` → true |
| 14 | POST /students คืน 409 เมื่อ email ซ้ำ | L296–L299: `if (err.code === 'ER_DUP_ENTRY')` → true |
| 15 | PUT /students/:id คืน 400 เมื่อข้อมูลไม่ครบ | L313–L319: `if (!name || !major)` → true |
| 16 | PUT /students/:id คืน 404 เมื่อไม่พบนิสิต | L328–L331: `if (rows.length === 0)` → true |
| 17 | PUT /students/:id คืน 403 ไม่ใช่เจ้าของ+ไม่ใช่ admin | L337–L344: `if (role !== 'admin' && user_id !== req.user.id)` → true |
| 18 | PUT /students/:id สำเร็จ + อัปเดต email + ล้าง cache | L347: `if (email)` → true; L361: `if (keys.length > 0)` → true |
| 19 | PUT /students/:id สำเร็จ ไม่อัปเดต email ไม่มี cache | L352: `if (email)` → false; L361: `if (keys.length > 0)` → false |
| 20 | PUT /students/:id คืน 409 เมื่อ email ซ้ำ | L375–L378: `if (err.code === 'ER_DUP_ENTRY')` → true (ใน PUT) |
| 21 | DELETE /students/:id คืน 404 เมื่อไม่พบนิสิต | L395–L398: `if (result.affectedRows === 0)` → true |
| 22 | DELETE /students/:id สำเร็จ + ล้าง cache | L395: → false; L402–L404: `if (keys.length > 0)` → true |

---

### Group 4: Enrollments & Transaction Branches (7 test cases)

| # | Test Case | Branch ที่ครอบคลุม (บรรทัดใน app.js) |
|---|-----------|--------------------------------------|
| 23 | POST /enrollments คืน 404 เมื่อไม่พบวิชา | L429–L433: `if (courseRows.length === 0)` → true + rollback() |
| 24 | POST /enrollments คืน 409 เมื่อที่นั่งเต็ม | L436–L440: `if (seat_available <= 0)` → true + rollback() |
| 25 | POST /enrollments สำเร็จ | L429: false; L436: false → บันทึก + commit() |
| 26 | POST /enrollments คืน 409 เมื่อลงทะเบียนซ้ำ | L459–L465: `if (err.code === 'ER_DUP_ENTRY')` → true ใน catch |
| 27 | GET /students/:id/courses คืนรายวิชา | L475–L483: SELECT JOIN ปกติ |
| 28 | DELETE /enrollments/:courseId คืน 404 เมื่อไม่พบ | L503–L510: `if (result.affectedRows === 0)` → true + rollback() |
| 29 | DELETE /enrollments/:courseId สำเร็จ | L503: false → คืนที่นั่ง + commit() |

---

### Group 5: API v2, 404 & Error Handler (2 test cases)

| # | Test Case | Branch ที่ครอบคลุม (บรรทัดใน app.js) |
|---|-----------|--------------------------------------|
| 30 | GET /api/v2/students คืน `{ items, count }` | L540–L543: v2Router response structure ใหม่ |
| 31 | GET /api/invalid-route คืน 404 ROUTE_NOT_FOUND | L568–L571: 404 catch-all middleware |

---

## ผลลัพธ์สุดท้าย

```
File    | % Stmts | % Branch | % Funcs | % Lines | Uncovered Lines
--------|---------|----------|---------|---------|------------------------------------------
app.js  |  93.43  |  83.72   | 100.00  |  93.43  | 39,77,182,245,265,301,380,409,467,484,...
```

### Branches ที่ยังไม่ครอบคลุม (16.28% ที่เหลือ)

บรรทัดที่เหลือทั้งหมดเป็น **`next(err)` error fallback** ในแต่ละ route  
ซึ่งต้องการ mock ให้ DB/Redis โยน error ทั่วไป (ไม่ใช่ ER_DUP_ENTRY)  
แต่ไม่จำเป็นเพราะได้ **83.72% ≥ 70%** ตามเป้าหมายแล้ว

---

## คำตอบสรุป

> **เพิ่ม test ทั้งหมด 31 กรณี** ใน `app-coverage.test.js`  
> แบ่งเป็น 5 กลุ่มตามฟีเจอร์ ครอบคลุม branch หลักทั้งหมด  
> ผลลัพธ์สุดท้าย: **Branch Coverage = 83.72%** (เกินเป้า 70%)
