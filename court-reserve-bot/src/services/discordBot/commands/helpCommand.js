const logger = require('../../../utils/logger').createServiceLogger('DiscordBot');

/**
 * Handle help command
 */
class HelpCommand {
  /**
   * Get command handlers
   * @returns {Object} Command handler map
   */
  getHandlers() {
    return {
      'help': this.help.bind(this),
      'status': this.globalStatus.bind(this)
    };
  }

  /**
   * Show help message
   */
  async help(message, args) {
    const embed = {
      color: 0x5865F2,
      title: '🤖 useful trin - Command Help',
      description: 'I can schedule waitlist sign-ups and fight for reservations on your behalf unlike useless trin !!',
      fields: [
        {
          name: '📋 Waitlist Scheduler Commands',
          value: [
            '`!wl status` - Show scheduler status',
            '`!wl enable` - Enable scheduler',
            '`!wl disable` - Disable scheduler',
            '`!wl add YYYY-MM-DD HH:MM HH:MM <duration>` - Add target',
            '`!wl remove <target_id>` - Remove target',
            '`!wl reload` - Reload configuration',
            '`!wl cleanup` - Remove expired targets'
          ].join('\n')
        },
        {
          name: '⚔️ Reservation Fighter Commands',
          value: [
            '`!ft status` - Show fighter status',
            '`!ft list` - List all fighter targets',
            '`!ft enable` - Enable fighter and schedule jobs',
            '`!ft disable` - Disable fighter',
            '`!ft add <court> YYYY-MM-DD HH:MM <duration>` - Add target',
            '`!ft remove <target_id>` - Remove target',
            '`!ft strategy <duration_sec> <interval_ms>` - Update strategy',
            '`!ft reload` - Reload configuration'
          ].join('\n')
        },
        {
          name: '🔍 Reservation Checker Commands',
          value: [
            '`!rc status` - Show checker status',
            '`!rc enable` - Enable automatic checking',
            '`!rc disable` - Disable automatic checking',
            '`!rc interval <minutes>` - Set check interval (1-60)',
            '`!rc check` - Check for new reservations now',
            '`!rc test` - Test API connection and auth token',
            '`!rc reload` - Reload configuration'
          ].join('\n')
        },
        {
          name: '🔐 Authentication Commands',
          value: [
            '`!auth status` - Show auth status',
            '`!auth update <token>` - Update bearer token',
            '`!auth reload` - Reload token from .env'
          ].join('\n')
        },
        {
          name: '🔧 General Commands',
          value: [
            '`!status` - Show status of all services',
            '`!help` - Show this help message'
          ].join('\n')
        }
      ],
      footer: {
        text: 'Use ! as command prefix'
      },
      timestamp: new Date()
    };

    await message.reply({ embeds: [embed] });
  }

  /**
   * Show global status of all services
   */
  async globalStatus(message, args) {
    try {
      const waitlistScheduler = require('../../waitlistScheduler');
      const reservationFighter = require('../../reservationFighter');
      const reservationChecker = require('../../reservationChecker');
      const authManager = require('../../authManager');

      const waitlistStatus = waitlistScheduler.getStatus();
      const fighterStatus = reservationFighter.getStatus();
      const checkerStatus = reservationChecker.getStatus();
      const authStatus = authManager.getStatus();

      const embed = {
        color: 0x5865F2,
        title: '🤖 useful trin - Global Status',
        fields: [
          {
            name: '📋 Waitlist Scheduler',
            value: [
              `Status: ${waitlistStatus.enabled ? '✅ Enabled' : '❌ Disabled'}`,
              `Active Jobs: ${waitlistStatus.activeJobCount}`,
              `Total Targets: ${waitlistStatus.targetCount}`
            ].join('\n'),
            inline: true
          },
          {
            name: '⚔️ Reservation Fighter',
            value: [
              `Status: ${fighterStatus.enabled ? '✅ Enabled' : '❌ Disabled'}`,
              `Active Targets: ${fighterStatus.targetCount}`,
              `Active Jobs: ${fighterStatus.activeJobCount}`
            ].join('\n'),
            inline: true
          },
          {
            name: '🔍 Reservation Checker',
            value: [
              `Status: ${checkerStatus.enabled ? '✅ Enabled' : '❌ Disabled'}`,
              `Interval: ${checkerStatus.checkIntervalMinutes} min`,
              `Tracked: ${checkerStatus.trackedReservations}`
            ].join('\n'),
            inline: true
          },
          {
            name: '🔐 Authentication',
            value: [
              `Initialized: ${authStatus.initialized ? '✅ Yes' : '❌ No'}`,
              `Token: ${authStatus.hasToken ? '✅ Set' : '❌ Not set'}`,
              `Preview: ${authStatus.tokenPreview}`
            ].join('\n'),
            inline: false
          }
        ],
        timestamp: new Date()
      };

      await message.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error getting global status', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }
}

module.exports = new HelpCommand();
