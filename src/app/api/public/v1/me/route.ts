import { NextResponse } from 'next/server'
import {
  authenticateApiKey,
  requireScope,
  getClientIp,
  logApiRequest,
  rateLimitHeaders,
} from '@/lib/api-auth'
import { db } from '@/lib/db'

// GET /api/public/v1/me
// Demo endpoint to validate an API key. Requires `read` scope.
//
// NOTE: api_keys.user_id is a uuid = users.supabase_id. All api_keys queries
// filter by auth.user.supabaseId. There is no Prisma relation between
// ApiKey ↔ ApiRequestLog, so log queries are two-step:
//   1. Find the user's key IDs
//   2. Query api_request_logs WHERE api_key_id IN (keyIds)
export async function GET(req: Request) {
  const started = Date.now()
  const auth = await authenticateApiKey(req)
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: rateLimitHeaders(auth) },
    )
  }
  const scoped = requireScope(auth, 'read')
  if (!scoped.ok) {
    return NextResponse.json(
      { error: scoped.error },
      { status: scoped.status, headers: rateLimitHeaders(auth) },
    )
  }

  const ip = getClientIp(req)

  // Count active keys + total request logs as a tiny dashboard for the caller.
  // - api_keys.user_id is a uuid = auth.user.supabaseId
  // - For api_request_logs, do a two-step query (no Prisma relation).
  let activeKeys = 0
  let totalRequests = 0
  let tenantName: string = 'Personal'
  try {
    activeKeys = await db.apiKey.count({
      where: { userId: auth.user.supabaseId, revokedAt: null },
    })

    const userKeys = await db.apiKey.findMany({
      where: { userId: auth.user.supabaseId },
      select: { id: true },
    })
    const keyIds = userKeys.map((k) => k.id)
    if (keyIds.length > 0) {
      totalRequests = await db.apiRequestLog.count({
        where: { apiKeyId: { in: keyIds } },
      })
    }

    // Tenant name resolution — cascading fallback:
    //   1. user_profiles.tenant_name (preferred, but may not exist yet)
    //   2. users.company (BIweb's source of truth, set by the app)
    //   3. 'Personal' (final default)
    //
    // This ensures /me always returns a non-null tenantName regardless of
    // whether user_profiles exists. BIweb doesn't need to change its code —
    // users.company remains its source of truth, and we fall back to it.
    const profile = await db.userProfile.findUnique({
      where: { userId: auth.user.supabaseId },
      select: { tenantName: true },
    })
    tenantName =
      profile?.tenantName          // 1. user_profiles.tenant_name
      ?? auth.user.company         // 2. users.company
      ?? 'Personal'                // 3. default
  } catch (e) {
    console.error('[/api/public/v1/me] stats query failed:', e)
    // Even if the DB query fails, fall back to company/Personal
    tenantName = auth.user.company ?? 'Personal'
  }

  const durationMs = Date.now() - started
  await logApiRequest({
    apiKeyId: auth.apiKey.id,
    endpoint: '/api/public/v1/me',
    method: 'GET',
    statusCode: 200,
    durationMs,
    ip,
  })

  return NextResponse.json(
    {
      ok: true,
      user: {
        id: auth.user.id,
        email: auth.user.email,
        name: auth.user.name,
        role: auth.user.role ?? null,
        tenantName,
      },
      apiKey: {
        id: auth.apiKey.id,
        label: auth.apiKey.label,
        scopes: auth.apiKey.scopes,
        prefix: auth.apiKey.prefix,
        lastUsedAt: auth.apiKey.lastUsedAt,
      },
      account: {
        activeKeys,
        totalApiRequests: totalRequests,
      },
      server: {
        time: new Date().toISOString(),
        durationMs,
      },
    },
    { headers: rateLimitHeaders(auth) },
  )
}
