const waitlistScheduler = require('../../waitlistScheduler');
const logger = require('../../../utils/logger').createServiceLogger('DiscordBot');

/**
 * Handle waitlist-related commands
 */
class WaitlistCommands {
  /**
   * Get command handlers
   * @returns {Object} Command handler map
   */
  getHandlers() {
    return {
      'wl status': this.status.bind(this),
      'wl enable': this.enable.bind(this),
      'wl disable': this.disable.bind(this),
      'wl add': this.add.bind(this),
      'wl remove': this.remove.bind(this),
      'wl reload': this.reload.bind(this),
      'wl cleanup': this.cleanup.bind(this)
    };
  }

  /**
   * Show waitlist status
   */
  async status(message, args) {
    try {
      const status = waitlistScheduler.getStatus();
      const config = require('../../../config/envConfig');
      
      const embed = {
        color: status.enabled ? 0x00ff00 : 0xff0000,
        title: '📋 Waitlist Scheduler Status',
        fields: [
          {
            name: 'Status',
            value: status.enabled ? '✅ Enabled' : '❌ Disabled',
            inline: true
          },
          {
            name: 'Active Jobs',
            value: `${status.activeJobCount}`,
            inline: true
          },
          {
            name: 'Total Targets',
            value: `${status.targetCount}`,
            inline: true
          },
          {
            name: '⚙️ Check Interval',
            value: `${config.scheduler.checkIntervalSeconds}s`,
            inline: true
          },
          {
            name: '⚙️ Advance Check Days',
            value: `${config.scheduler.advanceCheckDays} days`,
            inline: true
          },
          {
            name: '⚙️ Court Range',
            value: `${config.scheduler.courtIdStart}-${config.scheduler.courtIdEnd}`,
            inline: true
          }
        ],
        timestamp: new Date()
      };

      // Add target list if any
      if (status.targets && status.targets.length > 0) {
        const targetList = status.targets.map(t => {
          // Handle both old format (timeRange) and new format (startTime)
          const timeInfo = t.startTime 
            ? `at ${t.startTime} for ${t.duration}min`
            : `(${t.timeRange?.start}-${t.timeRange?.end})`;
          return `**${t.id}**: ${t.date} ${timeInfo} - Courts ${config.scheduler.courtIdStart}-${config.scheduler.courtIdEnd}`;
        }).join('\n');
        
        embed.fields.push({
          name: 'Targets',
          value: targetList.length > 1024 ? targetList.substring(0, 1021) + '...' : targetList
        });
      }

      await message.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error getting waitlist status', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Enable waitlist scheduler
   */
  async enable(message, args) {
    try {
      await waitlistScheduler.enable();
      await message.reply('✅ Waitlist scheduler enabled');
    } catch (error) {
      logger.error('Error enabling waitlist', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Disable waitlist scheduler
   */
  async disable(message, args) {
    try {
      await waitlistScheduler.disable();
      await message.reply('✅ Waitlist scheduler disabled');
    } catch (error) {
      logger.error('Error disabling waitlist', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Add waitlist target
   * Usage: !wl add <date> <start> <duration>
   * Example: !wl add 2025-11-15 18:00 60
   * Note: Will check all courts (52667-52677) automatically
   */
  async add(message, args) {
    try {
      if (args.length < 3) {
        await message.reply('❌ Usage: `!wl add <date> <start> <duration>`\nExample: `!wl add 2025-11-15 18:00 60`\n\nNote: Will automatically check all courts (52667-52677)');
        return;
      }

      const [date, startTime, duration] = args;
      
      const target = {
        date,
        startTime,
        duration: parseInt(duration, 10)
      };

      const added = await waitlistScheduler.addTarget(target);
      await message.reply(`✅ Waitlist target added: **${added.id}**\nDate: ${date} at ${startTime} for ${duration} minutes\nWill check all courts: 52667-52677`);
    } catch (error) {
      logger.error('Error adding waitlist target', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Remove waitlist target
   * Usage: !wl remove <id>
   */
  async remove(message, args) {
    try {
      if (args.length < 1) {
        await message.reply('❌ Usage: `!wl remove <id>`');
        return;
      }

      const targetId = args[0];
      const removed = await waitlistScheduler.removeTarget(targetId);
      
      if (removed) {
        await message.reply(`✅ Waitlist target removed: **${targetId}**`);
      } else {
        await message.reply(`❌ Target not found: **${targetId}**`);
      }
    } catch (error) {
      logger.error('Error removing waitlist target', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Reload waitlist configuration
   */
  async reload(message, args) {
    try {
      await waitlistScheduler.reload();
      await message.reply('✅ Waitlist configuration reloaded');
    } catch (error) {
      logger.error('Error reloading waitlist config', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Cleanup expired targets
   */
  async cleanup(message, args) {
    try {
      const removed = await waitlistScheduler.cleanupExpired();
      await message.reply(`✅ Cleaned up ${removed} expired targets`);
    } catch (error) {
      logger.error('Error cleaning up targets', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }
}

module.exports = new WaitlistCommands();
