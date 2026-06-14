const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { get, all, run } = require("../db");

const router = express.Router();

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ message: "Missing admin token" });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== "admin") {
      res.status(403).json({ message: "Invalid token type" });
      return;
    }
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  const configuredUser = process.env.ADMIN_USERNAME || "admin";
  const configuredPassword = process.env.ADMIN_PASSWORD || "ChangeThisAdminPassword!";

  if (username !== configuredUser) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const directMatch = password === configuredPassword;
  const hashMatch = configuredPassword.startsWith("$2")
    ? await bcrypt.compare(String(password || ""), configuredPassword)
    : false;

  if (!directMatch && !hashMatch) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  const token = jwt.sign(
    {
      type: "admin",
      username: configuredUser
    },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({ token });
});

router.get("/student/:roll/all", adminAuth, async (req, res) => {
  const roll = req.params.roll;
  const student = await get("SELECT * FROM students WHERE LOWER(roll_number) = LOWER(?)", [roll]);
  if (!student) {
    res.status(404).json({ message: "Student not found" });
    return;
  }

  const marks = await all("SELECT * FROM marks_internal WHERE student_id = ? ORDER BY semester DESC", [student.id]);
  const cgpa = await all("SELECT * FROM cgpa_history WHERE student_id = ? ORDER BY semester DESC", [student.id]);
  const faculty = await all("SELECT * FROM faculty_assignments WHERE student_id = ? ORDER BY semester DESC", [student.id]);
  const exams = await all("SELECT * FROM exams WHERE student_id = ? ORDER BY exam_date ASC", [student.id]);
  const events = await all("SELECT * FROM academic_events ORDER BY event_date ASC", []);

  res.json({ student, marks, cgpa, faculty, exams, events });
});

router.put("/student/:roll/basic", adminAuth, async (req, res) => {
  const roll = req.params.roll;
  const {
    attendance_percent,
    backlog_count,
    fee_status,
    earned_credits,
    total_credits,
    suspension_status,
    counselor_name,
    counselor_phone,
    counselor_email,
    current_semester,
    registration_number
  } = req.body || {};

  const result = await run(
    `UPDATE students
     SET attendance_percent = ?,
         backlog_count = ?,
         fee_status = ?,
         earned_credits = ?,
         total_credits = ?,
         suspension_status = ?,
         counselor_name = ?,
         counselor_phone = ?,
         counselor_email = ?,
         current_semester = ?,
         registration_number = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE LOWER(roll_number) = LOWER(?)`,
    [
      attendance_percent,
      backlog_count,
      fee_status,
      earned_credits,
      total_credits,
      suspension_status,
      counselor_name,
      counselor_phone,
      counselor_email,
      current_semester,
      registration_number,
      roll
    ]
  );

  if (!result.changes) {
    res.status(404).json({ message: "Student not found" });
    return;
  }

  res.json({ message: "Basic student data updated successfully" });
});

router.post("/student/:roll/marks", adminAuth, async (req, res) => {
  const roll = req.params.roll;
  const { semester, subject, internal1, internal2, internal3 } = req.body || {};

  const student = await get("SELECT id FROM students WHERE LOWER(roll_number) = LOWER(?)", [roll]);
  if (!student) {
    res.status(404).json({ message: "Student not found" });
    return;
  }

  await run(
    `INSERT INTO marks_internal (student_id, semester, subject, internal1, internal2, internal3, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [student.id, semester, subject, internal1, internal2, internal3]
  );

  res.json({ message: "Internal marks added" });
});

router.post("/student/:roll/cgpa", adminAuth, async (req, res) => {
  const roll = req.params.roll;
  const { semester, sgpa, cgpa } = req.body || {};

  const student = await get("SELECT id FROM students WHERE LOWER(roll_number) = LOWER(?)", [roll]);
  if (!student) {
    res.status(404).json({ message: "Student not found" });
    return;
  }

  await run(
    `INSERT INTO cgpa_history (student_id, semester, sgpa, cgpa, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [student.id, semester, sgpa, cgpa]
  );

  res.json({ message: "CGPA record added" });
});

router.post("/student/:roll/faculty", adminAuth, async (req, res) => {
  const roll = req.params.roll;
  const { semester, subject, faculty_name, faculty_email, faculty_phone } = req.body || {};

  const student = await get("SELECT id FROM students WHERE LOWER(roll_number) = LOWER(?)", [roll]);
  if (!student) {
    res.status(404).json({ message: "Student not found" });
    return;
  }

  await run(
    `INSERT INTO faculty_assignments (student_id, semester, subject, faculty_name, faculty_email, faculty_phone, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [student.id, semester, subject, faculty_name, faculty_email, faculty_phone]
  );

  res.json({ message: "Faculty assignment added" });
});

router.post("/student/:roll/exam", adminAuth, async (req, res) => {
  const roll = req.params.roll;
  const { semester, subject, exam_date, exam_time, hall } = req.body || {};

  const student = await get("SELECT id FROM students WHERE LOWER(roll_number) = LOWER(?)", [roll]);
  if (!student) {
    res.status(404).json({ message: "Student not found" });
    return;
  }

  await run(
    `INSERT INTO exams (student_id, semester, subject, exam_date, exam_time, hall, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [student.id, semester, subject, exam_date, exam_time, hall]
  );

  res.json({ message: "Exam schedule added" });
});

router.post("/events", adminAuth, async (req, res) => {
  const { title, event_date, description } = req.body || {};

  await run(
    `INSERT INTO academic_events (title, event_date, description, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
    [title, event_date, description]
  );

  res.json({ message: "Academic event added" });
});

module.exports = router;
