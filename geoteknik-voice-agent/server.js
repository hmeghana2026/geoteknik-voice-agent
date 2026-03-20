/**
 * Main Server - Updated for Supabase
 * Express server and Twilio integration
 */

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const logger = require('./src/utils/logger');
const agentConfig = require('./src/config/agentConfig');
const database = require('./src/config/database');

// Services
const SessionManager = require('./src/core/sessionManager');
const TroubleshootingEngine = require('./src/core/troubleshootingEngine');
const VoiceAgent = require('./src/core/voiceAgent');
const KnowledgeBase = require('./src/knowledge/knowledgeBase');
const SpeechService = require('./src/services/speechService');
const EscalationService = require('./src/services/escalationService');

const app = express();
const PORT = agentConfig.server.port;

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Initialize services
let voiceAgent;
let sessionManager;
let knowledgeBase;

/**
 * Initialize application
 */
async function initialize() {
  try {
    logger.info('Initializing Geoteknik Voice Agent with Supabase...');

    // Initialize Supabase
    await database.initializeSupabase();

    // Initialize services with in-memory session storage
    const sessions = {}; // In-memory session store
    sessionManager = new SessionManager(sessions, database);
    knowledgeBase = new KnowledgeBase(database);

    const speechService = new SpeechService(
      agentConfig.twilio.accountSid,
      agentConfig.twilio.authToken,
      agentConfig.twilio.phoneNumber
    );

    const troubleshootingEngine = new TroubleshootingEngine(
      knowledgeBase,
      sessionManager,
      speechService
    );

    const escalationService = new EscalationService(database);

    voiceAgent = new VoiceAgent({
      sessionManager,
      troubleshootingEngine,
      speechService,
      escalationService,
      database,
      silenceTimeouts: agentConfig.silenceTimeouts,
    });

    logger.info('✓ All services initialized successfully');
  } catch (error) {
    logger.error('Initialization failed:', error);
    process.exit(1);
  }
}

/**
 * Routes
 */

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: agentConfig.server.environment,
    database: 'supabase',
  });
});

// Incoming call handler
app.post('/call/incoming', async (req, res) => {
  try {
    const callData = {
      phoneNumber: req.body.From,
      callId: req.body.CallSid,
      customerId: req.body.CustomerId || null,
    };

    logger.info(`Incoming call: ${callData.callId} from ${callData.phoneNumber}`);

    voiceAgent.handleIncomingCall(callData).catch((error) => {
      logger.error('Call handling error:', error);
    });

    const twiml = new (require('twilio').twiml.VoiceResponse)();
    twiml.say('Please wait while we connect you to support');

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    logger.error('Incoming call route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Call end handler
app.post('/call/end', async (req, res) => {
  try {
    const sessionId = req.body.sessionId;
    if (sessionId) {
      await voiceAgent.handleCallEnd(sessionId);
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('Call end error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get session status
app.get('/sessions/:sessionId', async (req, res) => {
  try {
    const session = await sessionManager.getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (error) {
    logger.error('Session retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get active sessions
app.get('/sessions', async (req, res) => {
  try {
    const sessions = await sessionManager.getActiveSessions();
    res.json({ count: sessions.length, sessions });
  } catch (error) {
    logger.error('Active sessions retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search knowledge base
app.post('/knowledge/search', async (req, res) => {
  try {
    const { query } = req.body;
    const results = await knowledgeBase.search(query);
    res.json({ query, results });
  } catch (error) {
    logger.error('Knowledge base search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Analytics
app.get('/analytics', async (req, res) => {
  try {
    const analytics = await database.getSessionAnalytics(24);
    res.json(analytics);
  } catch (error) {
    logger.error('Analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

/**
 * Start server
 */
async function start() {
  try {
    await initialize();

    app.listen(PORT, () => {
      logger.info(`✓ Server running on port ${PORT}`);
      logger.info(`✓ Environment: ${agentConfig.server.environment}`);
      logger.info(`✓ Database: Supabase (PostgreSQL)`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await database.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await database.close();
  process.exit(0);
});

start();