/**
 * AI Service - Streaming + Caching for Real-Time
 * Uses Google Gemini with response caching and chunking
 */

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_IDENTITY = `
You are Geoteknik-Support, an expert technical support voice agent for Geotechnical Engineering Software.
Your role is to resolve software issues with empathy, clarity, and precision.

OPERATIONAL CONSTRAINTS:
- All responses MUST be ≤30 words for voice delivery
- Be concise, clear, and direct
- Use simple language
- Avoid technical jargon when possible
- Provide actionable guidance
`;

class AIService {
  constructor(cacheService = null) {
    this.model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    this.cache = cacheService;
    this.responseTimeout = 800; // 800ms target for real-time
  }

  /**
   * Get AI response with caching and timeout
   */
  async getResponse(context, options = {}) {
    try {
      // Check cache first
      if (this.cache) {
        const cached = await this.cache.getCachedAIResponse(context);
        if (cached) {
          logger.debug('AI response from cache');
          return {
            text: cached.text,
            fromCache: true,
          };
        }
      }

      const response = await this._getAIResponseWithTimeout(context);

      // Cache the response
      if (this.cache && response.text) {
        await this.cache
          .cacheAIResponse(context, response, 3600)
          .catch((err) => {
            logger.warn('Failed to cache AI response:', err);
          });
      }

      return {
        text: response,
        fromCache: false,
      };
    } catch (error) {
      logger.error('AI response generation failed:', error);
      return {
        text: 'I apologize, I encountered a technical issue. Please try again.',
        error: true,
      };
    }
  }

  /**
   * Get response with timeout enforcement for real-time
   */
  async _getAIResponseWithTimeout(context) {
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(
        () =>
          resolve(
            'I need a moment to check that. Can you hold for a second?'
          ),
        this.responseTimeout
      )
    );

    const responsePromise = this._generateResponse(context);

    // Race: first to complete wins
    return Promise.race([responsePromise, timeoutPromise]);
  }

  /**
   * Generate response with Gemini
   */
  async _generateResponse(context) {
    try {
      const prompt = `${SYSTEM_IDENTITY}\n\nContext: ${context}\n\nProvide a response that is exactly ≤30 words, helpful, and direct.`;

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      let text = response.text();

      // Ensure 30-word limit
      text = this._enforce30Words(text);

      return text;
    } catch (error) {
      logger.error('Gemini API error:', error);
      throw error;
    }
  }

  /**
   * Stream response chunks for real-time delivery
   */
  async *streamResponse(context) {
    try {
      const prompt = `${SYSTEM_IDENTITY}\n\nContext: ${context}\n\nProvide a response that is exactly ≤30 words, helpful, and direct.`;

      const result = await this.model.generateContentStream(prompt);

      for await (const chunk of result.stream) {
        if (chunk.candidates && chunk.candidates[0]) {
          const text = chunk.candidates[0].content.parts[0].text;
          if (text) {
            yield text;
          }
        }
      }
    } catch (error) {
      logger.error('Stream generation error:', error);
      yield 'I encountered an issue processing your request.';
    }
  }

  /**
   * Enforce 30-word limit
   */
  _enforce30Words(text) {
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

  /**
   * Batch process multiple contexts (for efficiency)
   */
  async getResponseBatch(contexts) {
    try {
      const responses = await Promise.all(
        contexts.map((ctx) => this.getResponse(ctx))
      );
      return responses;
    } catch (error) {
      logger.error('Batch response error:', error);
      return contexts.map(() => ({
        text: 'Unable to process request',
        error: true,
      }));
    }
  }

  /**
   * Get cache stats
   */
  async getCacheStats() {
    if (this.cache) {
      return await this.cache.getStats();
    }
    return null;
  }
}

module.exports = AIService;