package com.university.parentportal.service;

import com.university.parentportal.config.WhatsAppProperties;
import com.university.parentportal.exception.GraphApiException;
import com.university.parentportal.model.graph.WhatsAppAudioMessageRequest;
import com.university.parentportal.model.graph.WhatsAppInteractiveButtonMessageRequest;
import com.university.parentportal.model.graph.WhatsAppTextMessageRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.Map;

@Service
public class GraphApiService {

    private static final Logger log = LoggerFactory.getLogger(GraphApiService.class);

    private final WebClient webClient;
    private final WhatsAppProperties properties;

    public GraphApiService(WebClient webClient, WhatsAppProperties properties) {
        this.webClient = webClient;
        this.properties = properties;
    }

    public void sendTextMessage(String toWaId, String body) {
        String url = String.format(
                "%s/%s/%s/messages",
                properties.graphBaseUrl(),
                properties.apiVersion(),
                properties.phoneNumberId()
        );

        WhatsAppTextMessageRequest request = WhatsAppTextMessageRequest.of(toWaId, body);

        try {
            webClient.post()
                    .uri(url)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.accessToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(request)
                    .retrieve()
                    .toBodilessEntity()
                    .block();
        } catch (WebClientResponseException ex) {
            log.error("Graph API error: status={}, body={}", ex.getStatusCode().value(), ex.getResponseBodyAsString());
            throw new GraphApiException("Failed to send reply via WhatsApp Cloud API", ex);
        } catch (Exception ex) {
            log.error("Unexpected Graph API error", ex);
            throw new GraphApiException("Unexpected error while calling Graph API", ex);
        }
    }

    public void sendTextMessageWithVoiceButton(String toWaId, String body, String buttonId) {
        String url = String.format(
                "%s/%s/%s/messages",
                properties.graphBaseUrl(),
                properties.apiVersion(),
                properties.phoneNumberId()
        );

        WhatsAppInteractiveButtonMessageRequest request =
                WhatsAppInteractiveButtonMessageRequest.of(toWaId, body, buttonId, "Play Voice Reply");

        try {
            webClient.post()
                    .uri(url)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.accessToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(request)
                    .retrieve()
                    .toBodilessEntity()
                    .block();
        } catch (WebClientResponseException ex) {
            log.error("Graph API interactive error: status={}, body={}", ex.getStatusCode().value(), ex.getResponseBodyAsString());
            throw new GraphApiException("Failed to send interactive button reply via WhatsApp Cloud API", ex);
        } catch (Exception ex) {
            log.error("Unexpected Graph API interactive error", ex);
            throw new GraphApiException("Unexpected error while sending interactive button message", ex);
        }
    }

    /**
     * Uploads audio bytes (MP3) to the WhatsApp Media API.
     * Returns the media ID string, or null if the upload fails.
     */
    public String uploadMedia(byte[] audioBytes) {
        String url = String.format(
                "%s/%s/%s/media",
                properties.graphBaseUrl(),
                properties.apiVersion(),
                properties.phoneNumberId()
        );

        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part("messaging_product", "whatsapp");
        builder.part("type", "audio/mpeg");
        builder.part("file", audioBytes)
                .filename("reply.mp3")
                .contentType(MediaType.valueOf("audio/mpeg"));

        try {
            Map<?, ?> response = webClient.post()
                    .uri(url)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.accessToken())
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .bodyValue(builder.build())
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            if (response == null || response.get("id") == null) {
                log.warn("WhatsApp media upload returned no ID");
                return null;
            }
            return response.get("id").toString();

        } catch (WebClientResponseException ex) {
            log.error("Media upload error: status={}, body={}", ex.getStatusCode().value(), ex.getResponseBodyAsString());
            return null;
        } catch (Exception ex) {
            log.error("Unexpected media upload error: {}", ex.getMessage());
            return null;
        }
    }

    /**
     * Sends an audio message to a WhatsApp user using a previously uploaded media ID.
     * Errors are logged but not rethrown — text message was already sent successfully.
     */
    public void sendAudioMessage(String toWaId, String mediaId) {
        String url = String.format(
                "%s/%s/%s/messages",
                properties.graphBaseUrl(),
                properties.apiVersion(),
                properties.phoneNumberId()
        );

        WhatsAppAudioMessageRequest request = WhatsAppAudioMessageRequest.of(toWaId, mediaId);

        try {
            webClient.post()
                    .uri(url)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.accessToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(request)
                    .retrieve()
                    .toBodilessEntity()
                    .block();
            log.info("Audio message sent to {}", toWaId);
        } catch (WebClientResponseException ex) {
            log.error("Audio message send error: status={}, body={}", ex.getStatusCode().value(), ex.getResponseBodyAsString());
        } catch (Exception ex) {
            log.error("Unexpected error sending audio message: {}", ex.getMessage());
        }
    }
}
