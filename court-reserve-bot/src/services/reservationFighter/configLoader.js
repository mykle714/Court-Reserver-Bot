const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger').createServiceLogger('ReservationFighter');
const config = require('../../config/envConfig');

/**
 * Loads and manages reservation fighter configuration
 */
class ConfigLoader {
  constructor() {
    this.configPath = path.resolve(config.fighter.configPath);
    this.config = null;
  }

  /**
   * Load configuration from file
   * @returns {Promise<Object>} Configuration object
   */
  async load() {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(data);
      logger.info('Fighter configuration loaded successfully');
      return this.config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn('Fighter config file not found, creating default');
        return await this.createDefault();
      }
      logger.error('Failed to load fighter config', { error: error.message });
      throw error;
    }
  }

  /**
   * Create default configuration file
   * @returns {Promise<Object>} Default configuration
   */
  async createDefault() {
    const defaultConfig = {
      enabled: false,
      target: {
        court: "",
        date: "",
        startTime: "",
        duration: 60
      },
      strategy: {
        parallelRequests: 50,
        durationSeconds: 20,
        requestIntervalMs: 100
      }
    };

    await this.save(defaultConfig);
    this.config = defaultConfig;
    return defaultConfig;
  }

  /**
   * Save configuration to file
   * @param {Object} configData - Configuration to save
   * @returns {Promise<void>}
   */
  async save(configData) {
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.configPath), { recursive: true });
      
      // Write config file
      await fs.writeFile(
        this.configPath,
        JSON.stringify(configData, null, 2),
        'utf8'
      );
      
      this.config = configData;
      logger.info('Fighter configuration saved successfully');
    } catch (error) {
      logger.error('Failed to save fighter config', { error: error.message });
      throw error;
    }
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  get() {
    return this.config;
  }

  /**
   * Update master enabled state
   * @param {boolean} enabled - New enabled state
   * @returns {Promise<void>}
   */
  async setEnabled(enabled) {
    if (!this.config) {
      await this.load();
    }
    
    this.config.enabled = enabled;
    await this.save(this.config);
    logger.info(`Reservation fighter ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Update target configuration
   * @param {Object} updates - Partial target updates
   * @returns {Promise<Object>} Updated target
   */
  async updateTarget(updates) {
    if (!this.config) {
      await this.load();
    }

    this.config.target = {
      ...this.config.target,
      ...updates
    };

    await this.save(this.config);
    logger.info('Fighter target updated', updates);
    return this.config.target;
  }

  /**
   * Update strategy configuration
   * @param {Object} updates - Partial strategy updates
   * @returns {Promise<Object>} Updated strategy
   */
  async updateStrategy(updates) {
    if (!this.config) {
      await this.load();
    }

    this.config.strategy = {
      ...this.config.strategy,
      ...updates
    };

    await this.save(this.config);
    logger.info('Fighter strategy updated', updates);
    return this.config.strategy;
  }

  /**
   * Validate target configuration
   * @param {Object} target - Target to validate
   * @returns {Object} Validation result
   */
  validateTarget(target) {
    const errors = [];

    if (!target.court) {
      errors.push('court is required');
    }

    if (!target.date) {
      errors.push('date is required');
    } else {
      const date = new Date(target.date);
      if (isNaN(date.getTime())) {
        errors.push('date must be valid ISO date string');
      }
    }

    if (!target.startTime) {
      errors.push('startTime is required');
    }

    if (!target.duration || target.duration <= 0) {
      errors.push('duration must be a positive number');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = new ConfigLoader();
