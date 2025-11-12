const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger').createServiceLogger('AuthManager');

/**
 * Auth Manager Service
 * Centralized authentication token management
 */
class AuthManager {
  constructor() {
    this.token = null;
    this.envPath = path.join(process.cwd(), '.env');
    this.initialized = false;
  }

  /**
   * Initialize the auth manager
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      logger.info('🔐 Initializing Auth Manager...');
      
      // Load token from environment
      this.token = process.env.AUTH_BEARER_TOKEN || '';
      
      if (!this.token) {
        logger.warn('⚠️ No bearer token found in environment', {
          action: 'initialize',
          status: 'no_token'
        });
      } else {
        const tokenInfo = {
          action: 'initialize',
          status: 'token_loaded',
          tokenPreview: `${this.token.substring(0, 20)}...`,
          tokenLength: this.token.length
        };
        logger.info('✅ Bearer token loaded successfully', tokenInfo);
      }

      this.initialized = true;
      logger.info('✅ Auth Manager initialized successfully', {
        initialized: true,
        hasToken: this.hasToken()
      });
    } catch (error) {
      logger.error('❌ Failed to initialize Auth Manager', { 
        action: 'initialize',
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }

  /**
   * Get current bearer token
   * @returns {string} Bearer token
   */
  getToken() {
    if (!this.token) {
      logger.warn('⚠️ Token requested but not available', {
        action: 'get_token',
        status: 'no_token'
      });
    }
    return this.token;
  }

  /**
   * Check if token is set
   * @returns {boolean}
   */
  hasToken() {
    return !!this.token;
  }

  /**
   * Update bearer token
   * @param {string} newToken - New bearer token
   * @returns {Promise<void>}
   */
  async updateToken(newToken) {
    if (!newToken || typeof newToken !== 'string') {
      logger.error('❌ Invalid token provided for update', {
        action: 'update_token',
        status: 'invalid_token',
        tokenType: typeof newToken
      });
      throw new Error('Invalid token provided');
    }

    const oldTokenPreview = this.token ? `${this.token.substring(0, 20)}...` : 'none';

    try {
      logger.info('🔄 Starting token update process...', {
        action: 'update_token',
        status: 'starting',
        oldTokenPreview,
        newTokenPreview: `${newToken.substring(0, 20)}...`,
        oldTokenLength: this.token ? this.token.length : 0,
        newTokenLength: newToken.length
      });

      // Update in memory
      this.token = newToken;
      logger.info('✅ Token updated in memory', {
        action: 'update_token',
        status: 'memory_updated'
      });
      
      // Update in .env file
      await this.updateEnvFile('AUTH_BEARER_TOKEN', newToken);
      
      logger.info('✅ Bearer token updated successfully', {
        action: 'update_token',
        status: 'complete',
        tokenPreview: `${newToken.substring(0, 20)}...`,
        tokenLength: newToken.length,
        persistedToFile: true
      });
    } catch (error) {
      logger.error('❌ Failed to update bearer token', { 
        action: 'update_token',
        status: 'failed',
        error: error.message,
        stack: error.stack,
        oldTokenPreview
      });
      throw error;
    }
  }

  /**
   * Reload token from environment
   * @returns {Promise<void>}
   */
  async reload() {
    const oldTokenPreview = this.token ? `${this.token.substring(0, 20)}...` : 'none';
    
    try {
      logger.info('🔄 Reloading token from .env file...', {
        action: 'reload_token',
        status: 'starting',
        oldTokenPreview
      });

      // Re-read .env file
      const envContent = await fs.readFile(this.envPath, 'utf-8');
      const tokenMatch = envContent.match(/AUTH_BEARER_TOKEN=(.+)/);
      
      if (tokenMatch) {
        this.token = tokenMatch[1].trim();
        logger.info('✅ Bearer token reloaded from .env successfully', {
          action: 'reload_token',
          status: 'success',
          newTokenPreview: `${this.token.substring(0, 20)}...`,
          tokenLength: this.token.length,
          changed: oldTokenPreview !== `${this.token.substring(0, 20)}...`
        });
      } else {
        logger.warn('⚠️ No AUTH_BEARER_TOKEN found in .env file', {
          action: 'reload_token',
          status: 'not_found'
        });
        this.token = '';
      }
    } catch (error) {
      logger.error('❌ Failed to reload token', { 
        action: 'reload_token',
        status: 'failed',
        error: error.message,
        stack: error.stack,
        envPath: this.envPath 
      });
      throw error;
    }
  }

  /**
   * Update a value in the .env file
   * @param {string} key - Environment variable key
   * @param {string} value - New value
   * @returns {Promise<void>}
   */
  async updateEnvFile(key, value) {
    try {
      logger.info(`📝 Updating ${key} in .env file...`, {
        action: 'update_env_file',
        key,
        valuePreview: value.length > 20 ? `${value.substring(0, 20)}...` : value
      });

      let envContent = await fs.readFile(this.envPath, 'utf-8');
      
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const isUpdate = regex.test(envContent);
      
      if (isUpdate) {
        // Update existing key
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        // Add new key
        envContent += `\n${key}=${value}\n`;
      }
      
      await fs.writeFile(this.envPath, envContent, 'utf-8');
      
      logger.info(`✅ Successfully updated ${key} in .env file`, {
        action: 'update_env_file',
        key,
        operation: isUpdate ? 'updated' : 'added',
        envPath: this.envPath
      });
    } catch (error) {
      logger.error(`❌ Failed to update .env file`, { 
        action: 'update_env_file',
        key,
        error: error.message,
        stack: error.stack,
        envPath: this.envPath
      });
      throw error;
    }
  }

  /**
   * Get token status for display (masked)
   * @returns {Object}
   */
  getStatus() {
    return {
      initialized: this.initialized,
      hasToken: this.hasToken(),
      tokenPreview: this.token ? `${this.token.substring(0, 20)}...` : 'Not set'
    };
  }

  /**
   * Shutdown the auth manager
   */
  shutdown() {
    logger.info('🔒 Shutting down Auth Manager...', {
      action: 'shutdown',
      hadToken: this.hasToken()
    });
    this.initialized = false;
    logger.info('✅ Auth Manager shut down successfully');
  }
}

module.exports = new AuthManager();
