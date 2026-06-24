import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoUser } from '@/lib/api-auth'

// GET /api/settings/api-keys/usage
// Returns recent request logs aggregated by API key, for the dashboard widget.
export async function GET() {
  const user = await getDemoUser()

  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7) // 7 days

  const [recentLogs, perKeyStats, totalsRow] = await Promise.all([
    db.apiRequestLog.findMany({
      where: {
        apiKey: { userId: user.id },
        createdAt: { gte: since },
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
        apiKey: { select: { label: true, keyPrefix: true } },
      },
    }),
    db.apiRequestLog.groupBy({
      by: ['apiKeyId'],
      where: {
        apiKey: { userId: user.id },
        createdAt: { gte: since },
      },
      _count: { _all: true },
      _avg: { durationMs: true },
    }),
    db.apiRequestLog.aggregate({
      where: {
        apiKey: { userId: user.id },
        createdAt: { gte: since },
      },
      _count: { _all: true },
      _avg: { durationMs: true },
      _max: { createdAt: true },
    }),
  ])

  // Build hourly histogram for the last 24h
  const now = Date.now()
  const buckets = new Array(24).fill(0) as number[]
  for (const log of recentLogs) {
    const hoursAgo = Math.floor((now - log.createdAt.getTime()) / (1000 * 60 * 60))
    if (hoursAgo >= 0 && hoursAgo < 24) {
      buckets[23 - hoursAgo]++
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
    })),
    recent: recentLogs.map((l) => ({
      id: l.id,
      endpoint: l.endpoint,
      method: l.method,
      statusCode: l.statusCode,
      durationMs: l.durationMs,
      rowCount: l.rowCount,
      ip: l.ip,
      createdAt: l.createdAt,
      apiKeyLabel: l.apiKey.label,
    })),
    hourlyHistogram: buckets,
  })
}
