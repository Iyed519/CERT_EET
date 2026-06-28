# Cert_EET — INF03 (US-INFRA-03) — Web (Next.js, App Router) multi-stage Dockerfile
# Stages: deps -> build -> prod-deps -> (development | production)

# ---- Base ----
FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- All dependencies ----
FROM base AS deps
COPY package*.json ./
RUN npm ci

# ---- Build (next build) ----
FROM base AS build
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public
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
CMD ["npm", "run", "dev"]

# ---- Production runtime ----
FROM base AS production
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.* ./
COPY package*.json ./
EXPOSE 3000
CMD ["npm", "run", "start"]
