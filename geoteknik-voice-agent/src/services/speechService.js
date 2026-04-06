/**
 * speechService.js
 * ================
 * TwiML builder helpers shared across the app.
 *
 * NOTE: The main voice loop lives in src/routes/twilio.js and builds TwiML
 * inline.  This module provides the same helpers in a reusable class so that
 * server.js / voiceAgent.js can use them without duplicating logic.
 *
 * Voice: Polly.Salli (Amazon Polly — natural, friendly female)
 */

'use strict';

const twilio = require('twilio');

const VoiceResponse = twilio.twiml.VoiceResponse;

const VOICE    = { voice: 'Polly.Salli' };
const LANGUAGE = 'en-US';

/** Hard-limit to 30 words so TTS stays conversational. */
function cap30(text = '') {
  const words = text.trim().split(/\s+/);
  if (words.length <= 30) return text.trim();
  const truncated   = words.slice(0, 30).join(' ');
  const lastPeriod  = truncated.lastIndexOf('.');
  const lastComma   = truncated.lastIndexOf(',');
  const cut = lastPeriod > 15 ? lastPeriod + 1
            : lastComma  > 15 ? lastComma  + 1
            : truncated.length;
  return truncated.slice(0, cut).trim();
}

class SpeechService {
  /**
   * @param {string} accountSid   - Twilio Account SID (kept for SMS / REST calls)
   * @param {string} authToken    - Twilio Auth Token
   * @param {string} phoneNumber  - Twilio phone number for outbound SMS
   */
  constructor(accountSid, authToken, phoneNumber) {
    this.twilioClient = accountSid && authToken
      ? twilio(accountSid, authToken)
      : null;
    this.phoneNumber = phoneNumber || process.env.TWILIO_PHONE_NUMBER;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TwiML builders
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build TwiML that speaks `text` and then listens for a speech response.
   *
   * @param {string} text          - What the agent says
   * @param {string} actionUrl     - Twilio webhook to POST the SpeechResult to
   * @param {number} [timeout=12]  - Silence timeout in seconds
   * @returns {string}             - TwiML XML string
   */
  buildSayAndListen(text, actionUrl = '/twilio/incoming', timeout = 12) {
    const twiml  = new VoiceResponse();
    const gather = twiml.gather({
      input        : 'speech',
      action       : actionUrl,
      method       : 'POST',
      speechTimeout: 'auto',
      language     : LANGUAGE,
      timeout,
    });
    gather.say(VOICE, cap30(text));
    twiml.redirect({ method: 'POST' }, actionUrl);  // fallback if gather times out
    return twiml.toString();
  }

  /**
   * Build TwiML that speaks `text` and hangs up.
   *
   * @param {string} text
   * @returns {string} TwiML XML string
   */
  buildSayAndHang(text) {
    const twiml = new VoiceResponse();
    twiml.say(VOICE, cap30(text));
    twiml.hangup();
    return twiml.toString();
  }

  /**
   * Build TwiML that says `text` with no gather (pure announcement).
   *
   * @param {string} text
   * @returns {string} TwiML XML string
   */
  buildAnnounce(text) {
    const twiml = new VoiceResponse();
    twiml.say(VOICE, cap30(text));
    return twiml.toString();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REST helpers (require Twilio credentials)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Send an SMS via Twilio REST API.
   * Non-throwing — failures are logged only.
   *
   * @param {string} toNumber   - Recipient E.164 phone number
   * @param {string} message    - SMS body text
   */
  async sendSMS(toNumber, message) {
    if (!this.twilioClient) {
      console.warn('[SpeechService] Twilio client not initialised — SMS skipped');
      return;
    }
    try {
      await this.twilioClient.messages.create({
        body: message,
        from: this.phoneNumber,
        to  : toNumber,
      });
      console.log(`[SpeechService] SMS sent to ${toNumber}`);
    } catch (err) {
      console.warn(`[SpeechService] SMS failed (non-fatal): ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utility
  // ─────────────────────────────────────────────────────────────────────────

  /** Expose the 30-word cap helper for use by callers. */
  static cap30(text) {
    return cap30(text);
  }
}

module.exports = SpeechService;
