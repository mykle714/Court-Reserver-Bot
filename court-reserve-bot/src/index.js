require('dotenv').config();
const logger = require('./utils/logger').createServiceLogger('Main');
const authManager = require('./services/authManager');
const waitlistScheduler = require('./services/waitlistScheduler');
const reservationFighter = require('./services/reservationFighter');
const reservationChecker = require('./services/reservationChecker');
const discordBot = require('./services/discordBot');

/**
 * Court Reserve Bot
 * Main application entry point
 */
class CourtReserveBot {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize all services
   */
  async initialize() {
    try {
      logger.info('='.repeat(60));
      logger.info('useful trin - Starting...');
      logger.info('='.repeat(60));

      // Initialize services in order
      logger.info('Initializing services...');
      
      // 1. Initialize Auth Manager (first, as other services depend on it)
      await authManager.initialize();
      
      // 2. Initialize Waitlist Scheduler
      await waitlistScheduler.initialize();
      
      // 3. Initialize Reservation Fighter
      await reservationFighter.initialize();
      
      // 4. Initialize Reservation Checker
      await reservationChecker.initialize();
      
      // 5. Initialize Discord Bot (last, so it can listen to other services)
      await discordBot.initialize();

      this.initialized = true;
      
      logger.info('='.repeat(60));
      logger.info('useful trin - All services initialized successfully!');
      logger.info('='.repeat(60));
    } catch (error) {
      logger.error('Failed to initialize useful trin', { error: error.message, stack: error.stack });
      await this.shutdown();
      process.exit(1);
    }
  }

  /**
   * Shutdown all services gracefully
   */
  async shutdown() {
    logger.info('='.repeat(60));
    logger.info('useful trin - Shutting down...');
    logger.info('='.repeat(60));

    try {
      // Shutdown services in reverse order
      if (discordBot.initialized) {
        await discordBot.shutdown();
      }
      
      if (reservationChecker.initialized) {
        reservationChecker.shutdown();
      }
      
      if (reservationFighter.initialized) {
        reservationFighter.shutdown();
      }
      
      if (waitlistScheduler.initialized) {
        waitlistScheduler.shutdown();
      }
      
      if (authManager.initialized) {
        authManager.shutdown();
      }

      logger.info('All services shut down successfully');
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
    }
  }

  /**
   * Set up process event handlers
   */
  setupProcessHandlers() {
    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal');
      await this.shutdown();
      process.exit(0);
    });

    // Handle SIGTERM
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal');
      await this.shutdown();
      process.exit(0);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      await this.shutdown();
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('Unhandled promise rejection', { reason, promise });
      await this.shutdown();
      process.exit(1);
    });
  }

  /**
   * Start the bot
   */
  async start() {
    this.setupProcessHandlers();
    await this.initialize();
  }
}

// Create and start the bot
const bot = new CourtReserveBot();
bot.start().catch((error) => {
  logger.error('Fatal error starting bot', { error: error.message, stack: error.stack });
  process.exit(1);
});
