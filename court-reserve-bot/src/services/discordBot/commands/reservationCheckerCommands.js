const reservationChecker = require('../../reservationChecker');
const logger = require('../../../utils/logger').createServiceLogger('DiscordBot');

/**
 * Handle reservation checker commands
 */
class ReservationCheckerCommands {
  /**
   * Get command handlers
   * @returns {Object} Command handler map
   */
  getHandlers() {
    return {
      'rc status': this.status.bind(this),
      'rc enable': this.enable.bind(this),
      'rc disable': this.disable.bind(this),
      'rc interval': this.setInterval.bind(this),
      'rc reload': this.reload.bind(this),
      'rc check': this.checkNow.bind(this),
      'rc test': this.testNow.bind(this)
    };
  }

  /**
   * Show reservation checker status
   */
  async status(message, args) {
    try {
      const status = reservationChecker.getStatus();
      
      const lastCheck = status.lastCheckTime 
        ? new Date(status.lastCheckTime).toLocaleString('en-US', { 
            timeZone: 'America/Los_Angeles',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })
        : 'Never';
      
      const embed = {
        color: status.enabled ? 0x00ff00 : 0xff0000,
        title: '🔍 Reservation Checker Status',
        fields: [
          {
            name: 'Status',
            value: status.enabled ? '✅ Enabled' : '❌ Disabled',
            inline: true
          },
          {
            name: 'Cron Job',
            value: status.cronJobActive ? '✅ Running' : '❌ Not Running',
            inline: true
          },
          {
            name: 'Check Interval',
            value: `${status.checkIntervalMinutes} minute(s)`,
            inline: true
          },
          {
            name: 'Last Check',
            value: lastCheck,
            inline: true
          },
          {
            name: 'Tracked Reservations',
            value: `${status.trackedReservations}`,
            inline: true
          }
        ],
        footer: {
          text: 'Use !rc interval <minutes> to change check frequency'
        },
        timestamp: new Date()
      };

      await message.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error getting reservation checker status', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Enable reservation checker
   */
  async enable(message, args) {
    try {
      await reservationChecker.enable();
      await message.reply('✅ Reservation checker enabled and cron job started');
    } catch (error) {
      logger.error('Error enabling reservation checker', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Disable reservation checker
   */
  async disable(message, args) {
    try {
      await reservationChecker.disable();
      await message.reply('✅ Reservation checker disabled and cron job stopped');
    } catch (error) {
      logger.error('Error disabling reservation checker', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Set check interval
   * Usage: !rc interval <minutes>
   */
  async setInterval(message, args) {
    try {
      if (args.length < 1) {
        await message.reply('❌ Usage: `!rc interval <minutes>`\nExample: `!rc interval 5`\n\nAllowed range: 1-60 minutes');
        return;
      }

      const minutes = parseInt(args[0], 10);
      
      if (isNaN(minutes)) {
        await message.reply('❌ Invalid number. Please provide a valid number of minutes.');
        return;
      }

      await reservationChecker.setInterval(minutes);
      await message.reply(`✅ Check interval updated to ${minutes} minute(s)\nCron job restarted with new schedule`);
    } catch (error) {
      logger.error('Error setting check interval', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Reload configuration
   */
  async reload(message, args) {
    try {
      await reservationChecker.reload();
      const status = reservationChecker.getStatus();
      await message.reply(`✅ Configuration reloaded\nStatus: ${status.enabled ? 'Enabled' : 'Disabled'}\nInterval: ${status.checkIntervalMinutes} minute(s)`);
    } catch (error) {
      logger.error('Error reloading reservation checker config', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Check for new reservations now
   */
  async checkNow(message, args) {
    try {
      await message.reply('🔍 Checking for new reservations...');
      await reservationChecker.checkReservations();
      await message.reply('✅ Check completed! If any new reservations were found, you\'ll see a notification.');
    } catch (error) {
      logger.error('Error running manual check', { error: error.message });
      await message.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Test API connection and auth token validity
   */
  async testNow(message, args) {
    console.log('[DEBUG] testNow: Function called');
    const authManager = require('../../authManager');
    const apiClient = require('../../../utils/apiClient');
    console.log('[DEBUG] testNow: Modules loaded');
    
    const statusMsg = await message.reply('🧪 Testing API connection and auth token...');
    const startTime = Date.now();
    console.log('[DEBUG] testNow: Status message sent, starting API test');
    
    try {
      // Check if token exists
      const bearerToken = authManager.getToken();
      console.log('[DEBUG] testNow: Got bearer token:', bearerToken ? 'EXISTS' : 'MISSING');
      if (!bearerToken) {
        const embed = {
          color: 0xff0000,
          title: '❌ Auth Token Test Failed',
          description: 'No bearer token available',
          fields: [
            {
              name: 'Issue',
              value: 'Auth token is not set in the configuration',
              inline: false
            },
            {
              name: 'Solution',
              value: 'Use `!auth update <token>` to set a valid bearer token',
              inline: false
            }
          ],
          timestamp: new Date()
        };
        
        await statusMsg.edit({ content: '', embeds: [embed] });
        return;
      }

      // Make the actual API call using apiClient (enables logging to Discord)
      console.log('[DEBUG] testNow: About to call apiClient.customRequest');
      const responseData = await apiClient.customRequest({
        method: 'get',
        url: 'https://backend.courtreserve.com/api/scheduler/member-expanded',
        params: {
          id: '7031',
          RequestData: 'SVtXlVuPvpnXO5nnRKOxzcTcYY9TzotlauPP/CBlLvnwXLectu6zf+rYsKwBsDiqnDKlI8qAAMCVBaMyUywA0REwK+cgQWdbxmByWD7XkR9N0oOSPmpHEdu8JQXC/+V/QhUQ5cwdWP/UTuk8sP9NweZ1FyTWlWVUjE3fjfobtyPzeWLRdqXidGZy7MJnkxUdgkcC3JYw5QaJFtmR9mgeSBBVZ5LAvbk4hpamBJ0Okbw=',
          sort: '',
          group: '',
          filter: '',
          jsonData: JSON.stringify({
            startDate: new Date().toISOString(),
            orgId: "7031",
            TimeZone: "America/Los_Angeles",
            Date: new Date().toUTCString(),
            KendoDate: {
              Year: new Date().getFullYear(),
              Month: new Date().getMonth() + 1,
              Day: new Date().getDate()
            },
            UiCulture: "en-US",
            CostTypeId: "88151",
            CustomSchedulerId: "17109",
            ReservationMinInterval: "60",
            SelectedCourtIds: "52667,52668,52669,52670,52671,52672,52673,52674,52675,52676,52677",
            SelectedInstructorIds: "",
            MemberIds: "6098795",
            MemberFamilyId: "",
            EmbedCodeId: "",
            HideEmbedCodeReservationDetails: "True"
          })
        },
        headers: {
          'accept': '*/*',
          'accept-language': 'en-US,en;q=0.9',
          'authorization': `Bearer ${bearerToken}`,
          'origin': 'https://app.courtreserve.com',
          'referer': 'https://app.courtreserve.com/',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0'
        },
        timeout: 10000
      });
      console.log('[DEBUG] testNow: API call completed successfully');
      console.log('[DEBUG] testNow: Response data type:', typeof responseData);
      console.log('[DEBUG] testNow: Response data keys:', responseData ? Object.keys(responseData).slice(0, 5) : 'null');

      const duration = Date.now() - startTime;
      const reservations = responseData?.Data || [];
      console.log('[DEBUG] testNow: Found', reservations.length, 'reservations');
      
      // Success embed
      const embed = {
        color: 0x00ff00,
        title: '✅ API Test Successful',
        description: 'Auth token is valid and API is responding correctly',
        fields: [
          {
            name: '🔐 Auth Token Status',
            value: '✅ Valid and working',
            inline: true
          },
          {
            name: '📡 API Response',
            value: 'Status: 200 OK',
            inline: true
          },
          {
            name: '⏱️ Response Time',
            value: `${duration}ms`,
            inline: true
          },
          {
            name: '📊 Reservations Found',
            value: `${reservations.length} reservation(s)`,
            inline: true
          },
          {
            name: '🔗 Endpoint',
            value: 'backend.courtreserve.com/api/scheduler/member-expanded',
            inline: false
          },
          {
            name: '🔑 Token Preview',
            value: `${bearerToken.substring(0, 30)}...`,
            inline: false
          }
        ],
        timestamp: new Date()
      };

      await statusMsg.edit({ content: '', embeds: [embed] });
      console.log('[DEBUG] testNow: Success embed sent to Discord');
      
    } catch (error) {
      console.log('[DEBUG] testNow: ERROR CAUGHT:', error.message);
      console.log('[DEBUG] testNow: Error stack:', error.stack);
      const duration = Date.now() - startTime;
      
      // Determine error type
      let errorTitle = '❌ API Test Failed';
      let errorColor = 0xff0000;
      let errorDescription = '';
      let solution = '';
      
      if (error.response) {
        // Server responded with error
        const status = error.response.status;
        
        if (status === 401 || status === 403) {
          errorTitle = '🔒 Authentication Failed';
          errorDescription = 'The bearer token is invalid or expired';
          solution = 'Use `!auth update <token>` to set a new valid bearer token';
        } else {
          errorDescription = `API returned error: ${status} ${error.response.statusText}`;
          solution = 'Check the API endpoint and request parameters';
        }
      } else if (error.request) {
        // Request made but no response
        errorTitle = '🌐 Network Error';
        errorDescription = 'Unable to reach the API server';
        solution = 'Check your internet connection and firewall settings';
      } else {
        // Error in request setup
        errorDescription = error.message;
        solution = 'Check the request configuration';
      }
      
      const embed = {
        color: errorColor,
        title: errorTitle,
        description: errorDescription,
        fields: [
          {
            name: '❌ Error Details',
            value: error.message,
            inline: false
          },
          {
            name: '⏱️ Time Before Failure',
            value: `${duration}ms`,
            inline: true
          }
        ],
        timestamp: new Date()
      };
      
      if (solution) {
        embed.fields.push({
          name: '💡 Solution',
          value: solution,
          inline: false
        });
      }
      
      if (error.response?.status) {
        embed.fields.push({
          name: '📡 HTTP Status',
          value: `${error.response.status} ${error.response.statusText}`,
          inline: true
        });
      }
      
      await statusMsg.edit({ content: '', embeds: [embed] });
      logger.error('API test failed', { 
        error: error.message, 
        status: error.response?.status 
      });
    }
  }
}

module.exports = new ReservationCheckerCommands();
