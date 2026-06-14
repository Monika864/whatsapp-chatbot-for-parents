const PRIMARY_MENU_ROWS = [
  { id: "OPTION_1", title: "Attendance", description: "View current attendance percentage" },
  { id: "OPTION_2", title: "Internal Marks", description: "View subject-wise internal marks" },
  { id: "OPTION_3", title: "CGPA", description: "View current and previous CGPA" },
  { id: "OPTION_4", title: "Backlogs", description: "View backlog information" },
  { id: "OPTION_5", title: "Counselor Details", description: "View counselor contact details" },
  { id: "OPTION_6", title: "Fee Status", description: "View fee payment status" }
];

const SECONDARY_MENU_ROWS = [
  { id: "OPTION_7", title: "Credit Details", description: "View earned and pending credits" },
  { id: "OPTION_8", title: "Academic Calendar", description: "View academic events and calendar" },
  { id: "OPTION_9", title: "Exam Schedule", description: "View upcoming exams" },
  { id: "OPTION_10", title: "Suspension Status", description: "View disciplinary status" },
  { id: "OPTION_11", title: "Faculty Members", description: "View semester faculty members" },
  { id: "OPTION_12", title: "Logout", description: "End the authenticated session" }
];

function buildMenuIntro(studentName) {
  return `Hello ${studentName}'s Parent. Use the WhatsApp menu buttons below to view only your child's authenticated information.`;
}

function buildPrimaryMenuPayload(studentName) {
  return {
    header: `Student Menu: ${studentName}`,
    body: "Choose an academic option.",
    buttonText: "Open Academic Menu",
    sections: [
      {
        title: "Academic Information",
        rows: PRIMARY_MENU_ROWS
      }
    ]
  };
}

function buildSecondaryMenuPayload(studentName) {
  return {
    header: `More Options: ${studentName}`,
    body: "Choose another authenticated option.",
    buttonText: "Open More Options",
    sections: [
      {
        title: "Support and Account",
        rows: SECONDARY_MENU_ROWS
      }
    ]
  };
}

function normalizeOptionSelection(value) {
  const normalized = String(value || "").trim().toLowerCase();

  const map = {
    option_1: "1",
    option_2: "2",
    option_3: "3",
    option_4: "4",
    option_5: "5",
    option_6: "6",
    option_7: "7",
    option_8: "8",
    option_9: "9",
    option_10: "10",
    option_11: "11",
    option_12: "12",
    attendance: "1",
    "internal marks": "2",
    cgpa: "3",
    backlogs: "4",
    "counselor details": "5",
    counselor: "5",
    "fee status": "6",
    fees: "6",
    "credit details": "7",
    credits: "7",
    "academic calendar": "8",
    calendar: "8",
    "exam schedule": "9",
    exams: "9",
    "suspension status": "10",
    suspension: "10",
    "faculty members": "11",
    faculty: "11",
    logout: "12"
  };

  return map[normalized] || String(value || "").trim();
}

module.exports = {
  buildMenuIntro,
  buildPrimaryMenuPayload,
  buildSecondaryMenuPayload,
  normalizeOptionSelection
};
