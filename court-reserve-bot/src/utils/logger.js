const winston = require('winston');
const path = require('path');
const DiscordTransport = require('./discordTransport');

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

// Create Discord transport instance (will be initialized later)
const discordTransport = new DiscordTransport({
  level: 'debug', // Log all levels to Discord
  channelId: process.env.DISCORD_LOG_CHANNEL_ID
});

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: process.env.LOG_FILE || path.join(__dirname, '../../logs/app.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // File transport for errors only
    new winston.transports.File({
      filename: process.env.ERROR_LOG_FILE || path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Discord transport
    discordTransport
  ]
});

// Export method to initialize Discord transport with client
logger.initDiscordTransport = (discordClient) => {
  discordTransport.setClient(discordClient);
};

// Service-specific logger factory
logger.createServiceLogger = (serviceName) => {
  return {
    info: (message, meta = {}) => logger.info(`[${serviceName}] ${message}`, meta),
    warn: (message, meta = {}) => logger.warn(`[${serviceName}] ${message}`, meta),
    error: (message, meta = {}) => logger.error(`[${serviceName}] ${message}`, meta),
    debug: (message, meta = {}) => logger.debug(`[${serviceName}] ${message}`, meta)
  };
};

module.exports = logger;
