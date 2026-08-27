# คำอธิบายกลไกการทำงานและการตรวจสอบ Signature ใน JWT

การที่ JSON Web Token (JWT) ที่ถูกแก้ไขข้อมูลแม้เพียงตัวอักษรเดียวถูกระบบปฏิเสธ เกิดจากกลไกการรักษาความถูกต้องของข้อมูลผ่าน **Digital Signature (ลายเซ็นดิจิทัล)**

## โครงสร้างของ JWT
JWT ประกอบด้วย 3 ส่วนที่เชื่อมต่อกันด้วยจุด (`.`) คือ `Header.Payload.Signature`
1. **Header**: ระบุประเภทของ Token และอัลกอริทึมการเข้ารหัส (เช่น HS256)
2. **Payload**: ข้อมูลสิทธิ์และ identity ของผู้ใช้งาน (เช่น `id`, `email`, `role`)
3. **Signature**: ส่วนที่เกิดจากการนำ `Header` (Base64Url) และ `Payload` (Base64Url) มาทำการเข้ารหัสแฮช (Hash) ร่วมกับ **`JWT_SECRET`** ซึ่งเป็นความลับที่รู้เฉพาะฝั่ง Server เท่านั้น

## กระบวนการตรวจสอบ (Verification)
เมื่อ Client ส่ง Token มาใน Header `Authorization: Bearer <token>` ตัว Server จะทำการ:
1. นำ `Header` และ `Payload` จาก Token ที่ส่งมา นำมาแฮชคู่กับ `JWT_SECRET` ของ Server อีกครั้ง เพื่อคำนวณหาค่า Signature ชุดใหม่ขึ้นมา
2. นำ Signature ที่ Server คำนวณได้ ไปเปรียบเทียบกับ Signature ที่แนบมากับ Token จาก Client

## เหตุผลที่ Token ถูกปฏิเสธเมื่อโดนดัดแปลง
เนื่องจากฟังก์ชันการแฮชทางรหัสผ่าน (Cryptographic Hash Function) มีคุณสมบัติ **Avalanche Effect** หากมีความเปลี่ยนแปลงของข้อมูลอินพุตแม้เพียงbit เดียว หรือตัวอักษรเดียว ไม่ว่าจะแก้ใน Payload หรือ Signature ผลลัพธ์จากการคำนวณ Signature ใหม่จะเปลี่ยนแปลงไปอย่างสิ้นเชิง 

เมื่อ Server นำ Signature ที่คำนวณใหม่ไปเทียบกับ Signature ที่ถูกแก้ไขมา ค่าจะไม่ตรงกัน Server จึงรับรู้ทันทีว่า Token ถูกปลอมแปลงและส่งสถานะ `401 Unauthorized` พร้อมข้อความ `INVALID_TOKEN` กลับไป เพื่อป้องกันการยกระดับสิทธิ์โดยมิชอบ