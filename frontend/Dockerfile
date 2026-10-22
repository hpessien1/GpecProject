# GPEC website image: builds the Vite site and serves it with nginx. Build context is frontend/
# (Coolify "Base Directory": /frontend).
#
# Base images pinned to an exact version and multi-architecture digest (checked against Docker Hub on
# 2026-10-21). To upgrade, pull the new tag, read its digest with
# `docker buildx imagetools inspect <tag>`, and update the FROM line. Keep the node image in step with
# backend/Dockerfile.

# ── Build: type-check and bundle the site ────────────────────────────────────
FROM node:22.23.3-alpine3.24@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The API address is compiled into the JavaScript, so it must be set at build time (in Coolify, mark
# the variable as a build variable). The build stops if it is missing or not https, instead of
# shipping a site that quietly calls http://localhost.
ARG VITE_API_BASE_URL
RUN case "$VITE_API_BASE_URL" in \
      https://*) ;; \
      *) echo "VITE_API_BASE_URL must be set to the production API, starting with https:// (got: '$VITE_API_BASE_URL')" >&2; exit 1 ;; \
    esac
RUN npm run build

# The Content-Security-Policy may only allow calls to (and photos from) the same API the bundle was
# built for. The g flag matters: the address appears more than once on the policy's line.
RUN API_ORIGIN="$(node -e 'console.log(new URL(process.argv[1]).origin)' "$VITE_API_BASE_URL")" \
  && sed "s|__API_ORIGIN__|$API_ORIGIN|g" nginx/security-headers.conf > /app/security-headers.conf

# ── Production: static files served by nginx as a non-root user ──────────────
# nginx-unprivileged runs as the "nginx" user and listens on port 8080 instead of 80.
FROM nginxinc/nginx-unprivileged:1.31.7-alpine3.24@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e AS production

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

# 127.0.0.1, not localhost: BusyBox wget may try IPv6 (::1) first, where nginx is not listening.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ > /dev/null || exit 1
