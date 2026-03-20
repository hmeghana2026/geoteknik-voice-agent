/**
 * Main Voice Agent - Updated for Enhanced Conversation Flow
 * Orchestrates the entire call flow with improved conversation handling
 */

const logger = require('../utils/logger');

class VoiceAgent {
  constructor(config) {
    this.config = config;
    this.sessionManager = config.sessionManager;
    this.troubleshootingEngine = config.troubleshootingEngine;
    this.speechService = config.speechService;
    this.escalationService = config.escalationService;
    this.database = config.database;
  }

  /**
   * Handle inbound call
   */
  async handleIncomingCall(callData) {
    const { phoneNumber, callId, customerId = null } = callData;

    try {
      logger.info(`Inbound call received: ${callId} from ${phoneNumber}`);

      // Create session
      const sessionId = await this.sessionManager.createSession(
        phoneNumber,
        customerId
      );

      // Store callId in session
      await this.sessionManager.updateSession(sessionId, { callId });

      // Greet customer
      await this.greetCustomer(sessionId, phoneNumber);

      // Get initial problem statement
      const problemStatement = await this.getProblemStatement(sessionId);

      // Start main troubleshooting flow with enhanced features
      const result = await this.troubleshootingEngine.startTroubleshooting(
        sessionId,
        problemStatement
      );

      // Handle result based on resolution and follow-ups
      if (result.resolved) {
        // Customer's issue was resolved
        if (result.hasMoreIssues) {
          // Already handled in troubleshooting engine recursively
          await this.finalClose(sessionId, 'resolved_multiple');
        } else {
          await this.closeWithSatisfaction(sessionId);
        }
        await this.sessionManager.closeSession(sessionId, 'resolved', 5);
      } else {
        // Could not resolve - escalate to human
        await this.escalateToHuman(sessionId, result);
        await this.sessionManager.closeSession(sessionId, 'escalated', null);
      }
    } catch (error) {
      logger.error('Call handling error:', error);
      await this.handleError(callData, error);
    }
  }

  /**
   * Greet customer with personalization
   */
  async greetCustomer(sessionId, phoneNumber) {
    try {
      const greeting = `Hi there! Welcome to Geoteknik technical support. How can I help you today?`;

      await this.sessionManager.addMessage(sessionId, 'agent', greeting);
      await this.speechService.speak(greeting);

      logger.debug(`Greeting sent for session: ${sessionId}`);
    } catch (error) {
      logger.error('Greeting failed:', error);
      throw error;
    }
  }

  /**
   * Get initial problem with retry logic
   */
  async getProblemStatement(sessionId) {
    const timeout = this.config.silenceTimeouts.initialWelcome;
    let attempts = 0;

    while (attempts < 3) {
      try {
        logger.debug(`Listening for problem statement, attempt ${attempts + 1}`);

        const response = await this.speechService.listen(
          'Please describe your issue',
          timeout
        );

        if (response && response.text && response.text.trim() !== '') {
          await this.sessionManager.addMessage(
            sessionId,
            'customer',
            response.text
          );
          logger.debug(`Problem statement received: ${response.text}`);
          return response.text;
        }

        attempts++;

        if (attempts < 3) {
          const prompt = `I didn't catch that. Could you please describe your issue again?`;
          await this.sessionManager.addMessage(sessionId, 'agent', prompt);
          await this.speechService.speak(prompt);
        }
      } catch (error) {
        logger.warn(
          `Listen attempt ${attempts + 1} failed:`,
          error.message
        );
        attempts++;
      }
    }

    // Max attempts exceeded
    logger.warn(`Failed to get problem statement after ${attempts} attempts`);
    throw new Error('Unable to get problem statement - max retries exceeded');
  }

  /**
   * Close call with satisfaction
   */
  async closeWithSatisfaction(sessionId) {
    try {
      const message = `Great! Your issue is resolved. Thank you for contacting Geoteknik support. Have a wonderful day!`;

      await this.sessionManager.addMessage(sessionId, 'agent', message);
      await this.speechService.speak(message);

      logger.info(`Call closed successfully for session: ${sessionId}`);
    } catch (error) {
      logger.error('Close with satisfaction failed:', error);
    }
  }

  /**
   * Final close after handling multiple issues
   */
  async finalClose(sessionId, reason = 'resolved') {
    try {
      const message = `Thank you for using Geoteknik support! We're glad we could help resolve your issues. Have a great day!`;

      await this.sessionManager.addMessage(sessionId, 'agent', message);
      await this.speechService.speak(message);

      logger.info(
        `Call closed with reason ${reason} for session: ${sessionId}`
      );
    } catch (error) {
      logger.error('Final close failed:', error);
    }
  }

  /**
   * Escalate to human agent
   */
  async escalateToHuman(sessionId, result) {
    try {
      const message = `I wasn't able to fully resolve this issue. Let me connect you with a specialist who can help further.`;

      await this.sessionManager.addMessage(sessionId, 'agent', message);
      await this.speechService.speak(message);

      const session = await this.sessionManager.getSession(sessionId);

      // Prepare handoff data
      const handoffData = {
        sessionId,
        phoneNumber: session.phoneNumber,
        customerId: session.customerId,
        conversationHistory: session.conversationHistory,
        problem: session.problem,
        clarification: session.clarification,
        diagnostics: session.diagnostics,
        previousSolution: result.solution,
        escalationReason: result.reason || 'No solution found',
      };

      // Escalate
      await this.escalationService.transferToAgent(handoffData);

      logger.info(`Call escalated for session: ${sessionId}`);
    } catch (error) {
      logger.error('Escalation failed:', error);
    }
  }

  /**
   * Handle call errors gracefully
   */
  async handleError(callData, error) {
    try {
      const fallbackMessage = `I'm experiencing a technical issue. Please try again or press 1 to speak with an agent.`;
      await this.speechService.speak(fallbackMessage);

      logger.error(`Error handled for call ${callData.callId}:`, error);
    } catch (err) {
      logger.error('Error handling failed:', err);
    }
  }

  /**
   * Handle call disconnect
   */
  async handleCallEnd(sessionId) {
    try {
      const session = await this.sessionManager.getSession(sessionId);
      if (session && session.status === 'active') {
        await this.sessionManager.closeSession(
          sessionId,
          'disconnected',
          null
        );
        logger.info(`Call ended for session: ${sessionId}`);
      }
    } catch (error) {
      logger.error('Call end handling failed:', error);
    }
  }
}

module.exports = VoiceAgent;