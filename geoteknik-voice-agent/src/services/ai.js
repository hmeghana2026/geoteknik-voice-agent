/**
 * src/services/ai.js
 * ==================
 * Geoteknik Voice Agent — AI Response Service
 *
 * Voice-First Rules (from System Instructions):
 *  - All responses ≤ 30 words
 *  - No bullet points, no markdown
 *  - Conversational language, verbal cues where appropriate
 *  - Gemini 1.5 Flash for speed (low latency)
 */

'use strict';

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM IDENTITY (mirrors system instructions)
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_IDENTITY = `
You are Geoteknik-Support, an expert technical support voice agent for Geotechnical Engineering Software.

STRICT VOICE-FIRST RULES (NON-NEGOTIABLE):
1. Maximum 30 words per response — count them.
2. No bullet points. No numbered lists. No markdown formatting.
3. Speak naturally as if on a phone call.
4. Use verbal cues naturally: "I see", "Got it", "Let me check that", "Understood".
5. If the user sounds frustrated, acknowledge their emotion BEFORE any troubleshooting.
6. Repeat back key information to confirm understanding (active listening).
7. Never use technical jargon unless the user introduces it first.
8. If you don't know something, say: "That's a great question — let me escalate that to our specialist team."
9. Be warm, patient, solution-focused. Never patronizing.
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// HARD-CAP UTILITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Truncate to ≤30 words, ending cleanly at sentence or word boundary.
 * @param {string} text
 * @returns {string}
 */
function cap30(text = '') {
  const words = text.trim().split(/\s+/);
  if (words.length <= 30) return text.trim();
  const sentence = words.slice(0, 30).join(' ');
  const lastPeriod = sentence.lastIndexOf('.');
  const lastComma  = sentence.lastIndexOf(',');
  const cut = lastPeriod > 15
    ? lastPeriod + 1
    : lastComma > 15
    ? lastComma + 1
    : sentence.length;
  return sentence.slice(0, cut).trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: getAIResponse
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a voice-safe AI response.
 *
 * @param {string} userQuery       - The caller's input or the question to answer
 * @param {string} manualContext   - Optional KB / manual content to ground the answer
 * @param {object} customerInfo    - { currentProduct, callerName, issueType }
 * @returns {Promise<string>}      - ≤30-word plain-text response
 */
async function getAIResponse(userQuery, manualContext = '', customerInfo = {}) {
  const hasContext = manualContext && manualContext.trim().length > 0;

  const contextBlock = hasContext
    ? `Use this product manual content to inform your answer:\n\n${manualContext.slice(0, 1200)}`
    : `No manual content available. Use general technical knowledge and note: "This isn't in our manual, but based on general knowledge..."`;

  const systemPrompt = [
    SYSTEM_IDENTITY,
    '',
    `Current caller: ${customerInfo.callerName || 'unknown'}.`,
    `Product in question: ${customerInfo.currentProduct || 'Geoteknik equipment'}.`,
    `Issue type: ${customerInfo.issueType || 'general'}.`,
    '',
    contextBlock,
    '',
    'REMINDER: Your response must be ≤30 words, plain conversational English, no formatting.',
  ].join('\n');

  try {
    const model = genAI.getGenerativeModel({
      model           : 'gemini-1.5-flash',
      systemInstruction: systemPrompt,
      generationConfig : {
        temperature    : 0.4,   // Low temp → consistent, professional responses
        maxOutputTokens: 80,    // ~30 words max
        topP           : 0.9,
      },
    });

    const result = await model.generateContent(userQuery);
    const text   = result.response.text().trim();

    // Enforce 30-word cap as safety net
    return cap30(text);

  } catch (err) {
    console.error('[AI] getAIResponse error:', err.message);
    // Graceful fallback — still voice-safe
    return `I'm having a brief issue, but let me escalate this to our specialist team right away.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNOSTIC QUESTION GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a single short diagnostic follow-up question.
 * Strictly ≤20 words (leaves room for prefixes in twilio.js).
 *
 * @param {object} session   - Session state (product, symptoms, issueType)
 * @param {string} lastSpeech
 * @param {number} round     - 1, 2, or 3
 * @returns {Promise<string>}
 */
async function getDiagnosticQuestion(session, lastSpeech, round) {
  const prompt =
    `You are Geoteknik-Support on a phone call. ` +
    `Issue: ${session.issueType || 'general'}. ` +
    `Product: ${session.product || 'unknown'}. ` +
    `Caller just said: "${lastSpeech}". ` +
    `Symptoms so far: ${(session.symptoms || []).join('; ')}. ` +
    `Round ${round} of diagnosis. ` +
    `Ask ONE short follow-up question. Max 20 words. No lists. One sentence only.`;

  try {
    const model = genAI.getGenerativeModel({
      model           : 'gemini-1.5-flash',
      generationConfig : {
        temperature    : 0.3,
        maxOutputTokens: 50,
      },
    });
    const result = await model.generateContent(prompt);
    const q      = result.response.text().trim();
    if (q && q.length > 5) return cap30(q);
  } catch (err) {
    console.warn('[AI] getDiagnosticQuestion fallback:', err.message);
  }

  // Hardcoded fallbacks by domain
  const fallbacks = {
    license_activation: [
      `When exactly did the 404-L error appear?`,
      `Has this license been activated on another machine?`,
      `Did anything change on your system recently?`,
    ],
    report_generation: [
      `Which report type fails — soil stability or another?`,
      `What software version are you running?`,
      `Does an error code appear on screen?`,
    ],
    general: [
      `How long has this been happening?`,
      `Have you made any recent changes to your setup?`,
      `What exactly appears on screen when it fails?`,
    ],
  };

  const list = fallbacks[session.issueType] || fallbacks.general;
  return list[Math.min(round - 1, list.length - 1)];
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPATHY RESPONSE GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a warm empathy acknowledgment when frustration is detected.
 * Always leads with emotion before any technical content.
 *
 * @param {string} callerName
 * @returns {Promise<string>} — ≤30 words
 */
async function getEmpathyResponse(callerName = 'there') {
  const prompt =
    `A frustrated caller named ${callerName} just expressed frustration. ` +
    `Acknowledge their emotions warmly and briefly. ` +
    `Do NOT start troubleshooting yet. Max 20 words. Conversational tone.`;

  try {
    const model = genAI.getGenerativeModel({
      model           : 'gemini-1.5-flash',
      generationConfig : { temperature: 0.5, maxOutputTokens: 50 },
    });
    const result = await model.generateContent(prompt);
    const r      = result.response.text().trim();
    if (r && r.length > 5) return cap30(r);
  } catch (_) {}

  return `I completely understand your frustration, ${callerName} — I'm here to fix this right now.`;
}

module.exports = { getAIResponse, getDiagnosticQuestion, getEmpathyResponse, cap30 };