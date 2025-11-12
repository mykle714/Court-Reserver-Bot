const reservationFighter = require('../../reservationFighter');
const logger = require('../../../utils/logger').createServiceLogger('DiscordBot');

/**
 * Handle fighter-related commands
 */
class FighterCommands {
  /**
   * Get command handlers
   * @returns {Object} Command handler map
   */
  getHandlers() {
    return {
      'ft status': this.status.bind(this),
      'ft enable': this.enable.bind(this),
      'ft disable': this.disable.bind(this),
      'ft set court': this.setCourt.bind(this),
      'ft set date': this.setDate.bind(this),
      'ft set time': this.setTime.bind(this),
      'ft set duration': this.setDuration.bind(this),
      'ft reload': this.reload.bind(this)
    };
  }

  /**
   * Show fighter status
   */
  async status(message, args) {
    try {
      const status = reservationFighter.getStatus();
      
      const embed = {
        color: status.enabled ? (status.running ? 0xffaa00 : 0x00ff00) : 0xff0000,
        title: '⚔️ Reservation Fighter Status',
        fields: [
          {
            name: 'Status',
            value: status.enabled ? (status.running ? '🏃 Running' : '✅ Enabled') : '❌ Disabled',
            inline: true
          },
          {
            name: 'Target Court',
            value: status.target.court || 'Not set',
            inline: true
          },
          {
            name: 'Target Date',
            value: status.target.date || 'Not set',
            inline: true
          },
          {
            name: 'Start Time',
            value: status.target.startTime || 'Not set',
            inline: true
          },
          {
            name: 'Duration',
            value: status.target.duration ? `${status.target.duration} min` : 'Not set',
            inline: true
          },
          {
            name: 'Parallel Requests',
            value: `${status.strategy.parallelRequests || 50}`,
            inline: true
          }
        ],
        timestamp: new Date()
      };

      // Add session info if running
      if (status.currentSession) {
        const results = status.currentSession.results;
        embed.fields.push({
          name: 'Current Session',
          value: `Total: ${results.total} | Success: ${results.success} | Failed: ${results.failed}`
        });
      }

      await message.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error getting fighter status', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Enable fighter
   */
  async enable(message, args) {
    try {
      await reservationFighter.enable();
      await message.reply('✅ Reservation fighter enabled and started');
    } catch (error) {
      logger.error('Error enabling fighter', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Disable fighter
   */
  async disable(message, args) {
    try {
      await reservationFighter.disable();
      await message.reply('✅ Reservation fighter disabled');
    } catch (error) {
      logger.error('Error disabling fighter', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Set target court
   * Usage: !ft set court <court_name>
   */
  async setCourt(message, args) {
    try {
      if (args.length < 1) {
        await message.reply('❌ Usage: `!ft set court <court_name>`');
        return;
      }

      const court = args.join(' ');
      await reservationFighter.updateTarget({ court });
      await message.reply(`✅ Fighter target court set to: **${court}**`);
    } catch (error) {
      logger.error('Error setting fighter court', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Set target date
   * Usage: !ft set date <YYYY-MM-DD>
   */
  async setDate(message, args) {
    try {
      if (args.length < 1) {
        await message.reply('❌ Usage: `!ft set date <YYYY-MM-DD>`\nExample: `!ft set date 2025-11-15`');
        return;
      }

      const date = args[0];
      
      // Validate date format
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        await message.reply('❌ Invalid date format. Use YYYY-MM-DD');
        return;
      }

      await reservationFighter.updateTarget({ date });
      await message.reply(`✅ Fighter target date set to: **${date}**`);
    } catch (error) {
      logger.error('Error setting fighter date', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Set target time
   * Usage: !ft set time <HH:MM>
   */
  async setTime(message, args) {
    try {
      if (args.length < 1) {
        await message.reply('❌ Usage: `!ft set time <HH:MM>`\nExample: `!ft set time 18:00`');
        return;
      }

      const startTime = args[0];
      
      // Basic validation
      if (!/^\d{2}:\d{2}$/.test(startTime)) {
        await message.reply('❌ Invalid time format. Use HH:MM (e.g., 18:00)');
        return;
      }

      await reservationFighter.updateTarget({ startTime });
      await message.reply(`✅ Fighter start time set to: **${startTime}**`);
    } catch (error) {
      logger.error('Error setting fighter time', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Set duration
   * Usage: !ft set duration <minutes>
   */
  async setDuration(message, args) {
    try {
      if (args.length < 1) {
        await message.reply('❌ Usage: `!ft set duration <minutes>`\nExample: `!ft set duration 60`');
        return;
      }

      const duration = parseInt(args[0], 10);
      
      if (isNaN(duration) || duration <= 0) {
        await message.reply('❌ Duration must be a positive number');
        return;
      }

      await reservationFighter.updateTarget({ duration });
      await message.reply(`✅ Fighter duration set to: **${duration} minutes**`);
    } catch (error) {
      logger.error('Error setting fighter duration', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Reload fighter configuration
   */
  async reload(message, args) {
    try {
      await reservationFighter.reload();
      await message.reply('✅ Fighter configuration reloaded');
    } catch (error) {
      logger.error('Error reloading fighter config', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }
}

module.exports = new FighterCommands();
