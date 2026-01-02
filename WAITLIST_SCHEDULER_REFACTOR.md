# Waitlist Scheduler Refactor Summary

## Overview
The waitlist scheduler has been refactored to use the new `getMemberExpandedScheduler` API method for more efficient availability checking.

---

## Changes Made

### 1. **Configuration Updates**

#### `config/waitlistConfig.json`
- Added `requestData` field to store encrypted authentication token
- Structure:
```json
{
  "enabled": true,
  "requestData": "",
  "waitlistTargets": []
}
```

#### `src/services/waitlistScheduler/configLoader.js`
- Updated `createDefault()` to include `requestData` field
- Added `setRequestData(requestData)` method to update the auth token

---

### 2. **New Methods in WaitlistScheduler**

#### `findAvailableCourts(schedulerData, date, startTime, duration)`
**Purpose:** Identifies which courts have no conflicting reservations

**Returns:** Array of available court IDs (as strings)

**Process:**
1. Iterates through all courts (52667-52677)
2. For each court, checks for time conflicts
3. Returns only courts with no conflicts

#### `_parseDateTime(date, time)`
**Purpose:** Helper to convert date and time strings into a Date object

**Parameters:**
- `date`: "YYYY-MM-DD" format
- `time`: "HH:MM" format

**Returns:** JavaScript Date object

#### `_hasTimeConflict(schedulerData, courtId, desiredStart, desiredEnd)`
**Purpose:** Checks if a specific court has any reservation conflicts

**Logic:**
- Gets all reservations for the specified court
- For each reservation, checks for time overlap using: `(StartA < EndB) && (EndA > StartB)`
- Returns `true` if any conflict found, `false` otherwise

#### `_getCourtReservations(schedulerData, courtId)`
**Purpose:** Extracts reservations for a specific court from scheduler data

**⚠️ IMPORTANT:** This method uses a placeholder implementation and needs to be adjusted based on the actual response structure from `getMemberExpandedScheduler`

**Current assumption:**
```javascript
schedulerData.reservations.filter(r => r.courtId === courtId)
```

---

### 3. **Refactored `checkAndReserve()` Method**

#### Old Flow:
1. Loop through 11 courts sequentially
2. For each court, call `apiClient.checkAvailability()`
3. If available, attempt reservation
4. Add 500ms delay between court checks
5. Continue to next court

**Problems:**
- 11 separate API calls (slow)
- Staggered delays add latency
- No bulk availability view

#### New Flow:
1. Single call to `getMemberExpandedScheduler()` to get all reservations
2. Analyze response locally to find available courts
3. Attempt reservations only on available courts
4. No delays needed between checks

**Benefits:**
- ✅ 90% reduction in API calls (1 instead of 11)
- ✅ Much faster execution (no 500ms delays × 11)
- ✅ Complete availability picture before attempting reservations
- ✅ More efficient resource usage

---

### 4. **Removed Logging**

As requested:
- ❌ Removed: `logger.info('Checking availability for target...')` at start of checkAndReserve
- ❌ Removed: `logger.debug('No availability found...')` when no courts available

---

## Required Configuration

Before using the refactored scheduler, you must set the `requestData` field:

```javascript
const configLoader = require('./src/services/waitlistScheduler/configLoader');

// Set the encrypted auth token
await configLoader.setRequestData("SVtXlVuPvpnXO5nnRKOxzcTcYY9Tzotl...");
```

Or manually edit `config/waitlistConfig.json`:
```json
{
  "enabled": true,
  "requestData": "SVtXlVuPvpnXO5nnRKOxzcTcYY9Tzotl...",
  "waitlistTargets": []
}
```

---

## ✅ Response Structure Verified & Fixed

The `_getCourtReservations()` method has been updated to correctly parse the actual API response.

**Actual API Response Structure:**
```javascript
{
  Data: [
    {
      ReservationId: 43016978,  // 0 = empty slot, >0 = actual reservation
      CourtId: 52675,
      Start: "2025-11-14T02:00:00Z",  // UTC format
      End: "2025-11-14T03:00:00Z",    // UTC format
      CourtLabel: "Redmond 9",
      MemberIds: [6098795, 6566419, ...],
      // ... many other fields
    },
    // ... more items
  ],
  Total: 41
}
```

**Implementation:**
```javascript
_getCourtReservations(schedulerData, courtId) {
  if (!schedulerData || !schedulerData.Data) {
    return [];
  }
  
  return schedulerData.Data
    .filter(item => 
      item.ReservationId > 0 &&  // Only actual reservations
      item.CourtId.toString() === courtId.toString()
    )
    .map(item => ({
      startTime: item.Start,  // UTC format
      endTime: item.End       // UTC format
    }));
}
```

**Key Logic:**
- `ReservationId: 0` indicates an empty/available slot
- `ReservationId > 0` indicates an actual reservation
- `CourtId` matches against court numbers (52667-52677)
- `Start` and `End` are in UTC format, ready for conflict detection

---

## Testing Checklist

- [ ] Set valid `requestData` in config
- [ ] Add a waitlist target
- [ ] Verify `getMemberExpandedScheduler()` returns expected data
- [ ] Check that `_getCourtReservations()` correctly parses the response
- [ ] Confirm conflict detection logic works correctly
- [ ] Test successful reservation flow
- [ ] Verify target is removed after successful reservation

---

## Related Files Modified

1. `config/waitlistConfig.json` - Added requestData field
2. `src/services/waitlistScheduler/configLoader.js` - Added setRequestData method
3. `src/services/waitlistScheduler/index.js` - Complete refactor of checkAndReserve + new helper methods
4. `src/utils/apiClient.js` - Already has getMemberExpandedScheduler method

---

## Performance Comparison

### Before:
- **API Calls per check:** 11 (one per court)
- **Time per check:** ~5.5 seconds (11 courts × 500ms delay)
- **Network overhead:** High (11 round trips)

### After:
- **API Calls per check:** 1 (getMemberExpandedScheduler)
- **Time per check:** <1 second (single API call)
- **Network overhead:** Low (1 round trip)

**Estimated speed improvement: 5-10x faster** ⚡
