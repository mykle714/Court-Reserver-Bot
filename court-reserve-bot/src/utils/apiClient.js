const axios = require('axios');
const logger = require('./apiLogger').createServiceLogger('APIClient');
const authManager = require('../services/authManager');

/**
 * CourtReserve API Client
 * Handles all HTTP requests to the CourtReserve API
 */
class APIClient {
  constructor() {
    this.baseURL = process.env.API_BASE_URL;
    this.userId = process.env.USER_ID;
    this.facilityId = process.env.FACILITY_ID;
    
    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Request interceptor for logging and auth
    this.client.interceptors.request.use(
      (config) => {
        // Store request start time
        config.metadata = { startTime: Date.now() };
        
        // Add current bearer token to each request
        const token = authManager.getToken();
        if (token) {
          config.headers['Authorization'] = `Bearer ${token}`;
        }
        
        // Build detailed request log
        const requestInfo = {
          method: config.method.toUpperCase(),
          url: config.url,
          fullUrl: `${config.baseURL || ''}${config.url}`,
          headers: this.sanitizeHeaders(config.headers),
          params: config.params,
          data: config.data
        };
        
        logger.info(`🌐 API Request: ${requestInfo.method} ${requestInfo.url}`, requestInfo);
        return config;
      },
      (error) => {
        logger.error('❌ API Request Setup Failed', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        // Calculate request duration
        const duration = Date.now() - response.config.metadata.startTime;
        
        // Build detailed response log
        const responseInfo = {
          method: response.config.method.toUpperCase(),
          url: response.config.url,
          status: response.status,
          statusText: response.statusText,
          duration: `${duration}ms`,
          dataSize: JSON.stringify(response.data).length,
          data: this.truncateData(response.data)
        };
        
        logger.info(`✅ API Response: ${responseInfo.status} ${responseInfo.method} ${responseInfo.url} (${responseInfo.duration})`, responseInfo);
        return response;
      },
      (error) => {
        // Calculate request duration if available
        const duration = error.config?.metadata?.startTime 
          ? Date.now() - error.config.metadata.startTime 
          : 'N/A';
        
        const errorInfo = {
          method: error.config?.method?.toUpperCase(),
          url: error.config?.url,
          status: error.response?.status,
          statusText: error.response?.statusText,
          duration: duration !== 'N/A' ? `${duration}ms` : duration,
          errorMessage: error.message,
          responseData: error.response?.data
        };
        
        const message = error.response 
          ? `❌ API Error: ${error.response.status} ${error.response.statusText} - ${errorInfo.method} ${errorInfo.url}`
          : `❌ API Error: ${error.message}`;
        
        logger.error(message, errorInfo);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Sanitize headers for logging (redact sensitive info)
   * @param {Object} headers - Request headers
   * @returns {Object} Sanitized headers
   */
  sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    if (sanitized.Authorization) {
      sanitized.Authorization = 'Bearer [REDACTED]';
    }
    return sanitized;
  }

  /**
   * Truncate data for logging to avoid huge logs
   * @param {*} data - Data to truncate
   * @returns {*} Truncated data
   */
  truncateData(data) {
    const str = JSON.stringify(data);
    if (str.length > 500) {
      return str.substring(0, 500) + '... [truncated]';
    }
    return data;
  }

  /**
   * Check availability for a specific court and time
   * @param {Object} params - The availability check parameters
   * @returns {Promise<Object>} Availability response
   */
  async checkAvailability({ court, date, startTime, duration }) {
    try {
      const response = await this.client.post('/check-availability', {
        facilityId: this.facilityId,
        court,
        date,
        startTime,
        duration,
        userId: this.userId
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to check availability', { court, date, startTime });
      throw error;
    }
  }

  /**
   * Make a reservation
   * @param {Object} params - The reservation parameters
   * @returns {Promise<Object>} Reservation response
   */
  async makeReservation({ court, date, startTime, duration }) {
    try {
      logger.info(`Attempting reservation: ${court} on ${date} at ${startTime} for ${duration}min`);
      const response = await this.client.post('/reservations', {
        facilityId: this.facilityId,
        court,
        date,
        startTime,
        duration,
        userId: this.userId
      });
      logger.info('Reservation successful!', { reservationId: response.data?.id });
      return response.data;
    } catch (error) {
      logger.error('Reservation failed', { court, date, startTime, error: error.message });
      throw error;
    }
  }

  /**
   * Get list of available courts
   * @returns {Promise<Array>} List of courts
   */
  async getCourts() {
    try {
      const response = await this.client.get('/courts', {
        params: { facilityId: this.facilityId }
      });
      return response.data;
    } catch (error) {
      logger.error('Failed to get courts list');
      throw error;
    }
  }

  /**
   * Custom API request with full control
   * @param {Object} config - Axios request config
   * @returns {Promise<Object>} Response data
   */
  async customRequest(config) {
    try {
      const response = await this.client.request(config);
      return response.data;
    } catch (error) {
      logger.error('Custom request failed', { url: config.url, method: config.method });
      throw error;
    }
  }
}

module.exports = new APIClient();
