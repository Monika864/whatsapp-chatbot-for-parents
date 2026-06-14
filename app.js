const API_BASE_URL = "http://localhost:4000";

const authPanel = document.getElementById("authPanel");
const chatPanel = document.getElementById("chatPanel");
const requestOtpForm = document.getElementById("requestOtpForm");
const verifyOtpForm = document.getElementById("verifyOtpForm");
const chatWindow = document.getElementById("chatWindow");
const chatInputForm = document.getElementById("chatInputForm");
const chatInput = document.getElementById("chatInput");
const statusEl = document.getElementById("status");

let parentToken = "";

function setStatus(message, type = "ok") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function getRegistrationNumber() {
  return document.getElementById("registrationNumber").value.trim();
}

function getParentPhoneNumber() {
  return document.getElementById("parentPhoneNumber").value.trim();
}

async function api(path, method = "GET", body) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(parentToken ? { Authorization: `Bearer ${parentToken}` } : {})
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

function addMessage(type, text) {
  const message = document.createElement("div");
  message.className = `chat-bubble ${type}`;
  message.textContent = text;
  chatWindow.appendChild(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

async function sendChatMessage(message) {
  addMessage("parent", message);
  const response = await api("/api/parent/message", "POST", { message });
  addMessage("bot", response.botReply || "No response");
}

requestOtpForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const registrationNumber = getRegistrationNumber();
    const phoneNumber = getParentPhoneNumber();
    setStatus(`Sending OTP to ${phoneNumber}...`);
    const response = await api("/api/parent/request-otp", "POST", {
      registrationNumber,
      phoneNumber
    });

    verifyOtpForm.classList.remove("hidden");
    if (response.devOtp) {
      setStatus(`Test OTP for ${response.phoneHint}: ${response.devOtp}`);
    } else {
      setStatus(`OTP sent to ${response.phoneHint}. Check that phone.`);
    }
  } catch (error) {
    setStatus(error.message || "Failed to send OTP", "error");
    console.error("Send OTP error:", error);
  }
});

verifyOtpForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const registrationNumber = getRegistrationNumber();
    const otp = document.getElementById("otp").value.trim();
    const verification = await api("/api/parent/verify-otp", "POST", {
      registrationNumber,
      otp
    });

    parentToken = verification.token;
    authPanel.classList.add("hidden");
    chatPanel.classList.remove("hidden");
    addMessage(
      "bot",
      `Authentication successful for ${verification.student.fullName}. Choose an option: 1 Attendance, 2 Internal Marks, 3 CGPA, 4 Backlogs, 5 Counselor, 6 Fee Status, 7 Credits, 8 Calendar, 9 Exams, 10 Suspension, 11 Faculty.`
    );
    setStatus("Parent authenticated successfully");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

document.querySelectorAll(".option-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try {
      await sendChatMessage(btn.dataset.option);
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
});

chatInputForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) {
    return;
  }
  try {
    await sendChatMessage(message);
    chatInput.value = "";
  } catch (error) {
    setStatus(error.message, "error");
  }
});
