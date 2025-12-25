const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger').createServiceLogger('ReservationChecker');

/**
 * State Manager for Reservation Checker
 * Manages storing and retrieving reservation state per date
 */
class StateManager {
  constructor() {
    this.stateFilePath = null;
    this.reservationsByDate = {}; // Map of date -> Set of reservation IDs
  }

  /**
   * Initialize the state manager
   * @param {string} filePath - Path to state file
   * @returns {Promise<void>}
   */
  async initialize(filePath) {
    this.stateFilePath = filePath;
    
    try {
      // Try to load existing state
      await this.loadState();
      const totalReservations = Object.values(this.reservationsByDate)
        .reduce((sum, set) => sum + set.size, 0);
      logger.info('State loaded successfully', { 
        dates: Object.keys(this.reservationsByDate).length,
        totalReservations 
      });
    } catch (error) {
      // If file doesn't exist, start with empty state
      logger.info('No existing state found, starting fresh');
      this.reservationsByDate = {};
    }
  }

  /**
   * Load state from file
   * @returns {Promise<void>}
   */
  async loadState() {
    try {
      const data = await fs.readFile(this.stateFilePath, 'utf-8');
      const state = JSON.parse(data);
      
      // Convert stored arrays back to Sets
      this.reservationsByDate = {};
      if (state.reservationsByDate) {
        for (const [date, ids] of Object.entries(state.reservationsByDate)) {
          this.reservationsByDate[date] = new Set(ids);
        }
      } else if (state.reservationIds) {
        // Legacy format - migrate to new format
        // We don't know the date, so we'll just clear it
        logger.warn('Migrating from legacy state format');
        this.reservationsByDate = {};
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to load state', { error: error.message });
      }
      throw error;
    }
  }

  /**
   * Save current state to file
   * @returns {Promise<void>}
   */
  async saveState() {
    try {
      // Convert Sets to arrays for JSON serialization
      const reservationsByDate = {};
      for (const [date, ids] of Object.entries(this.reservationsByDate)) {
        reservationsByDate[date] = Array.from(ids);
      }
      
      const state = {
        reservationsByDate,
        lastUpdated: new Date().toISOString()
      };
      
      // Ensure directory exists
      const dir = path.dirname(this.stateFilePath);
      await fs.mkdir(dir, { recursive: true });
      
      await fs.writeFile(this.stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
      logger.debug('State saved successfully');
    } catch (error) {
      logger.error('Failed to save state', { error: error.message });
      throw error;
    }
  }

  /**
   * Compare new reservations with current state and find new ones for a specific date
   * @param {Array} newReservations - Array of reservation objects from API
   * @param {string} dateStr - Date string (YYYY-MM-DD format)
   * @returns {Array} New reservations that weren't in previous state for this date
   */
  async detectNewReservations(newReservations, dateStr) {
    // Member ID to filter out (exclude reservations where this member is a participant)
    const myMemberId = 6098795;
    
    // Extract reservation IDs from new data (filter out non-reservations and own reservations)
    const newReservationIds = new Set(
      newReservations
        .filter(r => 
          r.ReservationId && 
          r.ReservationId > 0 &&
          (!r.MemberIds || !r.MemberIds.includes(myMemberId))
        )
        .map(r => r.ReservationId)
    );

    // Get current reservation IDs for this date
    const currentIds = this.reservationsByDate[dateStr] || new Set();

    // Find new reservations (IDs in new set but not in current set)
    const newIds = Array.from(newReservationIds).filter(id => !currentIds.has(id));
    
    // Get full reservation objects for new IDs
    const newReservationObjects = newReservations.filter(r => newIds.includes(r.ReservationId));

    // Update current state for this date
    this.reservationsByDate[dateStr] = newReservationIds;
    
    // Save state to file
    await this.saveState();

    logger.debug('Reservation check completed for date', {
      date: dateStr,
      total: newReservationIds.size,
      new: newReservationObjects.length
    });

    return newReservationObjects;
  }

  /**
   * Get current state statistics
   * @returns {Object}
   */
  getStats() {
    const totalReservations = Object.values(this.reservationsByDate)
      .reduce((sum, set) => sum + set.size, 0);
    
    return {
      trackedReservations: totalReservations,
      trackedDates: Object.keys(this.reservationsByDate).length,
      stateFilePath: this.stateFilePath,
      dateBreakdown: Object.fromEntries(
        Object.entries(this.reservationsByDate).map(([date, set]) => [date, set.size])
      )
    };
  }

  /**
   * Clear all state
   * @returns {Promise<void>}
   */
  async clearState() {
    this.reservationsByDate = {};
    await this.saveState();
    logger.info('State cleared');
  }

  /**
   * Clean up past dates from state (remove dates before today)
   * @returns {Promise<number>} Number of dates removed
   */
  async cleanupPastDates() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    let removedCount = 0;
    for (const date of Object.keys(this.reservationsByDate)) {
      if (date < todayStr) {
        delete this.reservationsByDate[date];
        removedCount++;
      }
    }

    if (removedCount > 0) {
      await this.saveState();
      logger.info(`Cleaned up ${removedCount} past date(s) from state`);
    }

    return removedCount;
  }

  /**
   * Clean up old dates from state (remove dates older than N days)
   * @param {number} daysToKeep - Number of days to keep (default: 30)
   * @returns {Promise<number>} Number of dates removed
   */
  async cleanupOldDates(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    let removedCount = 0;
    for (const date of Object.keys(this.reservationsByDate)) {
      if (date < cutoffStr) {
        delete this.reservationsByDate[date];
        removedCount++;
      }
    }

    if (removedCount > 0) {
      await this.saveState();
      logger.info(`Cleaned up ${removedCount} old date(s) from state`);
    }

    return removedCount;
  }
}

module.exports = new StateManager();
