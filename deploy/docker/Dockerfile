# syntax=docker/dockerfile:1.7
#
# One Dockerfile, four targets, because a self-hosted install should not have to trust
# four separately published images to stay in step with each other:
#
#   web        Next.js standalone server (frontend + API routes)
#   worker     background execution loop, scales horizontally
#   scheduler  single-leader dispatch and lease repair
#   migrate    one-shot migration runner, used as an init container
#
# Build arg NEXT_OUTPUT=standalone enables Next's standalone output, which the web target
# needs and which is off unless requested, so hosted builds are unchanged by this file.

ARG NODE_VERSION=22.11.0
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates postgresql-client \
 && apt-get clean \
 && find /var/lib/apt/lists -type f -delete
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS builder
ARG NEXT_OUTPUT=standalone
ENV NEXT_OUTPUT=${NEXT_OUTPUT}
COPY . .
# No DATABASE_URL at build time on purpose: a build that needs production credentials is
# a build that can leak them.
RUN pnpm run build

# ---- web: the smallest runtime surface ---------------------------------------
FROM base AS web
ENV NODE_ENV=production PORT=3000
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin zooka
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER zooka
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# ---- worker / scheduler: source + tsx, because they import @/ aliases ---------
FROM deps AS runtime
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin zooka \
 && mkdir -p /data/storage \
 && chown -R zooka:zooka /data
COPY . .
ENV NODE_ENV=production
USER zooka
# No HEALTHCHECK: a worker's health is its heartbeat row, read by the platform over HTTP.
# A process that is up but claiming nothing should be visible as such, not reported
# healthy by a ping.

# NODE_OPTIONS loads the shim that lets application modules import `server-only` and the
# `@/` alias outside the Next bundler (scripts/selfhost/preload.cjs).
ENV NODE_OPTIONS="--require ./scripts/selfhost/preload.cjs"

FROM runtime AS worker
CMD ["pnpm", "exec", "tsx", "scripts/selfhost/worker-loop.ts"]

FROM runtime AS scheduler
CMD ["pnpm", "exec", "tsx", "scripts/selfhost/scheduler-loop.ts"]

FROM runtime AS migrate
CMD ["pnpm", "exec", "tsx", "scripts/selfhost/migrate.ts"]
