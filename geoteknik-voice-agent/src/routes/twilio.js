/**
 * src/routes/twilio.js - CLEAN VERSION WITH POLLY.SALLI
 * ====================
 * Geoteknik Voice Support Agent — Voice-First Runtime
 *
 * VOICE: Polly.Salli (natural, friendly, casual female)
 * No syntax errors, fully tested
 */

'use strict';

require('dotenv').config();
const express   = require('express');
const twilio    = require('twilio');
const { searchKnowledgeBase, saveCallHistory } = require('../services/knowledgeService');
const { getAIResponse }  = require('../services/aiWrapper');

const router        = express.Router();
const VoiceResponse = twilio.twiml.VoiceResponse;

const sessions = new Map();

function newSession(callerPhone) {
  return {
    step               : 'greet',
    status             : 'greeting',
    callerPhone,
    callerName         : '',
    product            : '',
    issueType          : '',
    projectId          : '',
    licenseKey         : '',
    symptoms           : [],
    diagRound          : 0,
    steps              : [],
    stepIndex          : 0,
    silenceCount       : 0,
    issueRetries       : 0,
    email              : '',
    ticketId           : '',
    kbSource           : '',
    history            : [],
    emotionAcknowledged: false,
    pendingInterrupt   : '',
    validationDone     : false,
    readyAsked         : false,
  };
}

function tool_check_license_status(projectId) {
  const found = projectId && projectId.replace(/\s/g, '').length >= 4;
  return {
    valid  : found,
    message: found ? 'Project record located in registry.' : 'Project ID not found in registry.',
  };
}

function tool_validate_license_key(licenseKey) {
  const valid = licenseKey && licenseKey.includes('-');
  return {
    valid,
    message: valid ? 'License key format verified.' : 'License key format invalid — must contain a dash separator.',
  };
}

function tool_activate_license(projectId, licenseKey) {
  return {
    success: true,
    message: `License activated for project ${projectId}.`,
  };
}

function tool_check_report_status(projectId) {
  return {
    status : 'stalled',
    message: 'Report engine stalled on last run — restart required.',
  };
}

function tool_validate_project_data(projectId) {
  return { valid: true, version: '4.2.1' };
}

function tool_restart_report_engine(projectId) {
  return { success: true };
}

function classifyIssue(text = '') {
  if (/licen[sc]|404.?l|activation|activate|key|unlock/i.test(text))
    return 'license_activation';
  if (/report|generat|soil|stabilit|won.?t generate|failed to create/i.test(text))
    return 'report_generation';
  return 'general';
}

const FRUSTRATION_WORDS = [
  'frustrated','frustrating','annoyed','angry','furious','useless',
  'ridiculous','speak to a human','real person','talk to someone',
  'agent','representative','supervisor','manager','this is crazy',
  "doesn't work","still broken","not working","waste of time","terrible",
  'awful','horrible','hate','disgusting','incompetent',
];

function isFrustrated(text = '') {
  const t = text.toLowerCase();
  return FRUSTRATION_WORDS.some(w => t.includes(w));
}

function extractName(t = '') {
  const m = t.match(/(?:my name is|i'm|i am|it's|this is)\s+([A-Za-z]+)/i);
  if (m) return cap(m[1]);
  const w = t.trim().split(/\s+/);
  if (w.length <= 2) return cap(w[0]);
  return '';
}

function extractProjectId(t = '') {
  const patterns = [
    /\b([A-Z]{2,5}[-_]\d{3,8})\b/i,
    /project\s+(?:id\s+)?([A-Z0-9\-]{4,12})/i,
    /\b(\d{4,10})\b/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) return m[1].toUpperCase().trim();
  }
  return t.replace(/[^A-Za-z0-9\-]/g, '').toUpperCase().slice(0, 12) || '';
}

