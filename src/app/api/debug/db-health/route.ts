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
    writeTest?: { ok: boolean; error?: string }
  } = {
    timestamp: new Date().toISOString(),
    db: { connected: false },
    auth: { hasSession: false },
    tables: {},
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

  // --- 4. Write test (only if user is logged in + api_keys table exists) ----
  if (result.auth.hasSession && result.auth.userId && result.tables.api_keys?.readable) {
    try {
      // Attempt to create a key — if this fails, we get the EXACT Prisma
      // error that the real POST /api/settings/api-keys would get.
      // We immediately delete it so nothing persists.
      const { generateApiKey, serializeScopes } = await import('@/lib/api-auth')
      const { hash, prefix } = generateApiKey()

      const created = await db.apiKey.create({
        data: {
          userId: result.auth.userId,
          keyHash: hash,
          keyPrefix: prefix,
          label: '__healthcheck__',
          scopes: serializeScopes(['read']),
        },
      })

      // Clean up immediately
      await db.apiKey.delete({ where: { id: created.id } })

      result.writeTest = { ok: true }
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string; meta?: unknown }
      result.writeTest = {
        ok: false,
        error: `${err?.code ?? ''}: ${err?.message?.slice(0, 300) ?? 'Unknown'}`,
      }
    }
  }

  return NextResponse.json(result, { status: 200 })
}
