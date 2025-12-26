const EventEmitter = require('events');
const logger = require('../../utils/logger').createServiceLogger('ReservationFighter');
const configLoader = require('./configLoader');
const JobGenerator = require('./jobGenerator');
const apiClient = require('../../utils/apiClient');

/**
 * Reservation Fighter Service
 * Manages jobs that repeatedly attempt to reserve specific courts
 */
class ReservationFighter extends EventEmitter {
  constructor() {
    super();
    this.jobGenerator = new JobGenerator();
    this.enabled = false;
    this.initialized = false;
    this.activeBursts = new Map(); // Track burst sessions per target
  }

  /**
   * Initialize the fighter
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      logger.info('Initializing Reservation Fighter...');
      
      // Load configuration
      const config = await configLoader.load();
      this.enabled = config.enabled;

      // Schedule jobs for all targets
      if (this.enabled) {
        await this.scheduleAllJobs();
      }

      this.initialized = true;
      logger.info(`Reservation Fighter initialized (${this.enabled ? 'ENABLED' : 'DISABLED'})`);
      
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize Reservation Fighter', { error: error.message });
      throw error;
    }
  }

  /**
   * Schedule jobs for all configured targets
   * @returns {Promise<void>}
   */
  async scheduleAllJobs() {
    const config = configLoader.get();
    if (!config || !config.fighterTargets) {
      logger.warn('No fighter targets to schedule');
      return;
    }

    logger.info(`Scheduling jobs for ${config.fighterTargets.length} targets`);
    
    for (const target of config.fighterTargets) {
      this.jobGenerator.createJob(target, (t) => this.runBurst(t));
    }

    logger.info(`Scheduled ${this.jobGenerator.getJobCount()} active jobs`);
  }

  /**
   * Run a burst attack for a specific target
   * @param {Object} target - Fighter target
   * @returns {Promise<void>}
   */
  async runBurst(target) {
    if (!this.enabled) {
      logger.debug('Fighter disabled, skipping burst');
      return;
    }

    const { id, court, date, startTime, duration } = target;
    const config = configLoader.get();
    const { durationSeconds, requestIntervalMs } = config.strategy;

    // Check if burst is already running for this target
    if (this.activeBursts.has(id)) {
      logger.debug(`Burst already running for target ${id}, skipping`);
      return;
    }

    logger.info(`Starting burst for target ${id}`, { 
      court, 
      date, 
      startTime,
      durationSeconds,
      requestIntervalMs
    });

    const burstSession = {
      targetId: id,
      startTime: new Date(),
      attempts: 0,
      success: false
    };

    this.activeBursts.set(id, burstSession);
    this.emit('burstStarted', { target });

    try {
      const endTime = Date.now() + (durationSeconds * 1000);
      let requestCount = 0;

      // Sequential request loop for the burst duration
      while (Date.now() < endTime && this.enabled) {
        requestCount++;
        burstSession.attempts++;

        try {
          logger.debug(`Burst ${id}: Request #${requestCount} for court ${court}`);
          
          const result = await apiClient.makeReservation({
            court,
            date,
            startTime,
            duration
          });

          // Success! We got a reservation
          logger.info(`SUCCESS! Burst ${id} secured reservation for court ${court}!`, {
            reservationId: result?.id,
            attempts: requestCount,
            date,
            startTime
          });

          burstSession.success = true;

          this.emit('reservationSuccess', {
            target,
            reservation: result,
            attempts: requestCount
          });

          // Remove target after successful reservation
          await configLoader.removeTarget(id);
          this.jobGenerator.removeJob(id);
          logger.info(`Target ${id} removed after successful reservation`);

          break; // Exit burst loop
        } catch (error) {
          logger.debug(`Burst ${id}: Request #${requestCount} failed: ${error.message}`);
          this.emit('requestFailed', { 
            targetId: id, 
            requestCount, 
            error: error.message 
          });
        }

        // Wait before next request (unless we're at the end)
        if (Date.now() + requestIntervalMs < endTime) {
          await new Promise(resolve => setTimeout(resolve, requestIntervalMs));
        }
      }

      // Burst complete
      const duration = Date.now() - burstSession.startTime.getTime();
      logger.info(`Burst complete for target ${id}`, {
        attempts: burstSession.attempts,
        success: burstSession.success,
        durationMs: duration
      });

      this.emit('burstComplete', {
        target,
        attempts: burstSession.attempts,
        success: burstSession.success,
        duration
      });

    } catch (error) {
      logger.error(`Burst failed for target ${id}`, { error: error.message });
      this.emit('burstError', { target, error });
    } finally {
      this.activeBursts.delete(id);
    }
  }

