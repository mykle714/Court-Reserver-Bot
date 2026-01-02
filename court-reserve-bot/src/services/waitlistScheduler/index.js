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
   * Uses getMemberExpandedScheduler to check for conflicts
   * @param {Object} target - Waitlist target
   * @returns {Promise<void>}
   */
  async checkAndReserve(target) {
    if (!this.enabled) {
      logger.debug('Scheduler disabled, skipping check');
      return;
    }

    const { id, date, startTime, duration } = target;
    const waitlistConfig = configLoader.get();
    const requestData = waitlistConfig.requestData;

    if (!requestData) {
      logger.error('Missing requestData in configuration', { targetId: id });
      return;
    }

    const successfulReservations = [];
    const failedCourts = [];

    try {
      // Get all existing reservations for the date
      const schedulerData = await apiClient.getMemberExpandedScheduler({
        requestData,
        startDate: new Date(date)
      });

      // Find which courts are available (no conflicts)
      const availableCourts = this.findAvailableCourts(
        schedulerData,
        date,
        startTime,
        duration
      );

      // Attempt reservation on each available court
      for (const courtId of availableCourts) {
        try {
          logger.info(`Attempting reservation on court ${courtId}`, { date, startTime });
          
          const result = await apiClient.makeReservation({
            court: courtId,
            date,
            startTime,
            duration
          });

          logger.info(`Reservation successful on court ${courtId}!`, {
            reservationId: result?.id,
            date,
            startTime
          });

          successfulReservations.push({ courtId, result });

          this.emit('reservationSuccess', {
            target,
            courtId,
            reservation: result
          });
          
        } catch (reservationError) {
          logger.error(`Failed to reserve court ${courtId}`, {
            error: reservationError.message,
            courtId,
            date,
            startTime
          });
          failedCourts.push({ courtId, reason: reservationError.message });
        }
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

      this.emit('reservationError', { target, error });
    }
  }

  /**
   * Find available courts by checking for time conflicts
   * @param {Object} schedulerData - Response from getMemberExpandedScheduler
   * @param {string} date - Target date (YYYY-MM-DD)
   * @param {string} startTime - Desired start time (HH:MM)
   * @param {number} duration - Duration in minutes
   * @returns {Array<string>} Array of available court IDs
   */
  findAvailableCourts(schedulerData, date, startTime, duration) {
    const config = require('../../config/envConfig');
    const courtIdStart = config.scheduler.courtIdStart;
    const courtIdEnd = config.scheduler.courtIdEnd;
    
    const availableCourts = [];
    
    // Parse our desired time window
    const desiredStart = this._parseDateTime(date, startTime);
    const desiredEnd = new Date(desiredStart.getTime() + duration * 60000);
    
    // Check each court for conflicts
    for (let courtId = courtIdStart; courtId <= courtIdEnd; courtId++) {
      const hasConflict = this._hasTimeConflict(
        schedulerData,
        courtId.toString(),
        desiredStart,
        desiredEnd
      );
      
      if (!hasConflict) {
        availableCourts.push(courtId.toString());
      }
    }
    
    return availableCourts;
  }

  /**
   * Helper: Parse date and time into Date object
   * @param {string} date - Date string (YYYY-MM-DD)
   * @param {string} time - Time string (HH:MM)
   * @returns {Date} Date object
   */
  _parseDateTime(date, time) {
    const [hours, minutes] = time.split(':');
    const dateObj = new Date(date);
    dateObj.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    return dateObj;
  }

  /**
   * Helper: Check if there's a time conflict for a specific court
   * @param {Object} schedulerData - Scheduler response data
   * @param {string} courtId - Court ID to check
   * @param {Date} desiredStart - Desired start time
   * @param {Date} desiredEnd - Desired end time
   * @returns {boolean} True if conflict exists
   */
  _hasTimeConflict(schedulerData, courtId, desiredStart, desiredEnd) {
    // Parse schedulerData to find reservations for this court
    const reservations = this._getCourtReservations(schedulerData, courtId);
    
    for (const reservation of reservations) {
      const resStart = new Date(reservation.startTime);
      const resEnd = new Date(reservation.endTime);
      
      // Check for overlap: (StartA < EndB) and (EndA > StartB)
      if (desiredStart < resEnd && desiredEnd > resStart) {
        return true; // Conflict found
      }
    }
    
    return false; // No conflicts
  }

  /**
   * Helper: Extract reservations for a specific court from scheduler data
   * @param {Object} schedulerData - Scheduler response data
   * @param {string} courtId - Court ID
   * @returns {Array} Array of reservations for the court with startTime and endTime
   */
  _getCourtReservations(schedulerData, courtId) {
    // Extract data array from API response
    if (!schedulerData || !schedulerData.Data) {
      return [];
    }
    
    // Filter for actual reservations (ReservationId > 0) on the specified court
    return schedulerData.Data
      .filter(item => 
        item.ReservationId > 0 &&  // Only actual reservations, not empty slots
        item.CourtId.toString() === courtId.toString()  // Match court ID
      )
      .map(item => ({
        startTime: item.Start,  // UTC format: "2025-11-13T14:00:00Z"
        endTime: item.End       // UTC format: "2025-11-13T15:00:00Z"
      }));
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
