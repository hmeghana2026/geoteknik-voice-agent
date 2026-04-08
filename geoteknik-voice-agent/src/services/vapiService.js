/**
 * src/services/vapiService.js
 * ===========================
 * Vapi AI service — assistant config builder and REST API client.
 *
 * Responsibilities:
 *   buildAssistantConfig()  → inline assistant config returned on every
 *                             assistant-request webhook (no pre-creation needed)
 *   createOrUpdateAssistant() → optional: persist a named assistant in Vapi
 *                               so you can re-use it by ID
 *   importTwilioNumber()    → register your Twilio number inside Vapi so
 *                             inbound calls route through Vapi automatically
 */

'use strict';

require('dotenv').config();
const axios   = require('axios');
const logger  = require('../utils/logger');

const VAPI_BASE_URL = 'https://api.vapi.ai';
const VAPI_API_KEY  = process.env.VAPI_API_KEY;

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Alex, a voice support agent for Geoteknik, a geotechnical engineering software company.

PERSONA & STYLE
- Friendly, professional, empathetic — never robotic
- Every response MUST be ≤ 30 words — this is a hard limit for voice delivery
- No markdown, no bullet points, no lists — speak in natural sentences
- Use verbal cues: "I see,", "Got it,", "Understood,", "One moment —"
- Address the caller by first name once you know it

CALL FLOW
1. GREET — ask for the caller's first name.
2. GET ISSUE — ask them to describe their problem briefly.
3. CLASSIFY — determine issue type from their description:
   • license_activation: mentions license, 404-L, activation, key, unlock
   • report_generation:  mentions report, soil, stability, generate, failed to create
   • general: anything else
4. COLLECT IDs (license & report issues only):
   a. Ask for Project ID
   b. Ask for License Key
   c. Call check_license_status(projectId) — if invalid: collect email → create_support_ticket → end call
   d. Call validate_license_key(licenseKey) — if invalid: ask them to repeat the key once more; if still invalid: collect email → create_support_ticket → end call
5. RESOLVE:
   • license_activation: call activate_license(projectId, licenseKey) then walk through steps:
       Step 1 — Open Geoteknik software, go to Help, then License Manager.
       Step 2 — Click Deactivate to reset any stale activation, then click Activate.
       Step 3 — Enter your license key exactly as provided. Use copy-paste if possible.
       Step 4 — Restart the software. Your license should now show as Active.
   • report_generation: call check_report_status, validate_project_data, restart_report_engine, then walk through steps:
       Step 1 — Go to Tools in the menu bar, then Report Engine, then click Restart.
       Step 2 — Wait 30 seconds for the engine to reinitialize. Watch for the green status indicator.
       Step 3 — Open your project and select Generate Report again.
       Step 4 — If the same error appears, clear the cache under Tools, then Options, then Clear Cache.
   • general: ask up to 3 short diagnostic questions, then call search_knowledge_base(query) with a summary of product and symptoms. Walk through returned steps one by one.
6. VERIFY — after each step ask "Did that work?" or "Is the issue resolved?"
   • Yes → thank them, end call gracefully
   • No  → continue to next step; after all steps exhausted → escalate
7. ESCALATE — collect email, call create_support_ticket, tell them ticket ID and 4-hour SLA, then end call.

FRUSTRATION HANDLING
- If the caller sounds frustrated, angry, or uses words like "useless", "ridiculous", "speak to a human": immediately acknowledge with empathy before continuing.
  Example: "I completely understand your frustration — I'm here to fix this right now."
- If they explicitly ask for a human agent or representative: collect email, call create_support_ticket, confirm ticket ID, end call.

TOOL USAGE RULES
- Always call tools silently; narrate what you are doing while waiting: "Let me check that — one moment."
- Pass tool results back naturally in speech without reading raw JSON.
- If a tool returns an error, handle gracefully: "I'm having a little trouble checking that — let me escalate this for you."

