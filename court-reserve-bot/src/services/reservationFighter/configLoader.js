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
      strategy: {
        durationSeconds: 20,
        requestIntervalMs: 100
      },
      fighterTargets: []
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
   * Add a new fighter target
   * @param {Object} target - Target configuration
   * @returns {Promise<Object>} Added target with generated ID
   */
  async addTarget(target) {
    if (!this.config) {
      await this.load();
    }

    // Generate unique ID
    const id = `fighter-${Date.now()}`;
    const newTarget = { id, ...target };

    this.config.fighterTargets.push(newTarget);
    await this.save(this.config);
    
    logger.info('Added fighter target', { id, court: target.court, date: target.date });
    return newTarget;
  }

  /**
   * Remove a fighter target
   * @param {string} targetId - Target ID to remove
   * @returns {Promise<boolean>} True if removed, false if not found
   */
  async removeTarget(targetId) {
    if (!this.config) {
      await this.load();
    }

    const initialLength = this.config.fighterTargets.length;
    this.config.fighterTargets = this.config.fighterTargets.filter(
      target => target.id !== targetId
    );

    if (this.config.fighterTargets.length < initialLength) {
      await this.save(this.config);
      logger.info('Removed fighter target', { id: targetId });
      return true;
    }

    logger.warn('Fighter target not found', { id: targetId });
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
    const initialLength = this.config.fighterTargets.length;

    this.config.fighterTargets = this.config.fighterTargets.filter(target => {
      const targetDate = new Date(target.date);
      return targetDate >= now;
    });

    const removed = initialLength - this.config.fighterTargets.length;
    
    if (removed > 0) {
      await this.save(this.config);
      logger.info(`Cleaned up ${removed} expired fighter targets`);
    }

    return removed;
  }

  /**
   * Remove old targets (less than 28 days in the future)
   * @returns {Promise<number>} Number of targets removed
   */
  async cleanupOldTargets() {
    if (!this.config) {
      await this.load();
    }

    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() + 28); // 28 days from now

    const initialLength = this.config.fighterTargets.length;

    this.config.fighterTargets = this.config.fighterTargets.filter(target => {
      const targetDate = new Date(target.date);
      return targetDate >= cutoffDate;
    });

    const removed = initialLength - this.config.fighterTargets.length;
    
    if (removed > 0) {
      await this.save(this.config);
      logger.info(`Cleaned up ${removed} old fighter targets (less than 28 days away)`);
    }

    return removed;
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
