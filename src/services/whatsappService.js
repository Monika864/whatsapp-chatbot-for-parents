const axios = require("axios");

const API_VERSION = "v22.0";

function hasWhatsAppConfig() {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID
  );
}

async function sendTextMessage(toPhone, bodyText) {
  if (!hasWhatsAppConfig()) {
    // Local fallback for development without WhatsApp credentials.
    console.log(`[WA MOCK -> ${toPhone}] ${bodyText}`);
    return { mocked: true };
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  return axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: String(toPhone),
      type: "text",
      text: { body: bodyText }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

async function sendListMessage(toPhone, payload) {
  if (!hasWhatsAppConfig()) {
    console.log(`[WA MOCK LIST -> ${toPhone}] ${JSON.stringify(payload)}`);
    return { mocked: true };
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  return axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: String(toPhone),
      type: "interactive",
      interactive: {
        type: "list",
        header: {
          type: "text",
          text: payload.header
        },
        body: {
          text: payload.body
        },
        action: {
          button: payload.buttonText,
          sections: payload.sections
        }
      }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

module.exports = {
  sendTextMessage,
  sendListMessage,
  hasWhatsAppConfig
};
