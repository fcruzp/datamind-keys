import { NextResponse } from 'next/server'
import {
  authenticateApiKey,
  requireScope,
  getClientIp,
  logApiRequest,
} from '@/lib/api-auth'
import { db } from '@/lib/db'

// GET /api/public/v1/me
// Demo endpoint to validate an API key. Requires `read` scope.
export async function GET(req: Request) {
  const started = Date.now()
  const auth = await authenticateApiKey(req)
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status },
    )
  }
  const scoped = requireScope(auth, 'read')
  if (!scoped.ok) {
    return NextResponse.json(
      { error: scoped.error },
      { status: scoped.status },
    )
  }

  const ip = getClientIp(req)

  // Count active keys + total request logs as a tiny dashboard for the caller
  const [activeKeys, totalRequests] = await Promise.all([
    db.apiKey.count({
      where: { userId: auth.user.id, revokedAt: null },
    }),
    db.apiRequestLog.count({
      where: { apiKey: { userId: auth.user.id } },
    }),
  ])

  const durationMs = Date.now() - started
  await logApiRequest({
    apiKeyId: auth.apiKey.id,
    endpoint: '/api/public/v1/me',
    method: 'GET',
    statusCode: 200,
    durationMs,
    ip,
  })

  return NextResponse.json({
    ok: true,
    user: {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
    },
    apiKey: {
      id: auth.apiKey.id,
      label: auth.apiKey.label,
      scopes: auth.apiKey.scopes,
      prefix: auth.apiKey.prefix,
      lastUsedAt: auth.apiKey.lastUsedAt,
      allowedIps: auth.apiKey.allowedIps,
      rateLimitPerMinute: auth.apiKey.rateLimitPerMinute,
    },
    account: {
      activeKeys,
      totalApiRequests: totalRequests,
    },
    server: {
      time: new Date().toISOString(),
      durationMs,
    },
  })
}
