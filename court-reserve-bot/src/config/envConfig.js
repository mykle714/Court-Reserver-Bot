require('dotenv').config();
const logger = require('../utils/logger').createServiceLogger('Config');

/**
 * Validates and exports environment configuration
 */
class EnvConfig {
  constructor() {
    this.requiredVars = [
      'DISCORD_BOT_TOKEN',
      'DISCORD_CHANNEL_ID',
      'API_BASE_URL'
    ];

    this.validate();
    this.loadConfig();
  }

  /**
   * Validate that all required environment variables are set
   */
  validate() {
    const missing = this.requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      logger.error(`Missing required environment variables: ${missing.join(', ')}`);
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    logger.info('Environment configuration validated successfully');
  }

  /**
   * Load configuration from environment variables
   */
  loadConfig() {
    this.discord = {
      token: process.env.DISCORD_BOT_TOKEN,
      channelId: process.env.DISCORD_CHANNEL_ID,
      logChannelId: process.env.DISCORD_LOG_CHANNEL_ID,
      commandPrefix: process.env.DISCORD_COMMAND_PREFIX || '!'
    };

    this.api = {
      baseURL: process.env.API_BASE_URL,
      authToken: process.env.AUTH_TOKEN || '',
      userId: process.env.USER_ID || '',
      facilityId: process.env.FACILITY_ID || '',
      timeout: parseInt(process.env.API_TIMEOUT || '10000', 10)
    };

    this.scheduler = {
      enabled: process.env.SCHEDULER_ENABLED === 'true',
      configPath: process.env.WAITLIST_CONFIG_PATH || './config/waitlistConfig.json',
      checkIntervalSeconds: parseInt(process.env.SCHEDULER_CHECK_INTERVAL_SECONDS || '10', 10),
      courtCheckDelayMs: parseInt(process.env.SCHEDULER_COURT_CHECK_DELAY_MS || '900', 10),
      advanceCheckDays: parseInt(process.env.SCHEDULER_ADVANCE_CHECK_DAYS || '7', 10),
      courtIdStart: parseInt(process.env.COURT_ID_START || '52667', 10),
      courtIdEnd: parseInt(process.env.COURT_ID_END || '52677', 10)
    };

    this.fighter = {
      enabled: process.env.FIGHTER_ENABLED === 'true',
      configPath: process.env.FIGHTER_CONFIG_PATH || './config/fighterConfig.json',
      maxConcurrent: parseInt(process.env.FIGHTER_MAX_CONCURRENT || '50', 10)
    };

    this.reservationChecker = {
      enabled: process.env.RESERVATION_CHECKER_ENABLED === 'true',
      checkIntervalMinutes: parseInt(process.env.RESERVATION_CHECKER_INTERVAL || '5', 10),
      stateFilePath: process.env.RESERVATION_CHECKER_STATE_PATH || './config/reservationCheckerState.json'
    };

    this.auth = {
      bearerToken: process.env.AUTH_BEARER_TOKEN || ''
    };

    this.logging = {
      level: process.env.LOG_LEVEL || 'info',
      logFile: process.env.LOG_FILE || './logs/app.log',
      errorLogFile: process.env.ERROR_LOG_FILE || './logs/error.log'
    };
  }

  /**
   * Get all configuration
   */
  getAll() {
    return {
      discord: this.discord,
      api: this.api,
      scheduler: this.scheduler,
      fighter: this.fighter,
      logging: this.logging
    };
  }
}

module.exports = new EnvConfig();
