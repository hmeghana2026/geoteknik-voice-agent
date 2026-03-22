/**
 * AI Response Wrapper
 * Provides getAIResponse() function for twilio.js
 * Handles both Gemini API calls and caching
 */

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

const SYSTEM_IDENTITY = `You are Geoteknik-Support, an expert technical support voice agent.
Your role is to resolve software issues with empathy, clarity, and precision.

CONSTRAINTS:
- Keep responses ≤30 words for voice delivery
- Be concise, clear, and direct
- Use simple language
- Provide actionable guidance`;

/**
 * Get AI response - main entry point for twilio.js
 * @param {string} prompt - The question/prompt to ask the AI
 * @param {string} context - Optional additional context
 * @param {object} options - Additional options
 * @returns {Promise<string>} - The AI response text
 */
async function getAIResponse(prompt, context = '', options = {}) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    // Build full prompt with system context
    const fullPrompt = context 
      ? `${SYSTEM_IDENTITY}\n\nContext: ${context}\n\nUser Request: ${prompt}`
      : `${SYSTEM_IDENTITY}\n\n${prompt}`;

    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    let text = response.text();

    // Enforce 30-word limit
    text = enforce30Words(text);

    console.log(`[AI] Response: ${text.slice(0, 80)}...`);
    return text;

  } catch (error) {
    console.error('[AI] Error:', error.message);
    // Return fallback response instead of throwing
    return 'Let me check on that and get back to you shortly.';
  }
}

/**
 * Enforce 30-word limit on response
 */
function enforce30Words(text) {
  const words = text.trim().split(/\s+/);
  if (words.length <= 30) {
    return text.trim();
  }

  const truncated = words.slice(0, 30).join(' ');
  
  // Clean up punctuation
  const lastPeriod = truncated.lastIndexOf('.');
  const lastComma = truncated.lastIndexOf(',');

  if (lastPeriod > 15) {
    return truncated.slice(0, lastPeriod + 1).trim();
  }
  if (lastComma > 15) {
    return truncated.slice(0, lastComma + 1).trim();
  }

  return truncated.trim() + '.';
}

module.exports = { getAIResponse };