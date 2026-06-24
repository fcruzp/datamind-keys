# Despliegue en Coolify — DataMind BI · API Keys Manager

Dominio: **`datamind-api.mooo.com`**
Repo: `fcruzp/datamind-keys` (privado)
Backend: Supabase `rsrcdaepiwjqfynwwzcn` (compartido con BIweb)
Build Pack: **Dockerfile** (igual que `datamind.mooo.com`)

---

## Archivos relevantes

| Archivo | Para qué sirve |
|---|---|
| `Dockerfile` | Imagen multi-stage Bun → Next.js standalone. Incluye baked-in las variables públicas (anon key, URL de Supabase, SITE_URL). No requiere build local. |
| `.dockerignore` | Recorta el contexto de build (excluye `node_modules`, `.next`, `db/`, etc.) |
| `.env.production.example` | Plantilla — solo las 3 variables SECRETAS que debes configurar en Coolify. |
| `supabase/migrations/*.sql` | Esquema + RLS que debes aplicar en Supabase Studio. |

> **No hay `docker-compose.yml` ni `coolify.yaml`** — el despliegue es Dockerfile puro, igual que tu `datamind.mooo.com`.

---

## Paso 1 — Aplicar migraciones en Supabase

Antes de desplegar, el backend necesita las tablas nuevas (`user_profiles`,
`api_keys`, `api_request_logs`, `settings_audit_logs`) y las políticas RLS.

1. Ve a **Supabase Dashboard** → proyecto `rsrcdaepiwjqfynwwzcn`
2. **SQL Editor** → **New query**
3. Pega el contenido de `supabase/migrations/0001_schema_additions.sql` → **Run**
4. Nuevo query → pega `supabase/migrations/0002_rls_policies.sql` → **Run**
5. Verifica en **Table Editor** que ves las 4 tablas nuevas con candado RLS.

---

## Paso 2 — Obtener las connection strings de Postgres

Prisma necesita `DATABASE_URL` y `DIRECT_URL` (no las claves de API).

1. Supabase Dashboard → **Project Settings** (engranaje abajo-izq) → **Database**
2. Sección **Connection string** → pestaña **Transaction pooler**:
   - URL con puerto **6543** y `?pgbouncer=true` → esa es `DATABASE_URL`
3. Pestaña **Session pooler** o **Direct connection**:
   - URL con puerto **5432** → esa es `DIRECT_URL`
4. Sustituye `[YOUR-PASSWORD]` por la contraseña del rol `postgres`.
   Si no la recuerdas: botón **Reset database password** en la misma página.

Formato esperado (región us-east-1):
```
DATABASE_URL=postgresql://postgres.rsrcdaepiwjqfynwwzcn:PASS@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.rsrcdaepiwjqfynwwzcn:PASS@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

---

## Paso 3 — Configurar Auth redirect URLs en Supabase

Para que el login redirija al dominio correcto:

1. Supabase Dashboard → **Authentication** → **URL Configuration**
2. **Site URL**: `https://datamind-api.mooo.com`
3. **Redirect URLs**: añade
   - `https://datamind-api.mooo.com/api/auth/callback`
   - `https://datamind-api.mooo.com/**`

---

## Paso 4 — Crear el recurso en Coolify (Build Pack = Dockerfile)

1. Coolify → **+ New Resource** → **Public repository** (o private con deploy key)
2. Selecciona `fcruzp/datamind-keys` → rama `main`
3. En **Configuration**:
   - **Build Pack**: `Dockerfile` ← importante, NO Docker Compose
   - **Dockerfile Location**: `/Dockerfile` (default)
   - **Domains**: `datamind-api.mooo.com`
   - **Ports Exposes**: `3000`
   - **Custom Docker Options**: (vacío)
   - **Install/Build/Start Command**: (vacíos — los maneja el Dockerfile)
4. **Environment Variables** — solo 3 (las secretas):
   - `SUPABASE_SERVICE_ROLE_KEY` = `eyJhbGc...` (service_role secret)
   - `DATABASE_URL` = `postgresql://...6543/postgres?pgbouncer=true`
   - `DIRECT_URL` = `postgresql://...5432/postgres`
   
   ⚠️ **NO añadir** `NODE_ENV`, `NEXT_PUBLIC_*`, etc. — ya están baked-in
   en el Dockerfile. Si las añades, pueden sobreescribir el valor correcto.
