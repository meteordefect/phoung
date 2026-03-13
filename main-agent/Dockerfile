FROM node:20-slim

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

RUN npm prune --production

EXPOSE 8000

CMD ["node", "dist/index.js"]
