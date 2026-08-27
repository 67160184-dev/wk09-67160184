require("dotenv").config();
const pool = require("./db");

async function runTest() {
  console.log("เริ่มทดสอบ Concurrent Queries (20 Requests)...");
  const startTime = Date.now();

  const queries = Array.from({ length: 20 }, (_, index) => {
    return pool.query("SELECT SLEEP(0.5) AS delay, ? AS id", [index + 1]);
  });

  try {
    await Promise.all(queries);
    const duration = (Date.now() - startTime) / 1000;
    console.log(`คำขอทั้งหมด 20 รายการทำงานสำเร็จในเวลา: ${duration} วินาที`);
  } catch (err) {
    console.error("เกิดข้อผิดพลาดระหว่างทดสอบ:", err);
  } finally {
    await pool.end();

  }
}

runTest();