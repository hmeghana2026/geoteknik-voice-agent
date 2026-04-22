# Geoteknik Voice Agent

Node.js / Express backend that powers a Vapi + Twilio voice support agent for Geoteknik. The original code lives under `geoteknik-voice-agent/`.

## Stack
- Node.js 20 (Express 4)
- OpenAI, Google Generative AI, Supabase, Twilio, Vapi
- Optional Redis cache

## Running on Replit
- Workflow `Start application` runs `npm start` inside `geoteknik-voice-agent/` and serves on port 5000 (proxied to the Replit preview).
- A `.env` file with placeholder values lives in `geoteknik-voice-agent/.env` so the server boots without external credentials. Replace these placeholders (or use Replit Secrets) with real values for OpenAI, Supabase, Twilio, Vapi, and Gemini before exercising the voice/AI features.

## Key endpoints
- `GET /` — health text response
- `POST /twilio/...` — Twilio SMS / fallback routes
- `POST /vapi/...` — Vapi voice webhook routes

## Deployment
Configured as a `vm` deployment running `npm start --prefix geoteknik-voice-agent` (always-on, required for webhook endpoints).
