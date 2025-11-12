const Transport = require('winston-transport');

/**
 * Custom Winston transport that sends logs to a Discord channel
 */
class DiscordTransport extends Transport {
  constructor(opts = {}) {
    super(opts);
    
    this.discordClient = null;
    this.channelId = opts.channelId;
    this.messageQueue = [];
    this.isProcessing = false;
    
    // Rate limiting: Discord allows ~5 messages per 5 seconds per channel
    this.rateLimitDelay = 1000; // 1 second between messages
    this.lastMessageTime = 0;
  }

  /**
   * Set the Discord client instance
   * @param {Client} client - Discord.js client
   */
  setClient(client) {
    this.discordClient = client;
    
    // Process any queued messages
    if (this.messageQueue.length > 0) {
      this.processQueue();
    }
  }

  /**
   * Winston log method
   * @param {Object} info - Log information
   * @param {Function} callback - Callback function
   */
  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Add to queue
    this.messageQueue.push(info);
    
    // Process queue if client is ready
    if (this.discordClient && !this.isProcessing) {
      this.processQueue();
    }

    callback();
  }

  /**
   * Process the message queue
   */
  async processQueue() {
    if (this.isProcessing || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.messageQueue.length > 0) {
      const info = this.messageQueue.shift();
      
      // Rate limiting
      const now = Date.now();
      const timeSinceLastMessage = now - this.lastMessageTime;
      if (timeSinceLastMessage < this.rateLimitDelay) {
        await this.sleep(this.rateLimitDelay - timeSinceLastMessage);
      }

      await this.sendToDiscord(info);
      this.lastMessageTime = Date.now();
    }

    this.isProcessing = false;
  }

  /**
   * Send log message to Discord
   * @param {Object} info - Log information
   */
  async sendToDiscord(info) {
    if (!this.discordClient || !this.channelId) {
      return;
    }

    try {
      const channel = this.discordClient.channels.cache.get(this.channelId);
      if (!channel) {
        console.error(`Discord log channel ${this.channelId} not found`);
        return;
      }

      const message = this.formatLogMessage(info);
      await channel.send(message);
    } catch (error) {
      // Don't log Discord errors to avoid infinite loop
      console.error('Failed to send log to Discord:', error.message);
    }
  }

  /**
   * Format log info into compact plain text message
   * @param {Object} info - Log information
   * @returns {string} Formatted log message
   */
  formatLogMessage(info) {
    const levelEmojis = {
      error: '❌',
      warn: '⚠️',
      info: 'ℹ️',
      debug: '🔍'
    };

    const emoji = levelEmojis[info.level] || '📝';

    // Format message - handle potential object/array messages
    let message = info.message;
    if (typeof message === 'object') {
      message = JSON.stringify(message, null, 2);
    }

    // Build compact log message
    let logMessage = `${emoji} **[${info.level.toUpperCase()}]** ${message}`;

    // Add stack trace if present (for errors) - more compact format
    if (info.stack) {
      let stack = info.stack;
      // Truncate stack trace if too long
      if (stack.length > 500) {
        stack = stack.substring(0, 497) + '...';
      }
      logMessage += `\n\`\`\`\n${stack}\n\`\`\``;
    }

    // Truncate entire message if too long (Discord has 2000 char limit for messages)
    if (logMessage.length > 1950) {
      logMessage = logMessage.substring(0, 1947) + '...';
    }

    return logMessage;
  }

  /**
   * Sleep helper
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DiscordTransport;
