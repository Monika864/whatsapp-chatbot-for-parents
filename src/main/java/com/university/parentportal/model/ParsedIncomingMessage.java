package com.university.parentportal.model;

/**
 * @param directReply when true, textBody is a pre-formed reply to send directly
 *                    without going through the chatbot (e.g. transcription errors).
 */
public record ParsedIncomingMessage(String fromWaId, String textBody, boolean directReply) {

    /** Convenience constructor for normal chatbot messages. */
    public ParsedIncomingMessage(String fromWaId, String textBody) {
        this(fromWaId, textBody, false);
    }
}
