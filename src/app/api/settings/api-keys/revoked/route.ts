import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import {
  getDemoUser,
  maskApiKey,
  parseAllowedIps,
  parseScopes,
} from '@/lib/api-auth'
import { withDbSafe } from '@/lib/api-wrapper'

// GET /api/settings/api-keys/revoked
// Lists revoked keys for audit (no plaintext). Newest-revoked first.
export const GET = withDbSafe<NextRequest>(async (req) => {
  const user = await getDemoUser(req)

  const keys = await db.apiKey.findMany({
    where: {
      userId: user.id,
      revokedAt: { not: null },
    },
    orderBy: { revokedAt: 'desc' },
    select: {
      id: true,
      label: true,
      keyPrefix: true,
      scopes: true,
      allowedIps: true,
      rateLimitPerMinute: true,
      lastUsedAt: true,
      lastUsedIp: true,
      expiresAt: true,
      createdAt: true,
      revokedAt: true,
    },
    take: 100,
  })

  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.id,
      label: k.label,
      keyMasked: maskApiKey(k.keyPrefix),
      scopes: parseScopes(k.scopes),
      allowedIps: parseAllowedIps(k.allowedIps),
      rateLimitPerMinute: k.rateLimitPerMinute,
      lastUsedAt: k.lastUsedAt,
      lastUsedIp: k.lastUsedIp,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
      revokedAt: k.revokedAt,
    })),
  })
})
