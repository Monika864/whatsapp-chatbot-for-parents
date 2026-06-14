package com.university.parentportal.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.Map;

@Service
public class OtpSmsService {

    private final WebClient webClient;

    @Value("${FAST2SMS_API_KEY:}")
    private String fast2SmsApiKey;

    public OtpSmsService(WebClient webClient) {
        this.webClient = webClient;
    }

    public boolean sendOtp(String rawPhone, String otp, int ttlMinutes) {
        if (fast2SmsApiKey == null || fast2SmsApiKey.isBlank()) {
            return false;
        }

        String digits = rawPhone == null ? "" : rawPhone.replaceAll("\\D", "");
        if (digits.length() == 12 && digits.startsWith("91")) {
            digits = digits.substring(2);
        }

        if (digits.length() != 10) {
            return false;
        }
        final String destinationNumber = digits;

        String message = "Your Parent Portal OTP is " + otp + ". Valid for " + ttlMinutes + " minutes.";

        try {
            Map<?, ?> response = webClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .scheme("https")
                            .host("www.fast2sms.com")
                            .path("/dev/bulkV2")
                            .queryParam("authorization", fast2SmsApiKey)
                            .queryParam("route", "q")
                            .queryParam("message", message)
                            .queryParam("flash", 0)
                            .queryParam("numbers", destinationNumber)
                            .build())
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            if (response == null) {
                return false;
            }

            Object ok = response.get("return");
            return ok instanceof Boolean && (Boolean) ok;
        } catch (WebClientResponseException ex) {
            return false;
        } catch (Exception ex) {
            return false;
        }
    }
}
