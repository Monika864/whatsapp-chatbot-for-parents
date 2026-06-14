package com.university.parentportal.service;

import com.university.parentportal.model.ParsedIncomingMessage;
import com.university.parentportal.model.webhook.WhatsAppWebhookPayload;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Processes all incoming WhatsApp messages in a background thread.
 *
 * The webhook controller returns HTTP 200 to WhatsApp immediately, then this
 * service handles the full pipeline in the background:
 *   voice note  → Whisper transcription (with retries, no timeout pressure)
 *   text/voice  → chatbot reply
 *   reply       → send as text message
 *   reply       → convert to speech via OpenAI TTS → upload → send as audio message
 *
 * Because processing is async, the existing step-by-step chatbot flow
 * (Hi → Registration → OTP → Menu options) is completely unchanged.
 */
@Service
public class MessageProcessingService {

    private static final Logger log = LoggerFactory.getLogger(MessageProcessingService.class);

    private final WebhookService webhookService;
    private final ChatbotService chatbotService;
    private final GraphApiService graphApiService;
    private final TextToSpeechService textToSpeechService;

    public MessageProcessingService(
            WebhookService webhookService,
            ChatbotService chatbotService,
            GraphApiService graphApiService,
            TextToSpeechService textToSpeechService
    ) {
        this.webhookService = webhookService;
        this.chatbotService = chatbotService;
        this.graphApiService = graphApiService;
        this.textToSpeechService = textToSpeechService;
    }

    /**
     * Runs entirely in a Spring-managed background thread.
     * WhatsApp has already received HTTP 200 before this method executes.
     */
    @Async
    public void processAsync(WhatsAppWebhookPayload payload) {
        List<ParsedIncomingMessage> incomingMessages;
        try {
            // parseIncomingMessages handles voice message transcription
            // (with up to 3 retries + 15 s waits — safe now that we are async)
            incomingMessages = webhookService.parseIncomingMessages(payload);
        } catch (Exception ex) {
            log.error("Failed to parse incoming webhook payload: {}", ex.getMessage());
            return;
        }

        for (ParsedIncomingMessage incomingMessage : incomingMessages) {
            if (incomingMessage.textBody().isBlank()) {
                continue;
            }

            try {
                // Direct replies (e.g. transcription rate-limit errors) bypass chatbot
                String reply = incomingMessage.directReply()
                        ? incomingMessage.textBody()
                        : chatbotService.getReply(incomingMessage.fromWaId(), incomingMessage.textBody());

                if (incomingMessage.directReply()) {
                    // Internal/system replies stay plain text.
                    graphApiService.sendTextMessage(incomingMessage.fromWaId(), reply);
                    log.info("Direct text reply sent to {}", incomingMessage.fromWaId());
                    continue;
                }

                // Normal bot reply: send text first, then send voice automatically.
                graphApiService.sendTextMessage(incomingMessage.fromWaId(), reply);
                log.info("Text reply sent to {}", incomingMessage.fromWaId());

                sendVoiceReply(incomingMessage.fromWaId(), reply);

            } catch (Exception ex) {
                log.error("Error processing message for {}: {}", incomingMessage.fromWaId(), ex.getMessage());
            }
        }
    }

    /**
     * Converts the bot's text reply to an MP3 via OpenAI TTS, uploads it to
     * WhatsApp media, then sends it as an audio message.
     * Any failure is logged but does not affect the already-sent text reply.
     */
    private void sendVoiceReply(String toWaId, String text) {
        try {
            byte[] audioBytes = textToSpeechService.textToSpeech(text);
            if (audioBytes == null) {
                log.info("TTS skipped for {} (no audio bytes)", toWaId);
                return;
            }
            String mediaId = graphApiService.uploadMedia(audioBytes);
            if (mediaId == null) {
                log.warn("Voice reply skipped for {} — media upload failed", toWaId);
                return;
            }
            graphApiService.sendAudioMessage(toWaId, mediaId);
            log.info("Voice reply sent to {}", toWaId);
        } catch (Exception ex) {
            log.warn("Voice reply skipped for {}: {}", toWaId, ex.getMessage());
        }
    }

}
