/**
 * Logger
 * Centralized logging configuration
 */

const winston = require('winston');
const path = require('path');

const logLevel = process.env.LOG_LEVEL || 'info';
const logFile = process.env.LOG_FILE || 'logs/agent.log';

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.dirname(logFile);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'geoteknik-voice-agent' },
  transports: [
    // File logging
    new winston.transports.File({
      filename: logFile,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),

    // Error file logging
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10485760,
      maxFiles: 5,
    }),

    // Console logging in development
    ...(process.env.NODE_ENV !== 'production'
      ? [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.printf(
                ({ level, message, timestamp, ...meta }) => {
                  return `${timestamp} [${level}]: ${message}`;
                }
              )
            ),
          }),
        ]
      : []),
  ],
});

module.exports = logger;