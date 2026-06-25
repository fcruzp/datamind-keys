# DataMind BI — API Keys Manager · Roadmap

> This roadmap tracks the evolution of the DataMind API Keys app
> (`datamind-api.mooo.com`). It lives in the repo so anyone (humans or
> AI agents) picking up the project can see what's done, what's next,
> and why.
>
> **Last updated:** 2026-06-25
> **Current deployed version:** `CACHEBUST=18` (Phase 1 live SQL execution — verified end-to-end)

---

## 🎉 Phase 1 COMPLETE (2026-06-25)

**Live SQL execution against uploaded SQLite files is now working in production.**

Verified end-to-end:
- `SELECT name FROM sqlite_master WHERE type='table'` → returned 4 tables in 10ms
- `SELECT * FROM clientes LIMIT 5` → returned 5 real customer rows in 1ms

Architecture:
```
BIweb container              datamind-keys container
   │                              │
   └─── /app/data ◄──────────────┘   (shared bind mount)
            │
            └─── /var/lib/docker/volumes/
                 hyvtdbc00txfcds8pr6oj8ji-datamind-data/_data
                 (host path)
```

---

## Current state (what works today)

| Capability | Status | Notes |
|---|---|---|
| API key management (create / list / edit / revoke) | ✅ Done | Full CRUD with audit log |
| Bearer token authentication | ✅ Done | SHA-256 hashed, never stored plaintext |
| Scope-based authorization (`read`, `execute`, `admin`) | ✅ Done | `admin` implies all scopes |
| Per-key rate limiting (token bucket, 60/min default) | ✅ Done | In-memory, per-key, configurable |
| IP allowlist per key | ✅ Done | Enforced on every request; UI still pending |
| Audit logging (every API request + key management actions) | ✅ Done | `api_request_logs` + `settings_audit_logs` |
| Tenant-scoped `/me` endpoint | ✅ Done | Returns user, key, account stats, tenantName |
| Tenant-scoped `/datasources` endpoint | ✅ Done | Real data from `data_sources` table |
| Tenant-scoped `/dashboards` endpoint | ✅ Done | Real data + widgets from `dashboards` + `dashboard_widgets` |
| Tenant-scoped `/queries` endpoint (live SQL execution) | ✅ Done | Real SELECT against shared volume, 6-layer safety |
| Shared volume mount between BIweb ↔ datamind-keys | ✅ Done | Bind mount at `/app/data`, verified end-to-end |
| OpenFN / N8N integration | ✅ Verified | 4/4 endpoints working end-to-end with real tenant data |
| Supabase Auth integration | ✅ Done | Magic link + password |
| Tenant isolation (data layer) | ✅ Done | Every query filtered by `auth.user.id` or `supabaseId` |
| `user_profiles` auto-creation trigger | ✅ Done | `on_auth_user_created` trigger in Supabase |
| Unified tenant source of truth | ✅ Done | `users.company` with `DEFAULT 'Personal'` |
| Dark mode | ✅ Done | `next-themes` |
| Responsive layout | ✅ Done | Mobile-first, sticky footer |

---

## Roadmap

### Phase 1 — Live SQL execution against uploaded SQLite files

**Why:** The `/queries` endpoint currently returns datasource metadata only.
Users (and OpenFN/N8N workflows) want to run actual `SELECT` queries against
the SQLite files they uploaded via BIweb — e.g. `SELECT * FROM clientes LIMIT
10` against `demo_ecommerce_rd.sqlite`.

**Complexity:** Medium-High
**Priority:** High (unlocks the most value for OpenFN/N8N automation)

#### Tasks

- [x] **1.1 Investigate BIweb's file storage** ✅ DONE (2026-06-25)
  - **Finding:** BIweb stores SQLite files inside a **named Docker volume**
    (`hyvtdbc00tfxcds8pr6o8jl-datamind-data`) mounted at `/app/data` inside
    the BIweb container.
  - Supabase only stores metadata (the `data_sources` table with `file_path`).
  - `file_path` format: `/app/data/{tenant_id}/{filename}.sqlite` (absolute
    container path).
  - **Implication:** datamind-keys runs in a separate container and cannot
    access BIweb's filesystem directly. We need to mount the **same named
    Docker volume** in datamind-keys at `/app/data`.
  - **Next step:** Configure the shared volume in Coolify (see 1.1a).

