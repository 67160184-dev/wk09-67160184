# บันทึกผลการทดสอบ Attack Scenario พื้นฐาน (สัปดาห์ที่ 4)

## 1. การทดสอบ Payload ขนาดใหญ่ผิดปกติ (Payload Too Large) - ขั้นตอนที่ 3.4

- **วิธีการทดสอบ:**
  ทำการตั้งค่า Pre-request Script ใน Postman เพื่อสร้าง String อักขระภาษาอังกฤษขนาด 15,000 ตัวอักษร (`"x".repeat(15000)`) ซึ่งคิดเป็นขนาดข้อมูลประมาณ 15KB แล้วส่งผ่าน Request Body แบบ JSON เข้าไปยัง Endpoint `POST /api/v1/students`

- **ผลการทดสอบ:**
  เซิร์ฟเวอร์ปฏิเสธการประมวลผลทันที และตอบกลับด้วย **Status Code 413 Payload Too Large** พร้อมรูปแบบ Error Response มาตรฐาน:
  ```json
  {
    "error": {
      "code": "entity.too.large",
      "message": "request entity too large"
    }
  }
  ```
