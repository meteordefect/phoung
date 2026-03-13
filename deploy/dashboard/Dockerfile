# Multi-stage build for Phoung Dashboard

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build arguments
ARG VITE_API_URL=/api
ARG VITE_GATEWAY_WS_URL=wss://localhost/gateway/ws
ARG VITE_GATEWAY_TOKEN=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GATEWAY_WS_URL=$VITE_GATEWAY_WS_URL
ENV VITE_GATEWAY_TOKEN=$VITE_GATEWAY_TOKEN

# Build application
RUN npm run build

# Production stage - serve with nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
