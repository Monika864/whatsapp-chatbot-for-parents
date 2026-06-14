package com.university.parentportal.model.graph;

import java.util.List;

public record WhatsAppInteractiveButtonMessageRequest(
        String messaging_product,
        String to,
        String type,
        Interactive interactive
) {

    public static WhatsAppInteractiveButtonMessageRequest of(String to, String body, String buttonId, String buttonTitle) {
        return new WhatsAppInteractiveButtonMessageRequest(
                "whatsapp",
                to,
                "interactive",
                new Interactive(
                        "button",
                        new Body(body),
                        new Action(List.of(new Button(new Reply(buttonId, buttonTitle))))
                )
        );
    }

    public record Interactive(String type, Body body, Action action) {
    }

    public record Body(String text) {
    }

    public record Action(List<Button> buttons) {
    }

    public record Button(String type, Reply reply) {
        public Button(Reply reply) {
            this("reply", reply);
        }
    }

    public record Reply(String id, String title) {
    }
}
