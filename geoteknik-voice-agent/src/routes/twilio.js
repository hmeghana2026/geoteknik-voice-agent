/**
 * src/routes/twilio.js
 * ====================
 * Geoteknik Voice Support Agent — Production Call Handler
 * 
 * WIRED TO: src/services/knowledgeService.js
 *   searchKnowledgeBase() → tries real manuals first, demo KB second
 *   saveCallHistory()     → persists completed calls to Supabase
 */

'use strict';

require('dotenv').config();
const express   = require('express');
const twilio    = require('twilio');
const { searchKnowledgeBase, saveCallHistory } = require('../services/knowledgeService');
const { getAIResponse }  = require('../services/ai');

const router        = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

// ─────────────────────────────────────────────────────────────────────────────
// SESSION STORE
// ─────────────────────────────────────────────────────────────────────────────
/** @type {Map<string, SessionState>} */
const sessions = new Map();

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
    kbSource    : '',
    history     : [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function createTicket(issueDetails) {
  const ticketId = `GT-${Math.floor(10000 + Math.random() * 90000)}`;
  await saveCallHistory({
    phone_number   : issueDetails.callerPhone,
    product_queried: issueDetails.product,
    summary        : `[${ticketId}] ${issueDetails.symptoms.join(' | ')}`,
    email          : issueDetails.email || null,
    ticket_id      : ticketId,
  });
  console.log(`[TICKET] Created ${ticketId}`);
  return ticketId;
}

async function sendSMS(phoneNumber, message) {
  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to  : phoneNumber,
    });
    console.log(`[SMS] Sent to ${phoneNumber}`);
  } catch (err) {
    console.warn(`[SMS] Failed (non-fatal): ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FRUSTRATION KEYWORDS
// ─────────────────────────────────────────────────────────────────────────────
const FRUSTRATION_WORDS = [
  'frustrated','frustrating','annoyed','angry','furious','useless',
  'ridiculous','speak to a human','real person','talk to someone',
  'agent','representative','supervisor','manager','this is crazy',
  "doesn't work","still broken","not working","waste of time","terrible",
];

function isFrustrated(text) {
  const t = text.toLowerCase();
  return FRUSTRATION_WORDS.some(w => t.includes(w));
}

// ─────────────────────────────────────────────────────────────────────────────
// VOICE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const VOICE = { voice: 'Polly.Joanna' };
const LANG  = 'en-US';

function buildGather(twiml, timeout = 12) {
  return twiml.gather({
    input        : 'speech',
    action       : '/twilio/incoming',
    method       : 'POST',
    speechTimeout: 'auto',
    language     : LANG,
    timeout,
  });
}

function sayAndListen(twiml, text, timeout = 12) {
  const g = buildGather(twiml, timeout);
  g.say(VOICE, text);
  twiml.redirect('/twilio/incoming');
}

function sayAndHang(twiml, text) {
  twiml.say(VOICE, text);
  twiml.hangup();
}

function isYes(t = '') {
  return /\b(yes|yeah|yep|yup|correct|it works|fixed|great|perfect|resolved|working|that did it|all good|done|sorted)\b/i.test(t);
}

function isNo(t = '') {
  return /\b(no|nope|still|same issue|not working|didn't work|didn't help|nothing|failed|negative)\b/i.test(t);
}

function extractName(t = '') {
  const m = t.match(/(?:my name is|i'm|i am|it's|this is)\s+([A-Za-z]+)/i);
  if (m) return cap(m[1]);
  const w = t.trim().split(/\s+/);
  if (w.length <= 2) return cap(w[0]);
  return '';
}

function extractEmail(t = '') {
  const m = t.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : '';
}

function cap(s = '') {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function spellTicket(id = '') {
  return id.split('').join(' ');
}

function send(res, twiml) {
  res.type('text/xml');
  res.send(twiml.toString());
}

async function closeSession(callSid, s, outcome) {
  await saveCallHistory({
    phone_number   : s.callerPhone,
    product_queried: s.product,
    summary        : `[${outcome.toUpperCase()}] ${s.callerName} | ${s.symptoms.join(' | ')}`,
    ticket_id      : s.ticketId || null,
  });
  sessions.delete(callSid);
}

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNOSTIC QUESTIONS
// ─────────────────────────────────────────────────────────────────────────────
async function getDiagnosticQuestion(s, lastSpeech, round) {
  // Try AI-generated contextual question
  try {
    const prompt =
      `You are a Geoteknik technical support agent. ` +
      `Round ${round} of diagnosis. Product: ${s.product}. ` +
      `Caller just said: "${lastSpeech}". ` +
      `Symptoms so far: ${s.symptoms.join('; ')}. ` +
      `Ask ONE short professional follow-up diagnostic question. ` +
      `One sentence only. No lists. No preamble.`;
    const q = await getAIResponse(prompt, '', { currentProduct: s.product });
    if (q && q.trim().length > 10) return q.trim();
  } catch (_) {}

  // Hardcoded fallback by round
  const fallbacks = {
    1: `How long has this been happening with your ${s.product}?`,
    2: `Have you made any recent changes — like a firmware update, new settings, or a different environment?`,
    3: `What exactly happens on your screen or display when the issue occurs?`,
  };
  return fallbacks[round] || fallbacks[1];
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CALL HANDLER
// ─────────────────────────────────────────────────────────────────────────────
router.post('/incoming', async (req, res) => {
  const twiml       = new VoiceResponse();
  const callSid     = req.body.CallSid;
  const callerPhone = req.body.From || 'unknown';
  const speech      = (req.body.SpeechResult || '').trim();

  let s = sessions.get(callSid) || newSession(callerPhone);
  console.log(`[${callSid}] step=${s.step} speech="${speech.slice(0,60)}"`);

  // ── GLOBAL: Frustration intercept ─────────────────────────────────────
  if (speech && isFrustrated(speech) && s.status !== 'escalating') {
    s.step   = 'connect_human';
    s.status = 'escalating';
    sessions.set(callSid, s);
  }

  // ── GLOBAL: Double-silence protection ─────────────────────────────────
  if (!speech && !['greet','kb_searching'].includes(s.step)) {
    s.silenceCount = (s.silenceCount || 0) + 1;
    sessions.set(callSid, s);

    if (s.silenceCount === 1) {
      sayAndListen(twiml, "I'm sorry, I didn't catch that. Could you please repeat?");
      return send(res, twiml);
    } else {
      s.silenceCount = 0;
      sessions.set(callSid, s);
      sayAndListen(twiml,
        "I still can't hear you clearly. Say 'hold on' if you need a moment, " +
        "or say 'agent' to speak with a specialist."
      );
      return send(res, twiml);
    }
  }

  if (speech) s.silenceCount = 0;

  // ── FSM ───────────────────────────────────────────────────────────────
  switch (s.step) {

    // ── 1. GREET ──────────────────────────────────────────────────────
    case 'greet': {
      s.step = 'get_name';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        "Thank you for calling Geoteknik Technical Support. " +
        "My name is Alex and I'm here to help you today. " +
        "To get started, could I please have your first name?",
        15
      );
      break;
    }

    // ── 2. NAME ────────────────────────────────────────────────────────
    case 'get_name': {
      s.callerName = extractName(speech) || cap(speech.split(' ')[0]) || 'there';
      s.step       = 'get_product';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        `Thank you, ${s.callerName}. Which Geoteknik product are you calling about today? ` +
        `You can say drone, GPS receiver, total station, data collector, or laser scanner.`,
        15
      );
      break;
    }

    // ── 3. PRODUCT ─────────────────────────────────────────────────────
    case 'get_product': {
      s.product = speech;
      s.step    = 'diagnose_1';
      s.status  = 'diagnosing';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        `I understand you're having an issue with your ${s.product}. ` +
        `Before I look for a solution, I'd like to understand the problem fully. ` +
        `Could you describe exactly what is happening?`,
        20
      );
      break;
    }

    // ── 4–6. DIAGNOSIS ROUNDS ──────────────────────────────────────────
    case 'diagnose_1':
    case 'diagnose_2':
    case 'diagnose_3': {
      s.symptoms.push(speech);
      s.history.push({ role: 'caller', text: speech });
      s.diagRound++;

      if (s.diagRound < 3) {
        const nextStep = `diagnose_${s.diagRound + 1}`;
        s.step = nextStep;
        sessions.set(callSid, s);
        const followUp = await getDiagnosticQuestion(s, speech, s.diagRound);
        s.history.push({ role: 'agent', text: followUp });
        sessions.set(callSid, s);
        sayAndListen(twiml, followUp, 20);
      } else {
        // All 3 diagnosis rounds done — search KB
        s.step   = 'kb_searching';
        s.status = 'resolving';
        sessions.set(callSid, s);
        sayAndListen(twiml,
          `Thank you, ${s.callerName}. I have a clear picture of the issue now. ` +
          `Let me search our technical knowledge base. One moment please.`,
          3  // short timeout — we redirect immediately after KB search
        );
      }
      break;
    }

    // ── (Internal) KB SEARCH ───────────────────────────────────────────
    case 'kb_searching': {
      const query = `${s.product} ${s.symptoms.join(' ')}`;
      const result = await searchKnowledgeBase(query);

      if (result.steps.length > 0) {
        s.steps    = result.steps;
        s.stepIndex = 0;
        s.kbSource  = result.source;
        s.step      = 'resolve_intro';
        s.status    = 'resolving';
      } else {
        s.step   = 'no_kb_result';
        s.status = 'escalating';
      }
      sessions.set(callSid, s);
      twiml.redirect('/twilio/incoming');
      break;
    }

    // ── 7. RESOLUTION INTRO ────────────────────────────────────────────
    case 'resolve_intro': {
      const total = s.steps.length;
      const src   = s.kbSource === 'manual' ? 'our product manual' : 'our knowledge base';
      s.step = 'resolve_step';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        `Great news — I found a solution in ${src} for this issue. ` +
        `I have ${total} step${total > 1 ? 's' : ''} to walk you through. ` +
        `Let's go through them together. Say "ready" when you're in front of the equipment.`,
        20
      );
      break;
    }

    // ── 8. READ A STEP ─────────────────────────────────────────────────
    case 'resolve_step': {
      const stepNum  = s.stepIndex + 1;
      const total    = s.steps.length;
      const stepText = s.steps[s.stepIndex];
      s.history.push({ role: 'agent', text: `Step ${stepNum}: ${stepText}` });
      s.step = 'resolve_check';
      sessions.set(callSid, s);

      sayAndListen(twiml,
        `Step ${stepNum} of ${total}: ${stepText}. ` +
        `Please go ahead and try that now. ` +
        `Let me know — did that resolve the issue?`,
        30  // give time to try the step
      );
      break;
    }

    // ── 9. CHECK STEP RESULT ───────────────────────────────────────────
    case 'resolve_check': {
      if (isYes(speech)) {
        s.step   = 'resolved';
        s.status = 'closed';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');

      } else if (isNo(speech) || !speech) {
        s.stepIndex++;
        sessions.set(callSid, s);

        if (s.stepIndex < s.steps.length) {
          // More steps remain
          s.step = 'resolve_step';
          sessions.set(callSid, s);
          sayAndListen(twiml,
            `No problem — let's keep going. ` +
            `I have ${s.steps.length - s.stepIndex} more step${s.steps.length - s.stepIndex > 1 ? 's' : ''} to try.`
          );
        } else {
          // All steps exhausted
          s.step   = 'steps_exhausted';
          s.status = 'escalating';
          sessions.set(callSid, s);
          twiml.redirect('/twilio/incoming');
        }

      } else {
        // Ambiguous — clarify
        sayAndListen(twiml,
          `Just to confirm — has the issue been fully resolved, or is it still occurring?`,
          15
        );
      }
      break;
    }

    // ── 10. ISSUE RESOLVED ✅ ──────────────────────────────────────────
    case 'resolved': {
      s.step = 'post_resolve';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        `Excellent! I'm really glad we could get that sorted for you, ${s.callerName}. ` +
        `Is there anything else I can help you with today?`,
        15
      );
      break;
    }

    case 'post_resolve': {
      if (isYes(speech) || /more|another|also|yes/i.test(speech)) {
        // Reset for new issue, keep name
        s.step      = 'get_product';
        s.symptoms  = [];
        s.diagRound = 0;
        s.steps     = [];
        s.stepIndex = 0;
        sessions.set(callSid, s);
        sayAndListen(twiml, `Of course. What other product or issue can I help you with?`);
      } else {
        s.step = 'farewell';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');
      }
      break;
    }

    // ── 11. NO KB RESULT ───────────────────────────────────────────────
    case 'no_kb_result': {
      s.step = 'get_email';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        `${s.callerName}, I wasn't able to find a solution in our knowledge base for that specific issue. ` +
        `I'd like to create a priority support ticket so a specialist can look into this for you personally. ` +
        `Could you share an email address so we can send you updates? ` +
        `Or say "skip" to continue without an email.`,
        20
      );
      break;
    }

    // ── 11b. STEPS EXHAUSTED ───────────────────────────────────────────
    case 'steps_exhausted': {
      s.step = 'get_email';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        `I've walked through all the standard steps and I'm sorry we haven't been able to resolve this yet. ` +
        `I'd like to escalate this to one of our senior specialists. ` +
        `Could I get your email address so we can follow up with you? Or say "skip".`,
        20
      );
      break;
    }

    // ── 12. CAPTURE EMAIL ─────────────────────────────────────────────
    case 'get_email': {
      s.email = extractEmail(speech) || (/skip/i.test(speech) ? '' : speech);
      s.step  = 'create_ticket';
      sessions.set(callSid, s);
      twiml.redirect('/twilio/incoming');
      break;
    }

    // ── 13. CREATE TICKET ─────────────────────────────────────────────
    case 'create_ticket': {
      const ticketId = await createTicket({
        callerName : s.callerName,
        callerPhone: s.callerPhone,
        product    : s.product,
        symptoms   : s.symptoms,
        email      : s.email,
        history    : s.history,
      });
      s.ticketId = ticketId;
      s.step     = 'ticket_confirm';
      sessions.set(callSid, s);

      // SMS async — don't block voice path
      const smsBody =
        `Geoteknik Support: Ticket ${ticketId} created for your ${s.product} issue. ` +
        `A specialist will contact you within 4 business hours.`;
      sendSMS(s.callerPhone, smsBody);

      twiml.redirect('/twilio/incoming');
      break;
    }

    // ── 14. CONFIRM TICKET ────────────────────────────────────────────
    case 'ticket_confirm': {
      s.step = 'post_ticket';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        `Your support ticket has been created. Your ticket number is ` +
        `${spellTicket(s.ticketId)}. ` +
        (s.email ? `A summary will be sent to ${s.email}. ` : '') +
        `I've also sent a text message to your phone with the ticket number. ` +
        `A Geoteknik specialist will contact you within four business hours. ` +
        `Is there anything else I can help you with today?`,
        15
      );
      break;
    }

    case 'post_ticket': {
      if (isYes(speech) || /more|another|also|yes/i.test(speech)) {
        s.step = 'get_product'; s.symptoms = []; s.diagRound = 0;
        s.steps = []; s.stepIndex = 0;
        sessions.set(callSid, s);
        sayAndListen(twiml, `Of course. What else can I help you with?`);
      } else {
        s.step = 'farewell';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');
      }
      break;
    }

    // ── 15. CONNECT TO HUMAN ──────────────────────────────────────────
    case 'connect_human': {
      sayAndHang(twiml,
        `I completely understand, ${s.callerName || 'and I\'m sorry for any frustration'}. ` +
        `Let me connect you with one of our senior support representatives right away. ` +
        `Please hold — they'll be with you shortly.`
      );
      // TODO: twiml.dial().queue('geoteknik-support') or .number('+1...')
      await closeSession(callSid, s, 'transferred');
      break;
    }

    // ── 16. FAREWELL ──────────────────────────────────────────────────
    case 'farewell': {
      sayAndHang(twiml,
        `Thank you for contacting Geoteknik Technical Support, ${s.callerName}. ` +
        `We really appreciate your patience today. ` +
        `Have a wonderful day, and don't hesitate to call if you need us again. Goodbye.`
      );
      await closeSession(callSid, s, s.ticketId ? 'ticketed' : 'resolved');
      break;
    }

    default: {
      console.error(`[${callSid}] Unknown step: ${s.step} — resetting`);
      s.step = 'greet';
      sessions.set(callSid, s);
      twiml.redirect('/twilio/incoming');
    }
  }

  return send(res, twiml);
});

module.exports = router;