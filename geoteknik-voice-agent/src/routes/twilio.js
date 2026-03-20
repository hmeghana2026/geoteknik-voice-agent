/**
 * Geoteknik Voice Support Agent — Production Route Handler
 * =========================================================
 * Senior Conversational AI Engineer spec:
 *   - Multi-turn dialogue with strict state machine
 *   - Knowledge retrieval → step-by-step resolution
 *   - Automatic ticket creation + SMS confirmation
 *   - Sentiment detection & frustration escalation
 *   - Silent-caller handling with graceful reprompts
 */

'use strict';

require('dotenv').config();
const express  = require('express');
const twilio   = require('twilio');
const { searchManuals, saveCallHistory } = require('../services/supabase');
const { getAIResponse }  = require('../services/ai');
const { getEmbedding }   = require('../services/embeddings');

const router      = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

// ─────────────────────────────────────────────────────────────────────────────
// SESSION STORE  (replace with Redis in production)
// ─────────────────────────────────────────────────────────────────────────────
/** @type {Map<string, SessionState>} */
const sessions = new Map();

/**
 * @typedef {Object} SessionState
 * @property {string}   step          - FSM step name
 * @property {string}   status        - 'greeting'|'diagnosing'|'resolving'|'escalating'|'closed'
 * @property {string}   callerPhone
 * @property {string}   callerName
 * @property {string}   product       - product mentioned by caller
 * @property {string[]} symptoms      - accumulated symptom descriptions
 * @property {number}   diagRound     - how many diagnosis rounds completed
 * @property {object[]} steps         - solution steps from KB
 * @property {number}   stepIndex     - current solution step being tried
 * @property {number}   silenceCount  - consecutive silences this turn
 * @property {string}   email         - for ticket
 * @property {string}   ticketId      - assigned ticket number
 * @property {object[]} history       - full Q&A log
 */

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION STUBS  — wire up your real implementations here
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search the vector knowledge base for relevant manual content.
 * @param {string} query  - natural-language description of the issue
 * @returns {Promise<{steps: string[], raw: string}>}
 */
async function searchKnowledgeBase(query) {
  try {
    const embedding   = await getEmbedding(query);
    const chunks      = await searchManuals(embedding, null); // null = all products
    const raw         = chunks?.map(c => c.content).join('\n\n') || '';

    // Ask AI to structure the raw context into numbered steps
    if (!raw) return { steps: [], raw: '' };

    const structured  = await getAIResponse(
      `Break the solution for this issue into clear numbered steps. Issue: ${query}`,
      raw,
      { currentProduct: 'Geoteknik equipment' }
    );

    // Parse "1. … 2. …" style output into an array
    const steps = structured
      .split(/\n?\d+\.\s+/)
      .map(s => s.trim())
      .filter(Boolean);

    return { steps, raw };
  } catch (err) {
    console.error('[KB] searchKnowledgeBase error:', err.message);
    return { steps: [], raw: '' };
  }
}

/**
 * Create a support ticket in your ticketing system.
 * @param {{callerName:string, callerPhone:string, product:string, symptoms:string[], email:string, history:object[]}} issueDetails
 * @returns {Promise<string>} human-readable ticket ID, e.g. "GT-48271"
 */
async function createTicket(issueDetails) {
  try {
    const ticketNumber = `GT-${Math.floor(10000 + Math.random() * 90000)}`;

    // TODO: POST to your ticketing API (Jira, Freshdesk, Zendesk, etc.)
    // await ticketingClient.create({ id: ticketNumber, ...issueDetails });

    await saveCallHistory({
      phone_number : issueDetails.callerPhone,
      product_queried: issueDetails.product,
      summary      : `[${ticketNumber}] ${issueDetails.symptoms.join(' | ')}`,
      email        : issueDetails.email || null,
    }).catch(() => {});   // non-fatal

    console.log(`[TICKET] Created ${ticketNumber} for ${issueDetails.callerPhone}`);
    return ticketNumber;
  } catch (err) {
    console.error('[TICKET] createTicket error:', err.message);
    return `GT-${Date.now().toString().slice(-5)}`; // fallback ID
  }
}

/**
 * Send an SMS confirmation to the caller.
 * @param {string} phoneNumber  - E.164 format
 * @param {string} message
 * @returns {Promise<void>}
 */
