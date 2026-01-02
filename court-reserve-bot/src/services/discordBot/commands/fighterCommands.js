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
      'ft list': this.list.bind(this),
      'ft enable': this.enable.bind(this),
      'ft disable': this.disable.bind(this),
      'ft add': this.add.bind(this),
      'ft remove': this.remove.bind(this),
      'ft strategy': this.updateStrategy.bind(this),
      'ft reload': this.reload.bind(this),
      'ft cleanup': this.cleanup.bind(this)
    };
  }

  /**
   * Show fighter status
   */
  async status(message, args) {
    try {
      const status = reservationFighter.getStatus();
      const config = require('../../../config/envConfig');
      
      const embed = {
        color: status.enabled ? 0x00ff00 : 0xff0000,
        title: '⚔️ Reservation Fighter Status',
        fields: [
          {
            name: 'Status',
            value: status.enabled ? '✅ Enabled' : '❌ Disabled',
            inline: true
          },
          {
            name: 'Active Targets',
            value: `${status.targetCount}`,
            inline: true
          },
          {
            name: 'Active Jobs',
            value: `${status.activeJobCount}`,
            inline: true
          },
          {
            name: 'Active Bursts',
            value: `${status.activeBurstCount}`,
            inline: true
          },
          {
            name: 'Burst Duration',
            value: `${status.strategy.durationSeconds || 20}s`,
            inline: true
          },
          {
            name: 'Request Interval',
            value: `${status.strategy.requestIntervalMs || 100}ms`,
            inline: true
          },
          {
            name: '⚙️ Check Interval',
            value: `${config.fighter.checkIntervalSeconds}s`,
            inline: true
          },
          {
            name: '⚙️ Advance Check Days',
            value: `${config.fighter.advanceCheckDays} days`,
            inline: true
          },
          {
            name: '⚙️ Max Concurrent',
            value: `${config.fighter.maxConcurrent} bursts`,
            inline: true
          }
        ],
        footer: {
          text: 'Use !ft list to see all targets'
        },
        timestamp: new Date()
      };

      await message.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error getting fighter status', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * List all fighter targets
   */
  async list(message, args) {
    try {
      const status = reservationFighter.getStatus();
      
      if (status.targets.length === 0) {
        await message.reply('📋 No fighter targets configured.\nUse `!ft add <court> <date> <time> <duration>` to add one.');
        return;
      }

      const embed = {
        color: 0x00ff00,
        title: '⚔️ Fighter Targets',
        description: status.targets.map((target, index) => {
          return `**${index + 1}.** \`${target.id}\`\n` +
                 `   Court: **${target.court}**\n` +
                 `   Date: **${target.date}**\n` +
                 `   Time: **${target.startTime}** (${target.duration}min)`;
        }).join('\n\n'),
        footer: {
          text: `Total: ${status.targets.length} targets`
        },
        timestamp: new Date()
      };

      await message.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error listing fighter targets', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Enable fighter
   */
  async enable(message, args) {
    try {
      await reservationFighter.enable();
      await message.reply('✅ Reservation fighter enabled and jobs scheduled');
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
   * Add a new fighter target
   * Usage: !ft add <court> <date> <time> <duration>
   * Example: !ft add 52667 2025-11-15 18:00 60
   */
  async add(message, args) {
    try {
      if (args.length < 4) {
        await message.reply(
          '❌ Usage: `!ft add <court> <date> <time> <duration>`\n' +
          'Example: `!ft add 52667 2025-11-15 18:00 60`\n\n' +
          '• **court**: Court ID (e.g., 52667)\n' +
          '• **date**: Date in YYYY-MM-DD format\n' +
          '• **time**: Start time in HH:MM format\n' +
          '• **duration**: Duration in minutes'
        );
        return;
      }

      const [court, date, startTime, durationStr] = args;
      const duration = parseInt(durationStr, 10);

      // Validate date
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        await message.reply('❌ Invalid date format. Use YYYY-MM-DD');
        return;
      }

      // Validate time
      if (!/^\d{2}:\d{2}$/.test(startTime)) {
        await message.reply('❌ Invalid time format. Use HH:MM (e.g., 18:00)');
        return;
      }

      // Validate duration
      if (isNaN(duration) || duration <= 0) {
        await message.reply('❌ Duration must be a positive number');
        return;
      }

      const target = await reservationFighter.addTarget({
        court,
        date,
        startTime,
        duration
      });

      await message.reply(
        `✅ Fighter target added!\n\n` +
        `**ID:** \`${target.id}\`\n` +
        `**Court:** ${target.court}\n` +
        `**Date:** ${target.date}\n` +
        `**Time:** ${target.startTime}\n` +
        `**Duration:** ${target.duration} minutes\n\n` +
        `${reservationFighter.getStatus().enabled ? '🏃 Job scheduled and running' : '⏸️ Fighter is disabled. Use `!ft enable` to start'}`
      );
    } catch (error) {
      logger.error('Error adding fighter target', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Remove a fighter target
   * Usage: !ft remove <target_id>
   */
  async remove(message, args) {
    try {
      if (args.length < 1) {
        await message.reply('❌ Usage: `!ft remove <target_id>`\nUse `!ft list` to see target IDs');
        return;
      }

      const targetId = args[0];
      const removed = await reservationFighter.removeTarget(targetId);

      if (removed) {
        await message.reply(`✅ Fighter target \`${targetId}\` removed`);
      } else {
        await message.reply(`❌ Target \`${targetId}\` not found`);
      }
    } catch (error) {
      logger.error('Error removing fighter target', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Update strategy configuration
   * Usage: !ft strategy <duration_seconds> <interval_ms>
   * Example: !ft strategy 30 50
   */
  async updateStrategy(message, args) {
    try {
      if (args.length < 2) {
        const status = reservationFighter.getStatus();
        await message.reply(
          '❌ Usage: `!ft strategy <duration_seconds> <interval_ms>`\n' +
          'Example: `!ft strategy 30 50`\n\n' +
          `**Current Strategy:**\n` +
          `• Burst Duration: ${status.strategy.durationSeconds || 20} seconds\n` +
          `• Request Interval: ${status.strategy.requestIntervalMs || 100} ms`
        );
        return;
      }

      const durationSeconds = parseInt(args[0], 10);
      const requestIntervalMs = parseInt(args[1], 10);

      if (isNaN(durationSeconds) || durationSeconds <= 0) {
        await message.reply('❌ Duration must be a positive number');
        return;
      }

      if (isNaN(requestIntervalMs) || requestIntervalMs <= 0) {
        await message.reply('❌ Interval must be a positive number');
        return;
      }

      await reservationFighter.updateStrategy({
        durationSeconds,
        requestIntervalMs
      });

      await message.reply(
        `✅ Fighter strategy updated!\n\n` +
        `**Burst Duration:** ${durationSeconds} seconds\n` +
        `**Request Interval:** ${requestIntervalMs} ms\n\n` +
        `Each target will send ~${Math.floor(durationSeconds * 1000 / requestIntervalMs)} requests per burst`
      );
    } catch (error) {
      logger.error('Error updating fighter strategy', { error: error.message });
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

  /**
   * Clean up old targets (less than 28 days in the future)
   */
  async cleanup(message, args) {
    try {
      const removed = await reservationFighter.cleanupOldTargets();
      
      if (removed > 0) {
        await message.reply(`✅ Cleaned up **${removed}** old target${removed > 1 ? 's' : ''} (less than 28 days away)`);
      } else {
        await message.reply('ℹ️ No old targets to clean up. All targets are more than 28 days in the future.');
      }
    } catch (error) {
      logger.error('Error cleaning up old targets', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }
}

module.exports = new FighterCommands();
