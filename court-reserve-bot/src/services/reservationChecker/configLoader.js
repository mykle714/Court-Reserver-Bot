const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger').createServiceLogger('ReservationChecker');

/**
 * Loads and manages reservation checker configuration
 */
class ConfigLoader {
  constructor() {
    this.configPath = path.resolve('./config/reservationCheckerConfig.json');
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
      logger.info('Reservation Checker configuration loaded successfully');
      return this.config;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn('Reservation Checker config file not found, creating default');
        return await this.createDefault();
      }
      logger.error('Failed to load reservation checker config', { error: error.message });
      throw error;
    }
  }

  /**
   * Create default configuration file from environment variables
   * @returns {Promise<Object>} Default configuration
   */
  async createDefault() {
    const defaultConfig = {
      enabled: process.env.RESERVATION_CHECKER_ENABLED === 'true',
      checkIntervalMinutes: parseInt(process.env.RESERVATION_CHECKER_INTERVAL || '5', 10)
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
      logger.info('Reservation Checker configuration saved successfully');
    } catch (error) {
      logger.error('Failed to save reservation checker config', { error: error.message });
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
   * Update enabled state
   * @param {boolean} enabled - New enabled state
   * @returns {Promise<void>}
   */
  async setEnabled(enabled) {
    if (!this.config) {
      await this.load();
    }
    
    this.config.enabled = enabled;
    await this.save(this.config);
    logger.info(`Reservation Checker ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Update check interval
   * @param {number} minutes - New interval in minutes
   * @returns {Promise<void>}
   */
  async setInterval(minutes) {
    if (!this.config) {
      await this.load();
    }
    
    if (minutes < 1 || minutes > 60) {
      throw new Error('Interval must be between 1 and 60 minutes');
    }
    
    this.config.checkIntervalMinutes = minutes;
    await this.save(this.config);
    logger.info(`Check interval updated to ${minutes} minutes`);
  }

  /**
   * Reload configuration from file
   * @returns {Promise<Object>} Reloaded configuration
   */
  async reload() {
    return await this.load();
  }
}

module.exports = new ConfigLoader();
