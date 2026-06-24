import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  getCurrentUser,
  listSwitchableUsers,
  SESSION_COOKIE,
} from '@/lib/session'
import { db } from '@/lib/db'
import { withDbSafe } from '@/lib/api-wrapper'

// GET /api/auth/me
// Returns the currently-logged-in user (resolved from the session cookie),
// the list of switchable demo tenants, and quick stats so the portal shell
// can render the sidebar / dashboard without N round-trips.

export const GET = withDbSafe<NextRequest>(async (req) => {
  const user = await getCurrentUser(req)

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

  // The cookie that's actually set (may be undefined → defaults to demo@datamind.bi)
  const cookieEmail = req.cookies.get(SESSION_COOKIE)?.value

  return NextResponse.json({
    current: {
      id: user.id,
      email: user.email,
      name: user.name,
      tenantName: user.tenantName,
      avatarColor: user.avatarColor,
      role: user.role,
      isSupabase: user.isSupabase ?? false,
      avatarUrl: user.avatarUrl ?? null,
      isDefault: !cookieEmail || cookieEmail === user.email,
    },
    // When a real Supabase user is logged in, we hide the demo tenant
    // switcher entirely — they should sign out + back in to switch accounts.
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