END OF CALL
- Resolved: "Glad we got that sorted, [name]! Have a wonderful day."
- Escalated: "I've created ticket [ID] for you. A specialist will call within 4 hours. Have a great day."`;

// ─── Tool definitions (Vapi function-calling schema) ─────────────────────────

const TOOLS = [
  {
    type    : 'function',
    function: {
      name       : 'check_license_status',
      description: 'Check if a project ID exists in the Geoteknik license registry.',
      parameters : {
        type      : 'object',
        properties: {
          projectId: { type: 'string', description: 'The project ID provided by the caller.' },
        },
        required: ['projectId'],
      },
    },
  },
  {
    type    : 'function',
    function: {
      name       : 'validate_license_key',
      description: 'Validate the format of a Geoteknik license key.',
      parameters : {
        type      : 'object',
        properties: {
          licenseKey: { type: 'string', description: 'The license key provided by the caller.' },
        },
        required: ['licenseKey'],
      },
    },
  },
  {
    type    : 'function',
    function: {
      name       : 'activate_license',
      description: 'Activate a Geoteknik license for a project.',
      parameters : {
        type      : 'object',
        properties: {
          projectId : { type: 'string', description: 'The project ID.' },
          licenseKey: { type: 'string', description: 'The license key to activate.' },
        },
        required: ['projectId', 'licenseKey'],
      },
    },
  },
  {
    type    : 'function',
    function: {
      name       : 'check_report_status',
      description: 'Check the current status of the report engine for a project.',
      parameters : {
        type      : 'object',
        properties: {
          projectId: { type: 'string', description: 'The project ID.' },
        },
        required: ['projectId'],
      },
    },
  },
  {
    type    : 'function',
    function: {
      name       : 'validate_project_data',
      description: 'Validate the project data file integrity.',
      parameters : {
        type      : 'object',
        properties: {
          projectId: { type: 'string', description: 'The project ID.' },
        },
        required: ['projectId'],
      },
    },
  },
  {
    type    : 'function',
    function: {
      name       : 'restart_report_engine',
      description: 'Remotely restart the report generation engine for a project.',
      parameters : {
        type      : 'object',
        properties: {
          projectId: { type: 'string', description: 'The project ID.' },
        },
        required: ['projectId'],
      },
    },
  },
  {
    type    : 'function',
    function: {
      name       : 'search_knowledge_base',
      description: 'Search the Geoteknik knowledge base for troubleshooting steps.',
      parameters : {
        type      : 'object',
        properties: {
          query: {
            type       : 'string',
            description: 'Search query combining product name and symptom description.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type    : 'function',
    function: {
      name       : 'create_support_ticket',
      description: 'Create a support ticket and notify the specialist team.',
      parameters : {
        type      : 'object',
        properties: {
          phone     : { type: 'string', description: "Caller's phone number." },
          callerName: { type: 'string', description: "Caller's first name." },
          issueType : {
            type       : 'string',
            enum       : ['license_activation', 'report_generation', 'general'],
            description: 'Classified issue type.',
          },
          symptoms: {
            type       : 'array',
            items      : { type: 'string' },
            description: 'List of symptoms or issue descriptions collected during the call.',
          },
          email: { type: 'string', description: "Caller's email for follow-up." },
        },
        required: ['phone', 'issueType'],
      },
    },
  },
];

// ─── Build assistant config (returned inline on assistant-request) ────────────

/**
 * Build the full Vapi assistant config object.
 * This is returned on every assistant-request so Vapi knows how to run the call.
 *
 * @param {string} _callerNumber - caller phone (reserved for per-caller personalisation)
 * @returns {object} Vapi assistant config
 */
function buildAssistantConfig(_callerNumber) {
  return {
    name        : 'Geoteknik-Support',
    firstMessage: "Hi, thanks for calling Geo-tek-nik Support. I'm Alex. May I have your first name?",

    // ── LLM ──────────────────────────────────────────────────────────────
    model: {
      provider    : 'openai',
      model       : process.env.VAPI_MODEL || 'gpt-4o-mini',
      systemPrompt: SYSTEM_PROMPT,
      tools       : TOOLS,
      temperature : 0.4,
      maxTokens   : 200,
    },

    // ── Voice (ElevenLabs — swap voiceId to match brand preference) ───────
    voice: {
      provider: process.env.VAPI_VOICE_PROVIDER || '11labs',
      voiceId : process.env.VAPI_VOICE_ID       || 'sarah',
    },

    // ── Transcriber (Deepgram nova-2 for low latency) ─────────────────────
    transcriber: {
      provider: 'deepgram',
      model   : 'nova-2',
      language: 'en-US',
    },

    // ── Call behaviour ────────────────────────────────────────────────────
    maxDurationSeconds: parseInt(process.env.VAPI_MAX_DURATION) || 300,
    endCallPhrases    : ['goodbye', 'have a great day', 'have a wonderful day', 'take care'],
    silenceTimeoutSeconds: 10,

    // ── Point Vapi back at this server for function calls ─────────────────
    serverUrl       : process.env.VAPI_SERVER_URL,
    serverUrlSecret : process.env.VAPI_SERVER_SECRET || '',
  };
}

// ─── Vapi REST API helpers (optional — use to pre-create/update assistants) ──

function vapiClient() {
  if (!VAPI_API_KEY) throw new Error('VAPI_API_KEY is not set');
  return axios.create({
    baseURL: VAPI_BASE_URL,
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Create or update a named assistant in Vapi.
 * Run this once (e.g. at deploy time) to register the assistant.
 *
 * @returns {Promise<{ id: string, name: string }>}
 */
async function createOrUpdateAssistant() {
  const client = vapiClient();
  const config = buildAssistantConfig();

  // Check if it already exists by name
  const { data: list } = await client.get('/assistant');
  const existing = list.find(a => a.name === config.name);

  if (existing) {
    logger.info(`[Vapi] Updating existing assistant: ${existing.id}`);
    const { data } = await client.patch(`/assistant/${existing.id}`, config);
    return data;
  }

  logger.info('[Vapi] Creating new assistant');
  const { data } = await client.post('/assistant', config);
  return data;
}

/**
 * Import a Twilio phone number into Vapi so inbound calls route through Vapi.
 * Twilio must be configured to forward to this number or use Vapi's SIP trunk.
 *
 * @param {string} twilioNumber   - E.164 Twilio number, e.g. "+15551234567"
 * @param {string} twilioSid      - TWILIO_ACCOUNT_SID
 * @param {string} twilioAuthToken- TWILIO_AUTH_TOKEN
 * @param {string} assistantId    - Vapi assistant ID to attach (optional)
 * @returns {Promise<object>}
 */
async function importTwilioNumber(twilioNumber, twilioSid, twilioAuthToken, assistantId) {
  const client = vapiClient();

  const payload = {
    provider    : 'twilio',
    number      : twilioNumber,
    twilioSid,
    twilioAuthToken,
  };

  if (assistantId) payload.assistantId = assistantId;

  logger.info(`[Vapi] Importing Twilio number ${twilioNumber}`);
  const { data } = await client.post('/phone-number', payload);
  logger.info(`[Vapi] Phone number imported: ${data.id}`);
  return data;
}

module.exports = {
  buildAssistantConfig,
  createOrUpdateAssistant,
  importTwilioNumber,
};
