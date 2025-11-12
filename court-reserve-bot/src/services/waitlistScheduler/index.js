const EventEmitter = require('events');
const logger = require('../../utils/logger').createServiceLogger('WaitlistScheduler');
const configLoader = require('./configLoader');
const CronGenerator = require('./cronGenerator');
const apiClient = require('../../utils/apiClient');

/**
 * Waitlist Scheduler Service
 * Manages cron jobs that monitor and attempt to reserve court times
 */
class WaitlistScheduler extends EventEmitter {
  constructor() {
    super();
    this.cronGenerator = new CronGenerator();
    this.enabled = false;
    this.initialized = false;
  }

  /**
   * Initialize the scheduler
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      logger.info('Initializing Waitlist Scheduler...');
      
      // Load configuration
      const config = await configLoader.load();
      this.enabled = config.enabled;

      // Schedule jobs for all targets
      if (this.enabled) {
        await this.scheduleAllJobs();
      }

      this.initialized = true;
      logger.info(`Waitlist Scheduler initialized (${this.enabled ? 'ENABLED' : 'DISABLED'})`);
      
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize Waitlist Scheduler', { error: error.message });
      throw error;
    }
  }

  /**
   * Schedule cron jobs for all configured targets
   * @returns {Promise<void>}
   */
  async scheduleAllJobs() {
    const config = configLoader.get();
    if (!config || !config.waitlistTargets) {
      logger.warn('No waitlist targets to schedule');
      return;
    }

    logger.info(`Scheduling jobs for ${config.waitlistTargets.length} targets`);
    
    for (const target of config.waitlistTargets) {
      this.cronGenerator.createJob(target, (t) => this.checkAndReserve(t));
    }

    logger.info(`Scheduled ${this.cronGenerator.getJobCount()} active cron jobs`);
  }

