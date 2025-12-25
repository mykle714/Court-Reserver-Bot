const { Client, GatewayIntentBits } = require('discord.js');
const logger = require('../../utils/logger').createServiceLogger('DiscordBot');
const config = require('../../config/envConfig');
const waitlistCommands = require('./commands/waitlistCommands');
const fighterCommands = require('./commands/fighterCommands');
const helpCommand = require('./commands/helpCommand');

/**
 * Discord Bot Service
 * Listens for commands and interfaces with other services
 */
class DiscordBot {
  constructor() {
    this.client = null;
    this.initialized = false;
    this.commandPrefix = config.discord.commandPrefix;
    this.channelId = config.discord.channelId;
    this.commands = new Map();
    
    // Register all commands
    this.registerCommands();
  }

  /**
   * Register command handlers
   */
  registerCommands() {
    // Register waitlist commands
    const waitlistHandlers = waitlistCommands.getHandlers();
    Object.entries(waitlistHandlers).forEach(([cmd, handler]) => {
      this.commands.set(cmd, handler);
    });

    // Register fighter commands
    const fighterHandlers = fighterCommands.getHandlers();
    Object.entries(fighterHandlers).forEach(([cmd, handler]) => {
      this.commands.set(cmd, handler);
    });

    // Register reservation checker commands
    const reservationCheckerCommands = require('./commands/reservationCheckerCommands');
    const rcHandlers = reservationCheckerCommands.getHandlers();
    Object.entries(rcHandlers).forEach(([cmd, handler]) => {
      this.commands.set(cmd, handler);
    });

    // Register auth commands
    const authCommands = require('./commands/authCommands');
    const authHandlers = authCommands.getHandlers();
    Object.entries(authHandlers).forEach(([cmd, handler]) => {
      this.commands.set(cmd, handler);
    });

    // Register dashboard commands
    const dashboardCommands = require('./commands/dashboardCommands');
    const dashboardHandlers = dashboardCommands.getHandlers();
    Object.entries(dashboardHandlers).forEach(([cmd, handler]) => {
      this.commands.set(cmd, handler);
    });

    // Register help commands
    const helpCommands = helpCommand.getHandlers();
    Object.entries(helpHandlers).forEach(([cmd, handler]) => {
      this.commands.set(cmd, handler);
    });

    logger.info(`Registered ${this.commands.size} commands`);
  }

  /**
   * Initialize the Discord bot
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      logger.info('Initializing Discord Bot...');

      // Create Discord client
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent
        ]
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Login to Discord
      await this.client.login(config.discord.token);

      this.initialized = true;
      logger.info('Discord Bot initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Discord Bot', { error: error.message });
      throw error;
    }
  }

  /**
   * Set up Discord event handlers
   */
  setupEventHandlers() {
    // Ready event
    this.client.on('ready', () => {
      logger.info(`Discord bot logged in as ${this.client.user.tag}`);
      this.onReady();
    });

    // Message event
    this.client.on('messageCreate', async (message) => {
      await this.handleMessage(message);
    });

    // Error event
    this.client.on('error', (error) => {
      logger.error('Discord client error', { error: error.message });
    });
  }

  /**
   * Handle ready event
   */
  onReady() {
    // Initialize Discord logging transport for main logger
    const mainLogger = require('../../utils/logger');
    mainLogger.initDiscordTransport(this.client);
    logger.info('Discord logging transport initialized');

    // Initialize Discord logging transport for API logger
    const apiLogger = require('../../utils/apiLogger');
    apiLogger.initDiscordTransport(this.client);
    logger.info('API Discord logging transport initialized');

    // Set bot status
    this.client.user.setActivity('court reservations', { type: 'WATCHING' });

    // Send startup message to designated channel
    const channel = this.client.channels.cache.get(this.channelId);
    if (channel) {
      channel.send('🤖 useful trin at your service !!').catch(err => {
        logger.warn('Failed to send startup message', { error: err.message });
      });
    }

    // Listen to service events
    this.setupServiceListeners();
  }

