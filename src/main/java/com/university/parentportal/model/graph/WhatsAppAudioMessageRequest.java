package com.university.parentportal.model.graph;

public record WhatsAppAudioMessageRequest(String messaging_product, String to, String type, Audio audio) {

    public static WhatsAppAudioMessageRequest of(String to, String mediaId) {
        return new WhatsAppAudioMessageRequest("whatsapp", to, "audio", new Audio(mediaId));
    }

    public record Audio(String id) {
    }
}
