# =============================================================================
# DataMind BI — API Keys Manager
# Autonomous Dockerfile for Coolify "Dockerfile" resource (no build context).
# Clones the public repo fcruzp/datamind-keys at build time via git clone.
# Pattern adapted from BIweb (datamind.mooo.com).
# =============================================================================

FROM node:20-alpine AS base

# git: clone repo · libc6-compat: prisma engine · python3/make/g++: native deps
# openssl: prisma query engine
RUN apk add --no-cache git libc6-compat python3 make g++ openssl

# ---------------------------------------------------------------------------
# Stage 1 — deps: clone repo + install + generate prisma client
# ---------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Cache-bust: change this value in Coolify (1 → 2 → 3...) each time you push
# new code to the repo, to force Docker to re-run git clone and pull the
# latest commit instead of using a cached layer.
ARG CACHEBUST=1

# Clone the public repo (no credentials needed — repo is public)
RUN git clone --depth 1 https://github.com/fcruzp/datamind-keys.git .

# Install dependencies (npm works fine with bun.lock present)
RUN npm install

# Generate Prisma client (needed at build time for type checking + bundling)
RUN npx prisma generate

# Push schema to Postgres (creates tables if they don't exist).
# Uses DIRECT_URL (direct connection, not pgbouncer) for DDL operations.
# DATABASE_URL and DIRECT_URL must be available at build time (Coolify passes
# env vars to the build by default).
RUN npx prisma db push --accept-data-loss

# ---------------------------------------------------------------------------
# Stage 2 — builder: compile Next.js standalone
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Copy everything from deps (source + node_modules + generated prisma)
COPY --from=deps /app .

# Next.js needs to know it's a production build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* vars are inlined by Next.js at BUILD time — must be present here.
# These are public/non-secret values (anon key is public by design).
ENV NEXT_PUBLIC_SUPABASE_URL=https://rsrcdaepiwjqfynwwzcn.supabase.co
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzcmNkYWVwaXdqcWZ5bnd3emNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyOTk2ODYsImV4cCI6MjA5Mzg3NTY4Nn0.SYC-TqLgL01BY59GtPQ7xnzKvjIJFWl9-HYr84K-eZM
ENV NEXT_PUBLIC_SITE_URL=https://datamind-api.mooo.com

# Build the standalone bundle (next.config.ts has output: "standalone")
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3 — runner: minimal production image
# ---------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema and runtime dependencies (needed for DB queries at runtime)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# ---------------------------------------------------------------------------
# Public env vars baked into the image (non-secret)
# Coolify only needs 3 secret vars at runtime: SERVICE_ROLE_KEY, DATABASE_URL, DIRECT_URL
# ---------------------------------------------------------------------------
ENV NEXT_PUBLIC_SUPABASE_URL=https://rsrcdaepiwjqfynwwzcn.supabase.co
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzcmNkYWVwaXdqcWZ5bnd3emNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyOTk2ODYsImV4cCI6MjA5Mzg3NTY4Nn0.SYC-TqLgL01BY59GtPQ7xnzKvjIJFWl9-HYr84K-eZM
ENV SUPABASE_PUBLISHABLE_KEY=sb_publishable_gB8AGof8Nd4UkmblvOjr7g_2aG4KrCy
ENV NEXT_PUBLIC_SITE_URL=https://datamind-api.mooo.com
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
