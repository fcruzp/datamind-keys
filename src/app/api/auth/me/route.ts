import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  getCurrentUser,
  listSwitchableUsers,
} from '@/lib/session'
import { db } from '@/lib/db'
import { withDbSafe } from '@/lib/api-wrapper'

// GET /api/auth/me
// Returns the currently-logged-in user (resolved from Supabase Auth),
// the list of switchable tenants (empty in integrated mode), and quick stats
// so the portal shell can render the sidebar / dashboard without N round-trips.
//
// If no Supabase session exists, returns 401 so the UI can show a Sign In card.

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
  const since7d = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)
  let activeKeys = 0
  let revokedKeys = 0
  let requests7d = 0
  let lastLogAt: { createdAt: Date } | null = null

  try {
    ;[activeKeys, revokedKeys, requests7d, lastLogAt] = await Promise.all([
      db.apiKey.count({
        where: { userId: user.id, revokedAt: null },
      }),
      db.apiKey.count({
        where: { userId: user.id, revokedAt: { not: null } },
      }),
      db.apiRequestLog.count({
        where: {
          apiKey: { userId: user.id },
          createdAt: { gte: since7d },
        },
      }),
      db.apiRequestLog.findFirst({
        where: { apiKey: { userId: user.id } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ])
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
