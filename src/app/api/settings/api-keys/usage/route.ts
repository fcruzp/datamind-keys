import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getDemoUser } from '@/lib/api-auth'
import { withDbSafe } from '@/lib/api-wrapper'

// GET /api/settings/api-keys/usage
// Returns recent request logs aggregated by API key, for the dashboard widget.
//
// NOTE: api_keys.user_id is a uuid = users.supabase_id. There is NO Prisma
// relation between ApiKey ↔ ApiRequestLog (the schema intentionally avoids
// enforcing an FK at the Prisma layer), so we can't filter logs via
// `where: { apiKey: { userId } }`. Instead we do a two-step query:
//   1. Find the user's API key IDs (filter api_keys by user_id = supabaseId)
//   2. Query api_request_logs WHERE api_key_id IN (...)
export const GET = withDbSafe<NextRequest>(async (req) => {
  const user = await getDemoUser(req)

  // Step 1: find the user's API key IDs (api_keys.user_id is the supabase UUID).
  const userKeys = await db.apiKey.findMany({
    where: { userId: user.supabaseId },
    select: { id: true, label: true, keyPrefix: true },
  })
  const keyIdToMeta = new Map(userKeys.map((k) => [k.id, k]))
  const keyIds = userKeys.map((k) => k.id)

  // No keys → return an empty usage payload.
  if (keyIds.length === 0) {
    return NextResponse.json({
      totals: { requests7d: 0, avgDurationMs: 0, lastRequestAt: null },
      perKey: [],
      recent: [],
      hourlyHistogram: new Array(24).fill(0),
    })
  }

  const since7d = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7) // 7 days
  const since24h = new Date(Date.now() - 1000 * 60 * 60 * 24) // 24 hours

  const [recentLogs, perKeyStats, totalsRow, logs24h] = await Promise.all([
    db.apiRequestLog.findMany({
      where: {
        apiKeyId: { in: keyIds },
        createdAt: { gte: since7d },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        id: true,
        endpoint: true,
        method: true,
        statusCode: true,
        durationMs: true,
        rowCount: true,
        ip: true,
        createdAt: true,
        apiKeyId: true,
      },
    }),
    db.apiRequestLog.groupBy({
      by: ['apiKeyId'],
      where: {
        apiKeyId: { in: keyIds },
        createdAt: { gte: since7d },
      },
      _count: { _all: true },
      _avg: { durationMs: true },
    }),
    db.apiRequestLog.aggregate({
      where: {
        apiKeyId: { in: keyIds },
        createdAt: { gte: since7d },
      },
      _count: { _all: true },
      _avg: { durationMs: true },
      _max: { createdAt: true },
    }),
    // All logs in the last 24h (uncapped, for per-key histograms)
    db.apiRequestLog.findMany({
      where: {
        apiKeyId: { in: keyIds },
        createdAt: { gte: since24h },
      },
      select: {
        apiKeyId: true,
        createdAt: true,
      },
    }),
  ])

  // Build global hourly histogram for the last 24h
  const now = Date.now()
  const globalHistogram = new Array(24).fill(0) as number[]
  // Per-key histograms: { [apiKeyId]: number[24] }
  const perKeyHistograms = new Map<string, number[]>()

  for (const log of logs24h) {
    const hoursAgo = Math.floor((now - log.createdAt.getTime()) / (1000 * 60 * 60))
    if (hoursAgo >= 0 && hoursAgo < 24) {
      const idx = 23 - hoursAgo
      globalHistogram[idx]!++
      let arr = perKeyHistograms.get(log.apiKeyId)
      if (!arr) {
        arr = new Array(24).fill(0)
        perKeyHistograms.set(log.apiKeyId, arr)
      }
      arr[idx]!++
    }
  }

  return NextResponse.json({
    totals: {
      requests7d: totalsRow._count._all,
      avgDurationMs: Math.round(totalsRow._avg.durationMs ?? 0),
      lastRequestAt: totalsRow._max.createdAt,
    },
    perKey: perKeyStats.map((s) => ({
      apiKeyId: s.apiKeyId,
      count: s._count._all,
      avgDurationMs: Math.round(s._avg.durationMs ?? 0),
      histogram24h: perKeyHistograms.get(s.apiKeyId) ?? new Array(24).fill(0),
    })),
    recent: recentLogs.map((l) => {
      const meta = keyIdToMeta.get(l.apiKeyId)
      return {
        id: l.id,
        endpoint: l.endpoint,
        method: l.method,
        statusCode: l.statusCode,
        durationMs: l.durationMs,
        rowCount: l.rowCount,
        ip: l.ip,
        createdAt: l.createdAt,
        apiKeyLabel: meta?.label ?? '(unknown)',
      }
    }),
    hourlyHistogram: globalHistogram,
  })
})
