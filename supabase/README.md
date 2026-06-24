# Supabase Migrations — DataMind BI API Keys Manager

This folder contains the raw SQL migrations that provision the
**API Keys Manager** tables on top of the existing BIweb Supabase project.
They are designed to be **additive** — they do not touch any existing
BIweb table, they only create new ones plus a `user_profiles` extension
joined 1:1 with `auth.users`.

## Files

| File | What it does |
|------|--------------|
| `0001_schema_additions.sql` | Creates `user_profiles`, `api_keys`, `api_request_logs`, `settings_audit_logs`. Adds indexes, the `touch_updated_at()` trigger, the `hash_api_key()` helper, and column comments. |
| `0002_rls_policies.sql` | `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on every table, plus per-table `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies scoped to `auth.uid()`. Also installs the `on_auth_user_created` trigger that auto-provisions a `user_profiles` row on signup. |

## Applying the migrations

You have three options. Pick whichever fits your workflow.

### Option A — Supabase Studio (fastest)

1. Open the Supabase project: <https://supabase.com/dashboard/project/rsrcdaepiwjqfynwwzcn>
2. Go to **SQL Editor → New query**.
3. Paste the contents of `0001_schema_additions.sql` and click **Run**.
4. Open a new tab, paste `0002_rls_policies.sql` and **Run**.
5. Verify: run the sanity-check query at the bottom of `0002` — every
   table should show `relrowsecurity = true` and `relforcerowsecurity = true`.

### Option B — Supabase CLI (recommended for CI/CD)

```bash
# From the repo root
supabase link --project-ref rsrcdaepiwjqfynwwzcn
supabase db push                     # applies all migrations in order
# or, to apply just these two:
supabase migration up
```

The CLI detects files in `supabase/migrations/` automatically and tracks
which ones have been applied in the `supabase_migrations.schema_migrations`
table.

### Option C — psql (any Postgres client)

```bash
# Get the direct connection string from
# Supabase Dashboard → Project Settings → Database → Connection string
psql "postgresql://postgres:[PASSWORD]@db.rsrcdaepiwjqfynwwzcn.supabase.co:5432/postgres" \
  -f supabase/migrations/0001_schema_additions.sql

psql "postgresql://postgres:[PASSWORD]@db.rsrcdaepiwjqfynwwzcn.supabase.co:5432/postgres" \
  -f supabase/migrations/0002_rls_policies.sql
```

## Post-apply checklist

- [ ] `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('user_profiles','api_keys','api_request_logs','settings_audit_logs');` → all `true`
- [ ] Create a test user via Supabase Auth → confirm a `user_profiles` row was auto-inserted by the trigger
- [ ] Sign in with that user from the portal → confirm they see an empty API Keys list (no rows from other users leak through)
- [ ] Generate a key, then run `SELECT id, user_id, key_prefix, label FROM public.api_keys;` as the service role → row should exist with `user_id = <test user uuid>`

## RLS posture summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `user_profiles` | own row | own row | own row | — (cascade only) |
| `api_keys` | own rows | own rows | own rows | own rows |
| `api_request_logs` | own rows (via `api_keys.user_id`) | service role only | service role only | service role only |
| `settings_audit_logs` | own rows | service role only | service role only | service role only |

The public API gateway (`/api/public/v1/*`) authenticates with a Bearer API
key (not a Supabase JWT), so those requests run through the **service role**
client (which bypasses RLS by design). The policies above therefore only
govern the *management* surface (portal UI + `/api/settings/*`), where the
user is logged in via Supabase Auth and their JWT is forwarded.

## Rollback

These migrations are additive. To roll back completely:

```sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.hash_api_key(text) CASCADE;
DROP FUNCTION IF EXISTS public.touch_updated_at() CASCADE;
DROP TABLE IF EXISTS public.settings_audit_logs CASCADE;
DROP TABLE IF EXISTS public.api_request_logs   CASCADE;
DROP TABLE IF EXISTS public.api_keys           CASCADE;
DROP TABLE IF EXISTS public.user_profiles      CASCADE;
```

No existing BIweb table is affected by either applying or rolling back.
