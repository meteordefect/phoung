# FriendLabs Command API
# Stage 2.C: HTTP API for missions, commands, events, artifacts

FROM node:22-alpine AS builder

WORKDIR /app

# Install all dependencies (including dev for build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Production image
FROM node:22-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built output from builder
COPY --from=builder /app/dist ./dist

# Run as non-root
USER node

EXPOSE 3002

CMD ["node", "dist/index.js"]
