const logger = require('../../utils/logger').createServiceLogger('ReservationFighter');
const config = require('../../config/envConfig');

/**
 * Generates and manages interval jobs for fighter targets
 */
class JobGenerator {
  constructor() {
    this.jobs = new Map(); // Map of targetId -> interval reference
    this.checkIntervalSeconds = config.fighter.checkIntervalSeconds || 60;
    this.advanceCheckDays = config.fighter.advanceCheckDays || 7;
  }

  /**
   * Get check interval in milliseconds
   * @returns {number} Interval in milliseconds
   */
  getCheckIntervalMs() {
    return this.checkIntervalSeconds * 1000;
  }

  /**
   * Check if we should start monitoring a target yet
   * @param {string} targetDate - ISO date string
   * @returns {boolean} True if we should be checking
   */
  shouldStartChecking(targetDate) {
    const target = new Date(targetDate);
    const now = new Date();
    const daysUntilTarget = (target - now) / (1000 * 60 * 60 * 24);
    
    // Start checking if we're within the advance window
    return daysUntilTarget <= this.advanceCheckDays;
  }

  /**
   * Check if target date has passed
   * @param {string} targetDate - ISO date string
   * @returns {boolean} True if date has passed
   */
  isExpired(targetDate) {
    const target = new Date(targetDate);
    const now = new Date();
    return target < now;
  }

  /**
   * Create and schedule an interval job for a target
   * @param {Object} target - Fighter target configuration
   * @param {Function} fightCallback - Function to call when fighting
   * @returns {Object|null} Created job or null if not scheduled
   */
  createJob(target, fightCallback) {
    const { id, date } = target;

    // Don't schedule if expired
    if (this.isExpired(date)) {
      logger.debug(`Target ${id} is expired, not scheduling`, { date });
      return null;
    }

    // Check if we should start checking yet
    if (!this.shouldStartChecking(date)) {
      logger.debug(`Target ${id} is too far in future, not scheduling yet`, { date });
      return null;
    }

    // Remove existing job if any
    this.removeJob(id);

    // Create interval-based job
    const intervalMs = this.getCheckIntervalMs();
    const intervalId = setInterval(async () => {
      try {
        logger.debug(`Running burst for target ${id}`);
        await fightCallback(target);
      } catch (error) {
        logger.error(`Error in interval job for target ${id}`, { error: error.message });
      }
    }, intervalMs);

    this.jobs.set(id, intervalId);
    logger.info(`Scheduled interval job for target ${id}`, { 
      date, 
      court: target.court,
      checkIntervalSeconds: this.checkIntervalSeconds,
      intervalMs
    });

    return intervalId;
  }

  /**
   * Remove an interval job
   * @param {string} targetId - Target ID
   * @returns {boolean} True if job was removed
   */
  removeJob(targetId) {
    const intervalId = this.jobs.get(targetId);
    if (intervalId) {
      clearInterval(intervalId);
      this.jobs.delete(targetId);
      logger.info(`Removed interval job for target ${targetId}`);
      return true;
    }
    return false;
  }

  /**
   * Remove all interval jobs
   */
  removeAllJobs() {
    logger.info(`Removing all ${this.jobs.size} interval jobs`);
    this.jobs.forEach((intervalId, id) => {
      clearInterval(intervalId);
      logger.debug(`Stopped job ${id}`);
    });
    this.jobs.clear();
  }

  /**
   * Get active job count
   * @returns {number} Number of active jobs
   */
  getJobCount() {
    return this.jobs.size;
  }

  /**
   * Get list of active job IDs
   * @returns {Array<string>} Array of target IDs with active jobs
   */
  getActiveJobIds() {
    return Array.from(this.jobs.keys());
  }

  /**
   * Check if a job exists for a target
   * @param {string} targetId - Target ID
   * @returns {boolean} True if job exists
   */
  hasJob(targetId) {
    return this.jobs.has(targetId);
  }
}

module.exports = JobGenerator;
