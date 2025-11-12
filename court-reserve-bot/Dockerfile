# Multi-stage build for court-reserve-bot
# Stage 1: Dependencies
FROM node:18-alpine AS dependencies

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Production image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy dependencies from previous stage
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application source
COPY --chown=nodejs:nodejs . .

# Create directories for logs and config with proper permissions
RUN mkdir -p /app/logs /app/config && \
    chown -R nodejs:nodejs /app/logs /app/config

# Switch to non-root user
USER nodejs

# Expose no ports (Discord bot doesn't need exposed ports)
# Health check is not needed for Discord bot

# Set NODE_ENV to production
ENV NODE_ENV=production

# Start the application
CMD ["node", "src/index.js"]