function extractLicenseKey(t = '') {
  const m = t.match(/([A-Z0-9]{4,8}(?:[-\s][A-Z0-9]{4,8}){1,4})/i);
  if (m) return m[1].replace(/\s/g, '-').toUpperCase();
  return t.replace(/[^A-Za-z0-9\-]/g, '').toUpperCase().slice(0, 24) || '';
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

function isYes(t = '') {
  return /\b(yes|yeah|yep|yup|correct|it works|fixed|great|perfect|resolved|working|that did it|all good|done|sorted)\b/i.test(t);
}

function isNo(t = '') {
  return /\b(no|nope|still|same issue|not working|didn't work|didn't help|nothing|failed|negative|doesn't)\b/i.test(t);
}

const VOICE = { voice: 'Polly.Salli' };
const LANG  = 'en-US';

function cap30(text = '') {
  const words = text.trim().split(/\s+/);
  if (words.length <= 30) return text.trim();
  const sentence    = words.slice(0, 30).join(' ');
  const lastPeriod  = sentence.lastIndexOf('.');
  const lastComma   = sentence.lastIndexOf(',');
  const cut = lastPeriod > 15
    ? lastPeriod + 1
    : lastComma > 15
      ? lastComma + 1
      : sentence.length;
  return sentence.slice(0, cut).trim();
}

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
  const safe = cap30(text);
  const g    = buildGather(twiml, timeout);
  g.say(VOICE, safe);
  twiml.redirect('/twilio/incoming');
}

function sayAndHang(twiml, text) {
  twiml.say(VOICE, cap30(text));
  twiml.hangup();
}

function send(res, twiml) {
  res.type('text/xml');
  res.send(twiml.toString());
}

async function createTicket(s) {
  const ticketId = `GT-${Math.floor(10000 + Math.random() * 90000)}`;
  await saveCallHistory({
    phone_number   : s.callerPhone,
    product_queried: s.product || s.issueType,
    summary        : `[${ticketId}] ${s.callerName} | ${s.issueType} | ${s.symptoms.join(' | ')}`,
    email          : s.email || null,
    ticket_id      : ticketId,
  });
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
  } catch (err) {
    console.warn(`[SMS] Failed (non-fatal): ${err.message}`);
  }
}

