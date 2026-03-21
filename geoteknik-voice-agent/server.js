/**
 * Main Server - Real-Time Ready with Redis + WebSocket
 * Express server with Twilio + WebSocket + Redis caching
 */

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const expressWs = require('express-ws');
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
const CacheService = require('./src/services/cacheService');
const AIService = require('./src/services/ai');
const websocketManager = require('./src/services/websocketManager');

const app = express();
expressWs(app);
const PORT = agentConfig.server.port;

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Initialize services
let voiceAgent;
let sessionManager;
let knowledgeBase;
let cacheService;
let aiService;

/**
 * Initialize application
 */
async function initialize() {
  try {
    logger.info('Initializing Geoteknik Voice Agent (Real-Time Ready)...');

    // Initialize Redis Cache
    cacheService = new CacheService({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
    });
    const cacheReady = await cacheService.initialize();
    if (!cacheReady) {
      logger.warn('⚠ Redis not available - using in-memory fallback');
    }

    // Initialize Database
    await database.initializeSupabase();

    // Initialize AI Service with cache
    aiService = new AIService(cacheService);

    // Initialize Session Manager with cache
    const sessions = {};
    sessionManager = new SessionManager(sessions, database, cacheService);
    knowledgeBase = new KnowledgeBase(database, cacheService);

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
      aiService,
      websocketManager,
    });

    logger.info('✓ All services initialized successfully');
    logger.info(
      `✓ Cache service: ${cacheReady ? 'Redis' : 'In-Memory Fallback'}`
    );
    logger.info(
      `✓ AI Service: Streaming enabled with ${agentConfig.aiTimeout || 800}ms timeout`
    );
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
    cache: cacheService?.isConnected ? 'redis' : 'in-memory',
    websockets: websocketManager.getActiveConnections(),
  });
});

// WebSocket endpoint for real-time communication
app.ws('/ws/:sessionId', async (ws, req) => {
  const { sessionId } = req.params;

  try {
    logger.info(`WebSocket connected: ${sessionId}`);

    // Register WebSocket connection
    websocketManager.registerSession(sessionId, ws);

    // Send welcome message
    ws.send(
      JSON.stringify({
        type: 'connection_established',
        data: { sessionId, timestamp: Date.now() },
      })
    );

    // Handle incoming messages
    ws.on('message', async (msg) => {
      try {
        const parsed = JSON.parse(msg);
        logger.debug(`Message from ${sessionId}:`, parsed.type);

        // Route to appropriate handler
        if (parsed.type === 'user_response') {
          await sessionManager.addMessage(
            sessionId,
            'customer',
            parsed.data.text
          );
          websocketManager.sendToSession(sessionId, 'message_received', {
            acknowledged: true,
          });
        } else if (parsed.type === 'request_status') {
          const session = await sessionManager.getSession(sessionId);
          websocketManager.sendToSession(sessionId, 'session_status', {
            session,
          });
        }
      } catch (error) {
        logger.error(`Message parsing error for ${sessionId}:`, error);
      }
    });
  } catch (error) {
    logger.error('WebSocket connection error:', error);
  }
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
      websocketManager.closeSession(sessionId);
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
    res.json({
      count: sessions.length,
      websockets: websocketManager.getActiveConnections(),
      sessions,
    });
  } catch (error) {
    logger.error('Active sessions retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search knowledge base (with caching)
app.post('/knowledge/search', async (req, res) => {
  try {
    const { query } = req.body;
    const results = await knowledgeBase.search(query);
    res.json({ query, results, cached: results.cached || false });
  } catch (error) {
    logger.error('Knowledge base search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// AI Response endpoint with streaming
app.post('/ai/response', async (req, res) => {
  try {
    const { context } = req.body;
    const response = await aiService.getResponse(context);
    res.json(response);
  } catch (error) {
    logger.error('AI response error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Analytics
app.get('/analytics', async (req, res) => {
  try {
    const analytics = await database.getSessionAnalytics(24);
    const cacheStats = await aiService.getCacheStats();
    res.json({
      ...analytics,
      cache_stats: cacheStats,
      websockets_active: websocketManager.getActiveConnections(),
    });
  } catch (error) {
    logger.error('Analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cache management endpoint
app.post('/cache/clear', async (req, res) => {
  try {
    const success = await cacheService.clearAll();
    res.json({ success, message: 'Cache cleared' });
  } catch (error) {
    logger.error('Cache clear error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cache stats endpoint
app.get('/cache/stats', async (req, res) => {
  try {
    const stats = await cacheService.getStats();
    res.json({ stats });
  } catch (error) {
    logger.error('Cache stats error:', error);
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
      logger.info(`✓ WebSocket: Enabled on /ws/:sessionId`);
      logger.info(`✓ Cache: Redis-backed with in-memory fallback`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  websocketManager.closeAll();
  await cacheService?.close();
  await database.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  websocketManager.closeAll();
  await cacheService?.close();
  await database.close();
  process.exit(0);
});

start();