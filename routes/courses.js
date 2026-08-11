const express = require("express");
const router = express.Router();

let courses = [
  { id: 1, courseCode: "CS101", courseName: "Introduction to Programming" },
  { id: 2, courseCode: "IT202", courseName: "Database Systems" },
];
let nextId = 3;

// 1. GET: ดึงรายการวิชาทั้งหมด
router.get("/", (req, res) => {
  res.status(200).json({ message: "สำเร็จ", data: courses });
});

// 2. GET: ดึงข้อมูลวิชาตาม id
router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const course = courses.find((c) => c.id === id);

  if (!course) {
    return res.status(404).json({ message: "ไม่พบข้อมูลวิชา" });
  }

  res.status(200).json({ message: "สำเร็จ", data: course });
});

// 3. POST: เพิ่มข้อมูลวิชาใหม่
router.post("/", (req, res) => {
  const { courseCode, courseName } = req.body;

  if (!courseCode || !courseName) {
    return res
      .status(400)
      .json({ message: "กรุณาระบุ courseCode และ courseName ให้ครบถ้วน" });
  }

  const newCourse = { id: nextId++, courseCode, courseName };
  courses.push(newCourse);

  res.status(201).json({ message: "เพิ่มข้อมูลสำเร็จ", data: newCourse });
});

// 4. PUT: แก้ไขข้อมูลวิชา  
router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  const { courseCode, courseName } = req.body;
  const course = courses.find((c) => c.id === id);

  if (!course) {
    return res.status(404).json({ message: "ไม่พบข้อมูลวิชา" });
  }

  if (!courseCode || !courseName    ) {
    return res
      .status(400)
      .json({ message: "กรุณาระบุ courseCode และ courseName ให้ครบถ้วน" });
  }

  course.courseCode = courseCode;
  course.courseName = courseName;

  res.status(200).json({ message: "แก้ไขข้อมูลสำเร็จ", data: course });
});

// 5. DELETE: ลบข้อมูลวิชา
router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const index = courses.findIndex((c) => c.id === id);

  if (index === -1) {
    return res.status(404).json({ message: "ไม่พบข้อมูลวิชา" });
  }

  courses.splice(index, 1);

  res.status(200).json({ message: "ลบข้อมูลสำเร็จ" });
});

module.exports = router;