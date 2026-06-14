package com.university.parentportal.model.webhook;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record WhatsAppWebhookPayload(String object, List<Entry> entry) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Entry(List<Change> changes) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Change(Value value) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Value(Metadata metadata, List<Message> messages) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Metadata(String phone_number_id) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Message(String from, String type, Text text, Audio audio, Interactive interactive) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Text(String body) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Audio(String id, String mime_type) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Interactive(String type, ButtonReply button_reply) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ButtonReply(String id, String title) {
    }
}
