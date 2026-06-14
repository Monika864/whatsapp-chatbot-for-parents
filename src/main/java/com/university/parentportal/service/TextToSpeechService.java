package com.university.parentportal.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.Map;

@Service
public class TextToSpeechService {

    private static final Logger log = LoggerFactory.getLogger(TextToSpeechService.class);

    private final WebClient webClient;

    @Value("${VOICE_MODE:openai}")
    private String voiceMode;

    @Value("${LOCAL_VOICE_BASE_URL:http://127.0.0.1:5001}")
    private String localVoiceBaseUrl;

    @Value("${OPENAI_API_KEY:}")
    private String openAiApiKey;

    public TextToSpeechService(WebClient webClient) {
        this.webClient = webClient;
    }

    /**
     * Converts text to MP3 audio bytes using OpenAI TTS API (tts-1 model, alloy voice).
     * Falls back to a public TTS endpoint when OpenAI is unavailable or out of quota.
     * Returns null only if all providers fail.
     */
    public byte[] textToSpeech(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }

        // OpenAI TTS input limit is 4096 characters
        String input = text.length() > 4096 ? text.substring(0, 4096) : text;

        if ("local".equalsIgnoreCase(voiceMode)) {
            return localTextToSpeech(input);
        }

        if (openAiApiKey == null || openAiApiKey.isBlank()) {
            log.warn("OPENAI_API_KEY not configured; using fallback TTS provider");
            return fallbackTextToSpeech(input);
        }

        try {
            Map<String, Object> requestBody = Map.of(
                    "model", "tts-1",
                    "input", input,
                    "voice", "alloy"
            );

            byte[] mp3Bytes = webClient.post()
                    .uri("https://api.openai.com/v1/audio/speech")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + openAiApiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(byte[].class)
                    .block();

            if (mp3Bytes == null || mp3Bytes.length == 0) {
                log.warn("OpenAI TTS returned empty audio");
                return fallbackTextToSpeech(input);
            }

            return mp3Bytes;

        } catch (WebClientResponseException ex) {
            log.error("TTS API error: status={}, body={}", ex.getStatusCode().value(), ex.getResponseBodyAsString());
            return fallbackTextToSpeech(input);
        } catch (Exception ex) {
            log.error("Unexpected TTS error: {}", ex.getMessage());
            return fallbackTextToSpeech(input);
        }
    }

    private byte[] localTextToSpeech(String text) {
        try {
            Map<String, Object> request = Map.of("text", text, "voice", "en-US-JennyNeural");

            byte[] bytes = webClient.post()
                    .uri(localVoiceBaseUrl + "/tts")
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.valueOf("audio/mpeg"))
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(byte[].class)
                    .block();

            if (bytes == null || bytes.length == 0) {
                log.warn("Local TTS returned empty audio");
                return null;
            }
            log.info("Voice generated via local TTS service");
            return bytes;
        } catch (Exception ex) {
            log.error("Local TTS failed: {}", ex.getMessage());
            return null;
        }
    }

    /**
     * Fallback provider for MP3 generation when OpenAI TTS is unavailable.
     * This is best-effort and keeps the chatbot process unchanged.
     */
    private byte[] fallbackTextToSpeech(String text) {
        // Keep fallback input short for URL-based providers.
        String clipped = text.length() > 260 ? text.substring(0, 260) : text;

        byte[] streamElementsAudio = streamElementsFallback(clipped);
        if (streamElementsAudio != null && streamElementsAudio.length > 0) {
            log.info("Voice generated via StreamElements fallback TTS");
            return streamElementsAudio;
        }

        byte[] googleAudio = googleTranslateFallback(clipped);
        if (googleAudio != null && googleAudio.length > 0) {
            log.info("Voice generated via Google fallback TTS");
            return googleAudio;
        }

        log.error("All fallback TTS providers failed");
        return null;
    }

    private byte[] streamElementsFallback(String text) {
        try {
            return webClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .scheme("https")
                            .host("api.streamelements.com")
                            .path("/kappa/v2/speech")
                            .queryParam("voice", "Brian")
                            .queryParam("text", text)
                            .build())
                    .header(HttpHeaders.USER_AGENT, "Mozilla/5.0")
                    .accept(MediaType.valueOf("audio/mpeg"))
                    .retrieve()
                    .bodyToMono(byte[].class)
                    .block();
        } catch (Exception ex) {
            log.warn("StreamElements fallback failed: {}", ex.getMessage());
            return null;
        }
    }

    private byte[] googleTranslateFallback(String text) {
        try {
            return webClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .scheme("https")
                            .host("translate.google.com")
                            .path("/translate_tts")
                            .queryParam("ie", "UTF-8")
                            .queryParam("client", "tw-ob")
                            .queryParam("tl", "en")
                            .queryParam("q", text)
                            .build())
                    .header(HttpHeaders.USER_AGENT, "Mozilla/5.0")
                    .accept(MediaType.valueOf("audio/mpeg"))
                    .retrieve()
                    .bodyToMono(byte[].class)
                    .block();
        } catch (Exception ex) {
            log.warn("Google fallback failed: {}", ex.getMessage());
            return null;
        }
    }
}
