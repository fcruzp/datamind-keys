# Contributing to DataMind BI

## Development setup

```bash
bun install
bun run db:push   # apply Prisma schema to SQLite
bun run dev        # starts Next.js on :3000
```

## ⚠️ Known issue: Prisma + Turbopack cache

After **any** change to `prisma/schema.prisma` (e.g. adding a field to a
model), you must regenerate the Prisma Client AND clear the Turbopack cache,
otherwise the running dev server will keep using the old `@prisma/client` and
throw runtime errors like:

```
Unknown field `allowedIps` for select statement on model `ApiKey`.
```

**The fix:**

```bash
bun run db:push          # regenerates @prisma/client
rm -rf .next             # clears Turbopack's module cache
# restart the dev server (kill the old process first if needed)
bun run dev
```

`bun run db:push` alone is NOT enough — Turbopack caches node_modules and
does not invalidate on user-file touches. Deleting `.next/` forces a full
recompile that picks up the new Prisma Client.

This only affects the dev server. Production builds (`bun run build`) always
use the fresh Prisma Client.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server on :3000 |
| `bun run lint` | Run ESLint |
| `bun run build` | Production build |
| `bun run db:push` | Apply schema → DB + regenerate Prisma Client |
| `bun run db:generate` | Regenerate Prisma Client only |
| `bun run db:migrate` | Create a versioned migration (dev) |
| `bash scripts/test-api-keys.sh` | Integration tests for the API Keys feature |

## Architecture notes

### Auth model

This sandbox uses a **deterministic demo user** (`demo@datamind.bi`) instead
of Supabase Auth, so the feature is fully testable without credentials. The
single swap point is `getDemoUser()` in `src/lib/api-auth.ts` — replace it
with Supabase session resolution when porting to the real BIweb repo.

### Two auth patterns

- `/api/settings/*` routes use **session auth** (the logged-in user's
  browser). In the sandbox, this resolves to the demo user.
- `/api/public/v1/*` routes use **Bearer API key auth** (header
  `Authorization: Bearer dm_live_...`) for OpenFN/N8N integrations.

### API key security

- Plaintext is **never stored** — only the SHA-256 hash.
- Plaintext is shown to the user **exactly once** at creation time, via a
  blocking modal that prevents accidental close.
- Keys can be **IP-allowlisted** (exact IP or CIDR, IPv4 + IPv6) and
  **rate-limited** (token bucket, configurable per key, default 60/min).
- Soft-delete via `revokedAt` preserves the audit trail.

### Rate limiting

The rate limiter is **in-memory** (token bucket per API key, persisted
across hot reloads via `globalThis`). This is fine for single-container
deployments (Coolify). For multi-replica production, switch to Redis-backed
(e.g. `@upstash/ratelimit`).

All public API responses include:
- `X-RateLimit-Limit` — the bucket capacity (per minute)
- `X-RateLimit-Remaining` — tokens left
- `Retry-After` — seconds to wait (only on 429 responses)

## Porting to production (Supabase + Postgres)

1. Replace `getDemoUser()` in `src/lib/api-auth.ts` with Supabase session
   resolution (`createServerClient` + `getSession`).
2. Change `prisma/schema.prisma` datasource from `sqlite` to `postgresql`
   and set `DATABASE_URL` to the Supabase connection string.
3. Run `bunx prisma migrate dev --name add_api_keys` to generate a versioned
   migration (better than `db:push` for production).
4. Deploy — Coolify auto-deploys from the `master` branch.

## Style guide

- **Colors**: emerald / sky / rose / amber palette only. NO indigo or blue
  (project rule).
- **Components**: use existing shadcn/ui components in `src/components/ui/`
  — don't build from scratch.
- **Footer**: must be sticky to the bottom (`min-h-screen flex flex-col` on
  the root wrapper + `mt-auto` on the footer).
- **Responsive**: mobile-first; test all breakpoints.
- **Icons**: `lucide-react` only.
- **Toasts**: `sonner` (not the legacy radix toaster).
- **State**: `@tanstack/react-query` for server state, `zustand` for client
  state (if needed).
