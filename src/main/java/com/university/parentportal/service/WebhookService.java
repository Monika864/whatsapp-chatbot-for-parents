package com.university.parentportal.service;

import com.university.parentportal.exception.InvalidWebhookException;
import com.university.parentportal.model.ParsedIncomingMessage;
import com.university.parentportal.model.webhook.WhatsAppWebhookPayload;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class WebhookService {

    private final AudioTranscriptionService transcriptionService;

    public WebhookService(AudioTranscriptionService transcriptionService) {
        this.transcriptionService = transcriptionService;
    }

    public List<ParsedIncomingMessage> parseIncomingMessages(WhatsAppWebhookPayload payload) {
        if (payload == null || payload.entry() == null) {
            throw new InvalidWebhookException("Webhook payload is empty or malformed");
        }

        List<ParsedIncomingMessage> messages = new ArrayList<>();

        for (WhatsAppWebhookPayload.Entry entry : payload.entry()) {
            if (entry == null || entry.changes() == null) {
                continue;
            }
            for (WhatsAppWebhookPayload.Change change : entry.changes()) {
                if (change == null || change.value() == null || change.value().messages() == null) {
                    continue;
                }
                for (WhatsAppWebhookPayload.Message message : change.value().messages()) {
                    if (message == null || message.from() == null) {
                        continue;
                    }

                    String body;
                    if ("audio".equals(message.type()) && message.audio() != null
                            && message.audio().id() != null) {
                        // Voice message — transcribe and treat as text
                        body = transcriptionService.transcribe(
                                message.audio().id(),
                                message.audio().mime_type()
                        );
                        if (body.isBlank()) {
                            // No API key configured — skip silently
                            continue;
                        } else if (AudioTranscriptionService.QUOTA_EXHAUSTED.equals(body)) {
                            // OpenAI quota issue — provide accurate guidance to user
                            messages.add(new ParsedIncomingMessage(
                                    message.from(),
                                    "Voice service is temporarily unavailable due to API quota. Please type your message for now.",
                                    true));
                            continue;
                        } else if (AudioTranscriptionService.RATE_LIMITED.equals(body)) {
                            // Whisper rate limited — tell the user to retry
                            messages.add(new ParsedIncomingMessage(
                                    message.from(),
                                    "Sorry, voice message processing is temporarily busy. Please type your message or send the voice note again in a minute.",
                                    true));
                            continue;
                        } else if (AudioTranscriptionService.FAILED.equals(body)) {
                            // Other transcription error — tell the user
                            messages.add(new ParsedIncomingMessage(
                                    message.from(),
                                    "Sorry, I could not understand your voice message. Please type your message instead.",
                                    true));
                            continue;
                        }
                    } else {
                        body = message.text() == null ? "" : defaultString(message.text().body());
                    }

                    messages.add(new ParsedIncomingMessage(message.from(), body.trim()));
                }
            }
        }

        return messages;
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }
}