- [x] **1.1a Configure shared volume in Coolify** ✅ DONE (2026-06-25)
  - **Approach used:** Bind mount via host path (Option A).
  - **Volume:** `hyvtdbc00txfcds8pr6oj8ji-datamind-data`
  - **Host Mountpoint:** `/var/lib/docker/volumes/hyvtdbc00txfcds8pr6oj8ji-datamind-data/_data`
  - **Container mount path (in datamind-keys):** `/app/data`
  - **Coolify config:** Storages → Add → Name `datamind-shared-data`, Source Path = host mountpoint, Destination Path = `/app/data`
  - **Verified:** `ls /app/data/` shows the tenant subfolders from inside datamind-keys container.

- [x] **1.2 Install a SQLite driver** ✅ DONE (Task 24)
  - `better-sqlite3@12.11.1` installed.

- [x] **1.3 Implement `/queries` live execution** ✅ DONE (Task 24, verified 2026-06-25)
  - `src/lib/sqlite-executor.ts` opens the SQLite file in readonly mode and
    executes the validated SELECT, returning `{ rows, rowCount, durationMs }`.
  - 6 safety layers: read-only connection, SELECT-only validation, 13 blocked
    keywords, no multi-statement, row limit subquery wrapping (1000 cap),
    10s timeout.
  - **Verified end-to-end:** `SELECT name FROM sqlite_master WHERE type='table'`
    returned 4 tables (productos, sqlite_sequence, ventas, clientes) in 10ms.
    `SELECT * FROM clientes LIMIT 5` returned 5 real customer rows in 1ms.

- [x] **1.4 Cache open DB handles** ✅ N/A
  - better-sqlite3 is synchronous and fast enough (1-10ms per query) that
    connection pooling/caching is unnecessary. Each request opens, queries,
    and closes the file. If latency becomes an issue, revisit.

- [x] **1.5 Update OpenFN workflow to test live SQL** ✅ READY
  - OpenFN can now call `/queries` with a real SQL string. No code changes
    needed in OpenFN — same endpoint, same auth, same response shape.

#### SQL execution safety rules (ALL IMPLEMENTED in `src/lib/sqlite-executor.ts`)

1. **Read-only connection** — `new Database(path, { readonly: true })`.
2. **SELECT-only** — already enforced, keep the existing check.
3. **Block pragma/attach** — reject SQL containing `PRAGMA`, `ATTACH`,
   `DETACH`, `VACUUM`, `REINDEX` (case-insensitive).
4. **Row limit** — `LIMIT` injection: wrap the user SQL in a subquery if no
   `LIMIT` is present: `SELECT * FROM (<user_sql>) LIMIT <max>`.
5. **Query timeout** — set a 10s timeout via `better-sqlite3`'s `timeout`
   option (for busy waits) + a `AbortController` wrapper.
6. **No DDL/DML** — the SELECT-only check handles this, but double-check
   by parsing the SQL with `sql-parser-cst` or similar.

---

### Phase 2 — SQLite file upload/update via API (OpenFN/N8N automation)

**Why:** Allow OpenFN/N8N workflows to **upload or replace** the SQLite file
associated with a datasource. This enables automation pipelines like:
"fetch data from external API → build SQLite → upload to BIweb → refresh
dashboards".

**Complexity:** High
**Priority:** Medium-High (depends on Phase 1 being stable)
**Requires new scope:** `write` (distinct from `execute`)
**Storage:** Writes directly to the shared volume at
`/home/z/my-project/upload/{file_name}` (same as BIweb).

#### Tasks

- [ ] **2.1 Add `write` scope**
  - Update `ALL_SCOPES` in `src/lib/api-auth.ts` to include `'write'`.
  - `admin` scope already implies `write`.
  - Update the scope badge UI + OpenAPI spec.