  /**
   * Enable the fighter
   * @returns {Promise<void>}
   */
  async enable() {
    await configLoader.setEnabled(true);
    this.enabled = true;
    
    // Schedule all jobs
    await this.scheduleAllJobs();
    
    logger.info('Reservation Fighter enabled');
    this.emit('statusChanged', { enabled: true });
  }

  /**
   * Disable the fighter
   * @returns {Promise<void>}
   */
  async disable() {
    await configLoader.setEnabled(false);
    this.enabled = false;
    
    // Don't remove jobs, just stop executing them
    logger.info('Reservation Fighter disabled (jobs remain scheduled)');
    this.emit('statusChanged', { enabled: false });
  }

  /**
   * Add a new fighter target
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
      this.jobGenerator.createJob(addedTarget, (t) => this.runBurst(t));
    }

    logger.info('Fighter target added', { id: addedTarget.id, court: addedTarget.court });
    this.emit('targetAdded', addedTarget);
    
    return addedTarget;
  }

  /**
   * Remove a fighter target
   * @param {string} targetId - Target ID to remove
   * @returns {Promise<boolean>} True if removed
   */
  async removeTarget(targetId) {
    const removed = await configLoader.removeTarget(targetId);
    
    if (removed) {
      this.jobGenerator.removeJob(targetId);
      logger.info('Fighter target removed', { id: targetId });
      this.emit('targetRemoved', { id: targetId });
    }
    
    return removed;
  }

  /**
   * Update strategy configuration
   * @param {Object} updates - Strategy updates
   * @returns {Promise<Object>} Updated strategy
   */
  async updateStrategy(updates) {
    return await configLoader.updateStrategy(updates);
  }

  /**
   * Reload configuration and reschedule jobs
   * @returns {Promise<void>}
   */
  async reload() {
    logger.info('Reloading fighter configuration...');
    
    // Remove all existing jobs
    this.jobGenerator.removeAllJobs();
    
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
    const validIds = new Set(config.fighterTargets.map(t => t.id));
    
    this.jobGenerator.getActiveJobIds().forEach(id => {
      if (!validIds.has(id)) {
        this.jobGenerator.removeJob(id);
      }
    });
    
    if (removed > 0) {
      this.emit('expiredCleaned', { count: removed });
    }
    
    return removed;
  }

  /**
   * Clean up old targets (less than 28 days in the future)
   * @returns {Promise<number>} Number of targets cleaned
   */
  async cleanupOldTargets() {
    const removed = await configLoader.cleanupOldTargets();
    
    // Remove associated jobs
    const config = configLoader.get();
    const validIds = new Set(config.fighterTargets.map(t => t.id));
    
    this.jobGenerator.getActiveJobIds().forEach(id => {
      if (!validIds.has(id)) {
        this.jobGenerator.removeJob(id);
      }
    });
    
    if (removed > 0) {
      logger.info(`Cleaned up ${removed} old fighter targets and their jobs`);
      this.emit('oldTargetsCleaned', { count: removed });
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
      targetCount: config?.fighterTargets?.length || 0,
      activeJobCount: this.jobGenerator.getJobCount(),
      activeBurstCount: this.activeBursts.size,
      targets: config?.fighterTargets || [],
      strategy: config?.strategy || {}
    };
  }

  /**
   * Shutdown the fighter
   */
  shutdown() {
    logger.info('Shutting down Reservation Fighter...');
    this.jobGenerator.removeAllJobs();
    this.activeBursts.clear();
    this.initialized = false;
    this.emit('shutdown');
  }
}

module.exports = new ReservationFighter();
