require("dotenv").config();
const pool = require("./db");

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('student', 'admin') NOT NULL DEFAULT 'student',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("users table ready");

    // Check if user_id exists in students
    const [cols] = await pool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'student_api' AND TABLE_NAME = 'students' AND COLUMN_NAME = 'user_id'
    `);

    if (cols.length === 0) {
      await pool.query(`ALTER TABLE students ADD COLUMN user_id INT NULL`);
      await pool.query(`ALTER TABLE students ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL`);
      console.log("user_id column and foreign key added to students table");
    } else {
      console.log("user_id column already exists in students table");
    }
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await pool.end();
  }
}

migrate();
