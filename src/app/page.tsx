import { getCurrentUser, listSwitchableUsers } from '@/lib/session'
import { db } from '@/lib/db'
import { PortalShell } from '@/components/portal/portal-shell'
import type { AuthMeResponse } from '@/components/portal/types'

// ---------------------------------------------------------------------------
// /  —  DataMind BI Portal (integrated with BIweb)
//
// Server Component: resolves the current user from the Supabase Auth session,
// pulls quick stats from the shared DB (no HTTP round-trip), and hands the
// bundle to the client-side <PortalShell/> which owns view switching +
// mutations.
//
// If no Supabase session exists, PortalShell shows a Sign In card.
//
// NOTE: api_keys.user_id is a uuid = users.supabase_id (NOT users.id text/cuid).
// All api_keys queries filter by user.supabaseId. There is no Prisma relation
// between ApiKey ↔ ApiRequestLog, so log queries are two-step.
// ---------------------------------------------------------------------------

// Force dynamic rendering — this page depends on the Supabase session cookie
// and the database, so it must NOT be prerendered at build time.
export const dynamic = 'force-dynamic'

export default async function Home() {
  const user = await getCurrentUser()

  // Not signed in — PortalShell will render the Sign In card.
  if (!user) {
    const empty: AuthMeResponse = {
      current: null,
      switchable: [],
      stats: {
        activeKeys: 0,
        revokedKeys: 0,
        requests7d: 0,
        lastRequestAt: null,
      },
    }
    return <PortalShell initial={empty} />
  }

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
    // Step 1: counts of api_keys for the user (filter by supabaseId).
    ;[activeKeys, revokedKeys] = await Promise.all([
      db.apiKey.count({
        where: { userId: user.supabaseId, revokedAt: null },
      }),
      db.apiKey.count({
        where: { userId: user.supabaseId, revokedAt: { not: null } },
      }),
    ])

    // Step 2: fetch the user's key IDs (for filtering api_request_logs).
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
