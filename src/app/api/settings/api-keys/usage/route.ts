import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getDemoUser } from '@/lib/api-auth'
import { withDbSafe } from '@/lib/api-wrapper'

// GET /api/settings/api-keys/usage
// Returns recent request logs aggregated by API key, for the dashboard widget.
export const GET = withDbSafe<NextRequest>(async (req) => {
  const user = await getDemoUser(req)

  const since7d = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7) // 7 days
  const since24h = new Date(Date.now() - 1000 * 60 * 60 * 24) // 24 hours

  const [recentLogs, perKeyStats, totalsRow, logs24h] = await Promise.all([
    db.apiRequestLog.findMany({
      where: {
        apiKey: { userId: user.id },
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
        apiKey: { select: { label: true, keyPrefix: true } },
      },
    }),
    db.apiRequestLog.groupBy({
      by: ['apiKeyId'],
      where: {
        apiKey: { userId: user.id },
        createdAt: { gte: since7d },
      },
      _count: { _all: true },
      _avg: { durationMs: true },
    }),
    db.apiRequestLog.aggregate({
      where: {
        apiKey: { userId: user.id },
        createdAt: { gte: since7d },
      },
      _count: { _all: true },
      _avg: { durationMs: true },
      _max: { createdAt: true },
    }),
    // All logs in the last 24h (uncapped, for per-key histograms)
    db.apiRequestLog.findMany({
      where: {
        apiKey: { userId: user.id },
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
    hourlyHistogram: globalHistogram,
  })
})
