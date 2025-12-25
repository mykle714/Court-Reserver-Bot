# Deployment Guide - Fighter 28-Day Advance Featurewheat mini

This guide walks you through deploying the updated fighter configuration to your production server.

## Changes Made

1. **Added `advanceCheckDays` configuration** to fighter settings in `envConfig.js`
2. **Updated environment variable defaults**:
   - `FIGHTER_ADVANCE_CHECK_DAYS` defaults to 28 days
   - `FIGHTER_CHECK_INTERVAL_SECONDS` defaults to 60 seconds
3. **Updated documentation** in README.md and .env.example

## How It Works Now

When you configure a fighter target with:
```
!ft add 52667 2025-12-15 18:00 60
```

The fighter will:
- Calculate: **target date - 28 days** = November 17, 2025
- Start checking on November 17, 2025 at 18:00
- Continue burst attempts every 60 seconds (configurable)
- Keep fighting until reservation succeeds or time passes

## Deployment Steps

### 1. Commit and Push Changes (Local Dev Machine)

```bash
cd ~/Court-Reserver-Bot/court-reserve-bot
git add .
git commit -m "Add 28-day advance check configuration for fighter"
git push origin main
```

### 2. Update Production Server

SSH into your production server:
```bash
ssh michael@beech-2025
```

Navigate to the project directory:
```bash
cd ~/Court-Reserver-Bot/court-reserve-bot
```

Pull the latest changes:
```bash
git pull origin main
```

### 3. Update Environment Variables (Optional)

If you want to customize the fighter settings, edit your `.env` file:

```bash
nano .env
```

Add or update these lines (note: these are the defaults, so only add if you want different values):
```env
# Fighter 28-day advance configuration
FIGHTER_ADVANCE_CHECK_DAYS=28
FIGHTER_CHECK_INTERVAL_SECONDS=60
```

Save and exit (Ctrl+X, then Y, then Enter).

### 4. Rebuild and Restart Container

Stop the current container:
```bash
docker-compose down
```

Rebuild the image with new code:
```bash
docker-compose build --no-cache
```

Start the container:
```bash
docker-compose up -d
```

### 5. Verify Deployment

Check container is running:
```bash
docker-compose ps
```

View logs to confirm startup:
```bash
docker-compose logs -f
```

Look for:
- `[Config] Environment configuration validated successfully`
- `[ReservationFighter] Reservation Fighter initialized`
- No error messages

Press Ctrl+C to exit logs.

### 6. Test in Discord

Try the fighter commands:
```
!ft enable
!ft add 52667 2025-12-13 18:00 60
!ft status
!ft list
```

The fighter should now:
- Accept the commands without permission errors
- Schedule jobs to start 28 days before the target date
- Show proper status in Discord

## Verification Checklist

- [ ] Code changes committed and pushed
- [ ] Production server updated with latest code
- [ ] Container rebuilt and restarted successfully
- [ ] No errors in container logs
- [ ] `!ft enable` works without permission errors
- [ ] `!ft add` successfully creates targets
- [ ] `!ft status` shows correct configuration
- [ ] Fighter jobs are scheduled correctly

## Troubleshooting

### Permission Errors Still Occur
If you still see permission errors:
```bash
cd ~/Court-Reserver-Bot/court-reserve-bot
sudo chown -R 1001:1001 config logs
docker-compose restart
```

### Container Won't Start
Check logs for details:
```bash
docker-compose logs --tail=100
```

### Fighter Not Scheduling Jobs
Check environment configuration:
```bash
docker exec court-reserve-bot node -e "console.log(require('./src/config/envConfig').fighter)"
```

Should show:
```
{
  enabled: false,
  configPath: './config/fighterConfig.json',
  maxConcurrent: 50,
  advanceCheckDays: 28,
  checkIntervalSeconds: 60
}
```

## Configuration Reference

### Fighter Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FIGHTER_ENABLED` | `false` | Enable fighter on startup |
| `FIGHTER_CONFIG_PATH` | `./config/fighterConfig.json` | Path to config file |
| `FIGHTER_MAX_CONCURRENT` | `50` | Max concurrent requests during burst |
| `FIGHTER_ADVANCE_CHECK_DAYS` | `28` | Days before target to start fighting |
| `FIGHTER_CHECK_INTERVAL_SECONDS` | `60` | Seconds between burst attempts |

### Fighter Discord Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!ft status` | Show fighter status | `!ft status` |
| `!ft enable` | Enable fighter | `!ft enable` |
| `!ft disable` | Disable fighter | `!ft disable` |
| `!ft add` | Add fighter target | `!ft add 52667 2025-12-15 18:00 60` |
| `!ft remove` | Remove target by ID | `!ft remove fighter-1234567890` |
| `!ft list` | List all targets | `!ft list` |
| `!ft strategy` | Update burst strategy | `!ft strategy 30 50` |
| `!ft reload` | Reload config | `!ft reload` |

## Support

If you encounter issues:

1. Check container logs: `docker-compose logs -f`
2. Check Docker status: `docker-compose ps`
3. Verify file permissions: `ls -la config logs`
4. Test API connectivity from container
5. Review Discord bot permissions

## Rollback Procedure

If you need to rollback:

```bash
cd ~/Court-Reserver-Bot/court-reserve-bot
git log --oneline  # Find the previous commit hash
git checkout <previous-commit-hash>
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

Then notify users that the 28-day feature has been temporarily disabled.
