package com.university.parentportal.service;

import com.university.parentportal.config.WhatsAppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.Map;

@Service
public class AudioTranscriptionService {

    /** Returned when Whisper rate-limits us (429) even after one retry. */
    public static final String RATE_LIMITED = "__TRANSCRIPTION_RATE_LIMITED__";

    /** Returned when transcription fails for any other reason. */
    public static final String FAILED = "__TRANSCRIPTION_FAILED__";

    /** Returned when OpenAI account quota is exhausted. */
    public static final String QUOTA_EXHAUSTED = "__TRANSCRIPTION_QUOTA_EXHAUSTED__";

    private static final Logger log = LoggerFactory.getLogger(AudioTranscriptionService.class);

    private final WebClient webClient;
    private final WhatsAppProperties whatsappProps;

    @Value("${VOICE_MODE:openai}")
    private String voiceMode;

    @Value("${LOCAL_VOICE_BASE_URL:http://127.0.0.1:5001}")
    private String localVoiceBaseUrl;

    @Value("${OPENAI_API_KEY:}")
    private String openAiApiKey;

    public AudioTranscriptionService(WebClient webClient, WhatsAppProperties whatsappProps) {
        this.webClient = webClient;
        this.whatsappProps = whatsappProps;
    }

    /**
     * Transcribes a WhatsApp voice/audio message using OpenAI Whisper.
     *
     * Flow:
     *   1. Fetch the media download URL from WhatsApp Graph API using the media ID.
     *   2. Download the raw audio bytes using the WhatsApp access token.
     *   3. POST the audio as multipart to OpenAI Whisper (whisper-1).
     *
     * Returns empty string if OPENAI_API_KEY is not set or transcription fails.
     */
    public String transcribe(String mediaId, String mimeType) {
        if (openAiApiKey == null || openAiApiKey.isBlank()) {
            log.warn("OPENAI_API_KEY not configured — cannot transcribe voice message (media id: {})", mediaId);
            return "";
        }

        try {
            // Step 1 — get media download URL from WhatsApp Graph API
            String mediaMetaUrl = whatsappProps.graphBaseUrl()
                    + "/" + whatsappProps.apiVersion()
                    + "/" + mediaId;

            Map<?, ?> meta = webClient.get()
                    .uri(mediaMetaUrl)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + whatsappProps.accessToken())
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            if (meta == null || meta.get("url") == null) {
                log.warn("WhatsApp returned no download URL for media id {}", mediaId);
                return "";
            }

            String downloadUrl = meta.get("url").toString();

            // Step 2 — download raw audio bytes
            byte[] audioBytes = webClient.get()
                    .uri(downloadUrl)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + whatsappProps.accessToken())
                    .retrieve()
                    .bodyToMono(byte[].class)
                    .block();

            if (audioBytes == null || audioBytes.length == 0) {
                log.warn("Empty audio download for media id {}", mediaId);
                return "";
            }

                // Step 3 — send to OpenAI Whisper for transcription (with retries on 429)
            String safeMime = (mimeType != null && !mimeType.isBlank())
                    ? mimeType.split(";")[0].trim()   // strip e.g. "; codecs=opus"
                    : "audio/ogg";

            String ext = safeMime.contains("mp4") ? "mp4"
                    : safeMime.contains("mpeg") ? "mp3"
                    : safeMime.contains("wav") ? "wav"
                    : "ogg";

            final byte[] finalAudioBytes = audioBytes;
            final String finalSafeMime = safeMime;
            final String finalExt = ext;

            if ("local".equalsIgnoreCase(voiceMode)) {
                return transcribeUsingLocalService(finalAudioBytes, finalSafeMime, finalExt, mediaId);
            }

            for (int attempt = 1; attempt <= 3; attempt++) {
                // Rebuild builder on every attempt (consumed after first use)
                MultipartBodyBuilder builder = new MultipartBodyBuilder();
                builder.part("file", finalAudioBytes)
                        .filename("voice." + finalExt)
                        .contentType(MediaType.parseMediaType(finalSafeMime));
                builder.part("model", "whisper-1");
                // Improve accuracy for this domain (registration/OTP/menu keywords).
                builder.part("temperature", "0");
                builder.part("prompt", "University parent portal chatbot. Common words: registration number, OTP, attendance, marks, CGPA, backlogs, fees, menu options one to eleven.");

                try {
                    Map<?, ?> whisperResponse = webClient.post()
                            .uri("https://api.openai.com/v1/audio/transcriptions")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + openAiApiKey)
                            .contentType(MediaType.MULTIPART_FORM_DATA)
                            .bodyValue(builder.build())
                            .retrieve()
                            .bodyToMono(Map.class)
                            .block();

                    if (whisperResponse == null || whisperResponse.get("text") == null) {
                        log.warn("Whisper returned no text for media id {}", mediaId);
                        return FAILED;
                    }

                    String text = whisperResponse.get("text").toString().trim();
                    log.info("Voice message transcribed (media id {}): [{}]", mediaId, text);
                    return text;

                } catch (WebClientResponseException ex) {
                    if (ex.getStatusCode().value() == 429) {
                        String body = ex.getResponseBodyAsString();
                        if (body != null && body.contains("insufficient_quota")) {
                            log.error("Whisper quota exhausted (media id {})", mediaId);
                            return QUOTA_EXHAUSTED;
                        }
                        if (attempt < 3) {
                            log.warn("Whisper rate limited (429), waiting 15 s before retry {}/3 (media id {})", attempt + 1, mediaId);
                            try { Thread.sleep(15_000); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
                        } else {
                            log.error("Whisper still rate limited after 3 attempts (media id {})", mediaId);
                            return RATE_LIMITED;
                        }
                    } else {
                        log.error("Whisper API error status={} (media id {}): {}", ex.getStatusCode().value(), mediaId, ex.getMessage());
                        return FAILED;
                    }
                }
            }

            return RATE_LIMITED; // unreachable, satisfies compiler

        } catch (Exception ex) {
            log.error("Failed to transcribe audio message (media id {}): {}", mediaId, ex.getMessage());
            return FAILED;
        }
    }

    private String transcribeUsingLocalService(byte[] audioBytes, String safeMime, String ext, String mediaId) {
        try {
            MultipartBodyBuilder builder = new MultipartBodyBuilder();
            builder.part("file", audioBytes)
                    .filename("voice." + ext)
                    .contentType(MediaType.parseMediaType(safeMime));

            Map<?, ?> response = webClient.post()
                    .uri(localVoiceBaseUrl + "/transcribe")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .bodyValue(builder.build())
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            if (response == null || response.get("text") == null) {
                log.warn("Local STT returned no text (media id {})", mediaId);
                return FAILED;
            }

            String text = response.get("text").toString().trim();
            log.info("Voice message transcribed via local STT (media id {}): [{}]", mediaId, text);
            return text;
        } catch (Exception ex) {
            log.error("Local STT failed (media id {}): {}", mediaId, ex.getMessage());
            return FAILED;
        }
    }
}