5. **Deploy** → espera 2-3 min

> Las 8 variables públicas (NODE_ENV, NEXT_PUBLIC_SUPABASE_URL, anon key,
> publishable key, SITE_URL, PORT, HOSTNAME, NEXT_TELEMETRY_DISABLED)
> ya están hardcodeadas como `ENV` en el Dockerfile — no necesitas
> configurarlas en Coolify.

---

## Paso 5 — DNS (si no está hecho)

En el panel donde gestionas `mooo.com`:

```
A     datamind-api     <IP-DEL-SERVIDOR-COOLIFY>     TTL 300
```

o CNAME si Coolify está detrás de otro dominio:
```
CNAME datamind-api     coolify.tuservidor.com.       TTL 300
```

Coolify solicitará el certificado Let's Encrypt automáticamente al primer
deploy.

---

## Paso 6 — Verificar el despliegue

Una vez verde el deploy:

```bash
# Página principal (debe responder 200)
curl -I https://datamind-api.mooo.com/

# OpenAPI spec (no requiere auth)
curl https://datamind-api.mooo.com/api/openapi.json | jq '.info'

# Auth flow: /api/public/v1/me sin token → 401
curl -i https://datamind-api.mooo.com/api/public/v1/me
# → HTTP/1.1 401  Missing Authorization header

# Con una API key válida:
curl https://datamind-api.mooo.com/api/public/v1/me \
  -H "Authorization: Bearer dm_live_..."
```

Y abre `https://datamind-api.mooo.com` en el navegador para verificar el
portal (login con Supabase Auth).

---

## Troubleshooting

### El contenedor arranca pero 502/503 en el navegador

- Revisa los logs del contenedor en Coolify — lo más probable es que falte
  una de las 3 env vars secretas (`SUPABASE_SERVICE_ROLE_KEY`,
  `DATABASE_URL`, `DIRECT_URL`).
- Verifica que las 3 están configuradas en Coolify → Environment Variables.

### `PrismaClientInitializationError: Can't reach database server`

- La contraseña del rol `postgres` es incorrecta → reseteala en Supabase.
- Estás usando la URL directa en `DATABASE_URL` (sin `?pgbouncer=true`) →
  usa la **Transaction pooler** (puerto 6543) para `DATABASE_URL`.
- IP baneada por Supabase → Dashboard → Database → Network restrictions.

### El login redirige a `localhost:3000`

- Esto ya no debería pasar: `NEXT_PUBLIC_SITE_URL` está baked-in en el
  Dockerfile con valor `https://datamind-api.mooo.com`.
- Si persiste, revisa Supabase → Authentication → URL Configuration →
  Site URL (debe ser `https://datamind-api.mooo.com`).

### `tls.certresolver=letsencrypt` no emite certificado

- El DNS `A datamind-api` aún no propagó → espera 5 min y fuerza redeploy.
- El dominio ya tiene un CAA record que bloquea Let's Encrypt → revisa DNS.

### Prisma dice `relation "api_keys" does not exist`

- No aplicaste las migraciones de `supabase/migrations/`. Vuelve al Paso 1.

---

## Rollback

```bash
# Coolify mantiene imágenes anteriores → redespliega la penúltima
# desde el dashboard: Deploy → selecciona commit anterior → Redeploy
```

---

## Notas de arquitectura

- **Multi-tenant**: cada usuario de Supabase Auth es un tenant. RLS aísla
  sus API keys y logs automáticamente (ver `supabase/migrations/0002_rls_policies.sql`).
- **Soft delete**: las keys revocadas (`revoked_at IS NOT NULL`) no se borran,
  se conservan para auditoría. El filtro parcial `WHERE revoked_at IS NULL`
  acelera las queries activas.
- **Rate limit**: token bucket in-memory por key. No sobrevive reinicios (OK
  para un solo contenedor; si escalas horizontalmente, mover a Redis).
- **Logs**: `api_request_logs` y `settings_audit_logs` se escriben con el
  service role (bypass RLS) desde el gateway público y las rutas de gestión.
