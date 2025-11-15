const winston = require('winston');
const path = require('path');
const DiscordTransport = require('./discordTransport');

/**
 * Dedicated API logger that sends logs to the API-specific Discord channel
 * This keeps API call logs separate from general application logs
 */

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return stack 
      ? `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`
      : `${timestamp} [${level.toUpperCase()}]: ${message}`;
  })
);

// Create Discord transport instance for API logs
const apiDiscordTransport = new DiscordTransport({
  level: 'debug', // Log all API activity
  channelId: process.env.DISCORD_API_LOG_CHANNEL_ID
});

// Create API logger instance
const apiLogger = winston.createLogger({
  level: 'debug', // Capture all API logs
  format: logFormat,
  transports: [
    // Console transport for local debugging
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    // File transport for API logs
    new winston.transports.File({
      filename: process.env.API_LOG_FILE || path.join(__dirname, '../../logs/api.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Discord transport for API-specific channel
    apiDiscordTransport
  ]
});

// Export method to initialize Discord transport with client
apiLogger.initDiscordTransport = (discordClient) => {
  apiDiscordTransport.setClient(discordClient);
};

// Service-specific logger factory (for API client)
apiLogger.createServiceLogger = (serviceName) => {
  return {
    info: (message, meta = {}) => apiLogger.info(`[${serviceName}] ${message}`, meta),
    warn: (message, meta = {}) => apiLogger.warn(`[${serviceName}] ${message}`, meta),
    error: (message, meta = {}) => apiLogger.error(`[${serviceName}] ${message}`, meta),
    debug: (message, meta = {}) => apiLogger.debug(`[${serviceName}] ${message}`, meta)
  };
};

module.exports = apiLogger;
