const express = require("express");
const {
  beginAuth,
  clearSession,
  getOrCreateSession,
  getAuthorizedContext,
  validateRollAndParent,
  verifyRegistrationNumber,
  verifyDob,
  verifyParentPinAndIssueToken,
  normalizePhone
} = require("../services/authService");
const { sendListMessage, sendTextMessage } = require("../services/whatsappService");
const {
  buildMenuIntro,
  buildPrimaryMenuPayload,
  buildSecondaryMenuPayload,
  normalizeOptionSelection
} = require("../utils/menu");
const studentService = require("../services/studentService");

const router = express.Router();

function extractIncomingMessages(body) {
  const messages = [];
  const entries = body?.entry || [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      for (const msg of value.messages || []) {
        messages.push(msg);
      }
    }
  }

  return messages;
}

function getMessageText(msg) {
  if (msg?.type === "text") {
    return msg.text?.body || "";
  }
  if (msg?.type === "button") {
    return msg.button?.text || "";
  }
  if (msg?.type === "interactive") {
    const replyId = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id;
    if (replyId) {
      return replyId;
    }
    const title = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title;
    if (title) {
      return title;
    }
  }
  return "";
}

async function sendAuthenticatedMenus(toPhone, studentName) {
  await sendTextMessage(toPhone, buildMenuIntro(studentName));
  await sendListMessage(toPhone, buildPrimaryMenuPayload(studentName));
  await sendListMessage(toPhone, buildSecondaryMenuPayload(studentName));
}

function buildUnauthorizedMessage() {
  return [
    "Authentication failed.",
    "This WhatsApp number is not linked to the provided student.",
    "For security, student details are blocked.",
    "Please contact the institution admin to register your number correctly."
  ].join("\n");
}

function renderRows(rows, rowBuilder, emptyText) {
  if (!rows || !rows.length) {
    return emptyText;
  }

  return rows.map(rowBuilder).join("\n");
}

async function renderOptionResponse(option, studentId, parentId) {
  switch (option) {
    case "1": {
      const attendance = await studentService.getAttendance(studentId, parentId);
      if (!attendance) return "Access denied.";
      return `Attendance: ${attendance.attendance_percent}%\nLast Updated: ${attendance.updated_at}`;
    }
    case "2": {
      const marks = await studentService.getInternalMarks(studentId, parentId);
      if (!marks) return "Access denied.";
      return renderRows(
        marks,
        (m) =>
          `Sem ${m.semester} | ${m.subject}: I1=${m.internal1}, I2=${m.internal2}, I3=${m.internal3} (Updated: ${m.updated_at})`,
        "No internal marks available."
      );
    }
    case "3": {
      const cgpaRows = await studentService.getCgpaHistory(studentId, parentId);
      if (!cgpaRows) return "Access denied.";
      return renderRows(
        cgpaRows,
        (r) => `Sem ${r.semester}: SGPA=${r.sgpa}, CGPA=${r.cgpa} (Updated: ${r.updated_at})`,
        "No CGPA history available."
      );
    }
    case "4": {
      const b = await studentService.getBacklogs(studentId, parentId);
      if (!b) return "Access denied.";
      return `Backlogs: ${b.backlog_count}\nLast Updated: ${b.updated_at}`;
    }
    case "5": {
      const c = await studentService.getCounselor(studentId, parentId);
      if (!c) return "Access denied.";
      return [
        `Counselor: ${c.counselor_name}`,
        `Phone: ${c.counselor_phone}`,
        `Email: ${c.counselor_email}`,
        `Last Updated: ${c.updated_at}`
      ].join("\n");
    }
    case "6": {
      const fee = await studentService.getFeeStatus(studentId, parentId);
      if (!fee) return "Access denied.";
      return `Fee Status: ${fee.fee_status}\nLast Updated: ${fee.updated_at}`;
    }
    case "7": {
      const credits = await studentService.getCredits(studentId, parentId);
      if (!credits) return "Access denied.";
      return [
        `Total Credits: ${credits.total_credits}`,
        `Earned Credits: ${credits.earned_credits}`,
        `Pending Credits: ${Math.max(0, credits.total_credits - credits.earned_credits)}`,
        `Last Updated: ${credits.updated_at}`
      ].join("\n");
    }
    case "8": {
      const events = await studentService.getAcademicCalendar();
      return renderRows(
        events,
        (e) => `${e.event_date}: ${e.title} - ${e.description}`,
        "No academic calendar events available."
      );
    }
    case "9": {
      const exams = await studentService.getExamSchedule(studentId, parentId);
      if (!exams) return "Access denied.";
      return renderRows(
        exams,
        (e) => `${e.exam_date} ${e.exam_time} | ${e.subject} | ${e.hall}`,
        "No exam schedule available."
      );
    }
    case "10": {
      const suspension = await studentService.getSuspensionStatus(studentId, parentId);
      if (!suspension) return "Access denied.";
      return `Suspension Status: ${suspension.suspension_status}\nLast Updated: ${suspension.updated_at}`;
    }
    case "11": {
      const facultyRows = await studentService.getSemesterFaculty(studentId, parentId);
      if (!facultyRows) return "Access denied.";
      return renderRows(
        facultyRows,
        (f) =>
          `Sem ${f.semester} | ${f.subject}: ${f.faculty_name} (${f.faculty_email}, ${f.faculty_phone})`,
        "No faculty assignments available."
      );
    }
    case "12": {
      return "LOGOUT";
    }
    default:
      return "Invalid option. Please choose 1-12 from the menu.";
  }
}

