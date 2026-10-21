# GPEC API image. Build context is backend/ (Coolify "Base Directory": /backend).
#
# Base image pinned to an exact version and its multi-architecture digest (checked against Docker Hub
# on 2026-10-21: Node 22.23.3, Alpine 3.24.2, works on x86 and ARM servers). To upgrade, pull the new
# tag, read its digest with `docker buildx imagetools inspect <tag>`, and update both FROM lines.

# ── Build: compile TypeScript to dist/ ────────────────────────────────────────
FROM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS builder

WORKDIR /app

# mongodb-memory-server (a test-only dependency) would otherwise download a MongoDB binary on install.
ENV MONGOMS_DISABLE_POSTINSTALL=1

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Production: compiled code and runtime dependencies only ──────────────────
FROM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS production

WORKDIR /app

# Turns on the "gpec" database guard, the production rate limit, and trust of Coolify's proxy
# (src/server.ts, src/config.ts). Do not remove.
ENV NODE_ENV=production
ENV PORT=5001

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# The image ships a non-root "node" user. The app never writes to disk, so no extra permissions.
USER node

EXPOSE 5001

# Healthy only when the process serves HTTP and MongoDB answers a ping within 2 seconds
# (src/services/health.ts); otherwise /api/health returns 503.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5001/api/health || exit 1

CMD ["node", "dist/server.js"]
