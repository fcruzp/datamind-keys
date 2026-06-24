import { getCurrentUser, listSwitchableUsers } from '@/lib/session'
import { db } from '@/lib/db'
import { PortalShell } from '@/components/portal/portal-shell'
import type { AuthMeResponse } from '@/components/portal/types'

// ---------------------------------------------------------------------------
// /  —  DataMind BI Portal (sandbox)
//
// Server Component: resolves the current tenant from the session cookie,
// pulls quick stats from the DB (no HTTP round-trip), and hands the bundle
// to the client-side <PortalShell/> which owns view switching + mutations.
// ---------------------------------------------------------------------------

// Force dynamic rendering — this page depends on the request session cookie
// and the database, so it must NOT be prerendered at build time.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const user = await getCurrentUser()

  // Defensive: listSwitchableUsers + stats queries may fail if the DB is
  // unreachable or tables don't exist yet. Wrap everything so the page
  // still renders with zeros instead of crashing.
  let switchable: Awaited<ReturnType<typeof listSwitchableUsers>> = []
  try {
    switchable = await listSwitchableUsers()
  } catch (e) {
    console.error('[/] listSwitchableUsers failed:', e)
  }

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
    console.error('[/] stats query failed:', e)
  }

  const initial: AuthMeResponse = {
    current: {
      id: user.id,
      email: user.email,
      name: user.name,
      tenantName: user.tenantName,
      avatarColor: user.avatarColor,
      role: user.role,
      isSupabase: user.isSupabase ?? false,
      avatarUrl: user.avatarUrl ?? null,
    },
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
  }

  return <PortalShell initial={initial} />
}
