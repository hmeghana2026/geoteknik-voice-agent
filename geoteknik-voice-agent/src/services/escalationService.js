/**
 * Escalation Service
 * Handles transfer to human agents
 */

const logger = require('../utils/logger');

class EscalationService {
  constructor(database) {
    this.database = database;
  }

  /**
   * Transfer call to human agent
   */
  async transferToAgent(handoffData) {
    try {
      logger.info(`Transferring session ${handoffData.sessionId} to human agent`);

      // Create escalation record
      await this.database.query(
        `INSERT INTO escalations 
         (session_id, phone_number, customer_id, handoff_data, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', NOW())`,
        [
          handoffData.sessionId,
          handoffData.phoneNumber,
          handoffData.customerId,
          JSON.stringify(handoffData),
        ]
      );

      // In production, call Twilio API to transfer
      // await this.transferViaVoice(handoffData);

      logger.info(`✓ Escalation created for session: ${handoffData.sessionId}`);

      return {
        success: true,
        escalationId: handoffData.sessionId,
        message: 'Call transferred to agent',
      };
    } catch (error) {
      logger.error('Escalation failed:', error);
      throw error;
    }
  }

  /**
   * Transfer via Twilio voice
   */
  async transferViaVoice(handoffData) {
    try {
      // Use Twilio client to dial queue or agent
      logger.debug(`Dialing agent for session: ${handoffData.sessionId}`);
      // Implementation would use Twilio API
    } catch (error) {
      logger.error('Voice transfer failed:', error);
      throw error;
    }
  }

  /**
   * Get escalation status
   */
  async getEscalationStatus(escalationId) {
    try {
      const result = await this.database.query(
        'SELECT * FROM escalations WHERE session_id = ?',
        [escalationId]
      );

      return result[0] || null;
    } catch (error) {
      logger.error('Failed to get escalation status:', error);
      return null;
    }
  }
}

module.exports = EscalationService;