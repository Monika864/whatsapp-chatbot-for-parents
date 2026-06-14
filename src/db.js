const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

function buildPoolConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : false,
      max: Number(process.env.PG_POOL_MAX || 20)
    };
  }

  return {
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER || "postgres",
    password: process.env.PG_PASSWORD || "postgres",
    database: process.env.PG_DATABASE || "parent_chatbot",
    ssl: process.env.PG_SSL === "true" ? { rejectUnauthorized: false } : false,
    max: Number(process.env.PG_POOL_MAX || 20)
  };
}

const db = new Pool(buildPoolConfig());

function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function run(sql, params = []) {
  let queryText = convertPlaceholders(sql);
  const isInsert = /^\s*insert\s+/i.test(queryText);
  const hasReturning = /\breturning\b/i.test(queryText);

  if (isInsert && !hasReturning) {
    queryText = `${queryText} RETURNING id`;
  }

  const result = await db.query(queryText, params);
  return {
    changes: result.rowCount,
    rowCount: result.rowCount,
    lastID: result.rows?.[0]?.id ?? null,
    rows: result.rows
  };
}

async function get(sql, params = []) {
  const queryText = convertPlaceholders(sql);
  const result = await db.query(queryText, params);
  return result.rows[0] || null;
}

async function all(sql, params = []) {
  const queryText = convertPlaceholders(sql);
  const result = await db.query(queryText, params);
  return result.rows;
}