- [ ] **2.2 `POST /api/public/v1/datasources` (upload)**
  - Accepts `multipart/form-data` with the SQLite file + a `name` field.
  - Writes the file to `/home/z/my-project/upload/{generated_id}.sqlite`
    on the shared volume.
  - Creates a `data_sources` row with the file metadata + `file_path`.
  - Tenant-scoped: the new datasource's `user_id` = `auth.user.id`.
  - Returns the new datasource metadata.
  - **Note:** BIweb and datamind-keys share the same upload directory, so
    the new file is immediately visible to both apps.

- [ ] **2.3 `PUT /api/public/v1/datasources/:id` (replace file)**
  - Accepts a new SQLite file, writes it to the same `file_path` on the
    shared volume, bumps `updated_at` (invalidates the handle cache from
    Phase 1.4).
  - Ownership check: `where: { id, userId: auth.user.id }` → 404 if not owned.
  - Keeps the same `data_sources.id` and `name`; only the file changes.
  - **Atomic write:** write to a temp file, then rename (avoid partial writes
    that could corrupt ongoing queries from BIweb).

- [ ] **2.4 `DELETE /api/public/v1/datasources/:id`**
  - Soft delete vs hard delete decision needed.
  - Removes the file from the shared volume + deletes the `data_sources` row.
  - Cascade: what happens to dashboards/widgets that reference this datasource?
    Probably: block deletion if widgets reference it, or null out their
    `data_source_id`.

- [ ] **2.5 Update OpenFN test workflow**
  - Add a step that uploads a test SQLite, then queries it, then deletes it.

---

### Phase 3 — Frontend UI for advanced API key options

**Why:** The API supports `allowedIps` and `rateLimitPerMinute` per key, but
the create/edit dialogs don't expose them. Users have to set them via raw
SQL or API calls.

**Complexity:** Low-Medium
**Priority:** Medium

#### Tasks

- [ ] **3.1 IP allowlist field in create dialog**
  - Add a "Tag input" component for IP addresses (comma-separated or
    chip-based). Validate each entry is a valid IPv4/IPv6/CIDR.
  - Store as JSON array in `allowed_ips`.
  - Empty array = allow all IPs (current default).

- [ ] **3.2 IP allowlist field in edit dialog**
  - Same component, pre-populated with current values.
  - Invalidation: `qc.invalidateQueries(['api-keys'])` + `['auth-me']`.

- [ ] **3.3 Rate limit field (slider or number input)**
  - Range: 1–600 requests/minute. Default: 60.
  - Null/empty = use global default (60).
  - Help text: "Overrides the global 60 req/min limit for this key."

- [ ] **3.4 Display effective rate limit in the keys table**
  - Show `rateLimitPerMinute ?? 'default (60)'` in a new column.

- [ ] **3.5 Display IP allowlist status**
  - Show "All IPs" if empty, or the count + first IP if non-empty
    (tooltip for the full list).

---

### Phase 4 — Query history endpoint

**Why:** Expose the `query_histories` table so OpenFN/N8N can retrieve past
NL→SQL query results for a tenant. Useful for audit + re-running queries.

**Complexity:** Low
**Priority:** Medium-Low

#### Tasks

- [ ] **4.1 `GET /api/public/v1/queries/history`**
  - Returns the caller's query history, tenant-scoped via the datasource
    ownership chain:
    ```ts
    db.queryHistory.findMany({
      where: { dataSource: { userId: auth.user.id } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    ```
  - Supports `?datasourceId=` filter + `?limit=` (default 50, max 200).

- [ ] **4.2 `GET /api/public/v1/queries/history/:id`**
  - Single query history row, ownership-checked.

- [ ] **4.3 Update OpenAPI spec**
  - Add the new endpoints to `/api/openapi.json`.

---

### Phase 5 — Observability & monitoring

**Why:** As API usage grows, we need visibility into usage patterns, errors,
and performance. Currently we log to `api_request_logs` but don't surface it
beyond the dashboard count.

**Complexity:** Medium
**Priority:** Medium-Low

#### Tasks

- [ ] **5.1 Usage analytics dashboard**
  - A new "Analytics" tab in the portal showing:
    - Requests per day (line chart)
    - Top endpoints by volume (bar chart)
    - Error rate (4xx/5xx as % of total)
    - p50/p95 latency per endpoint
  - Powered by `api_request_logs` + TanStack Query.

