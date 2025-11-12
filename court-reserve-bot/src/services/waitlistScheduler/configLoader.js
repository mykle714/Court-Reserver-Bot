const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger').createServiceLogger('WaitlistScheduler');
const config = require('../../config/envConfig');

/**
 * Loads and manages waitlist configuration
 */
class ConfigLoader {
  constructor() {
    this.configPath = path.resolve(config.scheduler.configPath);
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
      logger.info('Waitlist configuration loaded successfully');
      return this.config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn('Waitlist config file not found, creating default');
        return await this.createDefault();
      }
      logger.error('Failed to load waitlist config', { error: error.message });
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
      waitlistTargets: []
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
      logger.info('Waitlist configuration saved successfully');
    } catch (error) {
      logger.error('Failed to save waitlist config', { error: error.message });
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
    logger.info(`Waitlist scheduler ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Add a new waitlist target
   * @param {Object} target - Target configuration
   * @returns {Promise<Object>} Added target with generated ID
   */
  async addTarget(target) {
    if (!this.config) {
      await this.load();
    }

    // Generate unique ID
    const id = `waitlist-${Date.now()}`;
    const newTarget = { id, ...target };

    this.config.waitlistTargets.push(newTarget);
    await this.save(this.config);
    
    logger.info('Added waitlist target', { id, date: target.date });
    return newTarget;
  }

  /**
   * Remove a waitlist target
   * @param {string} targetId - Target ID to remove
   * @returns {Promise<boolean>} True if removed, false if not found
   */
  async removeTarget(targetId) {
    if (!this.config) {
      await this.load();
    }

    const initialLength = this.config.waitlistTargets.length;
    this.config.waitlistTargets = this.config.waitlistTargets.filter(
      target => target.id !== targetId
    );

    if (this.config.waitlistTargets.length < initialLength) {
      await this.save(this.config);
      logger.info('Removed waitlist target', { id: targetId });
      return true;
    }

    logger.warn('Waitlist target not found', { id: targetId });
    return false;
  }

  /**
   * Remove expired targets (past dates)
   * @returns {Promise<number>} Number of targets removed
   */
  async cleanupExpired() {
    if (!this.config) {
      await this.load();
    }

    const now = new Date();
    const initialLength = this.config.waitlistTargets.length;

    this.config.waitlistTargets = this.config.waitlistTargets.filter(target => {
      const targetDate = new Date(target.date);
      return targetDate >= now;
    });

    const removed = initialLength - this.config.waitlistTargets.length;
    
    if (removed > 0) {
      await this.save(this.config);
      logger.info(`Cleaned up ${removed} expired waitlist targets`);
    }

    return removed;
  }

  /**
   * Validate target configuration
   * @param {Object} target - Target to validate
   * @returns {Object} Validation result
   */
  validateTarget(target) {
    const errors = [];

    if (!target.date) {
      errors.push('date is required');
    } else {
      const date = new Date(target.date);
      if (isNaN(date.getTime())) {
        errors.push('date must be valid ISO date string');
      }
    }

    if (!target.timeRange || !target.timeRange.start || !target.timeRange.end) {
      errors.push('timeRange with start and end is required');
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
