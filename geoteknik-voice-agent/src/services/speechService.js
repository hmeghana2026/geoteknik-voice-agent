/**
 * Speech Service
 * Handles speech-to-text and text-to-speech via Twilio
 */

const twilio = require('twilio');
const logger = require('../utils/logger');

class SpeechService {
  constructor(accountSid, authToken, phoneNumber) {
    this.client = twilio(accountSid, authToken);
    this.phoneNumber = phoneNumber;
    this.currentCall = null;
  }

  /**
   * Speak text to user
   */
  async speak(text) {
    try {
      if (!this.currentCall) {
        logger.warn('No active call to speak to');
        return;
      }

      // Use Twilio's say/play verbs through TwiML
      logger.debug(`Speaking: ${text.substring(0, 50)}...`);

      // In a real implementation, this would use Twilio's gather/say
      // For now, we'll implement a basic version
      await this.playMessage(text);
    } catch (error) {
      logger.error('Speech failed:', error);
      throw error;
    }
  }

  /**
   * Listen for user speech with timeout
   */
  async listen(question, timeout = 8000) {
    return new Promise((resolve, reject) => {
      try {
        logger.debug(`Listening for response (timeout: ${timeout}ms)`);

        // Simulate listening with timeout
        const timeoutHandle = setTimeout(() => {
          logger.debug('Listen timeout - no response');
          resolve({ text: '', confidence: 0 });
        }, timeout);

        // In a real Twilio implementation, you would use:
        // - Gather to collect DTMF or voice input
        // - Speech recognition for voice
        // For POC, we'll simulate with a mock response

        clearTimeout(timeoutHandle);
        resolve({
          text: this.getMockResponse(question),
          confidence: 0.95,
        });
      } catch (error) {
        logger.error('Listen failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Play message to call
   */
  async playMessage(message) {
    try {
      // In production, integrate with Twilio's TwiML
      logger.debug(`Playing message: ${message}`);
    } catch (error) {
      logger.error('Play message failed:', error);
      throw error;
    }
  }

  /**
   * Set current call context
   */
  setCurrentCall(callSid) {
    this.currentCall = callSid;
    logger.debug(`Current call set to: ${callSid}`);
  }

  /**
   * Mock response for testing/POC
   */
  getMockResponse(question) {
    const responses = {
      device: 'It\'s a geoteknik drilling machine',
      'when did': 'It started happening this morning',
      'what were': 'I was trying to calibrate the settings',
      'have you tried': 'I restarted it but it didn\'t help',
      'resolved': 'Yes it\'s working now',
      'works': 'Yes it works',
      'repeat': 'The device is not responding',
    };

    for (const [key, value] of Object.entries(responses)) {
      if (question.toLowerCase().includes(key)) {
        return value;
      }
    }

    return 'I\'m having an issue with my equipment';
  }
}

module.exports = SpeechService;