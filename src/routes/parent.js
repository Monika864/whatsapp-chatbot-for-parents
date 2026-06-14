const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");

const { get, run } = require("../db");
const studentService = require("../services/studentService");
const { normalizePhone } = require("../services/authService");
const { hasWhatsAppConfig, sendTextMessage } = require("../services/whatsappService");
const { sendOtpSms, hasSmsConfig } = require("../services/smsService");

const router = express.Router();
const otpTtlMinutes = Number(process.env.PARENT_OTP_TTL_MINUTES || 5);
const otpDevMode = String(process.env.OTP_DEV_MODE || "false").toLowerCase() === "true";

function normalizePhoneForMatch(rawPhone) {
  const digits = normalizePhone(rawPhone);
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }
  return digits;
}

function toE164FromStored(rawPhone) {
  const normalized = normalizePhoneForMatch(rawPhone);
  return normalized ? `+${normalized}` : "";
}

function getFirebaseAuth() {
  if (!admin.apps.length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON;

    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      // Falls back to GOOGLE_APPLICATION_CREDENTIALS if provided.
      admin.initializeApp();
    }
  }

  return admin.auth();
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function parentPortalAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ message: "Missing parent token" });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== "parent-portal") {
      res.status(403).json({ message: "Invalid token type" });
      return;
    }
    req.parentSession = payload;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

function renderRows(rows, formatter, emptyText) {
  if (!rows || !rows.length) {
    return emptyText;
  }
  return rows.map(formatter).join("\n");
}

async function renderOptionResponse(option, studentId, parentId) {
  const dashboard = await studentService.getParentDashboard(studentId, parentId);
  if (!dashboard) {
    return "Access denied for this student-parent mapping.";
  }

  switch (option) {
    case "1":
      return `Attendance: ${dashboard.attendance?.attendance_percent ?? 0}%`;
    case "2":
      return renderRows(
        dashboard.marks,
        (m) => `${m.subject}: I1=${m.internal1}, I2=${m.internal2}, I3=${m.internal3}`,
        "No internal marks available."
      );
    case "3":
      return renderRows(
        dashboard.cgpa,
        (r) => `Sem ${r.semester}: SGPA=${r.sgpa}, CGPA=${r.cgpa}`,
        "No CGPA history available."
      );
    case "4":
      return `Backlogs: ${dashboard.backlogs?.backlog_count ?? 0}`;
    case "5":
      return [
        `Counselor: ${dashboard.counselor?.counselor_name || "-"}`,
        `Phone: ${dashboard.counselor?.counselor_phone || "-"}`,
        `Email: ${dashboard.counselor?.counselor_email || "-"}`
      ].join("\n");
    case "6":
      return `Fee Status: ${dashboard.fee?.fee_status || "-"}`;
    case "7":
      return [
        `Total Credits: ${dashboard.credits?.total_credits ?? 0}`,
        `Earned Credits: ${dashboard.credits?.earned_credits ?? 0}`
      ].join("\n");
    case "8":
      return renderRows(
        dashboard.calendar,
        (e) => `${e.event_date}: ${e.title}`,
        "No academic events available."
      );
    case "9":
      return renderRows(
        dashboard.exams,
        (e) => `${e.exam_date} ${e.exam_time} | ${e.subject} | ${e.hall}`,
        "No exam schedule available."
      );
    case "10":
      return `Suspension Status: ${dashboard.suspension?.suspension_status || "No active suspension"}`;
    case "11":
      return renderRows(
        dashboard.faculty,
        (f) => `Sem ${f.semester} | ${f.subject}: ${f.faculty_name}`,
        "No faculty data available."
      );
    default:
      return "Please choose options 1 to 11.";
  }
}

async function getParentStudentMappingByRegistration(registrationNumber) {
  return get(
    `SELECT
      p.id AS parent_id,
      p.parent_name,
      p.relation,
      p.whatsapp_number,
      s.id AS student_id,
      s.full_name,
      s.registration_number
     FROM students s
     JOIN parent_student_map m ON m.student_id = s.id
     JOIN parents p ON p.id = m.parent_id
     WHERE LOWER(s.registration_number) = LOWER(?)`,
    [registrationNumber]
  );
}

