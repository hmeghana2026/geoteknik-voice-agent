/**
 * src/routes/vapi.js
 * ==================
 * Vapi AI webhook handler — replaces TwiML conversation logic.
 *
 * Vapi handles: STT, TTS, LLM turn-taking, silence detection.
 * This server handles: function/tool calls, call history, escalation.
 *
 * Webhook event types handled:
 *   assistant-request   → return assistant config (system prompt + tools)
 *   function-call       → execute tool and return result string
 *   end-of-call-report  → persist call history to Supabase
 *   status-update       → logging / analytics hooks
 */

'use strict';

require('dotenv').config();
const express = require('express');
const { searchKnowledgeBase, saveCallHistory } = require('../services/knowledgeService');
const { buildAssistantConfig } = require('../services/vapiService');
const logger = require('../utils/logger');

const router = express.Router();

// ─── Tool implementations (same logic as twilio.js) ─────────────────────────

function tool_check_license_status(projectId) {
  const found = projectId && projectId.replace(/\s/g, '').length >= 4;
  return {
    valid  : found,
    message: found
      ? 'Project record located in registry.'
      : 'Project ID not found in registry.',
  };
}

function tool_validate_license_key(licenseKey) {
  const valid = licenseKey && licenseKey.includes('-');
  return {
    valid,
    message: valid
      ? 'License key format verified.'
      : 'License key format invalid — must contain a dash separator.',
  };
}

function tool_activate_license(projectId, licenseKey) {
  return {
    success: true,
    message: `License activated for project ${projectId}.`,
  };
}

function tool_check_report_status(projectId) {
  return {
    status : 'stalled',
    message: 'Report engine stalled on last run — restart required.',
  };
}

function tool_validate_project_data(projectId) {
  return { valid: true, version: '4.2.1' };
}

function tool_restart_report_engine(projectId) {
  return { success: true };
}

async function tool_search_knowledge_base(query) {
  try {
    const result = await searchKnowledgeBase(query);
    if (result.steps.length === 0) {
      return { found: false, steps: [], source: '' };
    }
    return { found: true, steps: result.steps, source: result.source, title: result.title };
  } catch (err) {
    logger.error('[Vapi KB] search failed:', err.message);
    return { found: false, steps: [], source: '' };
  }
}

async function tool_create_support_ticket({ phone, callerName, issueType, symptoms, email }) {
  const ticketId = `GT-${Math.floor(10000 + Math.random() * 90000)}`;
  try {
    await saveCallHistory({
      phone_number   : phone || 'unknown',
      product_queried: issueType || 'general',
      summary        : `[${ticketId}] ${callerName || 'Caller'} | ${issueType} | ${(symptoms || []).join(' | ')}`,
      email          : email || null,
      ticket_id      : ticketId,
    });
  } catch (err) {
    logger.warn('[Vapi Ticket] saveCallHistory failed (non-fatal):', err.message);
  }
  return {
    ticketId,
    message: `Support ticket ${ticketId} created. Our team will contact you within 4 hours.`,
  };
}

// ─── Tool dispatcher ─────────────────────────────────────────────────────────

async function dispatchTool(name, parameters) {
  logger.info(`[Vapi Tool] ${name}(${JSON.stringify(parameters)})`);

  switch (name) {
    case 'check_license_status':
      return tool_check_license_status(parameters.projectId);

    case 'validate_license_key':
      return tool_validate_license_key(parameters.licenseKey);

    case 'activate_license':
      return tool_activate_license(parameters.projectId, parameters.licenseKey);

    case 'check_report_status':
      return tool_check_report_status(parameters.projectId);

    case 'validate_project_data':
      return tool_validate_project_data(parameters.projectId);

    case 'restart_report_engine':
      return tool_restart_report_engine(parameters.projectId);

    case 'search_knowledge_base':
      return tool_search_knowledge_base(parameters.query);

    case 'create_support_ticket':
      return tool_create_support_ticket(parameters);

    default:
      logger.warn(`[Vapi Tool] Unknown tool: ${name}`);
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Webhook route ───────────────────────────────────────────────────────────

router.post('/webhook', async (req, res) => {
  const message = req.body?.message;

  if (!message) {
    logger.warn('[Vapi] Received webhook with no message body');
    return res.status(400).json({ error: 'Missing message' });
  }

  const { type, call } = message;
  const callId = call?.id || 'unknown';

  logger.info(`[Vapi] Event: ${type} | call: ${callId}`);

  try {
    switch (type) {

      // ── 1. Assistant request — Vapi asks which assistant to use ───────────
      case 'assistant-request': {
        const callerNumber = call?.customer?.number || 'unknown';
        const assistant = buildAssistantConfig(callerNumber);
        logger.info(`[Vapi] Returning assistant config for ${callerNumber}`);
        return res.json({ assistant });
      }

      // ── 2. Function call — Vapi needs to run one of our tools ────────────
      case 'function-call': {
        const { name, parameters } = message.functionCall;
        const result = await dispatchTool(name, parameters || {});
        // Vapi expects result as a string
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        logger.info(`[Vapi Tool] ${name} → ${resultStr.slice(0, 120)}`);
        return res.json({ result: resultStr });
      }

      // ── 3. End-of-call report — persist analytics & conversation ─────────
      case 'end-of-call-report': {
        const { endedReason, transcript, summary, recordingUrl } = message;
        const callerPhone = call?.customer?.number || 'unknown';

        logger.info(`[Vapi] Call ended — reason: ${endedReason} | caller: ${callerPhone}`);

        try {
          await saveCallHistory({
            phone_number   : callerPhone,
            product_queried: 'vapi-call',
            summary        : summary || transcript?.slice(0, 500) || 'No summary',
            recording_url  : recordingUrl || null,
          });
        } catch (err) {
          logger.warn('[Vapi] end-of-call saveCallHistory failed (non-fatal):', err.message);
        }

        return res.sendStatus(200);
      }

      // ── 4. Status update — log call lifecycle events ──────────────────────
      case 'status-update': {
        logger.info(`[Vapi] Status: ${message.status} | call: ${callId}`);
        return res.sendStatus(200);
      }

      // ── Unknown event types — acknowledge silently ────────────────────────
      default: {
        logger.debug(`[Vapi] Unhandled event type: ${type}`);
        return res.sendStatus(200);
      }
    }
  } catch (err) {
    logger.error(`[Vapi] Webhook error (${type}):`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Health check ────────────────────────────────────────────────────────────

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'vapi-webhook' });
});

module.exports = router;
