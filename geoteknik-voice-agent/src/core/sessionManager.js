/**
 * Session Manager - Updated for Supabase
 * Maintains conversation context using in-memory storage
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class SessionManager {
  constructor(sessionStore, database) {
    this.sessions = sessionStore; // In-memory store
    this.database = database;
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
      this.sessions[sessionId] = sessionData;
      logger.info(`✓ Session created: ${sessionId}`);
      return sessionId;
    } catch (error) {
      logger.error('Failed to create session:', error);
      throw error;
    }
  }

  /**
   * Get session
   */
  async getSession(sessionId) {
    try {
      const session = this.sessions[sessionId];
      if (!session) {
        logger.warn(`Session not found: ${sessionId}`);
        return null;
      }
      return session;
    } catch (error) {
      logger.error('Failed to retrieve session:', error);
      throw error;
    }
  }

  /**
   * Update session
   */
  async updateSession(sessionId, updates) {
    try {
      const session = this.sessions[sessionId];
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      this.sessions[sessionId] = {
        ...session,
        ...updates,
        lastUpdated: Date.now(),
      };

      return this.sessions[sessionId];
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