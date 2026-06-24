# =============================================================================
# DataMind BI — API Keys Manager
# Multi-stage Dockerfile for Next.js 16 (standalone output) on Coolify
# =============================================================================
# Build with:  docker build -t datamind-keys .
# Run with:    docker run -p 3000:3000 --env-file .env.production datamind-keys
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1 — deps: install all dependencies (including devDeps for build)
# ---------------------------------------------------------------------------
FROM oven/bun:1.1 AS deps

WORKDIR /app

# Install OS libs needed by Prisma + sharp at build time
#   - openssl:    Prisma engine
#   - ca-certificates: HTTPS calls to Supabase
#   - libc6:      sharp native bindings
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl \
      ca-certificates \
      libc6 \
    && rm -rf /var/lib/apt/lists/*

# Copy lockfile + manifests first for better layer caching
COPY package.json bun.lock* ./
COPY prisma ./prisma

# Install with frozen lockfile (reproducible)
RUN bun install --frozen-lockfile

# Generate Prisma Client (needed at build time for type checking + bundling)
RUN bunx prisma generate

# ---------------------------------------------------------------------------
# Stage 2 — builder: compile the Next.js app
# ---------------------------------------------------------------------------
FROM oven/bun:1.1 AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma

COPY . .

# Next.js needs to know it's a production build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* vars are inlined by Next.js at BUILD time, so they MUST be
# present in this builder stage (not just in the runner). The anon key is
# public by design and the URL is a public endpoint.
ENV NEXT_PUBLIC_SUPABASE_URL=https://rsrcdaepiwjqfynwwzcn.supabase.co
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzcmNkYWVwaXdqcWZ5bnd3emNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyOTk2ODYsImV4cCI6MjA5Mzg3NTY4Nn0.SYC-TqLgL01BY59GtPQ7xnzKvjIJFWl9-HYr84K-eZM
ENV NEXT_PUBLIC_SITE_URL=https://datamind-api.mooo.com

# Build the standalone bundle. next.config.ts already has output: "standalone"
# which produces .next/standalone (server.js + minimal node_modules).
RUN bun run build

# ---------------------------------------------------------------------------
# Stage 3 — runner: minimal image that serves the app
# ---------------------------------------------------------------------------
FROM oven/bun:1.1-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl \
      ca-certificates \
      tini \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system --gid 1001 nodejs \
    && adduser  --system --uid 1001 nextjs

# Copy the standalone server (already includes minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Copy static assets that standalone doesn't bundle
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma: we need the schema + generated client at runtime for queries
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# ---------------------------------------------------------------------------
# Runtime environment
# ---------------------------------------------------------------------------
# Core runtime (fixed)
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Public/non-secret Supabase + app vars — baked into the image so Coolify
# only needs 3 secret env vars at runtime (SERVICE_ROLE_KEY, DATABASE_URL,
# DIRECT_URL). These are safe to commit: anon key is public by design,
# publishable key is public, and the URL/SITE_URL are public endpoints.
ENV NEXT_PUBLIC_SUPABASE_URL=https://rsrcdaepiwjqfynwwzcn.supabase.co
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzcmNkYWVwaXdqcWZ5bnd3emNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyOTk2ODYsImV4cCI6MjA5Mzg3NTY4Nn0.SYC-TqLgL01BY59GtPQ7xnzKvjIJFWl9-HYr84K-eZM
ENV SUPABASE_PUBLISHABLE_KEY=sb_publishable_gB8AGof8Nd4UkmblvOjr7g_2aG4KrCy
ENV NEXT_PUBLIC_SITE_URL=https://datamind-api.mooo.com

# Next.js standalone server.js listens on $PORT
EXPOSE 3000

USER nextjs

# tini handles signals properly (SIGTERM for graceful shutdown in Coolify)
ENTRYPOINT ["/usr/bin/tini", "--"]

# bun runs the standalone Node-compatible server.js
CMD ["bun", "server.js"]
