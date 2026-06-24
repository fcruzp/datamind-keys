# Despliegue en Coolify — DataMind BI · API Keys Manager

Dominio: **`datamind-api.mooo.com`**
Repo: `fcruzp/datamind-keys` (**público** — necesario para que el Dockerfile haga `git clone`)
Backend: Supabase `rsrcdaepiwjqfynwwzcn` (compartido con BIweb)
Recurso Coolify: **Dockerfile** (igual que `datamind.mooo.com`)

---

## Cómo funciona

El Dockerfile es **autónomo**: en lugar de `COPY . .` (que requiere un contexto
de build), hace `git clone https://github.com/fcruzp/datamind-keys.git` dentro
del propio Dockerfile. Por eso el repo debe ser público.

Patrón adaptado del Dockerfile de BIweb (`datamind.mooo.com`):
- `node:20-alpine` como base
- 3 stages: `deps` → `builder` → `runner`
- `npm install` + `npx prisma generate` + `npm run build`
- Runner minimal con usuario `nextjs` non-root
- `CMD ["node", "server.js"]` (standalone output)

---

## Paso 1 — Aplicar migraciones en Supabase

1. Ve a **Supabase Dashboard** → proyecto `rsrcdaepiwjqfynwwzcn`
2. **SQL Editor** → **New query**
3. Pega el contenido de `supabase/migrations/0001_schema_additions.sql` → **Run**
4. Nuevo query → pega `supabase/migrations/0002_rls_policies.sql` → **Run**
5. Verifica en **Table Editor** que ves las 4 tablas nuevas con candado RLS.

---

## Paso 2 — Obtener las connection strings de Postgres

1. Supabase Dashboard → **Project Settings** → **Database**
2. Sección **Connection string** → pestaña **Transaction pooler**:
   - URL con puerto **6543** y `?pgbouncer=true` → esa es `DATABASE_URL`
3. Pestaña **Session pooler** o **Direct connection**:
   - URL con puerto **5432** → esa es `DIRECT_URL`
4. Sustituye `[YOUR-PASSWORD]` por la contraseña del rol `postgres`.

Formato esperado (región us-east-1):
```
DATABASE_URL=postgresql://postgres.rsrcdaepiwjqfynwwzcn:PASS@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.rsrcdaepiwjqfynwwzcn:PASS@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

---

## Paso 3 — Configurar Auth redirect URLs en Supabase

1. Supabase Dashboard → **Authentication** → **URL Configuration**
2. **Site URL**: `https://datamind-api.mooo.com`
3. **Redirect URLs**: añade
   - `https://datamind-api.mooo.com/api/auth/callback`
   - `https://datamind-api.mooo.com/**`

---

## Paso 4 — Crear el recurso en Coolify (opción "Dockerfile")

1. Coolify → **+ New Resource** → selecciona **Dockerfile** (NO "Public Repository")
2. Coolify te lleva a un editor de texto donde pegar el Dockerfile
3. Pega el contenido completo del `Dockerfile` del repo
4. **Save**
5. En **Configuration**:
   - **Domains**: `datamind-api.mooo.com`
   - **Ports Exposes**: `3000`
6. **Environment Variables** — solo 3 (las secretas):
   - `SUPABASE_SERVICE_ROLE_KEY` = `eyJhbGc...` (service_role secret)
   - `DATABASE_URL` = `postgresql://...6543/postgres?pgbouncer=true`
   - `DIRECT_URL` = `postgresql://...5432/postgres`
   
   ⚠️ **NO añadir** `NODE_ENV`, `NEXT_PUBLIC_*`, etc. — ya están baked-in
   en el Dockerfile.
7. **Deploy** → espera 3-4 min (git clone + npm install + build)

> Las 8 variables públicas (NODE_ENV, NEXT_PUBLIC_SUPABASE_URL, anon key,
> publishable key, SITE_URL, PORT, HOSTNAME, NEXT_TELEMETRY_DISABLED)
> ya están hardcodeadas como `ENV` en el Dockerfile — no necesitas
> configurarlas en Coolify.

---

## Paso 5 — DNS (si no está hecho)

```
A     datamind-api     <IP-DEL-SERVIDOR-COOLIFY>     TTL 300
```

o CNAME:
```
CNAME datamind-api     coolify.tuservidor.com.       TTL 300
```

Coolify solicitará el certificado Let's Encrypt automáticamente al primer deploy.

---

## Paso 6 — Verificar el despliegue

```bash
# Página principal (debe responder 200)
curl -I https://datamind-api.mooo.com/

# OpenAPI spec (no requiere auth)
curl https://datamind-api.mooo.com/api/openapi.json | jq '.info'

# Auth flow: /api/public/v1/me sin token → 401
curl -i https://datamind-api.mooo.com/api/public/v1/me

# Con una API key válida:
curl https://datamind-api.mooo.com/api/public/v1/me \
  -H "Authorization: Bearer dm_live_..."
```

---

## Troubleshooting

### El contenedor arranca pero 502/503

- Revisa los logs del contenedor en Coolify.
- Verifica que las 3 env vars secretas están configuradas:
  `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`.

### `fatal: could not read Username for 'https://github.com'`

- El repo `fcruzp/datamind-keys` no es público. Hazlo público en GitHub:
  Settings → General → Change visibility → Public.

### `PrismaClientInitializationError: Can't reach database server`

- Contraseña del rol `postgres` incorrecta → reseteala en Supabase.
- Usaste la URL directa en `DATABASE_URL` (sin `?pgbouncer=true`) →
  usa la **Transaction pooler** (puerto 6543).

### El login redirige a `localhost:3000`

- No debería pasar: `NEXT_PUBLIC_SITE_URL` está baked-in en el Dockerfile.
- Si persiste, revisa Supabase → Authentication → URL Configuration → Site URL.

### Prisma dice `relation "api_keys" does not exist`

- No aplicaste las migraciones. Vuelve al Paso 1.

---

## Notas de arquitectura

- **Multi-tenant**: cada usuario de Supabase Auth es un tenant. RLS aísla
  sus API keys y logs automáticamente.
- **Soft delete**: las keys revocadas no se borran, se conservan para auditoría.
- **Rate limit**: token bucket in-memory por key.
- **Logs**: `api_request_logs` y `settings_audit_logs` se escriben con el
  service role (bypass RLS).
