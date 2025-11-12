const EventEmitter = require('events');
const pLimit = require('p-limit');
const logger = require('../../utils/logger').createServiceLogger('ReservationFighter');
const configLoader = require('./configLoader');
const apiClient = require('../../utils/apiClient');

/**
 * Reservation Fighter Service
 * Makes many parallel API requests over a configured duration
 */
class ReservationFighter extends EventEmitter {
  constructor() {
    super();
    this.enabled = false;
    this.running = false;
    this.currentSession = null;
    this.initialized = false;
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

      this.initialized = true;
      logger.info(`Reservation Fighter initialized (${this.enabled ? 'ENABLED' : 'DISABLED'})`);
      
      this.emit('initialized');

      // Auto-start if enabled
      if (this.enabled) {
        await this.start();
      }
    } catch (error) {
      logger.error('Failed to initialize Reservation Fighter', { error: error.message });
      throw error;
    }
  }

  /**
   * Start the fighter (begins making requests)
   * @returns {Promise<void>}
   */
  async start() {
    if (this.running) {
      logger.warn('Fighter is already running');
      return;
    }

    if (!this.enabled) {
      logger.warn('Fighter is disabled, cannot start');
      throw new Error('Fighter is disabled');
    }

    const config = configLoader.get();
    const { target, strategy } = config;

    // Validate target
    const validation = configLoader.validateTarget(target);
    if (!validation.valid) {
      const error = `Invalid target configuration: ${validation.errors.join(', ')}`;
      logger.error(error);
      throw new Error(error);
    }

    this.running = true;
    this.currentSession = {
      startTime: new Date(),
      target: { ...target },
      strategy: { ...strategy },
      results: {
        total: 0,
        success: 0,
        failed: 0,
        responses: []
      }
    };

    logger.info('Starting reservation fighter', {
      target,
      strategy
    });

    this.emit('started', { target, strategy });

    // Run the burst
    try {
      await this.runBurst();
    } catch (error) {
      logger.error('Fighter burst failed', { error: error.message });
      this.emit('error', { error });
    } finally {
      this.running = false;
      this.emitResults();
    }
  }

  /**
   * Run the request burst
   * @returns {Promise<void>}
   */
  async runBurst() {
    const { target, strategy } = this.currentSession;
    const { parallelRequests, durationSeconds, requestIntervalMs } = strategy;

    const limit = pLimit(parallelRequests);
    const endTime = Date.now() + (durationSeconds * 1000);
    const requests = [];

    logger.info(`Starting ${durationSeconds}s burst with ${parallelRequests} parallel requests`);

    let requestCount = 0;

    // Create request loop
    const makeRequest = async () => {
      const reqId = ++requestCount;
      
      try {
        const startTime = Date.now();
        const result = await apiClient.makeReservation(target);
        const endTime = Date.now();
        
        logger.info(`Request ${reqId} succeeded!`, {
          reservationId: result?.id,
          duration: endTime - startTime
        });

        this.currentSession.results.success++;
        this.currentSession.results.responses.push({
          id: reqId,
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });

        this.emit('requestSuccess', { requestId: reqId, result });
        
        return { success: true, result };
      } catch (error) {
        logger.debug(`Request ${reqId} failed: ${error.message}`);
        
        this.currentSession.results.failed++;
        this.currentSession.results.responses.push({
          id: reqId,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });

        this.emit('requestFailed', { requestId: reqId, error });
        
        return { success: false, error };
      } finally {
        this.currentSession.results.total++;
      }
    };

    // Schedule requests continuously until duration expires
    while (Date.now() < endTime && this.running) {
      requests.push(limit(() => makeRequest()));
      
      // Wait for interval if we haven't reached end time
      if (Date.now() + requestIntervalMs < endTime) {
        await new Promise(resolve => setTimeout(resolve, requestIntervalMs));
      }
    }

    // Wait for all pending requests to complete
    logger.info('Waiting for all requests to complete...');
    await Promise.all(requests);
    
    logger.info('Burst complete', {
      total: this.currentSession.results.total,
      success: this.currentSession.results.success,
      failed: this.currentSession.results.failed
    });
  }

  /**
   * Stop the fighter
   */
  stop() {
    if (!this.running) {
      logger.warn('Fighter is not running');
      return;
    }

    logger.info('Stopping reservation fighter...');
    this.running = false;
    this.emit('stopped');
  }

  /**
   * Emit final results
   */
  emitResults() {
    if (!this.currentSession) {
      return;
    }

    const session = this.currentSession;
    const duration = Date.now() - session.startTime.getTime();

    const summary = {
      target: session.target,
      strategy: session.strategy,
      duration: duration,
      results: {
        total: session.results.total,
        success: session.results.success,
        failed: session.results.failed,
        successRate: session.results.total > 0 
          ? (session.results.success / session.results.total * 100).toFixed(2) + '%'
          : '0%'
      }
    };

    logger.info('Fighter session complete', summary);
    this.emit('complete', summary);

    this.currentSession = null;
  }

  /**
   * Enable the fighter (and start it)
   * @returns {Promise<void>}
   */
  async enable() {
    await configLoader.setEnabled(true);
    this.enabled = true;
    
    logger.info('Reservation Fighter enabled');
    this.emit('statusChanged', { enabled: true });

    // Auto-start
    await this.start();
  }

  /**
   * Disable the fighter (and stop it)
   * @returns {Promise<void>}
   */
  async disable() {
    await configLoader.setEnabled(false);
    this.enabled = false;
    
    // Stop if running
    if (this.running) {
      this.stop();
    }
    
    logger.info('Reservation Fighter disabled');
    this.emit('statusChanged', { enabled: false });
  }

  /**
   * Update target configuration
   * @param {Object} updates - Target updates
   * @returns {Promise<Object>} Updated target
   */
  async updateTarget(updates) {
    if (this.running) {
      throw new Error('Cannot update target while fighter is running');
    }

    return await configLoader.updateTarget(updates);
  }

  /**
   * Update strategy configuration
   * @param {Object} updates - Strategy updates
   * @returns {Promise<Object>} Updated strategy
   */
  async updateStrategy(updates) {
    if (this.running) {
      throw new Error('Cannot update strategy while fighter is running');
    }

    return await configLoader.updateStrategy(updates);
  }

  /**
   * Reload configuration
   * @returns {Promise<void>}
   */
  async reload() {
    if (this.running) {
      throw new Error('Cannot reload while fighter is running');
    }

    logger.info('Reloading fighter configuration...');
    const config = await configLoader.load();
    this.enabled = config.enabled;
    
    logger.info('Configuration reloaded');
    this.emit('reloaded');
  }

  /**
   * Get current status
   * @returns {Object} Status information
   */
  getStatus() {
    const config = configLoader.get();
    return {
      enabled: this.enabled,
      running: this.running,
      initialized: this.initialized,
      target: config?.target || {},
      strategy: config?.strategy || {},
      currentSession: this.currentSession ? {
        startTime: this.currentSession.startTime,
        results: this.currentSession.results
      } : null
    };
  }

  /**
   * Shutdown the fighter
   */
  shutdown() {
    logger.info('Shutting down Reservation Fighter...');
    if (this.running) {
      this.stop();
    }
    this.initialized = false;
    this.emit('shutdown');
  }
}

module.exports = new ReservationFighter();