  /**
   * Set up listeners for service events
   */
  setupServiceListeners() {
    const waitlistScheduler = require('../waitlistScheduler');
    const reservationFighter = require('../reservationFighter');
    const reservationChecker = require('../reservationChecker');

    // Waitlist scheduler events
    waitlistScheduler.on('reservationSuccess', (data) => {
      this.sendNotification('✅ Reservation successful!', {
        court: data.target.court,
        date: data.target.date,
        time: data.target.timeRange.start,
        reservationId: data.reservation?.id
      });
    });

    waitlistScheduler.on('reservationError', (data) => {
      this.sendNotification('❌ Reservation attempt failed', {
        court: data.target.court,
        date: data.target.date,
        error: data.error.message
      });
    });

    // Reservation fighter events
    reservationFighter.on('started', (data) => {
      this.sendNotification('⚔️ Fighter started', {
        court: data.target.court,
        date: data.target.date,
        time: data.target.startTime
      });
    });

    reservationFighter.on('complete', (data) => {
      this.sendNotification('⚔️ Fighter session complete', {
        total: data.results.total,
        success: data.results.success,
        failed: data.results.failed,
        successRate: data.results.successRate
      });
    });

    reservationFighter.on('requestSuccess', (data) => {
      this.sendNotification('🎯 Fighter got a reservation!', {
        requestId: data.requestId,
        reservationId: data.result?.id
      });
    });

    // Reservation checker events
    reservationChecker.on('newReservation', (data) => {
      const res = data.reservation;
      this.sendNotification('🆕 New Court Reservation Detected!', {
        court: res.CourtLabel || 'Unknown',
        reservationId: res.ReservationId,
        date: res.DateTimeDisplay || 'Unknown',
        type: res.ReservationType || 'Court Reservation',
        members: res.MembersDisplay || 'Not specified'
      });
    });

    logger.info('Service event listeners configured');
  }

  /**
   * Send notification to Discord channel
   * @param {string} title - Notification title
   * @param {Object} data - Notification data
   */
  sendNotification(title, data) {
    const channel = this.client.channels.cache.get(this.channelId);
    if (!channel) {
      logger.warn('Notification channel not found');
      return;
    }

    const fields = Object.entries(data).map(([key, value]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value: String(value),
      inline: true
    }));

    const embed = {
      color: title.startsWith('✅') ? 0x00ff00 : title.startsWith('❌') ? 0xff0000 : 0x5865F2,
      title: title,
      fields: fields,
      timestamp: new Date()
    };

    channel.send({ embeds: [embed] }).catch(err => {
      logger.error('Failed to send notification', { error: err.message });
    });
  }

  /**
   * Handle incoming messages
   * @param {Message} message - Discord message
   */
  async handleMessage(message) {
    // Ignore bot messages
    if (message.author.bot) return;

    // Only respond in designated channel
    if (message.channelId !== this.channelId) return;

    // Check if message starts with command prefix
    if (!message.content.startsWith(this.commandPrefix)) return;

    // Parse command
    const content = message.content.slice(this.commandPrefix.length).trim();
    const args = this.parseArgs(content);
    
    if (args.length === 0) return;

    // Find matching command
    const commandKey = this.findCommand(args);
    if (!commandKey) {
      logger.debug('Unknown command', { content });
      return;
    }

    // Get command arguments
    const commandArgs = args.slice(commandKey.split(' ').length);

    // Execute command
    try {
      logger.info(`Executing command: ${commandKey}`, { user: message.author.tag });
      const handler = this.commands.get(commandKey);
      await handler(message, commandArgs);
    } catch (error) {
      logger.error(`Error executing command: ${commandKey}`, { error: error.message });
      await message.reply(`❌ Error executing command: ${error.message}`);
    }
  }

  /**
   * Parse command arguments, handling quoted strings
   * @param {string} content - Message content
   * @returns {Array<string>} Arguments
   */
  parseArgs(content) {
    const args = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ' ' && !inQuotes) {
        if (current) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current) {
      args.push(current);
    }

    return args;
  }

  /**
   * Find matching command from args
   * @param {Array<string>} args - Command arguments
   * @returns {string|null} Command key or null
   */
  findCommand(args) {
    // Try to match multi-word commands first (longest to shortest)
    for (let i = Math.min(args.length, 4); i >= 1; i--) {
      const key = args.slice(0, i).join(' ');
      if (this.commands.has(key)) {
        return key;
      }
    }
    return null;
  }

  /**
   * Shutdown the bot
   */
  async shutdown() {
    logger.info('Shutting down Discord Bot...');
    
    if (this.client) {
      // Send shutdown message
      const channel = this.client.channels.cache.get(this.channelId);
      if (channel) {
        await channel.send('🤖 useful trin is shutting down...').catch(() => {});
      }
      
      this.client.destroy();
    }
    
    this.initialized = false;
  }
}

module.exports = new DiscordBot();
