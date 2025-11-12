const authManager = require('../../authManager');
const logger = require('../../../utils/logger').createServiceLogger('DiscordBot');

/**
 * Handle auth-related commands
 */
class AuthCommands {
  /**
   * Get command handlers
   * @returns {Object} Command handler map
   */
  getHandlers() {
    return {
      'auth status': this.status.bind(this),
      'auth token': this.updateToken.bind(this),
      'auth reload': this.reload.bind(this)
    };
  }

  /**
   * Show auth status
   */
  async status(message, args) {
    try {
      const status = authManager.getStatus();
      
      const embed = {
        color: status.hasToken ? 0x00ff00 : 0xff0000,
        title: '🔐 Auth Manager Status',
        fields: [
          {
            name: 'Status',
            value: status.initialized ? '✅ Initialized' : '❌ Not Initialized',
            inline: true
          },
          {
            name: 'Token',
            value: status.hasToken ? '✅ Set' : '❌ Not Set',
            inline: true
          },
          {
            name: 'Token Preview',
            value: `\`${status.tokenPreview}\``,
            inline: false
          }
        ],
        footer: {
          text: 'Token is masked for security'
        },
        timestamp: new Date()
      };

      await message.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error getting auth status', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Update bearer token
   * Usage: !auth token <new_token>
   */
  async updateToken(message, args) {
    try {
      if (args.length < 1) {
        await message.reply('❌ Usage: `!auth token <bearer_token>`');
        return;
      }

      const newToken = args.join(' ');
      
      await authManager.updateToken(newToken);
      
      const preview = newToken.substring(0, 20);
      await message.reply(`✅ Bearer token updated successfully\nPreview: \`${preview}...\``);
      
      // Delete the command message for security (contains the full token)
      try {
        await message.delete();
        logger.info('Deleted message containing bearer token for security');
      } catch (deleteError) {
        logger.warn('Could not delete message with token', { error: deleteError.message });
      }
    } catch (error) {
      logger.error('Error updating bearer token', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Reload token from .env
   */
  async reload(message, args) {
    try {
      await authManager.reload();
      
      const status = authManager.getStatus();
      await message.reply(`✅ Auth configuration reloaded\nToken: ${status.hasToken ? '✅ Set' : '❌ Not Set'}`);
    } catch (error) {
      logger.error('Error reloading auth config', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }
}

module.exports = new AuthCommands();
