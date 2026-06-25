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
#
# IMPORTANT: We reference $CACHEBUST in the RUN below. Per Docker docs, an ARG
# that is declared but NOT referenced in any RUN command does NOT invalidate
# the build cache. Referencing it here guarantees that bumping CACHEBUST in
# Coolify forces git clone to re-run and pull the latest commit.
ARG CACHEBUST=6

# Clone the public repo (no credentials needed — repo is public).
# The `echo $CACHEBUST` makes the layer's cache key depend on CACHEBUST, so
# changing it always busts the cache. The `git rev-parse HEAD` logs which
# commit was actually cloned so you can verify the deploy in build logs.
RUN echo "CACHEBUST=$CACHEBUST" && \
    git clone --depth 1 https://github.com/fcruzp/datamind-keys.git . && \
    echo "Deployed commit: $(git rev-parse HEAD)"

# Install dependencies (npm works fine with bun.lock present)
RUN npm install

# Generate Prisma client (needed at build time for type checking + bundling).
# We do NOT run `prisma db push` — the tables are owned by BIweb and already
# exist in the shared Supabase project. This schema is purely for type
# generation + query building (uses @@map to mirror existing tables).
RUN npx prisma generate

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
