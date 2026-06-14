package com.university.parentportal.controller;

import com.university.parentportal.config.WhatsAppProperties;
import com.university.parentportal.exception.InvalidWebhookException;
import com.university.parentportal.model.webhook.WhatsAppWebhookPayload;
import com.university.parentportal.service.MessageProcessingService;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@Validated
@RestController
@RequestMapping("/webhook")
public class WebhookController {

    private final WhatsAppProperties properties;
    private final MessageProcessingService messageProcessingService;

    public WebhookController(
            WhatsAppProperties properties,
            MessageProcessingService messageProcessingService
    ) {
        this.properties = properties;
        this.messageProcessingService = messageProcessingService;
    }

    @GetMapping
    public ResponseEntity<String> verifyWebhook(
            @RequestParam("hub.mode") @NotBlank String mode,
            @RequestParam("hub.verify_token") @NotBlank String verifyToken,
            @RequestParam("hub.challenge") @NotBlank String challenge
    ) {
        if (!"subscribe".equalsIgnoreCase(mode)) {
            throw new InvalidWebhookException("Invalid hub.mode value");
        }
        if (!properties.verifyToken().equals(verifyToken)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Forbidden");
        }
        return ResponseEntity.ok(challenge);
    }

    @PostMapping
    public ResponseEntity<Map<String, String>> receiveWebhook(@RequestBody WhatsAppWebhookPayload payload) {
        // Return 200 to WhatsApp immediately — all processing (transcription,
        // chatbot reply, TTS voice reply) happens in a background thread.
        messageProcessingService.processAsync(payload);
        return ResponseEntity.ok(Map.of("status", "EVENT_RECEIVED"));
    }
}
