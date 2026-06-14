const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");
const loginPanel = document.getElementById("loginPanel");
const dataPanel = document.getElementById("dataPanel");

let adminToken = "";

function setStatus(message, type = "ok") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function getRoll() {
  return document.getElementById("roll").value.trim();
}

async function api(path, method = "GET", body) {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.message || "Request failed");
  }

  return payload;
}

async function loadData() {
  const roll = getRoll();
  if (!roll) {
    setStatus("Enter roll number first", "error");
    return;
  }

  const data = await api(`/api/admin/student/${encodeURIComponent(roll)}/all`);
  previewEl.textContent = JSON.stringify(data, null, 2);

  const s = data.student;
  document.getElementById("registration_number").value = s.registration_number || "";
  document.getElementById("attendance_percent").value = s.attendance_percent;
  document.getElementById("backlog_count").value = s.backlog_count;
  document.getElementById("fee_status").value = s.fee_status;
  document.getElementById("earned_credits").value = s.earned_credits;
  document.getElementById("total_credits").value = s.total_credits;
  document.getElementById("suspension_status").value = s.suspension_status;
  document.getElementById("counselor_name").value = s.counselor_name;
  document.getElementById("counselor_phone").value = s.counselor_phone;
  document.getElementById("counselor_email").value = s.counselor_email;
  document.getElementById("current_semester").value = s.current_semester;

  setStatus("Data loaded successfully");
}

document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const response = await api("/api/admin/login", "POST", { username, password });
    adminToken = response.token;
    loginPanel.classList.add("hidden");
    dataPanel.classList.remove("hidden");
    setStatus("Admin authenticated");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.getElementById("loadDataBtn").addEventListener("click", async () => {
  try {
    await loadData();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.getElementById("basicForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const roll = getRoll();
    await api(`/api/admin/student/${encodeURIComponent(roll)}/basic`, "PUT", {
      registration_number: document.getElementById("registration_number").value,
      attendance_percent: Number(document.getElementById("attendance_percent").value),
      backlog_count: Number(document.getElementById("backlog_count").value),
      fee_status: document.getElementById("fee_status").value,
      earned_credits: Number(document.getElementById("earned_credits").value),
      total_credits: Number(document.getElementById("total_credits").value),
      suspension_status: document.getElementById("suspension_status").value,
      counselor_name: document.getElementById("counselor_name").value,
      counselor_phone: document.getElementById("counselor_phone").value,
      counselor_email: document.getElementById("counselor_email").value,
      current_semester: Number(document.getElementById("current_semester").value)
    });
    await loadData();
    setStatus("Basic data updated");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.getElementById("marksForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const roll = getRoll();
    await api(`/api/admin/student/${encodeURIComponent(roll)}/marks`, "POST", {
      semester: Number(document.getElementById("marks_semester").value),
      subject: document.getElementById("marks_subject").value,
      internal1: Number(document.getElementById("internal1").value),
      internal2: Number(document.getElementById("internal2").value),
      internal3: Number(document.getElementById("internal3").value)
    });
    event.target.reset();
    await loadData();
    setStatus("Marks row added");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.getElementById("cgpaForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const roll = getRoll();
    await api(`/api/admin/student/${encodeURIComponent(roll)}/cgpa`, "POST", {
      semester: Number(document.getElementById("cgpa_semester").value),
      sgpa: Number(document.getElementById("sgpa").value),
      cgpa: Number(document.getElementById("cgpa").value)
    });
    event.target.reset();
    await loadData();
    setStatus("CGPA row added");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.getElementById("facultyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const roll = getRoll();
    await api(`/api/admin/student/${encodeURIComponent(roll)}/faculty`, "POST", {
      semester: Number(document.getElementById("faculty_semester").value),
      subject: document.getElementById("faculty_subject").value,
      faculty_name: document.getElementById("faculty_name").value,
      faculty_email: document.getElementById("faculty_email").value,
      faculty_phone: document.getElementById("faculty_phone").value
    });
    event.target.reset();
    await loadData();
    setStatus("Faculty row added");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.getElementById("examForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const roll = getRoll();
    await api(`/api/admin/student/${encodeURIComponent(roll)}/exam`, "POST", {
      semester: Number(document.getElementById("exam_semester").value),
      subject: document.getElementById("exam_subject").value,
      exam_date: document.getElementById("exam_date").value,
      exam_time: document.getElementById("exam_time").value,
      hall: document.getElementById("exam_hall").value
    });
    event.target.reset();
    await loadData();
    setStatus("Exam row added");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.getElementById("eventForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/admin/events", "POST", {
      title: document.getElementById("event_title").value,
      event_date: document.getElementById("event_date").value,
      description: document.getElementById("event_description").value
    });
    event.target.reset();
    await loadData();
    setStatus("Academic event added");
  } catch (error) {
    setStatus(error.message, "error");
  }
});
