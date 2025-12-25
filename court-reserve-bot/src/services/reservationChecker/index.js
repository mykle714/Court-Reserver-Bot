const EventEmitter = require('events');
const cron = require('node-cron');
const logger = require('../../utils/logger').createServiceLogger('ReservationChecker');
const stateManager = require('./stateManager');
const authManager = require('../authManager');
const waitlistConfigLoader = require('../waitlistScheduler/configLoader');
const apiClient = require('../../utils/apiClient');

/**
 * Reservation Checker Service
 * Monitors for new court reservations every N minutes
 */
class ReservationChecker extends EventEmitter {
  constructor() {
    super();
    this.enabled = false;
    this.initialized = false;
    this.cronJob = null;
    this.checkIntervalMinutes = 5;
    this.lastCheckTime = null;
    this.stateFilePath = './config/reservationCheckerState.json';
  }

  /**
   * Initialize the reservation checker
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      logger.info('Initializing Reservation Checker...');
      
      // Load configuration from environment
      this.enabled = process.env.RESERVATION_CHECKER_ENABLED === 'true';
      this.checkIntervalMinutes = parseInt(process.env.RESERVATION_CHECKER_INTERVAL || '5', 10);
      this.stateFilePath = process.env.RESERVATION_CHECKER_STATE_PATH || this.stateFilePath;

      // Initialize state manager
      await stateManager.initialize(this.stateFilePath);

      // Start cron job if enabled
      if (this.enabled) {
        this.startCronJob();
      }

      this.initialized = true;
      logger.info(`Reservation Checker initialized (${this.enabled ? 'ENABLED' : 'DISABLED'}, interval: ${this.checkIntervalMinutes}min)`);
      
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize Reservation Checker', { error: error.message });
      throw error;
    }
  }

  /**
   * Start the cron job
   */
  startCronJob() {
    // Stop existing job if any
    this.stopCronJob();

    // Create cron expression for every N minutes
    const cronExpression = `*/${this.checkIntervalMinutes} * * * *`;
    
    this.cronJob = cron.schedule(cronExpression, async () => {
      await this.checkReservations();
    });

    logger.info(`Cron job started: checking every ${this.checkIntervalMinutes} minutes`);
  }

