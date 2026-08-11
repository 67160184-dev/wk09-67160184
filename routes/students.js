const express = require("express");
const router = express.Router();

let students = [
  { id: 1, name: "สมชาย ใจดี", major: "วิทยาการคอมพิวเตอร์" },
  { id: 2, name: "สมหญิง รักเรียน", major: "เทคโนโลยีสารสนเทศ" },
];
let nextId = 3;

// 1. GET: ดึงรายการนักศึกษาทั้งหมด
router.get("/", (req, res) => {
  const { major } = req.query;
  let result = students;

  if (major) {
    result = students.filter((s) => s.major === major);
  }

  res.status(200).json({ message: "สำเร็จ", data: students });
});

// 2. GET: ดึงข้อมูลนักศึกษารายบุคคลตาม id
router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const student = students.find((s) => s.id === id);

  if (!student) {
    return res.status(404).json({ message: "ไม่พบข้อมูลนักศึกษา" });
  }

  res.status(200).json({ message: "สำเร็จ", data: student });
});

// 3. POST: เพิ่มข้อมูลนักศึกษาใหม่
router.post("/", (req, res) => {
  const { name, major } = req.body;
  // 1. ตรวจสอบว่ามีการส่งข้อมูลครบหรือไม่
  if (!name || !major) {
    return res
      .status(400)
      .json({ message: "กรุณาระบุ name และ major ให้ครบถ้วน" });
  }

  // 2. ตรวจสอบว่า name ต้องมีความยาวอย่างน้อย 2 ตัวอักษร
  if (name.length < 2) {
    return res
      .status(400)
      .json({ message: "ชื่อต้องมีความยาวอย่างน้อย 2 ตัวอักษร" });
  }

  // 3. ตรวจสอบว่ามีชื่อนี้ซ้ำกับข้อมูลที่มีอยู่แล้วหรือไม่
  const isDuplicate = students.some((s) => s.name === name);
  if (isDuplicate) {
    return res
      .status(409)
      .json({ message: "ข้อมูลชื่อนักศึกษานี้มีอยู่ในระบบแล้ว" });
  }

  const newStudent = { id: nextId++, name, major };
  students.push(newStudent);

  res.status(201).json({ message: "เพิ่มข้อมูลสำเร็จ", data: newStudent });
});

// 4. PUT: แก้ไขข้อมูลนักศึกษาทั้งระเบียน
router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const { name, major } = req.body;
  const student = students.find((s) => s.id === id);

  if (!student) {
    return res.status(404).json({ message: "ไม่พบข้อมูลนักศึกษา" });
  }

  if (!name || !major) {
    return res
      .status(400)
      .json({ message: "กรุณาระบุ name และ major ให้ครบถ้วน" });
  }

  student.name = name;
  student.major = major;

  res.status(200).json({ message: "แก้ไขข้อมูลสำเร็จ", data: student });
});

// 5. DELETE: ลบข้อมูลนักศึกษา
router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const index = students.findIndex((s) => s.id === id);

  if (index === -1) {
    return res.status(404).json({ message: "ไม่พบข้อมูลนักศึกษา" });
  }

  students.splice(index, 1);

  res.status(200).json({ message: "ลบข้อมูลสำเร็จ" });
});

module.exports = router;
