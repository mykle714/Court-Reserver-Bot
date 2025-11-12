# Court Reserve Bot

A Discord-integrated bot for managing court reservations with three powerful subservices: Waitlist Scheduler, Reservation Fighter, and Discord Bot interface.

## Overview

This bot helps automate court reservations through two strategies:

1. **Waitlist Scheduler**: Monitors for availability and automatically books when slots open up
2. **Reservation Fighter**: Makes aggressive parallel API requests when reservations open to increase success rate
3. **Discord Bot**: Provides a convenient interface to control and monitor both services

## Features

### Waitlist Scheduler
- Monitor multiple target dates and time ranges
- Automatic cron job generation based on configuration
- Configurable check intervals and advance booking windows
- Master enable/disable switch
- Automatic cleanup of expired targets
- Real-time notifications on successful reservations

### Reservation Fighter
- High-volume parallel requests (configurable concurrency)
- 20-second burst strategy by default
- Configurable request intervals
- Master enable/disable switch
- Real-time status updates and success notifications
- Automatic configuration via Discord commands

### Discord Bot
- Comprehensive command interface
- Real-time status monitoring
- Event notifications for all reservation activities
- Support for multi-word commands with quoted arguments

## Architecture

```
court-reserve-bot/
├── src/
│   ├── index.js                    # Main entry point
│   ├── config/
│   │   └── envConfig.js            # Environment configuration
│   ├── services/
│   │   ├── waitlistScheduler/      # Waitlist monitoring service
│   │   ├── reservationFighter/     # Aggressive request service
│   │   └── discordBot/             # Discord interface
│   └── utils/
│       ├── logger.js               # Centralized logging
│       └── apiClient.js            # CourtReserve API wrapper
├── config/
│   ├── waitlistConfig.json         # Waitlist targets configuration
│   └── fighterConfig.json          # Fighter targets configuration
└── logs/                           # Application logs
```

## Installation

### Prerequisites
- Node.js 16.0.0 or higher (or Docker)
- A Discord bot token
- CourtReserve API credentials

### Option 1: Docker Installation (Recommended)

Docker provides an isolated, reproducible environment and is the recommended way to run the bot.

1. Prerequisites:
   - Docker installed
   - Docker Compose installed

2. Setup:
```bash
cd court-reserve-bot
cp .env.example .env
# Edit .env with your credentials
```

3. Start the bot:
```bash
docker-compose up -d
```

4. Monitor logs:
```bash
docker-compose logs -f
```

**For complete Docker documentation, see [DOCKER.md](DOCKER.md)**

### Option 2: Direct Installation

1. Clone the repository:
```bash
cd court-reserve-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create environment configuration:
```bash
cp .env.example .env
```

4. Edit `.env` with your credentials:
```env
# Discord Configuration
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CHANNEL_ID=your_discord_channel_id_here

