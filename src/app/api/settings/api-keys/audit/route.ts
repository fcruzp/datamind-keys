import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getDemoUser } from '@/lib/api-auth'
import { db } from '@/lib/db'
import { withDbSafe } from '@/lib/api-wrapper'

// GET /api/settings/api-keys/audit
// Returns the most recent settings-audit entries for the current user.
// Used by the AuditLogPanel UI to show "who did what, when" for compliance.

export const GET = withDbSafe<NextRequest>(async (req) => {
  const user = await getDemoUser(req)

  const entries = await db.settingsAuditLog.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100, // cap to the last 100 actions
    select: {
      id: true,
      action: true,
      apiKeyId: true,
      apiKeyLabel: true,
      diff: true,
      ip: true,
      userAgent: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    entries: entries.map((e) => {
      let diff: unknown = {}
      try {
        diff = JSON.parse(e.diff)
      } catch {
        diff = {}
      }
      return {
        id: e.id,
        action: e.action,
        apiKeyId: e.apiKeyId,
        apiKeyLabel: e.apiKeyLabel,
        diff,
        ip: e.ip,
        userAgent: e.userAgent,
        createdAt: e.createdAt,
      }
    }),
  })
})