async function sendSMS(phoneNumber, message) {
  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body : message,
      from : process.env.TWILIO_PHONE_NUMBER,
      to   : phoneNumber,
    });
    console.log(`[SMS] Sent to ${phoneNumber}: "${message.slice(0, 60)}..."`);
  } catch (err) {
    console.error('[SMS] sendSMS error:', err.message);
    // Non-fatal — the call should continue even if SMS fails
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SENTIMENT DETECTION
// ─────────────────────────────────────────────────────────────────────────────
const FRUSTRATION_KEYWORDS = [
  'frustrated', 'frustrating', 'annoyed', 'angry', 'useless',
  'ridiculous', 'speak to a human', 'real person', 'talk to someone',
  'agent', 'representative', 'supervisor', 'manager', 'this is crazy',
  "doesn't work", "still broken", "not working", "waste of time",
];

function detectFrustration(speech) {
  const lower = speech.toLowerCase();
  return FRUSTRATION_KEYWORDS.some(kw => lower.includes(kw));
}

// ─────────────────────────────────────────────────────────────────────────────
// VOICE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const VOICE    = { voice: 'Polly.Joanna' };  // warm, clear AWS Polly voice
const LANG     = 'en-US';
const TIMEOUT  = 12;   // seconds Twilio waits for speech before firing timeout

/** Build a <Gather> that redirects back to this endpoint on completion */
function gather(twiml, { timeout = TIMEOUT, hints = '' } = {}) {
  return twiml.gather({
    input        : 'speech',
    action       : '/twilio/incoming',
    method       : 'POST',
    speechTimeout: 'auto',
    language     : LANG,
    timeout,
    ...(hints ? { hints } : {}),
  });
}

/** Say + gather, with a fallback redirect if caller goes silent */
function sayAndListen(twiml, text, gatherOpts = {}) {
  const g = gather(twiml, gatherOpts);
  g.say(VOICE, text);
  twiml.redirect('/twilio/incoming');   // silence fallback → re-enter handler
}

/** Just speak then hang up */
function sayAndHang(twiml, text) {
  twiml.say(VOICE, text);
  twiml.hangup();
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION FACTORY
// ─────────────────────────────────────────────────────────────────────────────
function newSession(callerPhone) {
  return {
    step        : 'greet',
    status      : 'greeting',
    callerPhone,
    callerName  : '',
    product     : '',
    symptoms    : [],
    diagRound   : 0,
    steps       : [],
    stepIndex   : 0,
    silenceCount: 0,
    email       : '',
    ticketId    : '',
    history     : [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CALL HANDLER
// ─────────────────────────────────────────────────────────────────────────────
router.post('/incoming', async (req, res) => {
  const twiml       = new VoiceResponse();
  const callSid     = req.body.CallSid;
  const callerPhone = req.body.From || 'unknown';
  const speech      = (req.body.SpeechResult || '').trim();
  const confidence  = parseFloat(req.body.Confidence || '0');

  // Retrieve or create session
  let s = sessions.get(callSid) || newSession(callerPhone);
  console.log(`[${callSid}] step=${s.step} status=${s.status} speech="${speech}"`);

  // ── GLOBAL: Frustration catch ──────────────────────────────────────────────
  if (speech && detectFrustration(speech) && s.status !== 'escalating') {
    console.log(`[${callSid}] Frustration detected — routing to human`);
    s.step   = 'connect_human';
    s.status = 'escalating';
    sessions.set(callSid, s);
  }

  // ── GLOBAL: Silence handling ───────────────────────────────────────────────
  if (!speech && s.step !== 'greet') {
    s.silenceCount++;
    sessions.set(callSid, s);

    if (s.silenceCount === 1) {
      // First silence — gentle reprompt
      sayAndListen(twiml, "I'm sorry, I didn't catch that. Could you please repeat?");
      return send(res, twiml);
    } else {
      // Second consecutive silence — offer options
      s.silenceCount = 0;
      sayAndListen(
        twiml,
        "I still can't hear you. Say 'hold on' if you need a moment, " +
        "or say 'agent' to speak with a representative. Otherwise I'll stay on the line."
      );
      return send(res, twiml);
    }
  }

  // Reset silence counter on any real speech
  if (speech) s.silenceCount = 0;

  // ── FSM ───────────────────────────────────────────────────────────────────
  switch (s.step) {

    // ── 1. GREETING ──────────────────────────────────────────────────────────
    case 'greet': {
      s.step   = 'get_name';
      s.status = 'greeting';
      sessions.set(callSid, s);

      sayAndListen(
        twiml,
        "Thank you for calling Geoteknik Technical Support. " +
        "My name is Alex and I'm here to help you today. " +
        "To get started, could I please have your first name?"
      );
      break;
    }

    // ── 2. CAPTURE NAME ──────────────────────────────────────────────────────
    case 'get_name': {
      s.callerName = extractName(speech) || speech;
      s.step       = 'get_product';
      sessions.set(callSid, s);

      sayAndListen(
        twiml,
        `Thank you, ${s.callerName}. Which Geoteknik product are you calling about today? ` +
        `For example, a drone, GPS receiver, total station, or surveying equipment?`,
        { hints: 'drone, GPS, total station, scanner, GNSS, survey' }
      );
      break;
    }

    // ── 3. CAPTURE PRODUCT ───────────────────────────────────────────────────
    case 'get_product': {
      s.product = speech;
      s.step    = 'diagnose_1';
      s.status  = 'diagnosing';
      sessions.set(callSid, s);

      sayAndListen(
        twiml,
        `I understand you're having an issue with ${s.product}. ` +
        `I'd like to understand the problem fully before we look at solutions. ` +
        `Could you describe exactly what's happening?`
      );
      break;
    }

    // ── 4. DIAGNOSIS ROUND 1 ─────────────────────────────────────────────────
    case 'diagnose_1': {
      s.symptoms.push(speech);
      s.history.push({ role: 'caller', text: speech });
      s.step     = 'diagnose_2';
      s.diagRound = 1;
      sessions.set(callSid, s);

      const followUp = await getDiagnosticQuestion(s, speech, 1);
      sayAndListen(twiml, followUp);
      break;
    }

    // ── 5. DIAGNOSIS ROUND 2 ─────────────────────────────────────────────────
    case 'diagnose_2': {
      s.symptoms.push(speech);
      s.history.push({ role: 'caller', text: speech });
      s.step      = 'diagnose_3';
      s.diagRound = 2;
      sessions.set(callSid, s);

      const followUp = await getDiagnosticQuestion(s, speech, 2);
      sayAndListen(twiml, followUp);
      break;
    }

    // ── 6. DIAGNOSIS ROUND 3 → SEARCH KB ────────────────────────────────────
    case 'diagnose_3': {
      s.symptoms.push(speech);
      s.history.push({ role: 'caller', text: speech });
      s.diagRound = 3;

      sayAndListen(
        twiml,
        `Thank you, ${s.callerName}. I have a clear picture of the issue now. ` +
        `Let me search our technical knowledge base for you. One moment please.`
      );

      // Kick off KB search asynchronously — result handled on next turn
      s.step   = 'kb_searching';
      s.status = 'resolving';
      sessions.set(callSid, s);

      // Search and store results in session now (we're in async context)
      const query   = `${s.product} ${s.symptoms.join(' ')}`;
      const { steps } = await searchKnowledgeBase(query);

      if (steps.length > 0) {
        s.steps     = steps;
        s.stepIndex = 0;
        s.step      = 'resolve_step';
      } else {
        s.step   = 'no_kb_result';
        s.status = 'escalating';
      }
      sessions.set(callSid, s);

      // Force immediate re-entry to proceed to resolve/escalate
      twiml.redirect('/twilio/incoming');
      break;
    }

    // ── (Internal) KB search in progress ─────────────────────────────────────
    case 'kb_searching': {
      // Shouldn't normally land here; safety re-check
      twiml.redirect('/twilio/incoming');
      break;
    }

    // ── 7. WALK THROUGH SOLUTION STEPS ──────────────────────────────────────
    case 'resolve_step': {
      const stepNum  = s.stepIndex + 1;
      const total    = s.steps.length;
      const stepText = s.steps[s.stepIndex];

      s.history.push({ role: 'agent', text: `Step ${stepNum}: ${stepText}` });

      sayAndListen(
        twiml,
        `Here is step ${stepNum} of ${total}: ${stepText}. ` +
        `Please go ahead and try that, then let me know — did that resolve the issue?`,
        { hints: 'yes, no, partially, still not working' }
      );

      // Next turn will be 'resolve_check'
      s.step = 'resolve_check';
      sessions.set(callSid, s);
      break;
    }

    // ── 8. CHECK IF STEP WORKED ──────────────────────────────────────────────
    case 'resolve_check': {
      const positive = isPositive(speech);
      const negative = isNegative(speech);

      if (positive) {
        // ✅ Resolved!
        s.step   = 'resolved';
        s.status = 'closed';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');

      } else if (negative || !speech) {
        // ❌ Step didn't work
        s.stepIndex++;

        if (s.stepIndex < s.steps.length) {
          // More steps to try
          s.step = 'resolve_step';
          sessions.set(callSid, s);
          sayAndListen(
            twiml,
            `No problem, let's try the next step.`
          );
        } else {
          // All steps exhausted → escalate
          s.step   = 'escalate_ticket';
          s.status = 'escalating';
          sessions.set(callSid, s);
          twiml.redirect('/twilio/incoming');
        }

      } else {
        // Ambiguous — ask to clarify
        sayAndListen(
          twiml,
          `I want to make sure I understand — has the issue been fully resolved, ` +
          `or is it still occurring?`
        );
      }
      break;
    }

    // ── 9. NO KB RESULT ─────────────────────────────────────────────────────
    case 'no_kb_result': {
      s.step   = 'escalate_ticket';
      s.status = 'escalating';
      sessions.set(callSid, s);

      sayAndListen(
        twiml,
        `${s.callerName}, I wasn't able to find a solution in our knowledge base for that specific issue. ` +
        `I'd like to create a priority support ticket so our specialist team can look into this personally. ` +
        `Before I do that, could you share an email address so we can send you updates?`
      );
      break;
    }

    // ── 10. COLLECT EMAIL FOR TICKET ────────────────────────────────────────
    case 'escalate_ticket': {
      // First time in — ask for email
      if (!s.email && !isNegativeToEmail(speech)) {
        s.email = extractEmail(speech) || speech;
        sessions.set(callSid, s);
      }

      // Create the ticket
      const ticketId = await createTicket({
        callerName  : s.callerName,
        callerPhone : s.callerPhone,
        product     : s.product,
        symptoms    : s.symptoms,
        email       : s.email,
        history     : s.history,
      });

      s.ticketId = ticketId;
      s.step     = 'ticket_confirm';
      s.status   = 'escalating';
      sessions.set(callSid, s);

      // Send SMS asynchronously — don't await on the voice path
      const smsBody =
        `Geoteknik Support: Your ticket ${ticketId} has been created. ` +
        `A specialist will contact you within 4 business hours. ` +
        `Ref: ${s.product}.`;
      sendSMS(s.callerPhone, smsBody).catch(() => {});

      twiml.redirect('/twilio/incoming');
      break;
    }

    // ── 11. CONFIRM TICKET TO CALLER ────────────────────────────────────────
    case 'ticket_confirm': {
      sayAndListen(
        twiml,
        `I've created a support ticket for you. Your ticket number is ` +
        `${spellOutTicket(s.ticketId)}. ` +
        (s.email ? `A summary has also been sent to ${s.email}. ` : '') +
        `I've also sent a text message to your phone with the ticket number for your records. ` +
        `A Geoteknik specialist will contact you within four business hours. ` +
        `Is there anything else I can help you with today?`
      );
      s.step = 'post_ticket';
      sessions.set(callSid, s);
      break;
    }

    // ── 12. POST-TICKET: CLOSE OR MORE HELP ──────────────────────────────────
    case 'post_ticket': {
      if (isPositive(speech) || /more|another|also|yes/i.test(speech)) {
        s.step      = 'get_product';
        s.symptoms  = [];
        s.diagRound = 0;
        s.steps     = [];
        s.stepIndex = 0;
        sessions.set(callSid, s);
        sayAndListen(
          twiml,
          `Of course. What other product or issue can I help you with?`
        );
      } else {
        s.step   = 'farewell';
        s.status = 'closed';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');
      }
      break;
    }

    // ── 13. RESOLVED ────────────────────────────────────────────────────────
    case 'resolved': {
      sayAndListen(
        twiml,
        `Excellent! I'm really glad we could get that sorted for you, ${s.callerName}. ` +
        `Is there anything else I can help you with today?`
      );
      s.step = 'post_resolve';
      sessions.set(callSid, s);
      break;
    }

    // ── 14. POST-RESOLVE: CLOSE OR MORE HELP ────────────────────────────────
    case 'post_resolve': {
      if (isPositive(speech) || /more|another|also|yes/i.test(speech)) {
        s.step      = 'get_product';
        s.symptoms  = [];
        s.diagRound = 0;
        s.steps     = [];
        s.stepIndex = 0;
        sessions.set(callSid, s);
        sayAndListen(twiml, `Of course. What else can I help you with?`);
      } else {
        s.step   = 'farewell';
        s.status = 'closed';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');
      }
      break;
    }

    // ── 15. CONNECT TO HUMAN ────────────────────────────────────────────────
    case 'connect_human': {
      // In production: twiml.dial().queue('support-agents') or .number('+1...')
      sayAndHang(
        twiml,
        `I completely understand, ${s.callerName || 'and I\'m sorry for the trouble'}. ` +
        `Let me connect you with one of our senior support representatives right away. ` +
        `Please hold — they'll be with you in just a moment.`
      );
      await cleanupSession(callSid, s, 'transferred');
      break;
    }

    // ── 16. FAREWELL ────────────────────────────────────────────────────────
    case 'farewell': {
      sayAndHang(
        twiml,
        `Thank you for contacting Geoteknik Technical Support, ${s.callerName}. ` +
        `We appreciate your patience today. ` +
        `Have a wonderful day, and don't hesitate to call if you need us again. Goodbye.`
      );
      await cleanupSession(callSid, s, 'resolved');
      break;
    }

    // ── DEFAULT / UNKNOWN STEP ────────────────────────────────────────────
    default: {
      console.error(`[${callSid}] Unknown step: ${s.step}`);
      s.step = 'greet';
      sessions.set(callSid, s);
      twiml.redirect('/twilio/incoming');
    }
  }

  return send(res, twiml);
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function send(res, twiml) {
  res.type('text/xml');
  res.send(twiml.toString());
}

async function cleanupSession(callSid, s, outcome) {
  await saveCallHistory({
    phone_number   : s.callerPhone,
    product_queried: s.product,
    summary        : `[${outcome.toUpperCase()}] ${s.callerName} | ${s.symptoms.join(' | ')}`,
    ticket_id      : s.ticketId || null,
  }).catch(() => {});
  sessions.delete(callSid);
}

/**
 * Generate a contextual follow-up diagnostic question via AI.
 * Falls back to a sensible static question if AI is unavailable.
 */
async function getDiagnosticQuestion(session, lastSpeech, round) {
  const roundQuestions = {
    1: [
      `How long has this been happening with your ${session.product}?`,
      `When exactly did you first notice this issue?`,
    ],
    2: [
      `Have you made any changes recently — such as a firmware update, new installation, or environmental change?`,
      `Does the issue happen consistently, or only in certain conditions?`,
    ],
  };

  // Try AI-generated question first
  try {
    const prompt =
      `You are a Geoteknik technical support agent conducting diagnosis round ${round}. ` +
      `The customer said: "${lastSpeech}". ` +
      `Product: ${session.product}. Symptoms so far: ${session.symptoms.join('; ')}. ` +
      `Ask one precise, professional follow-up diagnostic question. No bullet points. One sentence only.`;
    const aiQ = await getAIResponse(prompt, '', { currentProduct: session.product });
    if (aiQ && aiQ.trim().length > 10) return aiQ.trim();
  } catch (_) { /* fall through */ }

  // Static fallback
  const options = roundQuestions[round] || roundQuestions[1];
  return options[Math.floor(Math.random() * options.length)];
}

function isPositive(text = '') {
  return /\b(yes|yeah|yep|yup|it works|it worked|fixed|great|perfect|resolved|working now|that did it|all good)\b/i.test(text);
}

function isNegative(text = '') {
  return /\b(no|nope|still|doesn't|not working|same|nothing|failed|didn't work|didn't help)\b/i.test(text);
}

function isNegativeToEmail(text = '') {
  return /\b(no|skip|don't|prefer not|not now)\b/i.test(text);
}

function extractName(text = '') {
  // Capture "my name is X", "it's X", "this is X", or just the first word
  const m = text.match(/(?:my name is|i'm|i am|it's|this is)\s+([A-Za-z]+)/i);
  if (m) return capitalise(m[1]);
  const words = text.trim().split(/\s+/);
  if (words.length === 1) return capitalise(words[0]);
  return '';
}

function extractEmail(text = '') {
  const m = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : '';
}

function capitalise(str = '') {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/** Convert "GT-48271" → "G T 4 8 2 7 1" so Polly reads each character */
function spellOutTicket(id = '') {
  return id.split('').join(' ');
}

module.exports = router;