# Reservation Fighter Refactoring Summary

## Overview
The Reservation Fighter has been refactored to use the same job system architecture as the Waitlist Scheduler, with support for multiple targets that can run in parallel.

## Key Changes

### 1. Architecture
**Before:**
- Single target configuration
- Manual start/stop burst sessions
- No job scheduling system

**After:**
- Multiple target support
- Automated job scheduling with intervals
- Same job system architecture as Waitlist Scheduler
- Each target runs independently on its own schedule

### 2. Configuration Structure

**Old Structure (`fighterConfig.json`):**
```json
{
  "enabled": false,
  "target": {
    "court": "Court 1",
    "date": "2025-11-15",
    "startTime": "18:00",
    "duration": 60
  },
  "strategy": {
    "parallelRequests": 50,
    "durationSeconds": 20,
    "requestIntervalMs": 100
  }
}
```

**New Structure:**
```json
{
  "enabled": false,
  "strategy": {
    "durationSeconds": 20,
    "requestIntervalMs": 100
  },
  "fighterTargets": [
    {
      "id": "fighter-1234567890",
      "court": "52667",
      "date": "2025-11-15",
      "startTime": "18:00",
      "duration": 60
    }
  ]
}
```

**Key Differences:**
- Removed `parallelRequests` (now always 1 sequential request per court)
- Changed `target` → `fighterTargets` array
- Each target now has an auto-generated `id`
- `court` parameter is REQUIRED (targets specific courts)

### 3. New Components

#### JobGenerator (`src/services/reservationFighter/jobGenerator.js`)
- Manages interval-based jobs for each fighter target
- Schedules jobs based on date proximity
- Handles job creation, removal, and cleanup
- Similar to `CronGenerator` in Waitlist Scheduler

#### Updated ConfigLoader
- Now handles multiple targets with array management
- Added `addTarget()`, `removeTarget()`, `cleanupExpired()` methods
- Validates each target configuration
- Matches Waitlist Scheduler's config management pattern

#### Updated Fighter Service
- Uses JobGenerator for scheduling
- Runs burst attacks on interval for each target
- Sequential requests (not parallel) - one request per court at a time
- Automatically removes targets after successful reservations
- Tracks active bursts to prevent overlapping sessions

### 4. Request Flow Comparison

#### Waitlist Scheduler (checks ALL courts):
```
Job triggers every X seconds
  → Check court 52667
  → Wait delay
  → Check court 52668
  → Wait delay
  → ... (continues through all courts)
```

#### Reservation Fighter (targets SPECIFIC court):
```
Job triggers every X seconds
  → Start 20-second burst for target court
    → Send request for court 52667
    → Wait 100ms
    → Send request for court 52667
    → Wait 100ms
    → ... (continues for 20 seconds)
    → ~200 sequential attempts
```

### 5. Updated Discord Commands

**New Commands:**
- `!ft status` - Show fighter status and strategy
- `!ft list` - List all fighter targets
- `!ft add <court> <date> <time> <duration>` - Add a target
- `!ft remove <target_id>` - Remove a target
- `!ft strategy <duration_seconds> <interval_ms>` - Update strategy
- `!ft enable` - Enable fighter and schedule jobs
- `!ft disable` - Disable fighter
- `!ft reload` - Reload configuration

**Removed Commands:**
- `!ft set court`, `!ft set date`, `!ft set time`, `!ft set duration`
  (Replaced by `!ft add` for multi-target support)

### 6. Behavioral Differences

| Feature | Waitlist Scheduler | Reservation Fighter |
|---------|-------------------|---------------------|
| **Court Parameter** | ❌ No - checks ALL courts (52667-52677) | ✅ Yes - targets SPECIFIC court |
| **Job System** | ✅ Interval-based jobs | ✅ Interval-based jobs |
| **Multiple Targets** | ✅ Yes - array of targets | ✅ Yes - array of targets |
| **Request Strategy** | Sequential with delays between courts | Sequential bursts for single court |
| **Success Behavior** | Removes target after ANY court succeeds | Removes target after THAT court succeeds |
| **Parallel Execution** | Each target runs independently | Each target runs independently |

## Usage Examples

### Add Fighter Targets
```bash
# Fight for court 52667 at 6pm
!ft add 52667 2025-11-15 18:00 60

# Fight for court 52668 at 7pm  
!ft add 52668 2025-11-15 19:00 60
```

### Enable Fighter
```bash
!ft enable
```

### View Status
```bash
!ft status   # Overall status
!ft list     # List all targets
```

### Update Strategy
```bash
# 30-second bursts with 50ms intervals
!ft strategy 30 50
```

## Migration Notes

If you have existing fighter configuration:
1. The old `target` field will need to be manually converted to `fighterTargets` array
2. Remove `parallelRequests` from strategy (no longer used)
3. Ensure `court` values use court IDs (e.g., "52667") not names

## Testing Recommendations

1. ✅ Syntax validation - PASSED
2. ✅ Docker container compatibility - PASSED
3. 🔄 Functional testing:
   - Add multiple fighter targets via Discord
   - Enable fighter and verify jobs are scheduled
   - Monitor burst executions in logs
   - Test successful reservation and target removal
   - Test multiple targets running in parallel

## Files Modified

- `src/services/reservationFighter/index.js` - Main service refactored
- `src/services/reservationFighter/configLoader.js` - Multi-target support
- `src/services/reservationFighter/jobGenerator.js` - NEW FILE
- `src/services/discordBot/commands/fighterCommands.js` - Updated commands
- `config/fighterConfig.json` - New structure

## Files Unchanged

- `src/services/waitlistScheduler/*` - Already had correct architecture
- `src/services/discordBot/commands/waitlistCommands.js` - Already correct (no court param)