# CourtReserve API Configuration
API_BASE_URL=https://api.courtreserve.com
AUTH_TOKEN=your_auth_token_here
USER_ID=your_user_id_here
FACILITY_ID=your_facility_id_here
```

5. Start the bot:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Configuration

### Environment Variables (.env)

#### Discord Settings
- `DISCORD_BOT_TOKEN` - Your Discord bot token (required)
- `DISCORD_CHANNEL_ID` - Channel ID for bot communications (required)
- `DISCORD_COMMAND_PREFIX` - Command prefix (default: `!`)

#### API Settings
- `API_BASE_URL` - CourtReserve API base URL (required)
- `AUTH_TOKEN` - API authentication token
- `USER_ID` - Your user ID
- `FACILITY_ID` - Facility ID
- `API_TIMEOUT` - Request timeout in ms (default: 10000)

#### Scheduler Settings
- `SCHEDULER_ENABLED` - Enable scheduler on startup (default: false)
- `WAITLIST_CONFIG_PATH` - Path to waitlist config (default: ./config/waitlistConfig.json)
- `SCHEDULER_CHECK_INTERVAL_MINUTES` - How often to check availability (default: 15)
- `SCHEDULER_ADVANCE_CHECK_DAYS` - Days before target to start checking (default: 7)

#### Fighter Settings
- `FIGHTER_ENABLED` - Enable fighter on startup (default: false)
- `FIGHTER_CONFIG_PATH` - Path to fighter config (default: ./config/fighterConfig.json)
- `FIGHTER_MAX_CONCURRENT` - Max concurrent requests (default: 50)

#### Logging Settings
- `LOG_LEVEL` - Logging level: debug, info, warn, error (default: info)
- `LOG_FILE` - Main log file path
- `ERROR_LOG_FILE` - Error log file path

### Waitlist Configuration (waitlistConfig.json)

```json
{
  "enabled": false,
  "waitlistTargets": [
    {
      "id": "unique-id",
      "date": "2025-11-15",
      "timeRange": {
        "start": "18:00",
        "end": "20:00"
      },
      "court": "Court 1",
      "duration": 60
    }
  ]
}
```

### Fighter Configuration (fighterConfig.json)

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

## Discord Commands

All commands use the `!` prefix by default (configurable).

### General Commands
- `!help` - Display all available commands
- `!status` - Show status of all services

### Waitlist Scheduler Commands
- `!waitlist status` - Show scheduler status and targets
- `!waitlist enable` - Enable the scheduler
- `!waitlist disable` - Disable the scheduler
- `!waitlist add <date> <start> <end> <court> <duration>` - Add a waitlist target
  - Example: `!waitlist add 2025-11-15 18:00 20:00 "Court 1" 60`
- `!waitlist remove <id>` - Remove a specific target
- `!waitlist reload` - Reload configuration from file
- `!waitlist cleanup` - Remove expired targets

### Reservation Fighter Commands
- `!fighter status` - Show fighter status and configuration
- `!fighter enable` - Enable and start the fighter
- `!fighter disable` - Disable the fighter
- `!fighter set court <name>` - Set target court
  - Example: `!fighter set court Court 1`
- `!fighter set date <YYYY-MM-DD>` - Set target date
  - Example: `!fighter set date 2025-11-15`
- `!fighter set time <HH:MM>` - Set start time
  - Example: `!fighter set time 18:00`
- `!fighter set duration <minutes>` - Set duration
  - Example: `!fighter set duration 60`
- `!fighter reload` - Reload configuration from file

## How It Works

### Waitlist Scheduler

1. Reads `waitlistConfig.json` for target reservations
2. Generates cron jobs for each target based on:
   - Target date
   - Check interval (e.g., every 15 minutes)
   - Advance check window (e.g., start 7 days before)
3. Periodically checks availability via API
4. Attempts reservation when slot becomes available
5. Notifies via Discord on success/failure
6. Automatically removes target after successful reservation

### Reservation Fighter

1. Reads `fighterConfig.json` for target reservation
2. When enabled, starts a configured duration burst (default 20 seconds)
3. Makes many parallel API requests with configurable:
   - Concurrency limit (default 50 parallel)
   - Request interval (default 100ms)
4. Aggregates results and reports statistics
5. Notifies via Discord on success
6. Auto-stops after duration completes

## Event Notifications

The bot automatically sends Discord notifications for:
- ✅ Successful reservations
- ❌ Failed reservation attempts
- ⚔️ Fighter session start/complete
- 🎯 Individual fighter successes
- ℹ️ Service status changes

## Logging

Logs are written to:
- `logs/app.log` - All application logs
- `logs/error.log` - Error logs only
- Console - Real-time colored output

Log levels: `debug`, `info`, `warn`, `error`

## API Client

The included API client (`src/utils/apiClient.js`) provides:
- Automatic request/response logging
- Error handling with retries
- Authentication header injection
- Methods for:
  - `checkAvailability()` - Check if slot is available
  - `makeReservation()` - Attempt to book a reservation
  - `getCourts()` - Get list of courts
  - `customRequest()` - Make custom API calls

You may need to modify the API client methods to match your specific CourtReserve API endpoints.

## Troubleshooting

### Bot won't start
- Check `.env` file exists and has required values
- Verify Discord bot token is valid
- Check Node.js version is 16.0.0 or higher

### Commands not responding
- Verify bot has permissions in Discord channel
- Check `DISCORD_CHANNEL_ID` matches your channel
- Ensure command prefix matches (default: `!`)

### Reservations failing
- Verify API credentials in `.env`
- Check API base URL is correct
- Review logs in `logs/error.log`
- Test API endpoints manually

### Cron jobs not running
- Check scheduler is enabled (`!waitlist status`)
- Verify target dates are in the future
- Check `SCHEDULER_ADVANCE_CHECK_DAYS` setting
- Review logs for cron job creation

## Development

### Running in development mode
```bash
npm run dev
```

This uses `nodemon` for automatic restarts on file changes.

### Project Structure
- `src/` - Source code
  - `services/` - Individual service modules
  - `utils/` - Shared utilities
  - `config/` - Configuration management
- `config/` - JSON configuration files
- `logs/` - Log output directory

### Adding New Commands
1. Create handler in appropriate command file
2. Add to `getHandlers()` method
3. Commands automatically register on bot startup

## Security Notes

- Never commit `.env` file to version control
- Keep API credentials secure
- Use environment variables for sensitive data
- Review Discord bot permissions carefully
- Monitor logs for suspicious activity

## License

MIT

## Support

For issues or questions, please check:
1. Logs in `logs/` directory
2. Discord bot permissions
3. API credential validity
4. Configuration file syntax

## Contributing

Contributions are welcome! Please ensure:
- Code follows existing patterns
- Add appropriate logging
- Update documentation
- Test thoroughly before submitting
