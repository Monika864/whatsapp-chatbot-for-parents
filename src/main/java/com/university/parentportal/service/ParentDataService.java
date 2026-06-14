package com.university.parentportal.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class ParentDataService {

    private final JdbcTemplate jdbcTemplate;

    public ParentDataService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Look up a student by registration number only.
     * No sender-phone validation — the OTP sent to the linked parent phone
     * is the sole authentication factor.
     */
    public Optional<StudentMapping> findByRegistration(String registrationNumber) {
        if (registrationNumber == null || registrationNumber.isBlank()) {
            return Optional.empty();
        }

        String sql = """
                SELECT
                  s.id AS student_id,
                  p.id AS parent_id,
                  s.full_name,
                  s.registration_number,
                  s.roll_number,
                  p.whatsapp_number AS parent_phone
                FROM students s
                JOIN parent_student_map m ON m.student_id = s.id
                JOIN parents p ON p.id = m.parent_id
                WHERE LOWER(s.registration_number) = LOWER(?)
                ORDER BY p.id
                LIMIT 1
                """;

        List<StudentMapping> rows = jdbcTemplate.query(
                sql,
                (rs, rowNum) -> new StudentMapping(
                        rs.getLong("student_id"),
                        rs.getLong("parent_id"),
                        rs.getString("full_name"),
                        rs.getString("registration_number"),
                        rs.getString("roll_number"),
                        rs.getString("parent_phone")
                ),
                registrationNumber
        );

        return rows.stream().findFirst();
    }

    /**
     * Find ALL students linked to this WhatsApp sender phone number.
     * Normalises to last-10-digits so it works regardless of whether
     * the DB stores numbers with or without the 91 country-code prefix.
     */
    public List<StudentMapping> findByWaId(String waId) {
        String normalizedWaId = normalizePhoneLast10(waId);
        if (normalizedWaId.isBlank()) {
            return List.of();
        }

        String sql = """
                SELECT
                  s.id AS student_id,
                  p.id AS parent_id,
                  s.full_name,
                  s.registration_number,
                  s.roll_number,
                  p.whatsapp_number AS parent_phone
                FROM students s
                JOIN parent_student_map m ON m.student_id = s.id
                JOIN parents p ON p.id = m.parent_id
                WHERE RIGHT(REGEXP_REPLACE(COALESCE(p.whatsapp_number, ''), '\\D', '', 'g'), 10) = ?
                ORDER BY s.full_name
                """;

        return jdbcTemplate.query(
                sql,
                (rs, rowNum) -> new StudentMapping(
                        rs.getLong("student_id"),
                        rs.getLong("parent_id"),
                        rs.getString("full_name"),
                        rs.getString("registration_number"),
                        rs.getString("roll_number"),
                        rs.getString("parent_phone")
                ),
                normalizedWaId
        );
    }

        private String normalizePhoneLast10(String rawPhone) {
                String digits = rawPhone == null ? "" : rawPhone.replaceAll("\\D", "");
                if (digits.length() <= 10) {
                        return digits;
                }
                return digits.substring(digits.length() - 10);
        }

    public AttendanceSummary getAttendance(long studentId) {
        String sql = """
                SELECT attendance_percent, updated_at
                FROM students
                WHERE id = ?
                """;

        return jdbcTemplate.queryForObject(
                sql,
                (rs, rowNum) -> new AttendanceSummary(
                        rs.getDouble("attendance_percent"),
                        rs.getObject("updated_at", java.time.OffsetDateTime.class)
                ),
                studentId
        );
    }

    public List<InternalMark> getInternalMarks(long studentId) {
        String sql = """
                SELECT semester, subject, internal1, internal2, internal3, updated_at
                FROM marks_internal
                WHERE student_id = ?
                ORDER BY semester DESC, subject ASC
                """;

        return jdbcTemplate.query(
                sql,
                (rs, rowNum) -> new InternalMark(
                        rs.getInt("semester"),
                        rs.getString("subject"),
                        rs.getDouble("internal1"),
                        rs.getDouble("internal2"),
                        rs.getDouble("internal3"),
                        rs.getObject("updated_at", java.time.OffsetDateTime.class)
                ),
                studentId
        );
    }

    public List<CgpaRow> getCgpaHistory(long studentId) {
        String sql = """
                SELECT semester, sgpa, cgpa, updated_at
                FROM cgpa_history
                WHERE student_id = ?
                ORDER BY semester DESC
                """;

        return jdbcTemplate.query(
                sql,
                (rs, rowNum) -> new CgpaRow(
                        rs.getInt("semester"),
                        rs.getDouble("sgpa"),
                        rs.getDouble("cgpa"),
                        rs.getObject("updated_at", java.time.OffsetDateTime.class)
                ),
                studentId
        );
    }

    public BacklogSummary getBacklogs(long studentId) {
        String sql = """
                SELECT backlog_count, updated_at
                FROM students
                WHERE id = ?
                """;

        return jdbcTemplate.queryForObject(
                sql,
                (rs, rowNum) -> new BacklogSummary(
                        rs.getInt("backlog_count"),
                        rs.getObject("updated_at", java.time.OffsetDateTime.class)
                ),
                studentId
        );
    }

    public CounselorInfo getCounselor(long studentId) {
        String sql = """
                SELECT counselor_name, counselor_phone, counselor_email, updated_at
                FROM students
                WHERE id = ?
                """;

        return jdbcTemplate.queryForObject(
                sql,
                (rs, rowNum) -> new CounselorInfo(
                        rs.getString("counselor_name"),
                        rs.getString("counselor_phone"),
                        rs.getString("counselor_email"),
                        rs.getObject("updated_at", java.time.OffsetDateTime.class)
                ),
                studentId
        );
    }

    public FeeStatus getFeeStatus(long studentId) {
        String sql = """
                SELECT fee_status, updated_at
                FROM students
                WHERE id = ?
                """;

        return jdbcTemplate.queryForObject(
                sql,
                (rs, rowNum) -> new FeeStatus(
                        rs.getString("fee_status"),
                        rs.getObject("updated_at", java.time.OffsetDateTime.class)
                ),
                studentId
        );
    }

    public CreditSummary getCredits(long studentId) {
        String sql = """
                SELECT total_credits, earned_credits, updated_at
                FROM students
                WHERE id = ?
                """;

        return jdbcTemplate.queryForObject(
                sql,
                (rs, rowNum) -> new CreditSummary(
                        rs.getInt("total_credits"),
                        rs.getInt("earned_credits"),
                        rs.getObject("updated_at", java.time.OffsetDateTime.class)
                ),
                studentId
        );
    }

    public List<AcademicEvent> getAcademicEvents() {
        String sql = """
                SELECT title, event_date, description, updated_at
                FROM academic_events
                ORDER BY event_date ASC
                """;

        return jdbcTemplate.query(
                sql,
                (rs, rowNum) -> new AcademicEvent(
                        rs.getString("title"),
                        rs.getString("event_date"),
                        rs.getString("description"),
                        rs.getObject("updated_at", java.time.OffsetDateTime.class)
                )
        );
    }

    public List<ExamRow> getExamSchedule(long studentId) {
        String sql = """
                SELECT semester, subject, exam_date, exam_time, hall, updated_at
                FROM exams
                WHERE student_id = ?
                ORDER BY exam_date ASC
                """;

        return jdbcTemplate.query(
                sql,
                (rs, rowNum) -> new ExamRow(
                        rs.getInt("semester"),
                        rs.getString("subject"),
                        rs.getString("exam_date"),
                        rs.getString("exam_time"),
                        rs.getString("hall"),
                        rs.getObject("updated_at", java.time.OffsetDateTime.class)
                ),
                studentId
        );
    }

    public SuspensionInfo getSuspensionStatus(long studentId) {
        String sql = """
                SELECT suspension_status, updated_at
                FROM students
                WHERE id = ?
                """;

        return jdbcTemplate.queryForObject(
                sql,
                (rs, rowNum) -> new SuspensionInfo(
                        rs.getString("suspension_status"),
                        rs.getObject("updated_at", java.time.OffsetDateTime.class)
                ),
                studentId
        );
    }

    public List<FacultyRow> getFacultyRows(long studentId) {
        String sql = """
                SELECT semester, subject, faculty_name, faculty_email, faculty_phone, updated_at
                FROM faculty_assignments
                WHERE student_id = ?
                ORDER BY semester DESC, subject ASC
                """;

        return jdbcTemplate.query(
                sql,
                (rs, rowNum) -> new FacultyRow(
                        rs.getInt("semester"),
                        rs.getString("subject"),
                        rs.getString("faculty_name"),
                        rs.getString("faculty_email"),
                        rs.getString("faculty_phone"),
                        rs.getObject("updated_at", java.time.OffsetDateTime.class)
                ),
                studentId
        );
    }

    public record StudentMapping(
            long studentId,
            long parentId,
            String studentName,
            String registrationNumber,
            String rollNumber,
            String parentPhone
    ) {
    }

    public record AttendanceSummary(double attendancePercent, java.time.OffsetDateTime updatedAt) {
    }

    public record InternalMark(
            int semester,
            String subject,
            double internal1,
            double internal2,
            double internal3,
            java.time.OffsetDateTime updatedAt
    ) {
    }

    public record CgpaRow(int semester, double sgpa, double cgpa, java.time.OffsetDateTime updatedAt) {
    }

    public record BacklogSummary(int backlogCount, java.time.OffsetDateTime updatedAt) {
    }

    public record CounselorInfo(String name, String phone, String email, java.time.OffsetDateTime updatedAt) {
    }

    public record FeeStatus(String feeStatus, java.time.OffsetDateTime updatedAt) {
    }

    public record CreditSummary(int totalCredits, int earnedCredits, java.time.OffsetDateTime updatedAt) {
    }

    public record AcademicEvent(String title, String eventDate, String description, java.time.OffsetDateTime updatedAt) {
    }

    public record ExamRow(
            int semester,
            String subject,
            String examDate,
            String examTime,
            String hall,
            java.time.OffsetDateTime updatedAt
    ) {
    }

    public record SuspensionInfo(String suspensionStatus, java.time.OffsetDateTime updatedAt) {
    }

    public record FacultyRow(
            int semester,
            String subject,
            String facultyName,
            String facultyEmail,
            String facultyPhone,
            java.time.OffsetDateTime updatedAt
    ) {
    }
}
