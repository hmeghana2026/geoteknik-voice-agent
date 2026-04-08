/**
 * src/config/agentConfig.js
 * =========================
 * Centralised configuration for the Geoteknik Voice Agent.
 *
 * Agent identity: Geoteknik-Support
 * Domain: Geotechnical Engineering Software
 * Interaction target: ≤ 2 minutes, all responses ≤ 30 words
 */

require('dotenv').config();

const agentConfig = {

  // ── Identity ─────────────────────────────────────────────────────────
  identity: {
    name        : 'Geoteknik-Support',
    callsignName: 'Alex',                    // name used in greetings
    domain      : 'Geotechnical Engineering Software',
    voicePersona: 'Polly.Joanna',            // AWS Polly voice via Twilio
    language    : 'en-US',
  },

  // ── Twilio (telephony layer — phone number & SMS) ─────────────────────
  twilio: {
    accountSid : process.env.TWILIO_ACCOUNT_SID,
    authToken  : process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },

  // ── Vapi AI (conversation layer — STT, LLM, TTS, turn-taking) ────────
  // Vapi replaces TwiML gather/say. Twilio number is imported into Vapi
  // so inbound calls are handled end-to-end by Vapi, while function calls
  // (tool execution, KB search, ticketing) are dispatched back here.
  vapi: {
    apiKey      : process.env.VAPI_API_KEY,
    serverUrl   : process.env.VAPI_SERVER_URL,       // public URL of this server + /vapi/webhook
    serverSecret: process.env.VAPI_SERVER_SECRET,    // optional shared secret for webhook auth
    model       : process.env.VAPI_MODEL       || 'gpt-4o-mini',
    voiceProvider: process.env.VAPI_VOICE_PROVIDER || '11labs',
    voiceId     : process.env.VAPI_VOICE_ID    || 'sarah',
    maxDuration : parseInt(process.env.VAPI_MAX_DURATION) || 300,
  },

  // ── Server ───────────────────────────────────────────────────────────
  server: {
    port       : process.env.PORT || 3000,
    environment: process.env.NODE_ENV || 'development',
  },

  // ── Supabase ─────────────────────────────────────────────────────────
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  },

  // ── Voice / Speech Timings ────────────────────────────────────────────
  // Tuned for a ≤ 2-minute total call target.
  // Tighter timeouts keep the call moving; escalate on repeated silence.
  silenceTimeouts: {
    initialGreet          : parseInt(process.env.SILENCE_TIMEOUT_WELCOME)        || 15000,
    afterQuestion         : parseInt(process.env.SILENCE_TIMEOUT_QUESTION)       ||  8000,
    duringTroubleshooting : parseInt(process.env.SILENCE_TIMEOUT_TROUBLESHOOTING)||  6000,
    afterError            : parseInt(process.env.SILENCE_TIMEOUT_ERROR)          ||  5000,
    stepVerification      : parseInt(process.env.SILENCE_TIMEOUT_STEP)           || 10000,
  },

  // ── Silence Escalation ───────────────────────────────────────────────
  silenceEscalation: {
    maxRetries        : parseInt(process.env.MAX_SILENCE_RETRIES) || 2,
    // After maxRetries silences, offer human transfer
    escalationMessage :
      `I'm having trouble hearing you. Say "agent" to speak with a specialist, or try again.`,
  },

  // ── Supported Issue Domains ──────────────────────────────────────────
  // Mirrors the two primary domains in the system specification.
  issueDomains: {
    license_activation: {
      label      : 'License Activation (Error 404-L)',
      tools      : ['check_license_status', 'validate_license_key', 'activate_license'],
      collectsKey: true,   // must collect license key before resolving
    },
    report_generation: {
      label      : 'Soil Stability Report Generation',
      tools      : ['check_report_status', 'validate_project_data', 'restart_report_engine'],
      collectsKey: false,
    },
    general: {
      label      : 'General Software Support',
      tools      : [],
      collectsKey: false,
    },
  },

  // ── Verbal Cues (used in FSM prompts) ────────────────────────────────
  // Spec requires at least 3 per call.
  verbalCues: {
    acknowledge   : ['I see,', 'Got it,', 'Understood,', 'Of course,'],
    checking      : ['Let me check that —', 'Let me pull that up —', 'One moment —'],
    empathy       : ['I completely understand.', 'I hear you.', 'I appreciate your patience.'],
    knowledgeGap  : `That's a great question — let me escalate that to our specialist team.`,
    pivot         : `Got it, let me focus on that.`,
  },

  // ── Interaction Targets ───────────────────────────────────────────────
  interaction: {
    maxTotalSeconds   : 120,   // 2-minute target from spec
    maxWordsPerUtterance: 30,  // hard cap per spec
    minVerbalCuesPerCall: 3,   // spec requirement
    greetWithinSeconds: 15,    // spec: establish context within 15 s
  },

  // ── Troubleshooting Flow ─────────────────────────────────────────────
  troubleshooting: {
    maxDiagnosticRounds: 3,    // diagnose_1 → diagnose_2 → diagnose_3 → kb_search
    maxStepRetries     : 1,    // retry once before escalating
  },

  // ── Knowledge Base ───────────────────────────────────────────────────
  knowledgeBase: {
    enableWebScraping: process.env.ENABLE_WEB_SCRAPING   === 'true',
    enableCaching    : process.env.ENABLE_CONTEXT_CACHING === 'true',
    cacheExpiry      : 86400000,  // 24 hours
    searchLimit      : 5,
    vectorSimilarityThreshold: 0.72,
  },

  // ── Web Scraper Fallback ─────────────────────────────────────────────
  webscraper: {
    baseUrl       : process.env.GEOTEKNIK_WEBSITE_URL || 'https://www.geoteknikltd.com/tr/',
    searchPaths   : ['/support', '/manuals', '/faq', '/knowledge-base'],
    timeout       : parseInt(process.env.SCRAPE_TIMEOUT) || 10000,
    retryAttempts : 2,
  },

  // ── Session Management ────────────────────────────────────────────────
  session: {
    ttl          : 3600000,   // 1 hour in ms
    storeLocation: 'memory',  // Map-based in-process store
  },

  // ── Ticket / Escalation ───────────────────────────────────────────────
  escalation: {
    slaHours        : 4,      // specialist contacts caller within 4 hours
    sendSmsOnTicket : true,
  },

  // ── Logging ───────────────────────────────────────────────────────────
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file : process.env.LOG_FILE  || 'logs/agent.log',
  },

};

module.exports = agentConfig;