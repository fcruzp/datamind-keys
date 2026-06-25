# Setup Guide: datamind-keys ↔ BIweb Shared SQLite Volume

> This guide explains, step by step, how to configure the `datamind-keys`
> container so it can read the SQLite files that `BIweb` users upload.
> It also documents how to test the `/queries` API endpoint from
> Windows PowerShell (which has a notorious `curl` quirk).
>
> **Use this guide if:**
> - You need to rebuild the `datamind-keys` container from scratch
> - You moved to a new Coolify server
> - You added a new BIweb tenant and the volume isn't showing up
> - You forgot how to test the API from Windows
>
> **Last verified working:** 2026-06-25 (CACHEBUST=18)

---

## Table of Contents

- [Part A: Architecture overview](#part-a-architecture-overview)
- [Part B: Identify BIweb's storage layout](#part-b-identify-biwebs-storage-layout)
- [Part C: Find the host path of BIweb's volume](#part-c-find-the-host-path-of-biwebs-volume)
- [Part D: Configure the shared volume in datamind-keys](#part-d-configure-the-shared-volume-in-datamind-keys)
- [Part E: Redeploy and verify](#part-e-redeploy-and-verify)
- [Part F: Test the API from Windows PowerShell](#part-f-test-the-api-from-windows-powershell)
- [Part G: Troubleshooting](#part-g-troubleshooting)

---

## Part A: Architecture overview

Two separate Coolify-managed Docker containers:

```
┌─────────────────────┐         ┌──────────────────────┐
│   BIweb container   │         │ datamind-keys        │
│                     │         │   container          │
│  Writes SQLite to   │         │                      │
│  /app/data/...      │         │  Reads SQLite from   │
│                     │         │  /app/data/...       │
└──────────┬──────────┘         └──────────┬───────────┘
           │                               │
           │   same Docker named volume    │
           │   (bind-mounted to host)      │
           └─────────────┬─────────────────┘
                         │
                         ▼
              /var/lib/docker/volumes/
              hyvtdbc00txfcds8pr6oj8ji-datamind-data/_data
              (host filesystem)
```

**Key facts:**
- BIweb stores uploaded SQLite files at `/app/data/{tenant_id}/{filename}.sqlite`
  (absolute container path).
- The `file_path` column in Supabase's `data_sources` table stores this path.
- BIweb's `/app/data` is a **named Docker volume** managed by Coolify
  (`hyvtdbc00txfcds8pr6oj8ji-datamind-data`).
- `datamind-keys` runs in a separate container, so it cannot access BIweb's
  filesystem by default — we must mount the **same host path** into both
  containers.
- `datamind-keys` reads the SQLite files in **read-only mode** using
  `better-sqlite3` (see `src/lib/sqlite-executor.ts`).

---

## Part B: Identify BIweb's storage layout

### Step B.1 — Confirm the file_path format in Supabase

Open the **Supabase Dashboard → SQL Editor** and run:

```sql
SELECT id, name, file_type, file_path, status, file_size, created_at
FROM data_sources
ORDER BY created_at DESC
LIMIT 10;
```

You should see rows like:

| id | name | file_type | file_path | status |
|---|---|---|---|---|
| cmp3flx2j... | Demo: E-Commerce RD | sqlite | `/app/data/cmp3flmly.../demo_ecommerce_rd.sqlite` | ready |

**Confirm:**
- `file_path` starts with `/app/data/` (absolute container path inside BIweb)
- Each tenant/workspace has its own subfolder under `/app/data/`

### Step B.2 — Find the volume name in Coolify

1. Open Coolify (e.g. `http://YOUR_SERVER_IP:8000/`)
2. Navigate to your project → **BIweb** service
3. Open the **Storages** tab
4. You should see a row like:

| Field | Value |
|---|---|
| Volume Name | `hyvtdbc00txfcds8pr6oj8ji-datamind-data` |
| Source Path | *(empty — it's a named Docker volume)* |
| Destination Path | `/app/data` |

**Copy the Volume Name exactly** (we'll need it in Part C).

> ⚠️ The Volume Name has a long prefix (`hyvtdbc00txfcds8pr6oj8ji-`) that
> Coolify auto-generates from the application UUID. Don't try to type it
> from memory — copy it.

---

## Part C: Find the host path of BIweb's volume

We need the **host filesystem path** where Docker stores this volume's data,
so we can bind-mount the same path into `datamind-keys`.

### Step C.1 — SSH into the Coolify server

Use any SSH client. The recommended one is **Termius** (cross-platform,
user-friendly), but the built-in terminal works too.

**Connection details:**
- Host: `187.127.249.13` (replace with YOUR server IP if different)
- Port: `22` (default)
- Username: `root`
- Password: the one set when the server was created
  (or SSH key, if configured)

**From a terminal (PowerShell on Windows, Terminal on Mac/Linux):**
```bash
ssh root@187.127.249.13
```

- If asked `Are you sure you want to continue connecting?` → type `yes`
- Type the password (it won't show anything while typing — that's normal)

**If you see a prompt like `root@srv1614431:~#` → you're in.**

### Step C.2 — List all Docker volumes

```bash
docker volume ls
```

You'll see something like:
```
DRIVER    VOLUME NAME
local     coolify-db
local     coolify-redis
local     dfte0q7lb9ykfeu93hzolzg9_hermes-data
local     hyvtdbc00txfcds8pr6oj8ji-datamind-data
local     traefik-letsencrypt
local     traefik_traefik-letsencrypt
```

Find the row matching the Volume Name from Step B.2
(`hyvtdbc00txfcds8pr6oj8ji-datamind-data` in this example).

> ⚠️ **If you don't see the exact name**, look for one that ends in
> `-datamind-data`. Coolify prefixes the name with the app UUID, so the
> prefix may differ slightly from what the UI showed (especially if you
> read it from a screenshot).

### Step C.3 — Inspect the volume to get the host Mountpoint

```bash
docker volume inspect hyvtdbc00txfcds8pr6oj8ji-datamind-data
```

(Replace with your actual Volume Name.)

Output:
```json
[
    {
        "CreatedAt": "2026-05-12T02:54:33Z",
        "Driver": "local",
        "Labels": { ... },
        "Mountpoint": "/var/lib/docker/volumes/hyvtdbc00txfcds8pr6oj8ji-datamind-data/_data",
        "Name": "hyvtdbc00txfcds8pr6oj8ji-datamind-data",
        "Options": null,
        "Scope": "local"
    }
]
```

**Copy the `Mountpoint` value.** This is the host path:
```
/var/lib/docker/volumes/hyvtdbc00txfcds8pr6oj8ji-datamind-data/_data
```

### Step C.4 — Verify the volume has data

```bash
ls /var/lib/docker/volumes/hyvtdbc00txfcds8pr6oj8ji-datamind-data/_data/
```

You should see tenant subfolders like:
```
cmp3azh230003ms01kb1mbyqg  cmp3flmly0000s201y43kix9m
```

If you see the tenant folders → ✅ the volume is correct.

### Step C.5 — Exit SSH

```bash
exit
```

---

## Part D: Configure the shared volume in datamind-keys

### Step D.1 — Open datamind-keys in Coolify

1. In Coolify, go to your project → **datamind-keys** service
2. Open the **Storages** tab
3. Click **+ Add Storage** (or similar button)
4. Choose **"Directory Mount"** (also called "Bind Mount" in some versions)

   > ⚠️ **Do NOT choose "Volume mount"** even though the source is a Docker
   > volume. Coolify's "Volume mount" creates a NEW named volume prefixed
   > with the datamind-keys app UUID — that would be a different volume
   > than BIweb's. We need to bind directly to the host path.

### Step D.2 — Fill the form

| Field | Value |
|---|---|
| **Name** | `datamind-shared-data` *(any label you want)* |
| **Source Path** | `/var/lib/docker/volumes/hyvtdbc00txfcds8pr6oj8ji-datamind-data/_data` *(the Mountpoint from C.3)* |
| **Destination Path** | `/app/data` |

### Step D.3 — Save

Click **Save** or **Add**. The new storage entry should appear in the list.

---

## Part E: Redeploy and verify

### Step E.1 — Bump the CACHEBUST env var

1. In Coolify → datamind-keys → **Configuration** (or **General**) tab
2. Find the `CACHEBUST` environment variable
3. Increment its value (e.g. from `17` → `18`)
4. Click **Save**

### Step E.2 — Deploy

Click the **Deploy** button. Wait for the build to complete (1-3 minutes).

### Step E.3 — Verify the volume inside datamind-keys

1. In Coolify → datamind-keys → **Terminal** tab
   (or click "Exec" / "Terminal" button)
2. Run:

```bash
ls /app/data/
```

You should see the same tenant folders as in Step C.4:
```
cmp3azh230003ms01kb1mbyqg  cmp3flmly0000s201y43kix9m
```

✅ If you see the folders → the shared volume is working.

### Step E.4 — Verify a single file is readable

```bash
ls /app/data/cmp3flmly0000s201y43kix9m/
```

You should see `.sqlite` files (e.g. `demo_ecommerce_rd.sqlite`).

---

## Part F: Test the API from Windows PowerShell

> This section exists because Windows PowerShell aliases `curl` to
> `Invoke-WebRequest`, which does NOT accept `-H "Header: value"` syntax
> the way real curl does. This trips up everyone.

### Step F.1 — Get an API key

Sign in to `https://datamind-api.mooo.com` with a user account,
go to API Keys, and create a key (or use an existing one).

Example key (Boceto's demo key): `dm_live_3Pzpzuz50Bncy0iNAq56WohTIsmSXA3z`

### Step F.2 — Get a datasourceId

Run this query in Supabase SQL Editor:
```sql
SELECT id, name FROM data_sources WHERE user_id = '<your-user-id>' LIMIT 5;
```

Or, if you don't know your user_id, just look at the rows from Part B.1
and copy any `id`.

### Step F.3 — Test the /queries endpoint (recommended way)

**Open PowerShell** and paste these 3 lines (replace API key + datasourceId):

```powershell
$headers = @{ "Authorization" = "Bearer dm_live_3Pzpzuz50Bncy0iNAq56WohTIsmSXA3z" }
$body = @{ datasourceId = "cmp3flx2j0004s201d862fg03"; sql = "SELECT name FROM sqlite_master WHERE type='table' LIMIT 10" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://datamind-api.mooo.com/api/public/v1/queries" -Method Post -Headers $headers -ContentType "application/json" -Body $body
```

**Expected response:**
```
ok           : True
sql          : SELECT name FROM sqlite_master WHERE type='table' LIMIT 10
datasourceId : cmp3flx2j0004s201d862fg03
rowCount     : 4
durationMs   : 10
rows         : {@{name=productos}, @{name=sqlite_sequence}, @{name=ventas}, @{name=clientes}}
```

### Step F.4 — Test with a real SELECT against data

```powershell
$headers = @{ "Authorization" = "Bearer dm_live_3Pzpzuz50Bncy0iNAq56WohTIsmSXA3z" }
$body = @{ datasourceId = "cmp3flx2j0004s201d862fg03"; sql = "SELECT * FROM clientes LIMIT 5" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://datamind-api.mooo.com/api/public/v1/queries" -Method Post -Headers $headers -ContentType "application/json" -Body $body
```

**Expected response:**
```
ok           : True
sql          : SELECT * FROM clientes LIMIT 5
datasourceId : cmp3flx2j0004s201d862fg03
rowCount     : 5
durationMs   : 1
rows         : {@{id=1; nombre=María García; email=maria@email.com; ...}, ...}
```

### Step F.5 — Using real curl on Windows (alternative)

If you prefer real `curl` over `Invoke-RestMethod`, use `curl.exe`
(the `.exe` suffix is required to bypass the PowerShell alias):

```powershell
curl.exe -X POST https://datamind-api.mooo.com/api/public/v1/queries `
  -H "Authorization: Bearer dm_live_3Pzpzuz50Bncy0iNAq56WohTIsmSXA3z" `
  -H "Content-Type: application/json" `
  -d '{\"datasourceId\":\"cmp3flx2j0004s201d862fg03\",\"sql\":\"SELECT name FROM sqlite_master WHERE type=\\\"table\\\" LIMIT 10\"}'
```

Note: the backtick `` ` `` is PowerShell's line continuation, and the
backslash escapes are needed for the JSON quotes. This is why
`Invoke-RestMethod` (Step F.3) is **strongly recommended** instead.

### Step F.6 — From Mac/Linux terminal (no PowerShell issues)

```bash
curl -X POST https://datamind-api.mooo.com/api/public/v1/queries \
  -H "Authorization: Bearer dm_live_3Pzpzuz50Bncy0iNAq56WohTIsmSXA3z" \
  -H "Content-Type: application/json" \
  -d '{"datasourceId":"cmp3flx2j0004s201d862fg03","sql":"SELECT name FROM sqlite_master WHERE type=\"table\" LIMIT 10"}'
```

---

## Part G: Troubleshooting

### G.1 — `curl: (6) Could not resolve host: SELECT` on Windows

You're using `curl` in PowerShell. PowerShell aliases it to
`Invoke-WebRequest`, which mangles the JSON.

**Fix:** Use `Invoke-RestMethod` (Step F.3) or `curl.exe` (Step F.5).
**Do NOT** use plain `curl`.

### G.2 — `Error response from daemon: no such volume` when running docker volume inspect

The volume name has a typo. Run `docker volume ls` and copy the EXACT
name from there. Coolify's UUID prefixes are easy to misread (e.g.
`fxcds8pr6o8jl` vs `txfcds8pr6oj8ji`).

### G.3 — `/queries` returns `503` with "SQLite file not found"

The shared volume is not mounted in datamind-keys. Re-check:
1. Coolify → datamind-keys → Storages → does the entry exist?
2. Is the Source Path exactly the Mountpoint from `docker volume inspect`?
3. Is the Destination Path exactly `/app/data`?
4. Did you redeploy after adding the storage?
5. Inside the container, does `ls /app/data/` show the tenant folders?

### G.4 — `/queries` returns `404` or `403`

The API key doesn't have access to the requested `datasourceId`, or the
datasource doesn't belong to the API key's user. Every query is
tenant-scoped — you can only query datasources owned by the API key's user.

### G.5 — `Permission denied (publickey)` when SSH-ing

The server only accepts SSH keys, not passwords. Either:
- Configure an SSH key in `~/.ssh/authorized_keys` on the server, OR
- Use Coolify's built-in **Terminal** feature (Servers → your server →
  Terminal button) which doesn't require SSH from your machine.

### G.6 — Coolify "Volume mount" creates a NEW volume instead of sharing BIweb's

This is expected behavior. Coolify v4 prefixes named volumes with the
application's UUID, so a new volume named `datamind-data` in datamind-keys
becomes `{datamind-keys-uuid}-datamind-data` — a DIFFERENT volume from
BIweb's.

**Fix:** Use "Directory Mount" (bind to host path) instead, as described
in Part D. The host path is the same physical storage regardless of which
container accesses it.

### G.7 — UTF-8 characters show as mojibake in PowerShell

Example: `MarÃa GarcÃa` instead of `María García`.

This is a PowerShell display issue only — the API returns proper UTF-8
JSON. To fix display in PowerShell:

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```

Or save the response to a file and open it:
```powershell
$response | ConvertTo-Json -Depth 10 | Out-File -FilePath response.json -Encoding utf8
```

### G.8 — `/queries` returns `400` with "Multiple SQL statements are not permitted"

The SQL contains a semicolon (`;`) in the middle. Remove it.
Only a trailing semicolon is allowed (and is stripped automatically).

### G.9 — `/queries` returns `400` with "Only SELECT (or WITH ... SELECT) statements are permitted"

The SQL doesn't start with `SELECT` or `WITH`. The executor enforces
SELECT-only — no `INSERT`, `UPDATE`, `DELETE`, `PRAGMA`, `CREATE`,
`ATTACH`, etc. See `src/lib/sqlite-executor.ts` for the full list of
blocked keywords.

---

## Appendix: Quick reference card

### The 3 critical values

| What | Value |
|---|---|
| BIweb's volume name | `hyvtdbc00txfcds8pr6oj8ji-datamind-data` |
| Host Mountpoint | `/var/lib/docker/volumes/hyvtdbc00txfcds8pr6oj8ji-datamind-data/_data` |
| Container mount path | `/app/data` |

### The 5-step setup (TL;DR)

1. SSH to Coolify server
2. `docker volume inspect hyvtdbc00txfcds8pr6oj8ji-datamind-data` → note Mountpoint
3. Coolify → datamind-keys → Storages → Add Directory Mount:
   - Source = Mountpoint, Destination = `/app/data`
4. Bump `CACHEBUST` env var, deploy
5. Verify: `ls /app/data/` inside the container shows tenant folders

### The PowerShell test snippet (TL;DR)

```powershell
$headers = @{ "Authorization" = "Bearer YOUR_API_KEY" }
$body = @{ datasourceId = "YOUR_DATASOURCE_ID"; sql = "SELECT * FROM clientes LIMIT 5" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://datamind-api.mooo.com/api/public/v1/queries" -Method Post -Headers $headers -ContentType "application/json" -Body $body
```