  /**
   * Check availability and attempt reservation for a target
   * Checks all 11 courts (52667-52677) with staggered delays
   * @param {Object} target - Waitlist target
   * @returns {Promise<void>}
   */
  async checkAndReserve(target) {
    if (!this.enabled) {
      logger.debug('Scheduler disabled, skipping check');
      return;
    }

    const { id, date, timeRange, duration } = target;
    const config = require('../../config/envConfig');
    const courtIdStart = config.scheduler.courtIdStart;
    const courtIdEnd = config.scheduler.courtIdEnd;
    const delayMs = config.scheduler.courtCheckDelayMs;

    logger.info(`Checking availability for target ${id}`, { date, timeRange, courts: `${courtIdStart}-${courtIdEnd}` });

    const successfulReservations = [];
    const failedCourts = [];

    try {
      // Check all courts from courtIdStart to courtIdEnd
      for (let courtId = courtIdStart; courtId <= courtIdEnd; courtId++) {
        try {
          // Parse time range and try the start of the time range
          const startTime = timeRange.start;
          
          logger.debug(`Checking court ${courtId} for target ${id}`, { date, startTime });
          
          const available = await this.checkSlotAvailability(courtId.toString(), date, startTime, duration);
          
          if (available) {
            logger.info(`Slot available on court ${courtId}! Attempting reservation`, { date, startTime });
            
            try {
              const result = await apiClient.makeReservation({
                court: courtId.toString(),
                date,
                startTime,
                duration
              });

              logger.info(`Reservation successful on court ${courtId}!`, { 
                reservationId: result?.id,
                date,
                startTime
              });

              successfulReservations.push({
                courtId,
                result
              });

              // Emit success event for each successful reservation
              this.emit('reservationSuccess', {
                target,
                courtId,
                reservation: result
              });
            } catch (reservationError) {
              logger.error(`Failed to reserve court ${courtId} despite availability`, {
                error: reservationError.message,
                courtId,
                date,
                startTime
              });
              failedCourts.push({ courtId, reason: reservationError.message });
            }
          } else {
            logger.debug(`Court ${courtId} not available for target ${id}`);
          }

          // Add delay between court checks (except after the last court)
          if (courtId < courtIdEnd) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        } catch (courtCheckError) {
          logger.warn(`Error checking court ${courtId}`, {
            error: courtCheckError.message,
            courtId,
            targetId: id
          });
          failedCourts.push({ courtId, reason: courtCheckError.message });
          
          // Continue to next court even if this one errored
          if (courtId < courtIdEnd) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
      }

      // Log summary
      if (successfulReservations.length > 0) {
        logger.info(`Completed check for target ${id}: ${successfulReservations.length} reservations made`, {
          courts: successfulReservations.map(r => r.courtId)
        });
      } else {
        logger.debug(`No availability found for target ${id} across all courts`);
      }

      // If we got at least one successful reservation, remove the target
      if (successfulReservations.length > 0) {
        await configLoader.removeTarget(id);
        this.cronGenerator.removeJob(id);
        logger.info(`Target ${id} removed after successful reservations`);
      }

    } catch (error) {
      logger.error(`Failed to check/reserve for target ${id}`, { 
        error: error.message,
        date
      });

      this.emit('reservationError', {
        target,
        error
      });
    }
  }

  /**
   * Check if a specific slot is available
   * @param {string} court - Court name
   * @param {string} date - Date string
   * @param {string} startTime - Start time
   * @param {number} duration - Duration in minutes
   * @returns {Promise<boolean>} True if available
   */
  async checkSlotAvailability(court, date, startTime, duration) {
    try {
      const result = await apiClient.checkAvailability({
        court,
        date,
        startTime,
        duration
      });
      return result?.available === true;
    } catch (error) {
      logger.warn('Error checking availability', { error: error.message });
      return false;
    }
  }

  /**
   * Enable the scheduler
   * @returns {Promise<void>}
   */
  async enable() {
    await configLoader.setEnabled(true);
    this.enabled = true;
    
    // Schedule all jobs
    await this.scheduleAllJobs();
    
    logger.info('Waitlist Scheduler enabled');
    this.emit('statusChanged', { enabled: true });
  }

  /**
   * Disable the scheduler
   * @returns {Promise<void>}
   */
  async disable() {
    await configLoader.setEnabled(false);
    this.enabled = false;
    
    // Don't remove jobs, just stop executing them
    logger.info('Waitlist Scheduler disabled (jobs remain scheduled)');
    this.emit('statusChanged', { enabled: false });
  }

  /**
   * Add a new waitlist target
   * @param {Object} target - Target configuration
   * @returns {Promise<Object>} Added target
   */
  async addTarget(target) {
    // Validate target
    const validation = configLoader.validateTarget(target);
    if (!validation.valid) {
      throw new Error(`Invalid target: ${validation.errors.join(', ')}`);
    }

    // Add to config
    const addedTarget = await configLoader.addTarget(target);
    
    // Schedule job if enabled
    if (this.enabled) {
      this.cronGenerator.createJob(addedTarget, (t) => this.checkAndReserve(t));
    }

    logger.info('Waitlist target added', { id: addedTarget.id });
    this.emit('targetAdded', addedTarget);
    
    return addedTarget;
  }

  /**
   * Remove a waitlist target
   * @param {string} targetId - Target ID to remove
   * @returns {Promise<boolean>} True if removed
   */
  async removeTarget(targetId) {
    const removed = await configLoader.removeTarget(targetId);
    
    if (removed) {
      this.cronGenerator.removeJob(targetId);
      logger.info('Waitlist target removed', { id: targetId });
      this.emit('targetRemoved', { id: targetId });
    }
    
    return removed;
  }

  /**
   * Reload configuration and reschedule jobs
   * @returns {Promise<void>}
   */
  async reload() {
    logger.info('Reloading waitlist configuration...');
    
    // Remove all existing jobs
    this.cronGenerator.removeAllJobs();
    
    // Reload config
    const config = await configLoader.load();
    this.enabled = config.enabled;
    
    // Reschedule if enabled
    if (this.enabled) {
      await this.scheduleAllJobs();
    }
    
    logger.info('Configuration reloaded');
    this.emit('reloaded');
  }

  /**
   * Clean up expired targets
   * @returns {Promise<number>} Number of targets cleaned
   */
  async cleanupExpired() {
    const removed = await configLoader.cleanupExpired();
    
    // Remove associated jobs
    const config = configLoader.get();
    const validIds = new Set(config.waitlistTargets.map(t => t.id));
    
    this.cronGenerator.getActiveJobIds().forEach(id => {
      if (!validIds.has(id)) {
        this.cronGenerator.removeJob(id);
      }
    });
    
    if (removed > 0) {
      this.emit('expiredCleaned', { count: removed });
    }
    
    return removed;
  }

  /**
   * Get current status
   * @returns {Object} Status information
   */
  getStatus() {
    const config = configLoader.get();
    return {
      enabled: this.enabled,
      initialized: this.initialized,
      targetCount: config?.waitlistTargets?.length || 0,
      activeJobCount: this.cronGenerator.getJobCount(),
      targets: config?.waitlistTargets || []
    };
  }

  /**
   * Shutdown the scheduler
   */
  shutdown() {
    logger.info('Shutting down Waitlist Scheduler...');
    this.cronGenerator.removeAllJobs();
    this.initialized = false;
    this.emit('shutdown');
  }
}

module.exports = new WaitlistScheduler();