async function handleIncomingMessage(msg) {
  const fromPhone = normalizePhone(msg.from);
  const text = getMessageText(msg).trim();
  const lowerText = text.toLowerCase();

  if (!fromPhone) {
    return;
  }

  const session = await getOrCreateSession(fromPhone);

  if (["hi", "hello", "start", "menu", "auth"].includes(lowerText)) {
    const authResult = await beginAuth(fromPhone);
    if (authResult.alreadyAuthenticated) {
      const authContext = await getAuthorizedContext(fromPhone);
      if (authContext) {
        const identity = await studentService.getStudentIdentity(authContext.studentId, authContext.parentId);
        if (identity) {
          await sendAuthenticatedMenus(fromPhone, identity.full_name);
          return;
        }
      }
    }

    await sendTextMessage(
      fromPhone,
      [
        "Secure Parent Authentication Started.",
        "Step 1/4: Enter your child roll number.",
        "Example: 22CSE1001"
      ].join("\n")
    );
    return;
  }

  if (lowerText === "logout") {
    await clearSession(fromPhone);
    await sendTextMessage(fromPhone, "You are logged out. Send HI to login again.");
    return;
  }

  if (session.auth_stage === "AWAIT_ROLL") {
    const mapping = await validateRollAndParent(fromPhone, text);
    if (!mapping) {
      await sendTextMessage(fromPhone, buildUnauthorizedMessage());
      return;
    }

    await sendTextMessage(
      fromPhone,
      [
        `Verified mapping for student ${mapping.full_name}.`,
        "Step 2/4: Enter student registration number."
      ].join("\n")
    );
    return;
  }

  if (session.auth_stage === "AWAIT_REGISTRATION") {
    const registrationCheck = await verifyRegistrationNumber(fromPhone, text);
    if (!registrationCheck.ok) {
      await sendTextMessage(fromPhone, "Registration number mismatch. Access blocked. Please retry with correct registration number.");
      return;
    }

    await sendTextMessage(
      fromPhone,
      [
        "Step 3/4: Enter student DOB in YYYY-MM-DD format.",
        "Example: 2004-10-15"
      ].join("\n")
    );
    return;
  }

  if (session.auth_stage === "AWAIT_DOB") {
    const dobCheck = await verifyDob(fromPhone, text);
    if (!dobCheck.ok) {
      await sendTextMessage(fromPhone, "DOB mismatch. Access blocked. Please retry with correct DOB (YYYY-MM-DD).");
      return;
    }

    await sendTextMessage(
      fromPhone,
      [
        "Step 4/4: Enter your Parent Security PIN.",
        "Your PIN is institution-issued and linked to this WhatsApp number."
      ].join("\n")
    );
    return;
  }

  if (session.auth_stage === "AWAIT_PIN") {
    const pinCheck = await verifyParentPinAndIssueToken(fromPhone, text);
    if (!pinCheck.ok) {
      await sendTextMessage(fromPhone, "Invalid PIN. Access blocked. Please try again.");
      return;
    }

    const authContext = await getAuthorizedContext(fromPhone);
    if (!authContext) {
      await sendTextMessage(fromPhone, "Session creation failed. Please send HI and authenticate again.");
      return;
    }

    const identity = await studentService.getStudentIdentity(authContext.studentId, authContext.parentId);
    if (!identity) {
      await sendTextMessage(fromPhone, "Authorized student mapping not found. Please contact admin.");
      return;
    }

    await sendTextMessage(
      fromPhone,
      [
        "Authentication successful.",
        `Parent: ${identity.parent_name} (${identity.relation})`,
        `Student: ${identity.full_name} [${identity.roll_number}]`,
        `Registration Number: ${identity.registration_number || "Not Set"}`
      ].join("\n")
    );
    await sendAuthenticatedMenus(fromPhone, identity.full_name);
    return;
  }

  const authContext = await getAuthorizedContext(fromPhone);
  if (!authContext) {
    await sendTextMessage(fromPhone, "Not authenticated. Send HI to begin secure authentication.");
    return;
  }

  const mappedOption = normalizeOptionSelection(text);

  const response = await renderOptionResponse(mappedOption, authContext.studentId, authContext.parentId);
  if (response === "LOGOUT") {
    await clearSession(fromPhone);
    await sendTextMessage(fromPhone, "Logged out successfully. Send HI to login again.");
    return;
  }

  await sendTextMessage(fromPhone, response);
  const identity = await studentService.getStudentIdentity(authContext.studentId, authContext.parentId);
  if (identity) {
    await sendAuthenticatedMenus(fromPhone, identity.full_name);
  }
}

router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (!mode && !token && !challenge) {
    res.status(200).json({
      message: "Webhook endpoint is active.",
      note: "This route is for WhatsApp verification callbacks, not normal browser usage.",
      try: ["GET /health", "Open / for admin dashboard"]
    });
    return;
  }

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }

  res.sendStatus(403);
});

router.post("/webhook", async (req, res) => {
  try {
    const messages = extractIncomingMessages(req.body);
    for (const msg of messages) {
      await handleIncomingMessage(msg);
    }
    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.sendStatus(500);
  }
});

module.exports = router;
