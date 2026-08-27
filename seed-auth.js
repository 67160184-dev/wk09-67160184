require("dotenv").config();
const pool = require("./db");
const { hashPassword } = require("./auth-helpers");

async function seedAuth() {
  try {
    const defaultPassword = await hashPassword("Passw0rd!");

    // Clean or upsert users
    await pool.query("DELETE FROM users WHERE email IN ('student1@example.com', 'admin1@example.com')");

    const [resStudent] = await pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES ('student1@example.com', ?, 'student')",
      [defaultPassword],
    );
    const studentUserId = resStudent.insertId;

    const [resAdmin] = await pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES ('admin1@example.com', ?, 'admin')",
      [defaultPassword],
    );
    const adminUserId = resAdmin.insertId;

    console.log(`✅ Seeded users:
- student1@example.com (id: ${studentUserId}, role: 'student', password: 'Passw0rd!')
- admin1@example.com (id: ${adminUserId}, role: 'admin', password: 'Passw0rd!')`);

    // Ensure student record with id=1 exists and links to student1@example.com
    const [existingStudent] = await pool.query("SELECT * FROM students WHERE id = 1");
    if (existingStudent.length === 0) {
      await pool.query(
        "INSERT INTO students (id, name, major, email, user_id) VALUES (1, 'สมชาย ใจดี', 'วิทยาการคอมพิวเตอร์', 'somchai@example.com', ?)",
        [studentUserId],
      );
      console.log("✅ Created student record with id = 1 linked to student1");
    } else {
      await pool.query("UPDATE students SET user_id = ? WHERE id = 1", [studentUserId]);
      console.log("✅ Updated student record id = 1 linked to student1");
    }
  } catch (err) {
    console.error("❌ Seed error:", err);
  } finally {
    await pool.end();
  }
}

seedAuth();