- [ ] **5.2 Per-key usage breakdown**
  - Click a key in the table → drawer with that key's usage stats.
  - Includes endpoint breakdown + recent requests.

- [ ] **5.3 Alerting (future)**
  - Email/Slack alert when a key hits 80% of its rate limit.
  - Alert on sustained 5xx error rate.

---

### Phase 6 — Security hardening

**Why:** Before opening the API to broader use, harden the security surface.

**Complexity:** Medium
**Priority:** Medium (do before significant adoption)

#### Tasks

- [ ] **6.1 Key rotation**
  - `POST /api/public/v1/keys/:id/rotate` — creates a new key hash, returns
    the new plaintext once, invalidates the old hash.
  - Keeps the same label/scopes/allowlist.

- [ ] **6.2 Webhook signing**
  - If we add webhooks (e.g. "notify when a key is revoked"), sign them
    with HMAC-SHA256 so receivers can verify authenticity.

- [ ] **6.3 Audit log retention policy**
  - Currently we keep logs forever. Add a 90-day retention with automatic
    cleanup (cron job or Supabase function).

- [ ] **6.4 IP allowlist CIDR support**
  - Currently we do exact string match. Support CIDR ranges
    (e.g. `192.168.0.0/16`) using the `ip-cidr` package.

---

## Architecture decisions (for context)

### Tenant isolation convention

The shared Supabase DB has **two different `user_id` conventions** (verified
empirically):

| Table | `user_id` type | References | Filter with |
|---|---|---|---|
| `users` (text cuid) | — | — | — |
| `api_keys` | uuid | `auth.users.id` | `auth.user.supabaseId` |
| `settings_audit_logs` | uuid | `auth.users.id` | `auth.user.supabaseId` |
| `user_profiles` | uuid | `auth.users.id` | `auth.user.supabaseId` |
| `data_sources` | text | `users.id` (cuid) | `auth.user.id` |
| `dashboards` | text | `users.id` (cuid) | `auth.user.id` |
| `dashboard_widgets` | text | `dashboards.id` | (via dashboard) |

**Why the split:** BIweb's original tables (`users`, `data_sources`,
`dashboards`) use the app-generated cuid. The auth-related tables
(`api_keys`, `user_profiles`, `settings_audit_logs`) use the Supabase Auth
UUID. This is a historical artifact — we live with it rather than migrate.

### Tenant name source of truth

**Source of truth:** `users.company` (with `DEFAULT 'Personal'`).

The `/me` endpoint resolves `tenantName` with a cascading fallback:
1. `user_profiles.tenant_name` (if it exists — populated by trigger)
2. `users.company` (BIweb's actual source of truth)
3. `'Personal'` (final default)

This means BIweb doesn't need to change its code. datamind-keys adapts to
the existing schema.

### No Prisma `db push` in production

The Dockerfile runs only `prisma generate` (never `prisma db push`). The
Prisma schema is used purely for type generation + query building. All
tables are owned by BIweb — we mirror them with `@@map()` and never alter
the physical schema.

### API auth vs. Supabase Auth

- **Portal UI** (this app): Supabase Auth (magic link / password) → session
  cookie → `getCurrentUser()`.
- **Public API** (`/api/public/v1/*`): Bearer token → `authenticateApiKey()`
  → resolves to the same `User` row. No Supabase session needed.

This dual-auth allows OpenFN/N8N to call the API with a long-lived API key
without dealing with Supabase session management.

---

## How to pick up work from this roadmap

1. Read this file (`ROADMAP.md`) to see what's done and what's next.
2. Read `/home/z/my-project/worklog.md` for the detailed history of what's
   been implemented (task-by-task).
3. Pick a task from the roadmap. Update its checkboxes as you go.
4. Append a new `Task ID` section to `worklog.md` when done.
5. Bump `CACHEBUST` in Coolify to deploy.

**Suggested next task:** Phase 1.1 (investigate BIweb's file storage) — it's
the prerequisite for the highest-value feature (live SQL execution).
