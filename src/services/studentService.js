const { get, all } = require("../db");

async function getStudentIdentity(studentId, parentId) {
  return get(
    `SELECT
      s.id,
      s.roll_number,
      s.registration_number,
      s.full_name,
      s.department,
      s.current_semester,
      s.updated_at,
      p.parent_name,
      p.relation
    FROM students s
    JOIN parent_student_map m ON m.student_id = s.id
    JOIN parents p ON p.id = m.parent_id
    WHERE s.id = ? AND p.id = ?`,
    [studentId, parentId]
  );
}

async function getAttendance(studentId, parentId) {
  return get(
    `SELECT s.attendance_percent, s.updated_at
     FROM students s
     JOIN parent_student_map m ON m.student_id = s.id
     WHERE s.id = ? AND m.parent_id = ?`,
    [studentId, parentId]
  );
}

async function getInternalMarks(studentId, parentId) {
  const authorized = await getStudentIdentity(studentId, parentId);
  if (!authorized) return null;

  return all(
    `SELECT semester, subject, internal1, internal2, internal3, updated_at
     FROM marks_internal
     WHERE student_id = ?
     ORDER BY semester DESC, subject ASC`,
    [studentId]
  );
}

async function getCgpaHistory(studentId, parentId) {
  const authorized = await getStudentIdentity(studentId, parentId);
  if (!authorized) return null;

  return all(
    `SELECT semester, sgpa, cgpa, updated_at
     FROM cgpa_history
     WHERE student_id = ?
     ORDER BY semester DESC`,
    [studentId]
  );
}

async function getBacklogs(studentId, parentId) {
  return get(
    `SELECT backlog_count, updated_at
     FROM students s
     JOIN parent_student_map m ON m.student_id = s.id
     WHERE s.id = ? AND m.parent_id = ?`,
    [studentId, parentId]
  );
}

async function getCounselor(studentId, parentId) {
  return get(
    `SELECT counselor_name, counselor_phone, counselor_email, updated_at
     FROM students s
     JOIN parent_student_map m ON m.student_id = s.id
     WHERE s.id = ? AND m.parent_id = ?`,
    [studentId, parentId]
  );
}

async function getFeeStatus(studentId, parentId) {
  return get(
    `SELECT fee_status, updated_at
     FROM students s
     JOIN parent_student_map m ON m.student_id = s.id
     WHERE s.id = ? AND m.parent_id = ?`,
    [studentId, parentId]
  );
}

async function getCredits(studentId, parentId) {
  return get(
    `SELECT total_credits, earned_credits, updated_at
     FROM students s
     JOIN parent_student_map m ON m.student_id = s.id
     WHERE s.id = ? AND m.parent_id = ?`,
    [studentId, parentId]
  );
}

async function getAcademicCalendar() {
  return all(
    `SELECT title, event_date, description, updated_at
     FROM academic_events
     ORDER BY event_date ASC`
  );
}

async function getExamSchedule(studentId, parentId) {
  const authorized = await getStudentIdentity(studentId, parentId);
  if (!authorized) return null;

  return all(
    `SELECT semester, subject, exam_date, exam_time, hall, updated_at
     FROM exams
     WHERE student_id = ?
     ORDER BY exam_date ASC`,
    [studentId]
  );
}

async function getSuspensionStatus(studentId, parentId) {
  return get(
    `SELECT suspension_status, updated_at
     FROM students s
     JOIN parent_student_map m ON m.student_id = s.id
     WHERE s.id = ? AND m.parent_id = ?`,
    [studentId, parentId]
  );
}

async function getSemesterFaculty(studentId, parentId) {
  const authorized = await getStudentIdentity(studentId, parentId);
  if (!authorized) return null;

  return all(
    `SELECT semester, subject, faculty_name, faculty_email, faculty_phone, updated_at
     FROM faculty_assignments
     WHERE student_id = ?
     ORDER BY semester DESC, subject ASC`,
    [studentId]
  );
}

async function getParentDashboard(studentId, parentId) {
  const identity = await getStudentIdentity(studentId, parentId);
  if (!identity) {
    return null;
  }

  const [attendance, marks, cgpa, backlogs, counselor, fee, credits, calendar, exams, suspension, faculty] = await Promise.all([
    getAttendance(studentId, parentId),
    getInternalMarks(studentId, parentId),
    getCgpaHistory(studentId, parentId),
    getBacklogs(studentId, parentId),
    getCounselor(studentId, parentId),
    getFeeStatus(studentId, parentId),
    getCredits(studentId, parentId),
    getAcademicCalendar(),
    getExamSchedule(studentId, parentId),
    getSuspensionStatus(studentId, parentId),
    getSemesterFaculty(studentId, parentId)
  ]);

  return {
    identity,
    attendance,
    marks,
    cgpa,
    backlogs,
    counselor,
    fee,
    credits,
    calendar,
    exams,
    suspension,
    faculty
  };
}

module.exports = {
  getStudentIdentity,
  getAttendance,
  getInternalMarks,
  getCgpaHistory,
  getBacklogs,
  getCounselor,
  getFeeStatus,
  getCredits,
  getAcademicCalendar,
  getExamSchedule,
  getSuspensionStatus,
  getSemesterFaculty,
  getParentDashboard
};
