package com.university.parentportal.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "whatsapp")
public record WhatsAppProperties(
        @NotBlank String verifyToken,
        @NotBlank String accessToken,
        @NotBlank String phoneNumberId,
        @NotBlank String apiVersion,
        @NotBlank String graphBaseUrl
) {
}
