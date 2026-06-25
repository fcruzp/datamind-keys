import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUser, listSwitchableUsers } from '@/lib/session'
import { db } from '@/lib/db'
import { withDbSafe } from '@/lib/api-wrapper'

// GET /api/auth/me
// Returns the currently-logged-in user (resolved from Supabase Auth),
// the list of switchable tenants (empty in integrated mode), and quick stats
// so the portal shell can render the sidebar / dashboard without N round-trips.
//
// If no Supabase session exists, returns 401 so the UI can show a Sign In card.
//
// NOTE: api_keys.user_id is a uuid = users.supabase_id (NOT users.id text/cuid).
// All api_keys queries filter by user.supabaseId. There is no Prisma relation
// between ApiKey ↔ ApiRequestLog, so log queries are two-step:
//   1. Find the user's key IDs
//   2. Query api_request_logs WHERE api_key_id IN (keyIds)

export const GET = withDbSafe<NextRequest>(async (req) => {
  const user = await getCurrentUser(req)

  if (!user) {
    return NextResponse.json(
      {
        current: null,
        switchable: [],
        stats: {
          activeKeys: 0,
          revokedKeys: 0,
          requests7d: 0,
          lastRequestAt: null,
        },
      },
      { status: 200 },
    )
  }

  // Defensive: listSwitchableUsers may fail if DB is unreachable.
  let switchable: Awaited<ReturnType<typeof listSwitchableUsers>> = []
  try {
    switchable = await listSwitchableUsers()
  } catch (e) {
    console.error('[/api/auth/me] listSwitchableUsers failed:', e)
  }

  // Quick stats — defensive: tables may not exist yet.
  // Filter api_keys by user.supabaseId (uuid = api_keys.user_id).
  const since7d = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)
  let activeKeys = 0
  let revokedKeys = 0
  let requests7d = 0
  let lastLogAt: { createdAt: Date } | null = null

  try {
    // Step 1: counts of api_keys for the user.
    ;[activeKeys, revokedKeys] = await Promise.all([
      db.apiKey.count({
        where: { userId: user.supabaseId, revokedAt: null },
      }),
      db.apiKey.count({
        where: { userId: user.supabaseId, revokedAt: { not: null } },
      }),
    ])

    // Step 2: fetch the user's key IDs (for filtering api_request_logs).
    // We only need IDs — minimal payload.
    const userKeys = await db.apiKey.findMany({
      where: { userId: user.supabaseId },
      select: { id: true },
    })
    const keyIds = userKeys.map((k) => k.id)

    if (keyIds.length > 0) {
      ;[requests7d, lastLogAt] = await Promise.all([
        db.apiRequestLog.count({
          where: {
            apiKeyId: { in: keyIds },
            createdAt: { gte: since7d },
          },
        }),
        db.apiRequestLog.findFirst({
          where: { apiKeyId: { in: keyIds } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ])
    }
  } catch (e) {
    console.error('[/api/auth/me] stats query failed:', e)
  }

  return NextResponse.json({
    current: {
      id: user.id,
      supabaseId: user.supabaseId,
      email: user.email,
      name: user.name,
      tenantName: user.tenantName,
      avatarColor: user.avatarColor,
      role: user.role,
      isSupabase: user.isSupabase ?? false,
      avatarUrl: user.avatarUrl ?? null,
    },
    // In integrated mode there are no switchable tenants (Supabase users
    // switch by signing out + into a different account).
    switchable: (user.isSupabase ? [] : switchable).map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      tenantName: u.tenantName,
      avatarColor: u.avatarColor,
      role: u.role,
      isCurrent: u.id === user.id,
    })),
    stats: {
      activeKeys,
      revokedKeys,
      requests7d,
      lastRequestAt: lastLogAt?.createdAt?.toISOString() ?? null,
    },
  })
})
