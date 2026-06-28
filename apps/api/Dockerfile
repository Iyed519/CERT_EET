# Cert_EET — INF03 (US-INFRA-03) — API (NestJS) multi-stage Dockerfile
# Stages: deps -> build -> prod-deps -> (development | production)

# ---- Base ----
FROM node:20-alpine AS base
WORKDIR /app

# ---- All dependencies (needed to compile) ----
FROM base AS deps
COPY package*.json ./
RUN npm ci

# ---- Build (TypeScript -> dist/) ----
FROM base AS build
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Production dependencies only ----
FROM base AS prod-deps
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Development (hot reload, used by docker-compose.dev.yml) ----
FROM base AS development
ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# ---- Production runtime (small image, non-root) ----
FROM base AS production
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
USER node
EXPOSE 3000
# NOTE: verify your build output entry. Nest CLI default = dist/main.js
CMD ["node", "dist/main.js"]
