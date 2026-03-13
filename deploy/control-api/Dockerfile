# Multi-stage build for Phoung Control API

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install system tools needed at runtime: ssh-keygen for key generation, git for repo cloning
RUN apk add --no-cache openssh-client git

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy migrations (SQL files are not compiled by TypeScript)
COPY src/migrations ./dist/migrations

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

EXPOSE 3001

CMD ["node", "dist/index.js"]