  /**
   * Stop the cron job
   */
  stopCronJob() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('Cron job stopped');
    }
  }

  /**
   * Check for new reservations
   * @returns {Promise<void>}
   */
  async checkReservations() {
    if (!this.enabled) {
      logger.debug('Checker disabled, skipping check');
      return;
    }

    try {
      logger.info('Checking for new reservations...');
      this.lastCheckTime = new Date();

      // Clean up past dates from state
      await stateManager.cleanupPastDates();

      // Get bearer token from auth manager
      const bearerToken = authManager.getToken();
      if (!bearerToken) {
        logger.error('No bearer token available, cannot check reservations');
        this.emit('checkError', { error: 'No bearer token' });
        return;
      }

      // Get dates to check from waitlist configuration
      const datesToCheck = await this.getDatesToCheck();
      
      // If no dates to check, skip the check
      if (datesToCheck.length === 0) {
        logger.debug('No dates to check, skipping reservation check');
        return;
      }
      
      logger.info(`Checking reservations for ${datesToCheck.length} date(s)`, { 
        dates: datesToCheck.map(d => d.toISOString().split('T')[0])
      });

      let totalReservations = 0;
      let totalNewReservations = 0;

      // Check each date
      for (let i = 0; i < datesToCheck.length; i++) {
        const checkDate = datesToCheck[i];
        const dateStr = checkDate.toISOString().split('T')[0];

        try {
          logger.debug(`Checking date ${dateStr} (${i + 1}/${datesToCheck.length})`);

          // Make API request for this specific date using apiClient (enables logging)
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
                startDate: checkDate.toISOString(),
                orgId: "7031",
                TimeZone: "America/Los_Angeles",
                Date: checkDate.toUTCString(),
                KendoDate: {
                  Year: checkDate.getFullYear(),
                  Month: checkDate.getMonth() + 1,
                  Day: checkDate.getDate()
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

          // Extract reservation data
          const reservations = responseData?.Data || [];
          totalReservations += reservations.length;
          
          // Detect new reservations for this date
          const newReservations = await stateManager.detectNewReservations(reservations, dateStr);

          // Emit events for new reservations
          if (newReservations.length > 0) {
            logger.info(`Found ${newReservations.length} new reservation(s) for ${dateStr}!`);
            totalNewReservations += newReservations.length;
            
            this.emit('newReservations', { 
              date: dateStr,
              reservations: newReservations 
            });
            
            // Emit individual events for each reservation
            newReservations.forEach(reservation => {
              this.emit('newReservation', { 
                date: dateStr,
                reservation 
              });
            });
          } else {
            logger.debug(`No new reservations found for ${dateStr}`);
          }

          // Add delay between API calls (except after the last one)
          if (i < datesToCheck.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

        } catch (dateError) {
          logger.error(`Failed to check reservations for ${dateStr}`, { 
            error: dateError.message 
          });
          // Continue checking other dates even if one fails
        }
      }

      this.emit('checkCompleted', { 
        total: totalReservations,
        new: totalNewReservations,
        datesChecked: datesToCheck.length
      });

    } catch (error) {
      logger.error('Failed to check reservations', { error: error.message });
      this.emit('checkError', { error: error.message });
    }
  }

  /**
   * Get list of dates to check based on waitlist configuration
   * @returns {Promise<Date[]>} Array of dates to check
   */
  async getDatesToCheck() {
    try {
      // Load waitlist configuration
      const config = waitlistConfigLoader.get();
      
      if (!config || !config.waitlistTargets || config.waitlistTargets.length === 0) {
        // No waitlist targets, don't check any dates
        logger.debug('No waitlist targets configured, skipping reservation check');
        return [];
      }

      // Extract unique dates from waitlist targets
      const dateSet = new Set();
      config.waitlistTargets.forEach(target => {
        if (target.date) {
          // Normalize to start of day in local timezone
          const targetDate = new Date(target.date);
          targetDate.setHours(0, 0, 0, 0);
          dateSet.add(targetDate.toISOString().split('T')[0]);
        }
      });

      // Convert back to Date objects
      const dates = Array.from(dateSet).map(dateStr => new Date(dateStr + 'T00:00:00'));

      // Sort dates chronologically
      dates.sort((a, b) => a - b);

      logger.debug(`Found ${dates.length} unique date(s) to check`, {
        dates: dates.map(d => d.toISOString().split('T')[0])
      });

      return dates;

    } catch (error) {
      logger.error('Error getting dates to check', { 
        error: error.message 
      });
      return [];
    }
  }

  /**
   * Enable the checker
   * @returns {Promise<void>}
   */
  async enable() {
    this.enabled = true;
    await this.updateEnvFile('RESERVATION_CHECKER_ENABLED', 'true');
    this.startCronJob();
    
    logger.info('Reservation Checker enabled');
    this.emit('statusChanged', { enabled: true });
  }

  /**
   * Disable the checker
   * @returns {Promise<void>}
   */
  async disable() {
    this.enabled = false;
    await this.updateEnvFile('RESERVATION_CHECKER_ENABLED', 'false');
    this.stopCronJob();
    
    logger.info('Reservation Checker disabled');
    this.emit('statusChanged', { enabled: false });
  }

  /**
   * Update check interval
   * @param {number} minutes - New interval in minutes
   * @returns {Promise<void>}
   */
  async setInterval(minutes) {
    if (minutes < 1 || minutes > 60) {
      throw new Error('Interval must be between 1 and 60 minutes');
    }

    this.checkIntervalMinutes = minutes;
    await this.updateEnvFile('RESERVATION_CHECKER_INTERVAL', minutes.toString());
    
    // Restart cron job with new interval
    if (this.enabled) {
      this.startCronJob();
    }
    
    logger.info(`Check interval updated to ${minutes} minutes`);
    this.emit('intervalChanged', { minutes });
  }

  /**
   * Reload configuration from environment
   * @returns {Promise<void>}
   */
  async reload() {
    logger.info('Reloading configuration...');
    
    // Re-read environment variables
    const fs = require('fs').promises;
    const path = require('path');
    const envPath = path.join(process.cwd(), '.env');
    
    try {
      const envContent = await fs.readFile(envPath, 'utf-8');
      
      // Extract values
      const enabledMatch = envContent.match(/RESERVATION_CHECKER_ENABLED=(.+)/);
      const intervalMatch = envContent.match(/RESERVATION_CHECKER_INTERVAL=(.+)/);
      
      if (enabledMatch) {
        const wasEnabled = this.enabled;
        this.enabled = enabledMatch[1].trim() === 'true';
        
        if (this.enabled && !wasEnabled) {
          this.startCronJob();
        } else if (!this.enabled && wasEnabled) {
          this.stopCronJob();
        }
      }
      
      if (intervalMatch) {
        this.checkIntervalMinutes = parseInt(intervalMatch[1].trim(), 10);
        if (this.enabled) {
          this.startCronJob();
        }
      }
      
      logger.info('Configuration reloaded');
      this.emit('reloaded');
    } catch (error) {
      logger.error('Failed to reload configuration', { error: error.message });
      throw error;
    }
  }

  /**
   * Update environment file
   * @param {string} key - Environment variable key
   * @param {string} value - New value
   * @returns {Promise<void>}
   */
  async updateEnvFile(key, value) {
    const fs = require('fs').promises;
    const path = require('path');
    const envPath = path.join(process.cwd(), '.env');
    
    try {
      let envContent = await fs.readFile(envPath, 'utf-8');
      
      const regex = new RegExp(`^${key}=.*$`, 'm');
      
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}\n`;
      }
      
      await fs.writeFile(envPath, envContent, 'utf-8');
      logger.info(`Updated ${key} in .env file`);
    } catch (error) {
      logger.error('Failed to update .env file', { error: error.message });
      throw error;
    }
  }

  /**
   * Get current status
   * @returns {Object}
   */
  getStatus() {
    const stateStats = stateManager.getStats();
    
    return {
      enabled: this.enabled,
      initialized: this.initialized,
      checkIntervalMinutes: this.checkIntervalMinutes,
      lastCheckTime: this.lastCheckTime,
      cronJobActive: !!this.cronJob,
      trackedReservations: stateStats.trackedReservations
    };
  }

  /**
   * Shutdown the checker
   */
  shutdown() {
    logger.info('Shutting down Reservation Checker...');
    this.stopCronJob();
    this.initialized = false;
    this.emit('shutdown');
  }
}

module.exports = new ReservationChecker();
