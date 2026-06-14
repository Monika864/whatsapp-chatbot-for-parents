package com.university.parentportal.model.graph;

public record WhatsAppTextMessageRequest(String messaging_product, String to, String type, Text text) {

    public static WhatsAppTextMessageRequest of(String to, String body) {
        return new WhatsAppTextMessageRequest("whatsapp", to, "text", new Text(body));
    }

    public record Text(String body) {
    }
}
