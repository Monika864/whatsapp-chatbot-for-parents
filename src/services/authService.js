const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dayjs = require("dayjs");
const { get, run } = require("../db");

const sessionTtlMinutes = Number(process.env.SESSION_TTL_MINUTES || 20);

function buildSessionExpiry() {
  return dayjs().add(sessionTtlMinutes, "minute").toISOString();
}

function normalizePhone(rawPhone) {
  return String(rawPhone || "").replace(/\D/g, "");
}

async function getOrCreateSession(whatsappNumber) {
  const normalizedPhone = normalizePhone(whatsappNumber);
  const session = await get("SELECT * FROM chat_sessions WHERE whatsapp_number = ?", [normalizedPhone]);

  if (session) {
    return session;
  }

  await run(
    "INSERT INTO chat_sessions (whatsapp_number, auth_stage, is_authenticated) VALUES (?, 'INIT', 0)",
    [normalizedPhone]
  );

  return get("SELECT * FROM chat_sessions WHERE whatsapp_number = ?", [normalizedPhone]);
}

async function clearSession(whatsappNumber) {
  const normalizedPhone = normalizePhone(whatsappNumber);
  await run(
    `UPDATE chat_sessions
      SET parent_id = NULL,
          student_id = NULL,
          auth_stage = 'INIT',
          is_authenticated = 0,
          jwt_token = NULL,
          expires_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE whatsapp_number = ?`,
    [normalizedPhone]
  );
}

async function beginAuth(whatsappNumber) {
  const session = await getOrCreateSession(whatsappNumber);

  if (session.is_authenticated && session.expires_at && dayjs(session.expires_at).isAfter(dayjs())) {
    return {
      alreadyAuthenticated: true,
      session
    };
  }

  await run(
    "UPDATE chat_sessions SET auth_stage = 'AWAIT_ROLL', is_authenticated = 0, updated_at = CURRENT_TIMESTAMP WHERE whatsapp_number = ?",
    [normalizePhone(whatsappNumber)]
  );

  return {
    alreadyAuthenticated: false
  };
}

async function validateRollAndParent(whatsappNumber, rollNumber) {
  const normalizedPhone = normalizePhone(whatsappNumber);

  const mapping = await get(
    `SELECT
      p.id AS parent_id,
      s.id AS student_id,
      p.parent_name,
      p.relation,
      p.pin_hash,
      s.full_name,
      s.roll_number,
      s.registration_number,
      s.dob
    FROM parents p
    JOIN parent_student_map m ON m.parent_id = p.id
    JOIN students s ON s.id = m.student_id
    WHERE p.whatsapp_number = ? AND LOWER(s.roll_number) = LOWER(?)`,
    [normalizedPhone, rollNumber.trim()]
  );

  if (!mapping) {
    return null;
  }

  await run(
    `UPDATE chat_sessions
      SET parent_id = ?,
          student_id = ?,
          auth_stage = 'AWAIT_REGISTRATION',
          is_authenticated = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE whatsapp_number = ?`,
    [mapping.parent_id, mapping.student_id, normalizedPhone]
  );

  return mapping;
}

async function verifyRegistrationNumber(whatsappNumber, providedRegistrationNumber) {
  const session = await getOrCreateSession(whatsappNumber);
  if (!session.student_id) {
    return { ok: false, reason: "SESSION_INVALID" };
  }

  const student = await get("SELECT id, registration_number FROM students WHERE id = ?", [session.student_id]);
  if (!student) {
    return { ok: false, reason: "STUDENT_NOT_FOUND" };
  }

  const normalizedProvided = String(providedRegistrationNumber || "").trim().toLowerCase();
  const normalizedStored = String(student.registration_number || "").trim().toLowerCase();

  if (!normalizedProvided || normalizedProvided !== normalizedStored) {
    return { ok: false, reason: "REGISTRATION_MISMATCH" };
  }

  await run(
    "UPDATE chat_sessions SET auth_stage = 'AWAIT_DOB', updated_at = CURRENT_TIMESTAMP WHERE whatsapp_number = ?",
    [normalizePhone(whatsappNumber)]
  );

  return { ok: true };
}

async function verifyDob(whatsappNumber, providedDob) {
  const session = await getOrCreateSession(whatsappNumber);
  if (!session.student_id) {
    return { ok: false, reason: "SESSION_INVALID" };
  }

  const student = await get("SELECT id, dob FROM students WHERE id = ?", [session.student_id]);
  if (!student) {
    return { ok: false, reason: "STUDENT_NOT_FOUND" };
  }

  const normalizedProvided = String(providedDob || "").trim();
  if (normalizedProvided !== student.dob) {
    return { ok: false, reason: "DOB_MISMATCH" };
  }

  await run(
    "UPDATE chat_sessions SET auth_stage = 'AWAIT_PIN', updated_at = CURRENT_TIMESTAMP WHERE whatsapp_number = ?",
    [normalizePhone(whatsappNumber)]
  );

  return { ok: true };
}

async function verifyParentPinAndIssueToken(whatsappNumber, providedPin) {
  const session = await getOrCreateSession(whatsappNumber);
  if (!session.parent_id || !session.student_id) {
    return { ok: false, reason: "SESSION_INVALID" };
  }

  const parent = await get("SELECT id, pin_hash FROM parents WHERE id = ?", [session.parent_id]);
  if (!parent) {
    return { ok: false, reason: "PARENT_NOT_FOUND" };
  }

  const pinMatches = await bcrypt.compare(String(providedPin || "").trim(), parent.pin_hash);
  if (!pinMatches) {
    return { ok: false, reason: "PIN_MISMATCH" };
  }

  const expiresAt = buildSessionExpiry();
  const token = jwt.sign(
    {
      type: "parent-session",
      parentId: session.parent_id,
      studentId: session.student_id,
      phone: normalizePhone(whatsappNumber)
    },
    process.env.JWT_SECRET,
    { expiresIn: `${sessionTtlMinutes}m` }
  );

  await run(
    `UPDATE chat_sessions
      SET auth_stage = 'AUTHENTICATED',
          is_authenticated = 1,
          jwt_token = ?,
          expires_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE whatsapp_number = ?`,
    [token, expiresAt, normalizePhone(whatsappNumber)]
  );

  return { ok: true, token, expiresAt };
}

async function getAuthorizedContext(whatsappNumber) {
  const session = await getOrCreateSession(whatsappNumber);

  if (!session.is_authenticated || !session.jwt_token || !session.expires_at) {
    return null;
  }

  if (dayjs(session.expires_at).isBefore(dayjs())) {
    await clearSession(whatsappNumber);
    return null;
  }

  try {
    const payload = jwt.verify(session.jwt_token, process.env.JWT_SECRET);
    return {
      parentId: payload.parentId,
      studentId: payload.studentId,
      session
    };
  } catch {
    await clearSession(whatsappNumber);
    return null;
  }
}

module.exports = {
  normalizePhone,
  getOrCreateSession,
  beginAuth,
  clearSession,
  validateRollAndParent,
  verifyRegistrationNumber,
  verifyDob,
  verifyParentPinAndIssueToken,
  getAuthorizedContext
};