router.post("/firebase/request-otp", async (req, res) => {
  const registrationNumber = String(req.body?.registrationNumber || "").trim();
  if (!registrationNumber) {
    res.status(400).json({ message: "Registration number is required" });
    return;
  }

  const mapping = await getParentStudentMappingByRegistration(registrationNumber);
  if (!mapping) {
    res.status(404).json({ message: "No registered parent found for that registration number" });
    return;
  }

  const e164Phone = toE164FromStored(mapping.whatsapp_number);
  if (!e164Phone) {
    res.status(400).json({ message: "No valid parent phone number found for this student" });
    return;
  }

  res.json({
    message: "Firebase OTP can be sent to the registered parent number",
    phoneHint: e164Phone.slice(-4).padStart(e164Phone.length, "*"),
    phoneNumber: e164Phone
  });
});

router.post("/firebase/verify-otp", async (req, res) => {
  const registrationNumber = String(req.body?.registrationNumber || "").trim();
  const firebaseIdToken = String(req.body?.firebaseIdToken || "").trim();

  if (!registrationNumber || !firebaseIdToken) {
    res.status(400).json({ message: "Registration number and Firebase ID token are required" });
    return;
  }

  const mapping = await getParentStudentMappingByRegistration(registrationNumber);
  if (!mapping) {
    res.status(404).json({ message: "No registered parent found for that registration number" });
    return;
  }

  let decoded;
  try {
    decoded = await getFirebaseAuth().verifyIdToken(firebaseIdToken);
  } catch {
    res.status(401).json({ message: "Invalid Firebase authentication token" });
    return;
  }

  const tokenPhone = normalizePhoneForMatch(decoded.phone_number || "");
  const parentPhone = normalizePhoneForMatch(mapping.whatsapp_number || "");

  if (!tokenPhone || tokenPhone !== parentPhone) {
    res.status(401).json({ message: "Firebase phone number does not match registered parent number" });
    return;
  }

  const token = jwt.sign(
    {
      type: "parent-portal",
      parentId: mapping.parent_id,
      studentId: mapping.student_id,
      registrationNumber: mapping.registration_number
    },
    process.env.JWT_SECRET,
    { expiresIn: "30m" }
  );

  res.json({
    token,
    parent: {
      name: mapping.parent_name,
      relation: mapping.relation,
      phone: toE164FromStored(mapping.whatsapp_number)
    },
    student: {
      fullName: mapping.full_name,
      registrationNumber: mapping.registration_number
    }
  });
});

router.post("/request-otp", async (req, res) => {
  const registrationNumber = String(req.body?.registrationNumber || "").trim();
  const providedPhone = normalizePhone(req.body?.phoneNumber || "");
  let deliveredViaDevMode = false;
  if (!registrationNumber || !providedPhone) {
    res.status(400).json({ message: "Registration number and phone number are required" });
    return;
  }

  const mapping = await get(
    `SELECT
      p.id AS parent_id,
      p.parent_name,
      p.whatsapp_number,
      s.id AS student_id,
      s.full_name,
      s.registration_number
     FROM students s
     JOIN parent_student_map m ON m.student_id = s.id
     JOIN parents p ON p.id = m.parent_id
     WHERE LOWER(s.registration_number) = LOWER(?)`,
    [registrationNumber]
  );

  if (!mapping) {
    res.status(404).json({ message: "No registered parent found for that registration number" });
    return;
  }

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);

  await run(
    `UPDATE parent_login_otps
     SET consumed_at = NOW()
     WHERE parent_id = ? AND student_id = ? AND consumed_at IS NULL`,
    [mapping.parent_id, mapping.student_id]
  );

  await run(
    `INSERT INTO parent_login_otps (parent_id, student_id, otp_hash, expires_at)
     VALUES (?, ?, ?, NOW() + (? * INTERVAL '1 minute'))`,
    [mapping.parent_id, mapping.student_id, otpHash, otpTtlMinutes]
  );

  // Delivery priority: SMS (Fast2SMS / Twilio) → WhatsApp
  try {
    if (hasSmsConfig()) {
      await sendOtpSms(providedPhone, otp, otpTtlMinutes);
    } else if (hasWhatsAppConfig()) {
      await sendTextMessage(
        providedPhone,
        [`Parent Portal OTP for ${mapping.full_name}`, `OTP: ${otp}`, `Valid for ${otpTtlMinutes} minutes.`].join("\n")
      );
    } else if (otpDevMode) {
      deliveredViaDevMode = true;
      console.log(`[DEV OTP -> ${providedPhone}] ${otp} (valid ${otpTtlMinutes} min)`);
    } else {
      res.status(503).json({
        message: "No OTP sender is configured. Add FAST2SMS_API_KEY or WhatsApp credentials, or enable OTP_DEV_MODE for local testing."
      });
      return;
    }
  } catch (deliveryErr) {
    if (otpDevMode) {
      deliveredViaDevMode = true;
      console.warn("[OTP delivery warning] Falling back to local dev OTP:", deliveryErr.message);
      console.log(`[DEV OTP -> ${providedPhone}] ${otp} (valid ${otpTtlMinutes} min)`);
    } else {
    console.error("[OTP delivery error]", deliveryErr.message);
    res.status(500).json({ message: `OTP delivery failed: ${deliveryErr.message}` });
    return;
    }
  }

  res.json({
    message: "OTP sent to the entered phone number",
    phoneHint: providedPhone.slice(-4).padStart(providedPhone.length, "*"),
    ...(deliveredViaDevMode ? { devOtp: otp } : {})
  });
});

