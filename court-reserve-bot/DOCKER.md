# Docker Setup Guide for Court Reserve Bot

This guide explains how to run the Court Reserve Bot using Docker.

## Prerequisites

- Docker installed on your system
- Docker Compose installed (usually comes with Docker Desktop)
- A configured `.env` file (copy from `.env.example` and fill in your values)

## Quick Start

### 1. Configure Environment Variables

First, ensure you have a `.env` file in the `court-reserve-bot` directory with all required configuration:

```bash
cp .env.example .env
# Edit .env with your actual values
```

### 2. Build and Start the Bot

```bash
# From the court-reserve-bot directory
docker-compose up -d
```

This command will:
- Build the Docker image
- Start the container in detached mode
- Auto-restart the container if it crashes

### 3. View Logs

```bash
# View all logs
docker-compose logs -f

# View recent logs
docker-compose logs --tail=100 -f
```

### 4. Stop the Bot

```bash
docker-compose down
```

## Docker Commands Reference

### Building and Starting

```bash
# Build the image
docker-compose build

# Start the container
docker-compose up -d

# Build and start in one command
docker-compose up -d --build
```

### Monitoring

```bash
# View logs (follow mode)
docker-compose logs -f

# View last 50 lines
docker-compose logs --tail=50

# Check container status
docker-compose ps

# View resource usage
docker stats court-reserve-bot
```

### Maintenance

```bash
# Restart the container
docker-compose restart

# Stop the container
docker-compose stop

# Start a stopped container
docker-compose start

# Stop and remove the container
docker-compose down

# Rebuild after code changes
docker-compose up -d --build
```

### Troubleshooting

```bash
# Access container shell
docker exec -it court-reserve-bot sh

# View container details
docker inspect court-reserve-bot

# Check Docker logs for errors
docker logs court-reserve-bot

# Remove everything and start fresh
docker-compose down
docker-compose up -d --build
```

## Volume Mounts

The following directories are mounted as volumes for persistent data:

- `./config` → `/app/config` - Configuration files (waitlist, fighter, state)
- `./logs` → `/app/logs` - Application logs

These directories persist even when the container is stopped or removed.

## Configuration Changes

### Updating Environment Variables

1. Edit the `.env` file
2. Restart the container:
   ```bash
   docker-compose restart
   ```

### Updating Configuration Files

Configuration files in `./config/` are mounted as volumes, so changes take effect based on how the application reads them:

- Some changes may require a restart: `docker-compose restart`
- Some may be picked up automatically by the running bot

### Code Changes

After modifying the source code:

```bash
docker-compose up -d --build
```

## Resource Limits (Optional)

The `docker-compose.yml` file includes commented-out resource limits. To enable them:

1. Uncomment the `deploy` section in `docker-compose.yml`
2. Adjust the values as needed
3. Restart: `docker-compose up -d`

Example limits:
- CPU: 1 core max, 0.5 reserved
- Memory: 512MB max, 256MB reserved

## Production Deployment

For production deployment:

1. Ensure `.env` file has production values
2. Consider using Docker secrets for sensitive data
3. Set up log rotation (already configured with 10MB max, 3 files)
4. Monitor container health with `docker stats`
5. Set up automatic container restart on system boot

### Setting Up Auto-Start on Boot

Docker Compose with `restart: unless-stopped` will automatically start the container on system boot if Docker is set to start on boot.

To verify Docker auto-start:
```bash
sudo systemctl enable docker
```

## Security Notes

- Container runs as non-root user (`nodejs`)
- `.env` file is not included in the Docker image (only mounted at runtime)
- Logs and config directories have proper permissions

## Differences from Non-Docker Setup

When running in Docker:
- Node modules are installed in the container (not in your local directory)
- The application runs in an isolated environment
- Logs and config persist through container restarts
- Easy to deploy to different environments with the same setup

## Troubleshooting Common Issues

### Issue: Container keeps restarting

Check logs:
```bash
docker-compose logs --tail=100
```

Common causes:
- Missing or invalid `.env` file
- Invalid Discord token
- Network connectivity issues

### Issue: Changes not reflected

Rebuild the image:
```bash
docker-compose up -d --build
```

### Issue: Permission errors

The container runs as user `nodejs` (UID 1001). Ensure the host directories have appropriate permissions:
```bash
chmod -R 755 logs config
```

### Issue: Cannot connect to Discord

Check:
1. `.env` file has valid `DISCORD_BOT_TOKEN`
2. Container has network access: `docker exec court-reserve-bot ping -c 3 discord.com`

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Node.js Best Practices in Docker](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
