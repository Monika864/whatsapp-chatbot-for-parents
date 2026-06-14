package com.university.parentportal.service;

import com.university.parentportal.model.ConversationState;
import com.university.parentportal.repository.ConversationStateRepository;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

@Service
public class ChatbotService {

    private static final String STAGE_WAITING_FOR_REGISTRATION = "WAITING_FOR_REGISTRATION";
    private static final String STAGE_WAITING_FOR_OTP = "WAITING_FOR_OTP";
    private static final String STAGE_AUTHENTICATED_MENU = "AUTHENTICATED_MENU";
    private static final String STAGE_IDLE = "IDLE";
    private static final int OTP_TTL_MINUTES = 5;

    private final ConversationStateRepository conversationStateRepository;
    private final ParentDataService parentDataService;
    private final OtpSmsService otpSmsService;

    public ChatbotService(
            ConversationStateRepository conversationStateRepository,
            ParentDataService parentDataService,
            OtpSmsService otpSmsService
    ) {
        this.conversationStateRepository = conversationStateRepository;
        this.parentDataService = parentDataService;
        this.otpSmsService = otpSmsService;
    }

    public String getReply(String waId, String incomingText) {
        String normalized = incomingText == null ? "" : incomingText.trim();
        String lower = normalized.toLowerCase();

        ConversationState state = conversationStateRepository.findByWaId(waId)
                .orElseGet(() -> {
                    ConversationState s = new ConversationState();
                    s.setWaId(waId);
                    s.setStage(STAGE_IDLE);
                    return s;
                });

        if ("hi".equalsIgnoreCase(normalized) || "start".equalsIgnoreCase(normalized) || "menu".equalsIgnoreCase(normalized)) {
            resetState(state);
            state.setStage(STAGE_WAITING_FOR_REGISTRATION);
            conversationStateRepository.save(state);
            return "Welcome to University Parent Portal.\nPlease enter Student Registration Number to continue.";
        }

        if ("logout".equals(lower)) {
            resetState(state);
            state.setStage(STAGE_IDLE);
            conversationStateRepository.save(state);
            return "Logged out successfully. Type Hi to begin again.";
        }

        if (STAGE_WAITING_FOR_REGISTRATION.equals(state.getStage())) {
            if (normalized.isBlank()) {
                return "Please enter a valid registration number.";
            }

            var mappingOpt = parentDataService.findByRegistration(normalized);

            if (mappingOpt.isEmpty()) {
                return "Registration number not found. Please check and enter again.";
            }

            var mapping = mappingOpt.get();
            String otp = String.format("%06d", ThreadLocalRandom.current().nextInt(0, 1_000_000));
            boolean smsSent = otpSmsService.sendOtp(mapping.parentPhone(), otp, OTP_TTL_MINUTES);

            if (!smsSent) {
                state.setStage(STAGE_WAITING_FOR_REGISTRATION);
                state.setStudentId(null);
                state.setParentId(null);
                state.setRegistrationNumber(null);
                state.setPendingOtp(null);
                state.setPendingOtpExpiresAt(null);
                conversationStateRepository.save(state);
                return "Unable to send OTP to the linked phone number right now. Please re-enter registration number and try again.";
            }

            state.setStudentId(mapping.studentId());
            state.setParentId(mapping.parentId());
            state.setRegistrationNumber(mapping.registrationNumber());
            state.setPendingOtp(otp);
            state.setPendingOtpExpiresAt(OffsetDateTime.now().plusMinutes(OTP_TTL_MINUTES));
            state.setStage(STAGE_WAITING_FOR_OTP);
            conversationStateRepository.save(state);
            return "OTP sent to the parent phone linked with this registration number.\nPlease enter the 6-digit OTP.";
        }

        if (STAGE_WAITING_FOR_OTP.equals(state.getStage())) {
            if (!normalized.matches("\\d{6}")) {
                return "Please enter valid 6-digit OTP.";
            }

            if (state.getPendingOtpExpiresAt() == null || state.getPendingOtpExpiresAt().isBefore(OffsetDateTime.now())) {
                state.setStage(STAGE_WAITING_FOR_REGISTRATION);
                state.setPendingOtp(null);
                state.setPendingOtpExpiresAt(null);
                conversationStateRepository.save(state);
                return "OTP expired. Please enter registration number again to get new OTP.";
            }

            if (!normalized.equals(state.getPendingOtp())) {
                return "Invalid OTP. Please try again.";
            }

            state.setPendingOtp(null);
            state.setPendingOtpExpiresAt(null);
            state.setStage(STAGE_AUTHENTICATED_MENU);
            conversationStateRepository.save(state);

            return "Authentication successful.\nPlease enter option number.";
        }

        if (STAGE_AUTHENTICATED_MENU.equals(state.getStage())) {
            if (state.getStudentId() == null) {
                resetState(state);
                conversationStateRepository.save(state);
                return "Session invalid. Please type Hi to begin again.";
            }

            return switch (normalized) {
                case "1" -> {
                    var attendance = parentDataService.getAttendance(state.getStudentId());
                    yield "Attendance: " + attendance.attendancePercent() + "%\nLast Updated: " + attendance.updatedAt();
                }
                case "2" -> {
                    List<ParentDataService.InternalMark> marks = parentDataService.getInternalMarks(state.getStudentId());
                    if (marks.isEmpty()) {
                        yield "No internal marks found for this student.";
                    }
                    String text = marks.stream()
                            .map(m -> "Sem " + m.semester() + " | " + m.subject()
                                    + ": I1=" + m.internal1() + ", I2=" + m.internal2() + ", I3=" + m.internal3())
                            .collect(Collectors.joining("\n"));
                    yield "Internal Marks:\n" + text;
                }
                case "3" -> {
                    List<ParentDataService.CgpaRow> rows = parentDataService.getCgpaHistory(state.getStudentId());
                    if (rows.isEmpty()) {
                        yield "No CGPA history found for this student.";
                    }
                    String text = rows.stream()
                            .map(r -> "Sem " + r.semester() + ": SGPA=" + r.sgpa() + ", CGPA=" + r.cgpa())
                            .collect(Collectors.joining("\n"));
                    yield "CGPA History:\n" + text;
                }
                case "4" -> {
                    var b = parentDataService.getBacklogs(state.getStudentId());
                    yield "Backlogs: " + b.backlogCount() + "\nLast Updated: " + b.updatedAt();
                }
                case "5" -> {
                    var c = parentDataService.getCounselor(state.getStudentId());
                    yield "Counselor: " + defaultText(c.name())
                            + "\nPhone: " + defaultText(c.phone())
                            + "\nEmail: " + defaultText(c.email())
                            + "\nLast Updated: " + c.updatedAt();
                }
                case "6" -> {
                    var f = parentDataService.getFeeStatus(state.getStudentId());
                    yield "Fee Status: " + defaultText(f.feeStatus()) + "\nLast Updated: " + f.updatedAt();
                }
                case "7" -> {
                    var cr = parentDataService.getCredits(state.getStudentId());
                    int pending = Math.max(0, cr.totalCredits() - cr.earnedCredits());
                    yield "Total Credits: " + cr.totalCredits()
                            + "\nEarned Credits: " + cr.earnedCredits()
                            + "\nPending Credits: " + pending
                            + "\nLast Updated: " + cr.updatedAt();
                }
                case "8" -> {
                    var events = parentDataService.getAcademicEvents();
                    if (events.isEmpty()) {
                        yield "No academic calendar events available.";
                    }
                    String text = events.stream()
                            .map(e -> e.eventDate() + ": " + e.title() + " - " + defaultText(e.description()))
                            .collect(Collectors.joining("\n"));
                    yield "Academic Calendar:\n" + text;
                }
                case "9" -> {
                    var exams = parentDataService.getExamSchedule(state.getStudentId());
                    if (exams.isEmpty()) {
                        yield "No exam schedule available.";
                    }
                    String text = exams.stream()
                            .map(e -> e.examDate() + " " + e.examTime() + " | " + e.subject() + " | " + defaultText(e.hall()))
                            .collect(Collectors.joining("\n"));
                    yield "Exam Schedule:\n" + text;
                }
                case "10" -> {
                    var s = parentDataService.getSuspensionStatus(state.getStudentId());
                    yield "Suspension Status: " + defaultText(s.suspensionStatus())
                            + "\nLast Updated: " + s.updatedAt();
                }
                case "11" -> {
                    var rows = parentDataService.getFacultyRows(state.getStudentId());
                    if (rows.isEmpty()) {
                        yield "No faculty assignments available.";
                    }
                    String text = rows.stream()
                            .map(f -> "Sem " + f.semester() + " | " + f.subject() + ": " + defaultText(f.facultyName())
                                    + " (" + defaultText(f.facultyEmail()) + ", " + defaultText(f.facultyPhone()) + ")")
                            .collect(Collectors.joining("\n"));
                    yield "Faculty Details:\n" + text;
                }
                default -> "Invalid option number. Please enter valid option number.";
            };
        }

        return "Please type Hi to begin.";
    }

    private void resetState(ConversationState state) {
        state.setStudentId(null);
        state.setParentId(null);
        state.setRegistrationNumber(null);
        state.setPendingOtp(null);
        state.setPendingOtpExpiresAt(null);
    }

    private String defaultText(String value) {
        return value == null || value.isBlank() ? "N/A" : value;
    }
}