router.post("/verify-otp", async (req, res) => {
  const registrationNumber = String(req.body?.registrationNumber || "").trim();
  const otp = String(req.body?.otp || "").trim();

  if (!registrationNumber || !otp) {
    res.status(400).json({ message: "Registration number and OTP are required" });
    return;
  }

  const mapping = await get(
    `SELECT
      p.id AS parent_id,
      p.parent_name,
      p.relation,
      p.whatsapp_number,
      s.id AS student_id,
      s.full_name,
      s.registration_number
     FROM students s
     JOIN parent_student_map m ON m.student_id = s.id
     JOIN parents p ON p.id = m.parent_id
     WHERE LOWER(s.registration_number) = LOWER(?)`,
    [registrationNumber]
  );

  if (!mapping) {
    res.status(404).json({ message: "No registered parent found for that registration number" });
    return;
  }

  const latestOtp = await get(
    `SELECT *
     FROM parent_login_otps
     WHERE parent_id = ? AND student_id = ? AND consumed_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [mapping.parent_id, mapping.student_id]
  );

  if (!latestOtp) {
    const expiredOtp = await get(
      `SELECT id FROM parent_login_otps
       WHERE parent_id = ? AND student_id = ? AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [mapping.parent_id, mapping.student_id]
    );

    if (expiredOtp) {
      await run("UPDATE parent_login_otps SET consumed_at = NOW() WHERE id = ?", [expiredOtp.id]);
      res.status(400).json({ message: "OTP expired. Request a new OTP." });
      return;
    }

    res.status(400).json({ message: "No active OTP found. Request a new OTP." });
    return;
  }

  const isOtpValid = await bcrypt.compare(otp, latestOtp.otp_hash);
  if (!isOtpValid) {
    res.status(401).json({ message: "Invalid OTP" });
    return;
  }

  await run("UPDATE parent_login_otps SET consumed_at = NOW() WHERE id = ?", [latestOtp.id]);

  const token = jwt.sign(
    {
      type: "parent-portal",
      parentId: mapping.parent_id,
      studentId: mapping.student_id,
      registrationNumber: mapping.registration_number
    },
    process.env.JWT_SECRET,
    { expiresIn: "30m" }
  );

  res.json({
    token,
    parent: {
      name: mapping.parent_name,
      relation: mapping.relation,
      phone: normalizePhone(mapping.whatsapp_number)
    },
    student: {
      fullName: mapping.full_name,
      registrationNumber: mapping.registration_number
    }
  });
});

router.get("/dashboard", parentPortalAuth, async (req, res) => {
  const dashboard = await studentService.getParentDashboard(
    req.parentSession.studentId,
    req.parentSession.parentId
  );

  if (!dashboard) {
    res.status(404).json({ message: "Student data not found for this parent session" });
    return;
  }

  res.json(dashboard);
});

router.post("/message", parentPortalAuth, async (req, res) => {
  const rawInput = String(req.body?.message || "").trim().toLowerCase();
  const option = {
    attendance: "1",
    "internal marks": "2",
    cgpa: "3",
    backlogs: "4",
    counselor: "5",
    fees: "6",
    credits: "7",
    calendar: "8",
    exams: "9",
    suspension: "10",
    faculty: "11"
  }[rawInput] || String(req.body?.message || "").trim();

  const response = await renderOptionResponse(
    option,
    req.parentSession.studentId,
    req.parentSession.parentId
  );

  res.json({
    botReply: response
  });
});

module.exports = router;
