# Despliegue en Coolify — DataMind BI · API Keys Manager

Dominio: **`datamind-api.mooo.com`**
Repo: `fcruzp/datamind-keys` (pendiente de crear)
Backend: Supabase `rsrcdaepiwjqfynwwzcn` (compartido con BIweb)

---

## Archivos relevantes

| Archivo | Para qué sirve |
|---|---|
| `Dockerfile` | Imagen multi-stage Bun → Next.js standalone. No requiere build local. |
| `.dockerignore` | Recorta el contexto de build (excluye `node_modules`, `.next`, `db/`, etc.) |
| `docker-compose.yml` | Definición del servicio con labels Traefik + Caddy para Coolify. |
| `coolify.yaml` | Referencia YAML de los labels y env vars (para pegar en el dashboard). |
| `.env.production.example` | Plantilla de variables de entorno. |
| `supabase/migrations/*.sql` | Esquema + RLS que debes aplicar en Supabase Studio. |

---

## Paso 1 — Aplicar migraciones en Supabase

Antes de desplegar, el backend necesita las tablas nuevas (`user_profiles`,
`api_keys`, `api_request_logs`, `settings_audit_logs`) y las políticas RLS.

1. Ve a **Supabase Dashboard** → proyecto `rsrcdaepiwjqfynwwzcn`
2. **SQL Editor** → **New query**
3. Pega el contenido de `supabase/migrations/0001_schema_additions.sql` → **Run**
4. Nuevo query → pega `supabase/migrations/0002_rls_policies.sql` → **Run**
5. Verifica en **Table Editor** que ves las 4 tablas nuevas con candado RLS.

> Alternativa: `supabase db push` con la CLI, pero SQL Editor es más rápido
> para una única aplicación.

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

Formato esperado:
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

## Paso 4 — Crear el recurso en Coolify

### Opción A — Desde repo Git (recomendado)

1. Sube el código a `fcruzp/datamind-keys` en GitHub.
2. Coolify → **+ New Resource** → **Public repository** (o private con deploy key)
3. Selecciona `fcruzp/datamind-keys` → rama `main`
4. Coolify detecta `docker-compose.yml` automáticamente → **Continue**
5. En **Configuration**:
   - **Domains**: `datamind-api.mooo.com` (Coolify genera los labels automáticamente)
   - **Build Pack**: Docker Compose
   - **Environment Variables**: pega el contenido de `.env.production.example`
     con los valores reales (`DATABASE_URL`, `DIRECT_URL`, etc.)
6. **Deploy** → espera 2-3 min (build + healthcheck)

### Opción B — Docker Compose vacío

1. Coolify → **+ New Resource** → **Docker Compose Empty**
2. Pega el contenido de `docker-compose.yml`
3. En **Custom Labels** puedes pegar el bloque `labels` de `coolify.yaml`
   (aunque Coolify ya los genera con solo poner el dominio en el campo **Domains**)
4. Configura **Environment Variables** igual que en la Opción A
5. **Deploy**

---

## Paso 5 — DNS (si no está hecho)

En el panel donde gestionas `mooo.com` (probablemente el proveedor de DNS):

```
A     datamind-api     <IP-DEL-SERVIDOR-COOLIFY>     TTL 300
```

o CNAME si Coolify está detrás de otro dominio:
```
CNAME datamind-api     coolify.tuservidor.com.       TTL 300
```

Coolify solicitará el certificado Let's Encrypt automáticamente al primer
deploy gracias a `tls.certresolver=letsencrypt`.

---

## Paso 6 — Verificar el despliegue

Una vez verde el deploy:

```bash
# Health check
curl https://datamind-api.mooo.com/api/health
# → {"ok":true,"service":"datamind-keys","ts":"..."}

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

## Estructura de labels (referencia)

Los labels de Traefik + Caddy siguen exactamente el mismo patrón que
`datamind.mooo.com` (BIweb), solo cambia el dominio y el ID del router:

| Campo | datamind.mooo.com (BIweb) | datamind-api.mooo.com (Keys) |
|---|---|---|
| `Host(...)` | `datamind.mooo.com` | `datamind-api.mooo.com` |
| `caddy_0=` | `https://datamind.mooo.com` | `https://datamind-api.mooo.com` |
| Router ID | `hyvtdbc00txfcds8pr6oj8ji` | `datamindapi` (estable, legible) |
| Puerto LB | 3000 | 3000 |
| certresolver | letsencrypt | letsencrypt |
| Middleware | gzip + redirect-to-https | gzip + redirect-to-https |

El ID del router (`hyvtdbc...` en BIweb) es el UUID del recurso en Coolify.
Para `datamind-keys` uso `datamindapi` porque es grep-able y estable entre
rebuilds. Traefik solo requiere que el ID sea consistente dentro del servicio.

---

## Troubleshooting

### El contenedor arranca pero 502/503 en el navegador

- Revisa `docker logs datamind-keys` — lo más probable es que falte una env var.
- Comprueba que `DATABASE_URL` y `DIRECT_URL` están seteadas (no las de API).
- Verifica que el healthcheck pasa: `curl http://localhost:3000/api/health`
  desde dentro del contenedor.

### `PrismaClientInitializationError: Can't reach database server`

- La contraseña del rol `postgres` es incorrecta → reseteala en Supabase.
- Estás usando la URL directa en `DATABASE_URL` (sin `?pgbouncer=true`) →
  usa la **Transaction pooler** (puerto 6543) para `DATABASE_URL`.
- IP baneada por Supabase → Dashboard → Database → Network restrictions.

### El login redirige a `localhost:3000`

- `NEXT_PUBLIC_SITE_URL` no está seteada en Coolify → debe ser
  `https://datamind-api.mooo.com`.
- Supabase → Authentication → URL Configuration → Site URL mal puesto.

### `tls.certresolver=letsencrypt` no emite certificado

- El DNS `A datamind-api` aún no propagó → espera 5 min y forza redeploy.
- El dominio ya tiene un CAA record que bloquea Let's Encrypt → revisa DNS.

### Prisma dice `relation "api_keys" does not exist`

- No aplicaste las migraciones de `supabase/migrations/`. Vuelve al Paso 1.

---

## Rollback

```bash
# En el servidor Coolify
docker stop datamind-keys
docker rm datamind-keys
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
