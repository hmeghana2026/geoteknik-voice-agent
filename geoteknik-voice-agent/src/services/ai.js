/**
 * ENHANCED: src/services/ai.js
 * Patch: AI-native response with KB search & context accumulation
 */

'use strict';

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_IDENTITY = `
You are Geo-tek-nik-Support, an expert technical support voice agent.

STRICT RULES:
1. Maximum 30 words per response.
2. No bullet points, markdown, or lists.
3. Speak naturally as on a phone call.
4. Use conversational cues: "I see", "Got it", "Let me check".
5. Acknowledge frustration before troubleshooting.
6. Repeat key info to confirm understanding.
7. Avoid jargon unless customer uses it first.
8. If unsure, say: "That's a great question — let me escalate to our specialists."
9. Be warm, patient, solution-focused.

CONTEXT AWARENESS:
- Reference previous issues this customer reported
- Remember what you've already tried
- Build on prior solutions
- Proactively suggest related fixes
`.trim();

function cap30(text = '') {
  const words = text.trim().split(/\s+/);
  if (words.length <= 30) return text.trim();
  const sentence = words.slice(0, 30).join(' ');
  const lastPeriod = sentence.lastIndexOf('.');
  const lastComma = sentence.lastIndexOf(',');
  const cut = lastPeriod > 15 ? lastPeriod + 1 : lastComma > 15 ? lastComma + 1 : sentence.length;
  return sentence.slice(0, cut).trim();
}

/**
 * ENHANCED: Search KB for relevant context BEFORE generating response
 */
async function searchKnowledgeBase(query, knowledgeBase) {
  if (!knowledgeBase) return '';
  
  try {
    logger.debug(`Searching KB for: ${query}`);
    const results = await knowledgeBase.search(query, { limit: 3 });
    
    if (!results || results.length === 0) {
      logger.debug('No KB results found');
      return '';
    }
    
    // Extract relevant content from top results
    const kbContent = results
      .map(r => `${r.title}: ${r.content}`.substring(0, 400))
      .join('\n\n');
    
    return kbContent;
  } catch (error) {
    logger.warn(`KB search failed: ${error.message}`);
    return '';
  }
}

/**
 * ENHANCED: Accumulate conversation context
 */
function buildConversationContext(conversationHistory = []) {
  if (!conversationHistory || conversationHistory.length === 0) return '';
  
  const relevant = conversationHistory.slice(-6); // Last 6 messages for context
  return relevant
    .map(msg => `${msg.role}: ${msg.text}`)
    .join('\n');
}

/**
 * ENHANCED: Main AI response with KB search + context + general knowledge
 */
async function getAIResponse(
  userQuery,
  manualContext = '',
  customerInfo = {},
  conversationHistory = [],
  knowledgeBase = null,
  webScraper = null
) {
  try {
    // Step 1: Search KB proactively
    let kbResults = await searchKnowledgeBase(userQuery, knowledgeBase);
    
    // Step 2: Fallback to web scraping if KB is empty
    if (!kbResults && webScraper && process.env.ENABLE_WEB_SCRAPING === 'true') {
      try {
        logger.debug('KB empty, attempting web scraping...');
        const scrapedContent = await webScraper.scrapeUrl(
          `${process.env.GEOTEKNIK_WEBSITE_URL || 'https://www.geoteknikltd.com'}/support`
        );
        kbResults = scrapedContent?.paragraphs?.join(' ').substring(0, 800) || '';
      } catch (error) {
        logger.warn(`Web scraping failed: ${error.message}`);
      }
    }
    
    // Step 3: Build context from conversation history
    const conversationContext = buildConversationContext(conversationHistory);
    
    // Step 4: Combine all context
    const fullContext = [
      manualContext && `Manual: ${manualContext.substring(0, 600)}`,
      kbResults && `Knowledge Base: ${kbResults}`,
      conversationContext && `Conversation Context:\n${conversationContext}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    
    // Step 5: Build enhanced prompt
    const userPrompt = `
Customer: ${customerInfo.callerName || 'Valued Customer'}
Product: ${customerInfo.currentProduct || 'Geoteknik Software'}
Issue Type: ${customerInfo.issueType || 'General Support'}
Question: ${userQuery}

${fullContext ? `Available Knowledge:\n${fullContext}` : 'Use your general knowledge.'}

Respond with ≤30 words. Be proactive in suggesting next steps if issue is complex.
`;

    logger.debug('Calling Gemini with enhanced context...');
    
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: SYSTEM_IDENTITY }] },
        { role: 'user', parts: [{ text: userPrompt }] }
      ]
    });
    
    const response = result.response.text().trim();
    const capped = cap30(response);
    
    logger.debug(`AI Response: ${capped}`);
    return capped;
    
  } catch (error) {
    logger.error('AI response generation failed:', error);
    return "I'm having trouble processing that. Let me connect you with a specialist.";
  }
}

module.exports = {
  getAIResponse,
  searchKnowledgeBase,
  buildConversationContext,
};