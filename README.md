# Spring Boot WhatsApp Backend

Production-ready Spring Boot backend integrating with WhatsApp Business Cloud API.

## Features

- Webhook verification using verify token
- Webhook message receiver and payload parsing
- Reply messages via Meta Graph API
- Basic chatbot flow:
  - User sends `Hi`
  - Bot replies `Welcome to University Parent Portal. Please enter Student ID.`
- Layered structure: controller, service, model, repository
- Exception handling with clean API error responses

## Project Structure

```text
src/main/java/com/university/parentportal
  controller/
  service/
  model/
  repository/
  config/
  exception/
```

## Environment Variables

Set these before running:

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_API_VERSION` (optional, default: `v20.0`)
- `WHATSAPP_GRAPH_BASE_URL` (optional, default: `https://graph.facebook.com`)
- `DB_URL` (optional, default: `jdbc:postgresql://localhost:5432/parent_chatbot`)
- `DB_USERNAME` (optional, default: `postgres`)
- `DB_PASSWORD` (optional, default: `postgres`)

## Run

```bash
mvn clean spring-boot:run
```

Webhook endpoints:

- `GET /webhook` for verification
- `POST /webhook` for incoming messages
