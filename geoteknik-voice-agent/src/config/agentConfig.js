/**
 * Agent Configuration
 * Centralized configuration for voice agent behavior
 */

require('dotenv').config();

const agentConfig = {
  // Twilio Configuration
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },

  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    environment: process.env.NODE_ENV || 'development',
  },

  // Supabase Configuration
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  },

  // Silence Handling - The Fix!
  silenceTimeouts: {
    initialWelcome: parseInt(process.env.SILENCE_TIMEOUT_WELCOME) || 5000,
    duringTroubleshooting: parseInt(process.env.SILENCE_TIMEOUT_TROUBLESHOOTING) || 10000,
    afterQuestion: parseInt(process.env.SILENCE_TIMEOUT_QUESTION) || 8000,
    afterError: parseInt(process.env.SILENCE_TIMEOUT_ERROR) || 6000,
  },

  // Escalation Settings
  silenceEscalation: {
    maxSilenceRetries: parseInt(process.env.MAX_SILENCE_RETRIES) || 3,
    escalationMessage:
      "I'm having trouble hearing you. Let me connect you with a specialist.",
  },

  // Session Management
  sessionContext: {
    ttl: 3600000, // 1 hour in milliseconds
    storeLocation: 'memory', // Use in-memory for Supabase
  },

  // Troubleshooting Flow
  troubleshooting: {
    maxDiagnosticRetries: 3,
    enableAutoDiagnostics: true,
    enableStepByStep: true,
  },

  // Knowledge Base
  knowledgeBase: {
    enableWebScraping: process.env.ENABLE_WEB_SCRAPING === 'true',
    enableCaching: process.env.ENABLE_CONTEXT_CACHING === 'true',
    cacheExpiry: 86400000, // 24 hours
    searchLimit: 5,
  },

  // Website Scraping
  webscraper: {
    baseUrl: process.env.GEOTEKNIK_WEBSITE_URL || 'https://www.geoteknikltd.com/tr/',
    searchPaths: ['/support', '/manuals', '/faq', '/knowledge-base', '/products'],
    timeout: parseInt(process.env.SCRAPE_TIMEOUT) || 10000,
    retryAttempts: 2,
  },

  // Analytics
  analytics: {
    enabled: process.env.ENABLE_ANALYTICS === 'true',
    trackSessions: true,
    trackResolutions: true,
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/agent.log',
  },
};

module.exports = agentConfig;