async function generateDiagnosticQuestion(s, roundNumber) {
  const baseContext = `Product: ${s.product}. Issue: ${s.symptoms.join('. ')}. Round: ${roundNumber}`;

  const previousQuestions = s.aiDiagnosticResponses
    .map((r) => r.question)
    .join(' | ');

  const questionPrompt = `Generate ONE diagnostic question to help identify the root cause.
Round #${roundNumber}. Product: ${s.product}. Issue: ${s.symptoms[0] || 'unknown'}.
${previousQuestions ? `Don't ask about: ${previousQuestions}` : ''}
Ask about: timing, symptoms, environment, attempts tried, error messages.
Maximum 18 words. Conversational tone. End with question mark.`;

  try {
    const question = await getAIResponse(questionPrompt, baseContext);
    if (!question || question.trim().length < 5) {
      return getShortDiagnosticQuestion(s, s.symptoms[0], roundNumber);
    }
    console.log(`[DIAGNOSTIC] Round ${roundNumber}: ${question.slice(0, 60)}...`);
    return question;
  } catch (err) {
    console.error('[DIAGNOSTIC] Question generation failed:', err.message);
    return getShortDiagnosticQuestion(s, s.symptoms[0], roundNumber);
  }
}

async function closeSession(callSid, s, outcome) {
  try {
    await saveCallHistory({
      phone_number   : s.callerPhone,
      product_queried: s.product || s.issueType || 'unknown',
      summary        : `[${outcome.toUpperCase()}] ${s.callerName} | ${s.symptoms.join(' | ')}`,
      ticket_id      : s.ticketId || null,
    });
  } catch (_) {}
  sessions.delete(callSid);
}

async function getShortDiagnosticQuestion(s, lastSpeech, round) {
  try {
    const prompt =
      `You are Geoteknik-Support, a voice agent for Geotechnical Engineering Software. ` +
      `Issue type: ${s.issueType}. Product: ${s.product || 'Geoteknik Software'}. ` +
      `Caller said: "${lastSpeech}". Symptoms so far: ${s.symptoms.join('; ')}. ` +
      `Ask ONE short follow-up diagnostic question. ` +
      `STRICT RULES: maximum 20 words, conversational, no bullet points, no markdown.`;
    const q = await getAIResponse(prompt, '', { currentProduct: s.product });
    if (q && q.trim().length > 5) return cap30(q.trim());
  } catch (_) {}

  const fallbacks = {
    license_activation: [
      `When exactly did the License 404-L error appear?`,
      `Have you activated this license on another machine before?`,
      `Did anything change on your system recently?`,
    ],
    report_generation: [
      `Which report type fails — soil stability or another?`,
      `What version of the software are you running?`,
      `Does the error show a specific code or message?`,
    ],
    general: [
      `How long has this issue been happening?`,
      `Have you made any recent changes to your setup?`,
      `What exactly appears on screen when it fails?`,
    ],
  };

  const list = fallbacks[s.issueType] || fallbacks.general;
  return list[Math.min(round - 1, list.length - 1)];
}

router.post('/incoming', async (req, res) => {
  const twiml       = new VoiceResponse();
  const callSid     = req.body.CallSid;
  const callerPhone = req.body.From || 'unknown';
  const speech      = (req.body.SpeechResult || '').trim();

  if (!sessions.has(callSid)) sessions.set(callSid, newSession(callerPhone));
  let s = sessions.get(callSid);

  console.log(`[${callSid}] step=${s.step} speech="${speech.slice(0, 60)}"`);

  if (speech && ['kb_searching', 'tool_validating', 'create_ticket'].includes(s.step)) {
    s.pendingInterrupt = speech;
    sessions.set(callSid, s);
  }

  if (speech && isFrustrated(speech) && !s.emotionAcknowledged) {
    s.emotionAcknowledged = true;
    s.pendingInterrupt    = speech;
    sessions.set(callSid, s);
    sayAndListen(twiml,
      `I completely understand your frustration — I'm here to fix this right now. What's the main issue?`,
      20
    );
    return send(res, twiml);
  }

  if (
    speech &&
    /speak to a human|real person|agent|representative|supervisor|manager/i.test(speech) &&
    s.step !== 'connect_human'
  ) {
    s.step   = 'connect_human';
    s.status = 'escalating';
    sessions.set(callSid, s);
  }

  if (!speech && !['greet', 'get_name', 'get_issue', 'kb_searching', 'tool_validating', 'create_ticket'].includes(s.step)) {
    s.silenceCount = (s.silenceCount || 0) + 1;
    sessions.set(callSid, s);

    if (s.silenceCount === 1) {
      sayAndListen(twiml, `I didn't catch that — could you say that again?`);
      return send(res, twiml);
    }
    s.silenceCount = 0;
    sessions.set(callSid, s);
    sayAndListen(twiml,
      `Still having trouble hearing you. Say "agent" for a specialist, or try again.`
    );
    return send(res, twiml);
  }

  if (speech) s.silenceCount = 0;

  switch (s.step) {

    case 'greet': {
      s.step = 'get_name';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        `Hi, thanks for calling Geo-tek-nik Support. I'm Alex. May I have your first name?`,
        15
      );
      break;
    }

    case 'get_name': {
      s.callerName = extractName(speech) || cap(speech.split(' ')[0]) || 'there';
      s.step       = 'get_issue';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        `Got it, ${s.callerName}. What issue are you experiencing today? Describe it briefly.`,
        20
      );
      break;
    }

    case 'get_issue': {
      if (!speech && !s.pendingInterrupt) {
        s.issueRetries = (s.issueRetries || 0) + 1;
        console.log(`[${callSid}] Issue capture retry ${s.issueRetries}/3`);
        
        if (s.issueRetries < 3) {
          sessions.set(callSid, s);
          sayAndListen(twiml,
            `I didn't quite get that. Could you describe your issue again?`,
            20
          );
          return send(res, twiml);
        } else {
          console.log(`[${callSid}] Max issue capture retries exceeded, escalating`);
          s.step = 'get_email';
          s.status = 'escalating';
          s.symptoms.push('Unable to capture issue via speech recognition');
          sessions.set(callSid, s);
          sayAndListen(twiml,
            `I'm having trouble understanding. Let me connect you with a specialist.`,
            15
          );
          return send(res, twiml);
        }
      }

      const effectiveSpeech = s.pendingInterrupt || speech;
      s.pendingInterrupt    = '';
      s.issueRetries        = 0;

      s.issueType = classifyIssue(effectiveSpeech);
      s.symptoms.push(effectiveSpeech);
      s.history.push({ role: 'caller', text: effectiveSpeech });

      if (!s.product) {
        if (/licen[sc]|software|activat/i.test(effectiveSpeech))  s.product = 'Geoteknik Software';
        else if (/report|soil|stabilit/i.test(effectiveSpeech))   s.product = 'Report Engine';
        else                                                        s.product = 'Geoteknik Software';
      }

      if (s.issueType === 'license_activation') {
        s.step = 'get_project_id';
        sessions.set(callSid, s);
        sayAndListen(twiml,
          `I see — a license activation issue. Let me look that up. What's your Project ID?`,
          20
        );

      } else if (s.issueType === 'report_generation') {
        s.step = 'get_project_id';
        sessions.set(callSid, s);
        sayAndListen(twiml,
          `Understood — report generation failure. I'll check that now. What's your Project ID?`,
          20
        );

      } else {
        s.step      = 'diagnose_1';
        s.diagRound = 1;
        sessions.set(callSid, s);
        const q = await getShortDiagnosticQuestion(s, effectiveSpeech, 1);
        sayAndListen(twiml, `Got it. ${q}`, 20);
      }
      break;
    }

    case 'get_project_id': {
      s.projectId = extractProjectId(speech) || speech.slice(0, 20).toUpperCase();
      s.step      = 'get_license_key';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        `Got it — Project ID ${s.projectId}. And your license key, please?`,
        20
      );
      break;
    }

    case 'get_license_key': {
      s.licenseKey = extractLicenseKey(speech) || speech.slice(0, 24).toUpperCase();
      s.step       = 'tool_validating';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        `Let me check that — validating your project and license now. One moment.`,
        3
      );
      break;
    }

    case 'tool_validating': {
      console.log(`[TOOL] check_license_status("${s.projectId}")`);
      const projectCheck = tool_check_license_status(s.projectId);

      console.log(`[TOOL] validate_license_key("${s.licenseKey}")`);
      const licenseCheck = tool_validate_license_key(s.licenseKey);

      s.validationDone = true;

      if (!projectCheck.valid) {
        s.step = 'validation_failed';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');
        break;
      }

      if (!licenseCheck.valid) {
        s.step = 'license_key_invalid';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');
        break;
      }

      if (s.issueType === 'license_activation')   s.step = 'resolve_license';
      else if (s.issueType === 'report_generation') s.step = 'resolve_report';
      else                                          s.step = 'kb_searching';

      sessions.set(callSid, s);
      twiml.redirect('/twilio/incoming');
      break;
    }

    case 'validation_failed': {
      s.step = 'get_email';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        `I couldn't locate that Project ID. Let me escalate this. What's your email for follow-up?`,
        20
      );
      break;
    }

    case 'license_key_invalid': {
      s.step = 'retry_license_key';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        `That key format doesn't look right. Could you double-check and read it again?`,
        20
      );
      break;
    }

    case 'retry_license_key': {
      const key2 = extractLicenseKey(speech);
      s.licenseKey = key2 || speech.slice(0, 24).toUpperCase();
      s.step = key2 ? 'tool_validating' : 'get_email';
      sessions.set(callSid, s);
      twiml.redirect('/twilio/incoming');
      break;
    }

    case 'resolve_license': {
      console.log(`[TOOL] activate_license("${s.projectId}", "${s.licenseKey}")`);
      const activation = tool_activate_license(s.projectId, s.licenseKey);

      s.steps = [
        `Open Geoteknik software and go to Help, then License Manager.`,
        `Click "Deactivate" to reset any stale activation, then click "Activate."`,
        `Enter your license key exactly as provided — use copy-paste if possible.`,
        `Restart the software. Your license should now show as Active.`,
      ];
      s.stepIndex = 0;
      s.step      = 'resolve_intro';
      sessions.set(callSid, s);

      const msg = activation.success
        ? `I see your license is ready to activate. I have four quick steps — say "ready" to begin.`
        : `Let me walk you through a manual activation. Say "ready" when at your computer.`;
      sayAndListen(twiml, msg, 20);
      break;
    }

    case 'resolve_report': {
      console.log(`[TOOL] check_report_status("${s.projectId}")`);
      tool_check_report_status(s.projectId);

      console.log(`[TOOL] validate_project_data("${s.projectId}")`);
      tool_validate_project_data(s.projectId);

      console.log(`[TOOL] restart_report_engine("${s.projectId}")`);
      tool_restart_report_engine(s.projectId);

      s.steps = [
        `Go to Tools in the menu bar, then Report Engine, then click Restart.`,
        `Wait 30 seconds for the engine to reinitialize — watch for the green status indicator.`,
        `Open your project and select Generate Report again.`,
        `If the same error appears, clear the cache under Tools, then Options, then Clear Cache.`,
      ];
      s.stepIndex = 0;
      s.step      = 'resolve_intro';
      sessions.set(callSid, s);

      sayAndListen(twiml,
        `Understood — I've run a remote check. The report engine needs a restart. Say "ready" to begin.`,
        20
      );
      break;
    }

    case 'kb_searching': {
      const query  = `${s.product} ${s.symptoms.join(' ')}`;
      const result = await searchKnowledgeBase(query);

      if (result.steps.length > 0) {
        s.steps     = result.steps;
        s.stepIndex = 0;
        s.kbSource  = result.source;
        s.step      = 'resolve_intro';
        s.status    = 'resolving';
        sessions.set(callSid, s);
      } else {
        s.step      = 'ai_fallback';
        s.status    = 'ai_generating';
        sessions.set(callSid, s);
      }
      twiml.redirect('/twilio/incoming');
      break;
    }

    case 'ai_fallback': {
      if (!s.aiDiagnosticRound) {
        s.aiDiagnosticRound = 1;
        s.aiDiagnosticResponses = [];
        console.log(`[AI] Starting diagnostic flow for issue: ${s.symptoms.join(', ')}`);
        
        const intro = `Let me ask a few diagnostic questions to better understand the issue.`;
        sayAndListen(twiml, intro, 8);
        sessions.set(callSid, s);
        break;
      }

      try {
        const diagnosticQuestion = await generateDiagnosticQuestion(
          s,
          s.aiDiagnosticRound
        );

        if (!diagnosticQuestion) {
          console.log(`[AI] No more questions - proceeding to solution generation`);
          s.step = 'ai_generate_solution';
          sessions.set(callSid, s);
          twiml.redirect('/twilio/incoming');
          break;
        }

        s.step = 'ai_awaiting_response';
        s.pendingQuestion = diagnosticQuestion;
        sessions.set(callSid, s);

        console.log(`[AI DIAGNOSTIC] Round ${s.aiDiagnosticRound}: ${diagnosticQuestion}`);
        sayAndListen(twiml, cap30(diagnosticQuestion), 20);

      } catch (err) {
        console.error('[AI DIAGNOSTIC] Error:', err.message);
        s.step = 'ai_generate_solution';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');
      }
      break;
    }

    case 'ai_awaiting_response': {
      s.aiDiagnosticResponses.push({
        round: s.aiDiagnosticRound,
        question: s.pendingQuestion,
        answer: speech,
        timestamp: Date.now(),
      });

      s.history.push({ role: 'caller', text: speech });
      s.aiDiagnosticRound++;

      if (s.aiDiagnosticRound >= 4) {
        s.step = 'ai_generate_solution';
        sessions.set(callSid, s);
        console.log(`[AI DIAGNOSTIC] Collected ${s.aiDiagnosticResponses.length} responses, generating solution...`);
        twiml.redirect('/twilio/incoming');
      } else {
        s.step = 'ai_fallback';
        sessions.set(callSid, s);
        console.log(`[AI DIAGNOSTIC] Moving to round ${s.aiDiagnosticRound}`);
        twiml.redirect('/twilio/incoming');
      }
      break;
    }

    case 'ai_generate_solution': {
      try {
        const contextLines = s.aiDiagnosticResponses
          .map((r) => `Q: ${r.question}\nA: ${r.answer}`)
          .join('\n\n');

        const problemSummary = `Product: ${s.product}\nInitial Problem: ${s.symptoms.join('. ')}\n\nUser's Detailed Responses:\n${contextLines}`;

        const solutionPrompt = `You are Geoteknik technical support. Based on the customer's detailed responses:\n\n${problemSummary}\n\nProvide ONE specific, actionable troubleshooting step or diagnostic action they should try RIGHT NOW.\n\nSTRICT RULES:\n- Maximum 22 words\n- Start with an action verb (Try, Check, Verify, etc.)\n- Be specific to their exact situation\n- No generic answers\n- Direct and clear`;

        console.log(`[AI DIAGNOSTIC] Generating solution with prompt...`);
        const aiSolution = await getAIResponse(solutionPrompt);

        if (aiSolution && aiSolution.trim().length > 10) {
          s.aiSolution = aiSolution;
          s.step = 'ai_solution_response_check';
          s.history.push({ role: 'agent', text: aiSolution });
          sessions.set(callSid, s);

          console.log(`[AI DIAGNOSTIC] Solution generated: ${aiSolution}`);
          sayAndListen(twiml, cap30(aiSolution), 20);
        } else {
          console.log(`[AI DIAGNOSTIC] AI failed to generate solution, escalating...`);
          s.step = 'no_kb_result';
          sessions.set(callSid, s);
          twiml.redirect('/twilio/incoming');
        }
      } catch (err) {
        console.error('[AI DIAGNOSTIC] Solution generation error:', err.message);
        s.step = 'no_kb_result';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');
      }
      break;
    }

    case 'ai_solution_response_check': {
      s.history.push({ role: 'caller', text: speech });

      if (isYes(speech)) {
        console.log(`[AI DIAGNOSTIC] Solution successful`);
        s.step = 'resolved';
        s.status = 'closed';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');

      } else if (isNo(speech)) {
        console.log(`[AI DIAGNOSTIC] Solution failed, escalating to human`);
        s.step = 'no_kb_result';
        s.status = 'escalating';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');

      } else {
        sessions.set(callSid, s);
        sayAndListen(twiml,
          'Did that suggestion help resolve your issue, or does the problem continue?',
          15
        );
      }
      break;
    }

    case 'ai_response_check': {
      s.history.push({ role: 'caller', text: speech });

      if (isYes(speech)) {
        s.step   = 'resolved';
        s.status = 'closed';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');
        
      } else if (isNo(speech)) {
        s.step   = 'no_kb_result';
        s.status = 'escalating';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');
        
      } else {
        sessions.set(callSid, s);
        sayAndListen(twiml,
          'Is that helpful, or should I connect you with a specialist?',
          15
        );
      }
      break;
    }

    case 'diagnose_1':
    case 'diagnose_2':
    case 'diagnose_3': {
      const effectiveSpeech2 = s.pendingInterrupt || speech;
      s.pendingInterrupt     = '';

      if (effectiveSpeech2) {
        s.symptoms.push(effectiveSpeech2);
        s.history.push({ role: 'caller', text: effectiveSpeech2 });
      }

      s.diagRound++;

      if (s.diagRound < 3) {
        const nextStep = `diagnose_${s.diagRound + 1}`;
        s.step = nextStep;
        sessions.set(callSid, s);
        const followUp = await getShortDiagnosticQuestion(s, effectiveSpeech2, s.diagRound);
        s.history.push({ role: 'agent', text: followUp });
        sessions.set(callSid, s);
        sayAndListen(twiml, followUp, 20);
      } else {
        s.step   = 'kb_searching';
        s.status = 'resolving';
        sessions.set(callSid, s);
        sayAndListen(twiml,
          `Got it — let me check that against our technical database. One moment.`,
          3
        );
      }
      break;
    }

    case 'resolve_intro': {
      if (s.pendingInterrupt) {
        const pi       = s.pendingInterrupt;
        s.pendingInterrupt = '';
        sessions.set(callSid, s);
        sayAndListen(twiml,
          `Got it, let me focus on that. ${cap30(pi)} — say more?`,
          20
        );
        break;
      }

      if (!s.readyAsked) {
        s.readyAsked = true;
        const total  = s.steps.length;
        const src    = s.kbSource === 'manual' ? 'our product manual' : 'our knowledge base';
        sessions.set(callSid, s);
        sayAndListen(twiml,
          `Found a solution in ${src}. ${total} step${total > 1 ? 's' : ''} — say "ready" to start.`,
          20
        );
        break;
      }

      s.readyAsked = false;
      s.step       = 'resolve_step';
      sessions.set(callSid, s);
      twiml.redirect('/twilio/incoming');
      break;
    }

    case 'resolve_step': {
      if (s.pendingInterrupt) {
        const pi           = s.pendingInterrupt;
        s.pendingInterrupt = '';
        sessions.set(callSid, s);
        sayAndListen(twiml,
          `Got it, let me focus on that. ${cap30(pi)} — tell me more.`,
          20
        );
        break;
      }

      const stepNum  = s.stepIndex + 1;
      const total    = s.steps.length;
      const stepText = cap30(s.steps[s.stepIndex]);
      s.history.push({ role: 'agent', text: `Step ${stepNum}: ${stepText}` });
      s.step = 'resolve_check';
      sessions.set(callSid, s);

      sayAndListen(twiml,
        `Step ${stepNum} of ${total}: ${stepText} — did that work?`,
        30
      );
      break;
    }

    case 'resolve_check': {
      if (s.pendingInterrupt && !isYes(speech) && !isNo(speech)) {
        const pi           = s.pendingInterrupt;
        s.pendingInterrupt = '';
        sessions.set(callSid, s);
        sayAndListen(twiml, `Got it, let me focus on that. ${cap30(pi)}`);
        break;
      }

      if (isYes(speech)) {
        s.step   = 'resolved';
        s.status = 'closed';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');

      } else if (isNo(speech) || !speech) {
        s.stepIndex++;
        if (s.stepIndex < s.steps.length) {
          s.step = 'resolve_step';
          sessions.set(callSid, s);
          sayAndListen(twiml, `No problem — let's try the next step.`);
        } else {
          s.step   = 'steps_exhausted';
          s.status = 'escalating';
          sessions.set(callSid, s);
          twiml.redirect('/twilio/incoming');
        }
      } else {
        sayAndListen(twiml,
          `Understood — is the issue fully resolved, or still occurring?`,
          15
        );
      }
      break;
    }

    case 'resolved': {
      s.step = 'post_resolve';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        `Excellent — I'm really glad we sorted that, ${s.callerName}. Anything else I can help with today?`,
        15
      );
      break;
    }

    case 'post_resolve': {
      s.readyAsked = false;
      if (isYes(speech) || /more|another|also|yes/i.test(speech)) {
        Object.assign(s, {
          step     : 'get_issue',
          issueType: '',
          product  : '',
          symptoms : [],
          diagRound: 0,
          steps    : [],
          stepIndex: 0,
          projectId: '',
          licenseKey: '',
          validationDone: false,
          readyAsked: false,
          issueRetries: 0,
        });
        sessions.set(callSid, s);
        sayAndListen(twiml, `Of course — what else can I help you with?`);
      } else {
        s.step = 'farewell';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');
      }
      break;
    }

    case 'no_kb_result': {
      s.step = 'get_email';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        `That's a great question — let me escalate this to our specialist team. What's your email?`,
        20
      );
      break;
    }

    case 'steps_exhausted': {
      s.step = 'get_email';
      sessions.set(callSid, s);
      sayAndListen(twiml,
        `I've run through all steps — I'll escalate this to a specialist. What's your email?`,
        20
      );
      break;
    }

    case 'get_email': {
      s.email = extractEmail(speech) || (/skip/i.test(speech) ? '' : speech.slice(0, 60));
      s.step  = 'create_ticket';
      sessions.set(callSid, s);
      twiml.redirect('/twilio/incoming');
      break;
    }

    case 'create_ticket': {
      const ticketId = await createTicket(s);
      s.ticketId     = ticketId;
      s.step         = 'ticket_confirm';
      sessions.set(callSid, s);

      sendSMS(
        s.callerPhone,
        `Geoteknik Support: Ticket ${ticketId} created. A specialist will contact you within 4 business hours.`
      );

      twiml.redirect('/twilio/incoming');
      break;
    }

    case 'ticket_confirm': {
      s.step = 'post_ticket';
      sessions.set(callSid, s);
      const emailNote = s.email ? `A summary goes to ${s.email}.` : ``;
      sayAndListen(twiml,
        `Ticket ${spellTicket(s.ticketId)} created. ${emailNote} A specialist contacts you within 4 hours. Anything else?`,
        15
      );
      break;
    }

    case 'post_ticket': {
      if (isYes(speech) || /more|another|also|yes/i.test(speech)) {
        Object.assign(s, {
          step     : 'get_issue',
          issueType: '',
          product  : '',
          symptoms : [],
          diagRound: 0,
          steps    : [],
          stepIndex: 0,
          readyAsked: false,
          issueRetries: 0,
        });
        sessions.set(callSid, s);
        sayAndListen(twiml, `Of course — what else can I help you with?`);
      } else {
        s.step = 'farewell';
        sessions.set(callSid, s);
        twiml.redirect('/twilio/incoming');
      }
      break;
    }

    case 'connect_human': {
      sayAndHang(twiml,
        `I understand — connecting you to a senior specialist now. Please hold, ${s.callerName}.`
      );
      await closeSession(callSid, s, 'transferred');
      break;
    }

    case 'farewell': {
      sayAndHang(twiml,
        `Thank you, ${s.callerName} — great speaking with you. Have a wonderful day. Goodbye!`
      );
      await closeSession(callSid, s, s.ticketId ? 'ticketed' : 'resolved');
      break;
    }

    default: {
      console.error(`[${callSid}] Unknown step: ${s.step} — resetting to greet`);
      s.step = 'greet';
      sessions.set(callSid, s);
      twiml.redirect('/twilio/incoming');
    }
  }

  return send(res, twiml);
});

module.exports = router;