async function ensureColumn(tableName, columnName, addColumnSql) {
  const col = await get(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`,
    [tableName, columnName]
  );

  if (!col) {
    await run(addColumnSql);
  }
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS parents (
      id SERIAL PRIMARY KEY,
      parent_name TEXT NOT NULL,
      whatsapp_number TEXT UNIQUE NOT NULL,
      relation TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      roll_number TEXT UNIQUE NOT NULL,
      registration_number TEXT UNIQUE,
      full_name TEXT NOT NULL,
      department TEXT NOT NULL,
      current_semester INTEGER NOT NULL,
      dob TEXT NOT NULL,
      counselor_name TEXT,
      counselor_phone TEXT,
      counselor_email TEXT,
      backlog_count INTEGER DEFAULT 0,
      fee_status TEXT DEFAULT 'Pending',
      total_credits INTEGER DEFAULT 0,
      earned_credits INTEGER DEFAULT 0,
      attendance_percent DOUBLE PRECISION DEFAULT 0,
      suspension_status TEXT DEFAULT 'None',
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS parent_student_map (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      UNIQUE(parent_id, student_id),
      CONSTRAINT fk_parent_map_parent FOREIGN KEY(parent_id) REFERENCES parents(id) ON DELETE CASCADE,
      CONSTRAINT fk_parent_map_student FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  await ensureColumn(
    "students",
    "registration_number",
    "ALTER TABLE students ADD COLUMN registration_number TEXT"
  );
  await run(
    "UPDATE students SET registration_number = roll_number WHERE registration_number IS NULL OR TRIM(registration_number) = ''"
  );
  await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_students_registration_number ON students(registration_number)");

  await run(`
    CREATE TABLE IF NOT EXISTS marks_internal (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL,
      semester INTEGER NOT NULL,
      subject TEXT NOT NULL,
      internal1 DOUBLE PRECISION DEFAULT 0,
      internal2 DOUBLE PRECISION DEFAULT 0,
      internal3 DOUBLE PRECISION DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW(),
      CONSTRAINT fk_marks_student FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS cgpa_history (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL,
      semester INTEGER NOT NULL,
      sgpa DOUBLE PRECISION NOT NULL,
      cgpa DOUBLE PRECISION NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW(),
      CONSTRAINT fk_cgpa_student FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS faculty_assignments (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL,
      semester INTEGER NOT NULL,
      subject TEXT NOT NULL,
      faculty_name TEXT NOT NULL,
      faculty_email TEXT,
      faculty_phone TEXT,
      updated_at TIMESTAMP DEFAULT NOW(),
      CONSTRAINT fk_faculty_student FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS academic_events (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      event_date TEXT NOT NULL,
      description TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS exams (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL,
      semester INTEGER NOT NULL,
      subject TEXT NOT NULL,
      exam_date TEXT NOT NULL,
      exam_time TEXT NOT NULL,
      hall TEXT,
      updated_at TIMESTAMP DEFAULT NOW(),
      CONSTRAINT fk_exams_student FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id SERIAL PRIMARY KEY,
      whatsapp_number TEXT UNIQUE NOT NULL,
      parent_id INTEGER,
      student_id INTEGER,
      auth_stage TEXT DEFAULT 'INIT',
      is_authenticated INTEGER DEFAULT 0,
      jwt_token TEXT,
      expires_at TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      CONSTRAINT fk_sessions_parent FOREIGN KEY(parent_id) REFERENCES parents(id) ON DELETE SET NULL,
      CONSTRAINT fk_sessions_student FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE SET NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS parent_login_otps (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      consumed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      CONSTRAINT fk_parent_otp_parent FOREIGN KEY(parent_id) REFERENCES parents(id) ON DELETE CASCADE,
      CONSTRAINT fk_parent_otp_student FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  const seededStudent = await get("SELECT id FROM students WHERE roll_number = ?", ["22CSE1001"]);
  if (!seededStudent) {
    const parentPinHash = await bcrypt.hash("4455", 10);
    const parent = await run(
      "INSERT INTO parents (parent_name, whatsapp_number, relation, pin_hash) VALUES (?, ?, ?, ?)",
      ["Meera Rao", "919999111222", "Mother", parentPinHash]
    );

    const student = await run(
      `INSERT INTO students (
        roll_number, registration_number, full_name, department, current_semester, dob, counselor_name,
        counselor_phone, counselor_email, backlog_count, fee_status,
        total_credits, earned_credits, attendance_percent, suspension_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "22CSE1001",
        "REG22CSE1001",
        "Arjun Rao",
        "Computer Science and Engineering",
        6,
        "2004-10-15",
        "Dr. Priya Menon",
        "+91 98888 77665",
        "priya.menon@college.edu",
        1,
        "Paid (Semester 6)",
        180,
        132,
        91.6,
        "No Active Suspension"
      ]
    );

    await run("INSERT INTO parent_student_map (parent_id, student_id) VALUES (?, ?)", [parent.lastID, student.lastID]);

    await run(
      "INSERT INTO marks_internal (student_id, semester, subject, internal1, internal2, internal3) VALUES (?, ?, ?, ?, ?, ?)",
      [student.lastID, 6, "Machine Learning", 24, 23, 25]
    );
    await run(
      "INSERT INTO marks_internal (student_id, semester, subject, internal1, internal2, internal3) VALUES (?, ?, ?, ?, ?, ?)",
      [student.lastID, 6, "Cloud Computing", 22, 24, 23]
    );

    await run(
      "INSERT INTO cgpa_history (student_id, semester, sgpa, cgpa) VALUES (?, ?, ?, ?)",
      [student.lastID, 5, 8.9, 8.72]
    );
    await run(
      "INSERT INTO cgpa_history (student_id, semester, sgpa, cgpa) VALUES (?, ?, ?, ?)",
      [student.lastID, 6, 9.1, 8.83]
    );

    await run(
      "INSERT INTO faculty_assignments (student_id, semester, subject, faculty_name, faculty_email, faculty_phone) VALUES (?, ?, ?, ?, ?, ?)",
      [student.lastID, 6, "Machine Learning", "Prof. Neha Iyer", "neha.iyer@college.edu", "+91 90000 12345"]
    );
    await run(
      "INSERT INTO faculty_assignments (student_id, semester, subject, faculty_name, faculty_email, faculty_phone) VALUES (?, ?, ?, ?, ?, ?)",
      [student.lastID, 6, "Cloud Computing", "Prof. Karthik R", "karthik.r@college.edu", "+91 90000 67890"]
    );

    await run(
      "INSERT INTO academic_events (title, event_date, description) VALUES (?, ?, ?)",
      ["Mid Semester Review", "2026-03-25", "Parents and students meeting with mentors"]
    );
    await run(
      "INSERT INTO academic_events (title, event_date, description) VALUES (?, ?, ?)",
      ["Project Expo", "2026-04-10", "Department level innovation showcase"]
    );

    await run(
      "INSERT INTO exams (student_id, semester, subject, exam_date, exam_time, hall) VALUES (?, ?, ?, ?, ?, ?)",
      [student.lastID, 6, "Machine Learning", "2026-04-20", "10:00 AM", "Block B, Hall 12"]
    );
    await run(
      "INSERT INTO exams (student_id, semester, subject, exam_date, exam_time, hall) VALUES (?, ?, ?, ?, ?, ?)",
      [student.lastID, 6, "Cloud Computing", "2026-04-22", "02:00 PM", "Block C, Hall 3"]
    );
  }

  const userSampleStudent = await get("SELECT id FROM students WHERE LOWER(registration_number) = LOWER(?)", ["231FA04827"]);
  if (!userSampleStudent) {
    const userParentPinHash = await bcrypt.hash("6281", 10);
    const userParent = await run(
      "INSERT INTO parents (parent_name, whatsapp_number, relation, pin_hash) VALUES (?, ?, ?, ?)",
      ["Thota Monika Parent", "6281327732", "Parent", userParentPinHash]
    );

    const userStudent = await run(
      `INSERT INTO students (
        roll_number, registration_number, full_name, department, current_semester, dob, counselor_name,
        counselor_phone, counselor_email, backlog_count, fee_status,
        total_credits, earned_credits, attendance_percent, suspension_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "23FA04827",
        "231FA04827",
        "Thota Monika",
        "Computer Science and Engineering",
        6,
        "2004-08-12",
        "Dr.Vinoj Sir",
        "+91 62813 27732",
        "vinoj.sir@college.edu",
        0,
        "Paid",
        180,
        128,
        89.4,
        "No Active Suspension"
      ]
    );

    await run("INSERT INTO parent_student_map (parent_id, student_id) VALUES (?, ?)", [userParent.lastID, userStudent.lastID]);

    await run(
      "INSERT INTO cgpa_history (student_id, semester, sgpa, cgpa) VALUES (?, ?, ?, ?)",
      [userStudent.lastID, 6, 8.2, 8.2]
    );

    await run(
      "INSERT INTO marks_internal (student_id, semester, subject, internal1, internal2, internal3) VALUES (?, ?, ?, ?, ?, ?)",
      [userStudent.lastID, 6, "Data Analytics", 22, 23, 24]
    );

    await run(
      "INSERT INTO faculty_assignments (student_id, semester, subject, faculty_name, faculty_email, faculty_phone) VALUES (?, ?, ?, ?, ?, ?)",
      [userStudent.lastID, 6, "Data Analytics", "Dr.Vinoj Sir", "vinoj.sir@college.edu", "+91 62813 27732"]
    );

    await run(
      "INSERT INTO exams (student_id, semester, subject, exam_date, exam_time, hall) VALUES (?, ?, ?, ?, ?, ?)",
      [userStudent.lastID, 6, "Data Analytics", "2026-04-24", "10:00 AM", "Block A, Hall 4"]
    );
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb
};
