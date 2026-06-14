package com.university.parentportal.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;

@Entity
@Table(name = "conversation_states")
public class ConversationState {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "wa_id", nullable = false, unique = true)
    private String waId;

    @Column(name = "stage", nullable = false)
    private String stage;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "student_id")
    private Long studentId;

    @Column(name = "parent_id")
    private Long parentId;

    @Column(name = "registration_number")
    private String registrationNumber;

    @Column(name = "pending_otp")
    private String pendingOtp;

    @Column(name = "pending_otp_expires_at")
    private OffsetDateTime pendingOtpExpiresAt;

    public Long getId() {
        return id;
    }

    public String getWaId() {
        return waId;
    }

    public void setWaId(String waId) {
        this.waId = waId;
    }

    public String getStage() {
        return stage;
    }

    public void setStage(String stage) {
        this.stage = stage;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public Long getStudentId() {
        return studentId;
    }

    public void setStudentId(Long studentId) {
        this.studentId = studentId;
    }

    public Long getParentId() {
        return parentId;
    }

    public void setParentId(Long parentId) {
        this.parentId = parentId;
    }

    public String getRegistrationNumber() {
        return registrationNumber;
    }

    public void setRegistrationNumber(String registrationNumber) {
        this.registrationNumber = registrationNumber;
    }

    public String getPendingOtp() {
        return pendingOtp;
    }

    public void setPendingOtp(String pendingOtp) {
        this.pendingOtp = pendingOtp;
    }

    public OffsetDateTime getPendingOtpExpiresAt() {
        return pendingOtpExpiresAt;
    }

    public void setPendingOtpExpiresAt(OffsetDateTime pendingOtpExpiresAt) {
        this.pendingOtpExpiresAt = pendingOtpExpiresAt;
    }

    @PrePersist
    @PreUpdate
    public void updateTimestamp() {
        this.updatedAt = OffsetDateTime.now();
    }
}
