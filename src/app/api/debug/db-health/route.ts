import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'

/**
 * GET /api/debug/db-health
 *
 * Diagnostic endpoint that checks:
 *   1. DB connectivity (can we connect at all?)
 *   2. Current user resolution (Supabase Auth → users table)
 *   3. Each table existence + readability (users, api_keys, api_request_logs,
 *      settings_audit_logs)
 *   4. Write test (tries a dummy api_keys insert + delete)
 *
 * This endpoint is SAFE to call in production — it never persists data and
 * only performs read queries + one immediately-deleted insert.
 *
 * Usage: open https://datamind-api.mooo.com/api/debug/db-health in the
 * browser while logged in. The JSON response tells you exactly what's broken.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const result: {
    timestamp: string
    db: { connected: boolean; error?: string }
    auth: { hasSession: boolean; userId?: string; userSupabaseId?: string; userEmail?: string; error?: string }
    tables: Record<string, { exists: boolean; readable: boolean; count?: number; error?: string }>
    columnTypes: Record<string, Array<{ column: string; type: string; nullable: string; default: string | null }>>
    writeTest?: { ok: boolean; error?: string; triedWith?: string }
  } = {
    timestamp: new Date().toISOString(),
    db: { connected: false },
    auth: { hasSession: false },
    tables: {},
    columnTypes: {},
  }

  // --- 1. DB connectivity ----------------------------------------------------
  try {
    await db.$queryRaw`SELECT 1`
    result.db.connected = true
  } catch (e: unknown) {
    result.db.connected = false
    result.db.error = (e as Error)?.message?.slice(0, 300) ?? 'Unknown error'
    return NextResponse.json(result, { status: 200 })
  }

  // --- 2. Auth + user resolution --------------------------------------------
  try {
    const user = await getCurrentUser()
    if (user) {
      result.auth.hasSession = true
      result.auth.userId = user.id
      result.auth.userSupabaseId = user.supabaseId
      result.auth.userEmail = user.email
    } else {
      result.auth.hasSession = false
      result.auth.error = 'No Supabase session — not logged in'
    }
  } catch (e: unknown) {
    result.auth.hasSession = false
    result.auth.error = (e as Error)?.message?.slice(0, 300) ?? 'Unknown error'
  }

  // --- 3. Table checks -------------------------------------------------------
  const tableChecks: Array<{ name: string; check: () => Promise<number> }> = [
    {
      name: 'users',
      check: async () => {
        const c = await db.user.count()
        return c
      },
    },
    {
      name: 'api_keys',
      check: async () => {
        const c = await db.apiKey.count()
        return c
      },
    },
    {
      name: 'api_request_logs',
      check: async () => {
        const c = await db.apiRequestLog.count()
        return c
      },
    },
    {
      name: 'settings_audit_logs',
      check: async () => {
        const c = await db.settingsAuditLog.count()
        return c
      },
    },
  ]

  for (const { name, check } of tableChecks) {
    try {
      const count = await check()
      result.tables[name] = { exists: true, readable: true, count }
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string }
      result.tables[name] = {
        exists: false,
        readable: false,
        error: `${err?.code ?? ''}: ${err?.message?.slice(0, 200) ?? 'Unknown'}`,
      }
    }
  }

  // --- 3b. Column types from information_schema ------------------------------
  // This tells us the EXACT data type of every column so we can detect
  // mismatches between our Prisma schema (e.g. @default(cuid())) and the
  // actual DB (which might use uuid).
  try {
    const rows = await db.$queryRaw<Array<{
      table_name: string
      column_name: string
      data_type: string
      is_nullable: string
      column_default: string | null
    }>>`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'api_keys', 'api_request_logs', 'settings_audit_logs')
      ORDER BY table_name, ordinal_position
    `
    for (const row of rows) {
      const t = row.table_name as string
      if (!result.columnTypes[t]) result.columnTypes[t] = []
      result.columnTypes[t].push({
        column: row.column_name as string,
        type: row.data_type as string,
        nullable: row.is_nullable as string,
        default: row.column_default as string | null,
      })
    }
  } catch (e: unknown) {
    console.error('[db-health] column type query failed:', e)
  }

  // --- 4. Write test (only if user is logged in + api_keys table exists) ----
  // NOTE: api_keys.id is uuid (gen_random_uuid), api_keys.user_id is uuid
  // referencing auth.users.id (= users.supabase_id). So we MUST pass the
  // Supabase UUID as user_id — NOT the users.id (text/cuid).
  if (result.auth.hasSession && result.auth.userSupabaseId && result.tables.api_keys?.readable) {
    try {
      const { generateApiKey, serializeScopes } = await import('@/lib/api-auth')
      const { hash, prefix } = generateApiKey()

      // Use a raw SQL insert with gen_random_uuid() for the id, and pass the
      // user's Supabase UUID as user_id. The scopes column is jsonb, so we
      // cast the JSON string explicitly.
      const uuidResult = await db.$queryRaw<{ id: string }[]>`
        INSERT INTO api_keys (id, user_id, key_hash, key_prefix, label, scopes, allowed_ips, created_at)
        VALUES (
          gen_random_uuid(),
          ${result.auth.userSupabaseId}::uuid,
          ${hash},
          ${prefix},
          '__healthcheck__',
          ${serializeScopes(['read'])}::jsonb,
          '[]'::jsonb,
          NOW()
        )
        RETURNING id
      `
      const insertedId = uuidResult[0]?.id as string
      // Clean up immediately. id is uuid, so cast the parameter to uuid.
      await db.$executeRaw`DELETE FROM api_keys WHERE id = ${insertedId}::uuid`

      result.writeTest = { ok: true, triedWith: 'gen_random_uuid() + supabaseId via raw SQL' }
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string; meta?: unknown }
      result.writeTest = {
        ok: false,
        triedWith: 'gen_random_uuid() + supabaseId via raw SQL',
        error: `${err?.code ?? ''}: ${err?.message?.slice(0, 400) ?? 'Unknown'}`,
      }
    }
  }

  return NextResponse.json(result, { status: 200 })
}
