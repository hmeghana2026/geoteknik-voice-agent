/**
 * src/services/ai.js
 * ==================
 * AI response service — Geoteknik Voice Agent
 *
 * Identity: Geoteknik-Support, expert voice agent for
 *           Geotechnical Engineering Software.
 *
 * All responses are hard-capped at ≤30 words for voice-first delivery.
 * Gemini 1.5 Flash is used for low latency (target < 800 ms).
 */

'use strict';

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM IDENTITY  (matches spec exactly)
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_IDENTITY = `
You are Geoteknik-Support, an expert technical support voice agent for Geotechnical Engineering Software.
Your role is to resolve software issues with empathy, clarity, and precision.

OPERATIONAL CONSTRAINTS — THESE ARE HARD RULES:
1. Maximum 30 words per response. Never exceed this. This is a phone call.
2. No bullet points, markdown, numbered lists, or headers — ever.
3. Speak naturally as you would on a phone call.
4. Always use at least one verbal cue per response:
   - "I see,"  "Got it,"  "Let me check that,"  "Understood,"  "Of course,"
5. Acknowledge frustration or emotion BEFORE any troubleshooting — always empathy first.
6. Repeat back key information (Project ID, license key) to confirm active listening.
7. Avoid technical jargon unless the customer introduces it first.
8. If you do not have an answer, say exactly:
   "That's a great question — let me escalate that to our specialist team."
9. Be warm, patient, and solution-focused. Never patronising.
10. Reference previous symptoms when relevant to show continuity.

SUPPORTED ISSUE DOMAINS:
- License Activation (Error 404-L): collect Project ID → validate license key → activate
- Soil Stability Report Generation: collect Project ID → check version → restart engine
- General software issues: diagnose with short questions → search knowledge base

SUCCESS CRITERIA (know these and work toward them in every call):
✓ Greet and establish context within 15 seconds
✓ Collect Project ID and License Key without sounding robotic
✓ Validate data and provide actionable fix steps
✓ User confirms resolution or acknowledges fix path
✓ Total interaction: 2 minutes or less
✓ No response exceeds 30 words
✓ Use at least 3 verbal cues naturally across the call
`.trim();

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hard-cap text to ≤30 words, breaking at a sentence boundary if possible.
 */
function cap30(text = '') {
  const words = text.trim().split(/\s+/);
  if (words.length <= 30) return text.trim();

  const sentence   = words.slice(0, 30).join(' ');
  const lastPeriod = sentence.lastIndexOf('.');
  const lastComma  = sentence.lastIndexOf(',');
  const cut = lastPeriod > 15
    ? lastPeriod + 1
    : lastComma > 15
      ? lastComma + 1
      : sentence.length;

  return sentence.slice(0, cut).trim();
}

/**
 * Build a concise conversation context string from recent history.
 * Limited to the last 6 turns to keep the prompt small.
 */
function buildConversationContext(conversationHistory = []) {
  if (!conversationHistory || conversationHistory.length === 0) return '';
  return conversationHistory
    .slice(-6)
    .map(msg => `${msg.role}: ${msg.text}`)
    .join('\n');
}

/**
 * Search the knowledge base and return a brief context string.
 * Non-throwing — returns '' on any failure.
 */
async function searchKnowledgeBase(query, knowledgeBase) {
  if (!knowledgeBase) return '';
  try {
    logger.debug(`[AI] KB search: "${query}"`);
    const results = await knowledgeBase.search(query, { limit: 3 });
    if (!results || results.length === 0) return '';
    return results
      .map(r => `${r.title}: ${(r.content || '').substring(0, 300)}`)
      .join('\n\n');
  } catch (err) {
    logger.warn(`[AI] KB search failed: ${err.message}`);
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: getAIResponse
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a ≤30-word voice response using Gemini, enriched with:
 *   - manual context (from vector search / uploaded docs)
 *   - knowledge base results
 *   - conversation history
 *
 * @param {string}   userQuery          — the caller's latest utterance / diagnostic prompt
 * @param {string}   manualContext      — raw text from manual vector search (may be empty)
 * @param {object}   customerInfo       — { callerName, currentProduct, issueType }
 * @param {Array}    conversationHistory — [ { role, text }, ... ]
 * @param {object}   knowledgeBase      — optional KB instance for supplementary lookup
 * @param {object}   webScraper         — optional scraper (fallback when KB empty)
 * @returns {Promise<string>}            — ≤30-word response string
 */
async function getAIResponse(
  userQuery,
  manualContext      = '',
  customerInfo       = {},
  conversationHistory = [],
  knowledgeBase      = null,
  webScraper         = null
) {
  try {
    // 1. Supplementary KB search
    let kbResults = await searchKnowledgeBase(userQuery, knowledgeBase);

    // 2. Web-scrape fallback (only if explicitly enabled)
    if (!kbResults && webScraper && process.env.ENABLE_WEB_SCRAPING === 'true') {
      try {
        logger.debug('[AI] KB empty — attempting web scrape');
        const scraped = await webScraper.scrapeUrl(
          `${process.env.GEOTEKNIK_WEBSITE_URL || 'https://www.geoteknikltd.com'}/support`
        );
        kbResults = scraped?.paragraphs?.join(' ').substring(0, 800) || '';
      } catch (err) {
        logger.warn(`[AI] Web scrape failed: ${err.message}`);
      }
    }

    // 3. Conversation context
    const convContext = buildConversationContext(conversationHistory);

    // 4. Assemble all available knowledge
    const knowledgeBlock = [
      manualContext && `Product Manual:\n${manualContext.substring(0, 600)}`,
      kbResults     && `Knowledge Base:\n${kbResults}`,
      convContext   && `Recent Conversation:\n${convContext}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    // 5. Focused user prompt — drives the ≤30-word constraint and persona
    const userPrompt = [
      `Customer name: ${customerInfo.callerName || 'Valued Customer'}`,
      `Product: ${customerInfo.currentProduct || 'Geoteknik Software'}`,
      `Issue type: ${customerInfo.issueType || 'general software support'}`,
      `Customer said: "${userQuery}"`,
      '',
      knowledgeBlock
        ? `Available knowledge (use this to inform your answer):\n${knowledgeBlock}`
        : `No specific documentation available — use your general knowledge of geotechnical engineering software.`,
      '',
      `TASK: Reply in ≤30 words. Use a verbal cue. Be warm and solution-focused.`,
      `If unsure: "That's a great question — let me escalate that to our specialist team."`,
    ].join('\n');

    logger.debug('[AI] Calling Gemini Flash...');

    const model  = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent({
      contents: [
        // System identity as first user turn (Gemini does not have a system role)
        { role: 'user',  parts: [{ text: SYSTEM_IDENTITY }] },
        { role: 'model', parts: [{ text: 'Understood. I am Geoteknik-Support, ready to assist.' }] },
        { role: 'user',  parts: [{ text: userPrompt }] },
      ],
    });

    const raw    = result.response.text().trim();
    const capped = cap30(raw);

    logger.debug(`[AI] Response (${capped.split(' ').length} words): ${capped}`);
    return capped;

  } catch (err) {
    logger.error('[AI] getAIResponse failed:', err);
    // Graceful fallback — escalation line from spec
    return `I'm having trouble processing that. Let me connect you with a specialist right away.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  getAIResponse,
  buildConversationContext,
  searchKnowledgeBase,
};