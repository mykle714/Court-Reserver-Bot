const authManager = require('../../authManager');
const waitlistScheduler = require('../../waitlistScheduler');
const reservationFighter = require('../../reservationFighter');
const reservationChecker = require('../../reservationChecker');
const apiClient = require('../../../utils/apiClient');
const logger = require('../../../utils/logger').createServiceLogger('DiscordBot');

/**
 * Handle dashboard commands
 */
class DashboardCommands {
  /**
   * Get command handlers
   * @returns {Object} Command handler map
   */
  getHandlers() {
    return {
      'db': this.dashboard.bind(this)
    };
  }

  /**
   * Display comprehensive dashboard
   */
  async dashboard(message, args) {
    const statusMsg = await message.reply('📊 Loading dashboard...');
    
    try {
      // Test auth token validity
      const authStatus = await this.testAuthToken();
      
      // Get module statuses
      const waitlistStatus = waitlistScheduler.getStatus();
      const fighterStatus = reservationFighter.getStatus();
      const checkerStatus = reservationChecker.getStatus();
      
      // Build dashboard text
      const dashboardText = this.buildDashboard(
        authStatus,
        waitlistStatus,
        fighterStatus,
        checkerStatus
      );
      
      // Send as code block for better formatting
      await statusMsg.edit(`\`\`\`\n${dashboardText}\n\`\`\``);
      
    } catch (error) {
      logger.error('Error generating dashboard', { error: error.message });
      await statusMsg.edit(`❌ Error generating dashboard: ${error.message}`);
    }
  }

  /**
   * Test auth token validity
   * @returns {Promise<Object>} Auth status
   */
  async testAuthToken() {
    try {
      const bearerToken = authManager.getToken();
      
      if (!bearerToken) {
        return { valid: false, error: 'No token set' };
      }

      // Make test API call
      await apiClient.customRequest({
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

      return { valid: true };
      
    } catch (error) {
      // Check if it's an auth error
      if (error.response?.status === 401 || error.response?.status === 403) {
        return { valid: false, error: 'Invalid/Expired' };
      }
      return { valid: false, error: 'API Error' };
    }
  }

  /**
   * Build dashboard text
   * @returns {string} Formatted dashboard
   */
  buildDashboard(authStatus, waitlistStatus, fighterStatus, checkerStatus) {
    const lines = [];
    
    // Header
    lines.push('═══════════════════════════════════════');
    lines.push('    COURT RESERVE BOT DASHBOARD');
    lines.push('═══════════════════════════════════════');
    lines.push('');
    
    // Auth Token Section
    lines.push('🔐 AUTH TOKEN');
    if (authStatus.valid) {
      lines.push('   Status: ✅ Valid');
    } else {
      lines.push('   Status: ❌ Invalid');
      if (authStatus.error) {
        lines.push(`   Error: ${authStatus.error}`);
      }
    }
    lines.push('');
    
    // Waitlist Section
    lines.push('📋 WAITLIST');
    lines.push(`   Status: ${waitlistStatus.enabled ? '✅ Enabled' : '❌ Disabled'}`);
    lines.push(`   Targets: ${waitlistStatus.targetCount}`);
    
    if (waitlistStatus.targets && waitlistStatus.targets.length > 0) {
      waitlistStatus.targets.forEach(target => {
        lines.push(`   • ${target.id}`);
        lines.push(`     ${target.date} | ${target.timeRange.start}-${target.timeRange.end}`);
      });
    }
    lines.push('');
    
    // Fighter Section
    lines.push('⚔️  FIGHTER');
    lines.push(`   Status: ${fighterStatus.enabled ? '✅ Enabled' : '❌ Disabled'}`);
    lines.push(`   Targets: ${fighterStatus.targetCount}`);
    
    if (fighterStatus.targets && fighterStatus.targets.length > 0) {
      fighterStatus.targets.forEach(target => {
        lines.push(`   • ${target.id}`);
        lines.push(`     Ct:${target.court} | ${target.date}`);
        lines.push(`     ${target.startTime} (${target.duration}min)`);
      });
    }
    lines.push('');
    
    // Reservation Checker Section
    lines.push('🔍 CHECKER');
    lines.push(`   Status: ${checkerStatus.enabled ? '✅ Enabled' : '❌ Disabled'}`);
    lines.push(`   Interval: ${checkerStatus.checkIntervalMinutes} min`);
    lines.push(`   Tracked: ${checkerStatus.trackedReservations} res.`);
    
    if (checkerStatus.lastCheckTime) {
      const lastCheck = new Date(checkerStatus.lastCheckTime);
      const timeStr = lastCheck.toLocaleTimeString('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: '2-digit',
        minute: '2-digit'
      });
      lines.push(`   Last: ${timeStr}`);
    }
    
    lines.push('');
    lines.push('═══════════════════════════════════════');
    
    return lines.join('\n');
  }
}

module.exports = new DashboardCommands();
