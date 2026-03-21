/**
 * Session Manager - Redis-Enabled for Real-Time
 * Maintains conversation context with fast caching
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class SessionManager {
  constructor(sessionStore, database, cacheService = null) {
    this.sessions = sessionStore; // In-memory fallback
    this.database = database;
    this.cache = cacheService; // Redis cache
  }

  /**
   * Create new session
   */
  async createSession(phoneNumber, customerId = null) {
    const sessionId = `session_${Date.now()}_${uuidv4()}`;

    const sessionData = {
      sessionId,
      phoneNumber,
      customerId,
      startTime: Date.now(),
      conversationHistory: [],
      problem: null,
      clarification: {},
      diagnostics: null,
      solution: null,
      status: 'active',
      silenceCount: 0,
      stepCount: 0,
    };

    try {
      // Store in memory (fallback)
      this.sessions[sessionId] = sessionData;

      // Cache in Redis (primary)
      if (this.cache) {
        await this.cache.cacheSession(sessionId, sessionData, 3600);
      }

      logger.info(`✓ Session created: ${sessionId}`);
      return sessionId;
    } catch (error) {
      logger.error('Failed to create session:', error);
      throw error;
    }
  }

  /**
   * Get session (Redis-first, then fallback)
   */
  async getSession(sessionId) {
    try {
      // Try Redis first for performance
      if (this.cache) {
        const cached = await this.cache.getCachedSession(sessionId);
        if (cached) {
          return cached;
        }
      }

      // Fallback to memory
      const session = this.sessions[sessionId];
      if (!session) {
        logger.warn(`Session not found: ${sessionId}`);
        return null;
      }

      // Re-cache if it was missing from Redis
      if (this.cache) {
        await this.cache.cacheSession(sessionId, session, 3600);
      }

      return session;
    } catch (error) {
      logger.error('Failed to retrieve session:', error);
      throw error;
    }
  }

  /**
   * Update session (fast path with cache)
   */
  async updateSession(sessionId, updates) {
    try {
      const session = this.sessions[sessionId];
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const updated = {
        ...session,
        ...updates,
        lastUpdated: Date.now(),
      };

      // Update both stores for consistency
      this.sessions[sessionId] = updated;

      if (this.cache) {
        await this.cache.cacheSession(sessionId, updated, 3600);
      }

      return updated;
    } catch (error) {
      logger.error('Failed to update session:', error);
      throw error;
    }
  }

  /**
   * Add message to conversation history
   */
  async addMessage(sessionId, role, message, metadata = {}) {
    try {
      const session = this.sessions[sessionId];
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      session.conversationHistory.push({
        timestamp: Date.now(),
        role,
        message,
        metadata,
      });

      this.sessions[sessionId] = session;

      // Update cache asynchronously (don't wait)
      if (this.cache) {
        this.cache.cacheSession(sessionId, session, 3600).catch((err) => {
          logger.warn('Failed to update cache on message add:', err);
        });
      }
    } catch (error) {
      logger.error('Failed to add message:', error);
    }
  }

  /**
   * Increment silence count
   */
  async incrementSilenceCount(sessionId) {
    try {
      const session = this.sessions[sessionId];
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      session.silenceCount += 1;
      this.sessions[sessionId] = session;

      if (this.cache) {
        await this.cache.cacheSession(sessionId, session, 3600);
      }

      return session.silenceCount;
    } catch (error) {
      logger.error('Failed to increment silence count:', error);
      throw error;
    }
  }

  /**
   * Reset silence count
   */
  async resetSilenceCount(sessionId) {
    try {
      const session = this.sessions[sessionId];
      if (session) {
        session.silenceCount = 0;
        this.sessions[sessionId] = session;

        if (this.cache) {
          await this.cache.cacheSession(sessionId, session, 3600);
        }
      }
    } catch (error) {
      logger.error('Failed to reset silence count:', error);
    }
  }

  /**
   * Update problem clarification
   */
  async updateProblemClarification(sessionId, clarification) {
    try {
      const session = this.sessions[sessionId];
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      session.clarification = {
        ...session.clarification,
        ...clarification,
      };

      this.sessions[sessionId] = session;

      if (this.cache) {
        await this.cache.cacheSession(sessionId, session, 3600);
      }
    } catch (error) {
      logger.error('Failed to update clarification:', error);
    }
  }

  /**
   * Close session and persist to database
   */
  async closeSession(
    sessionId,
    resolutionStatus = 'unknown',
    satisfactionScore = null
  ) {
    try {
      const session = this.sessions[sessionId];
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const endTime = Date.now();
      const duration = endTime - session.startTime;

      // Persist to Supabase
      const logData = {
        session_id: session.sessionId,
        phone_number: session.phoneNumber,
        customer_id: session.customerId,
        start_time: session.startTime,
        end_time: endTime,
        duration,
        problem: session.problem,
        clarification: session.clarification,
        diagnostics: session.diagnostics,
        solution: session.solution,
        status: resolutionStatus,
        conversation_count: session.conversationHistory.length,
        silence_count: session.silenceCount,
        satisfaction_score: satisfactionScore,
      };

      await this.database.insertSessionLog(logData);

      // Remove from memory
      delete this.sessions[sessionId];

      // Remove from cache
      if (this.cache) {
        await this.cache.delete(`session:${sessionId}`);
      }

      logger.info(
        `✓ Session closed: ${sessionId} (${duration}ms, Status: ${resolutionStatus})`
      );

      return {
        sessionId,
        duration,
        conversationCount: session.conversationHistory.length,
        resolutionStatus,
      };
    } catch (error) {
      logger.error('Failed to close session:', error);
      throw error;
    }
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions() {
    try {
      return Object.values(this.sessions);
    } catch (error) {
      logger.error('Failed to retrieve active sessions:', error);
      return [];
    }
  }
}

module.exports = SessionManager;