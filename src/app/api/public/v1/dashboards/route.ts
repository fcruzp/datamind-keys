import { NextResponse } from 'next/server'
import {
  authenticateApiKey,
  requireScope,
  getClientIp,
  logApiRequest,
  rateLimitHeaders,
} from '@/lib/api-auth'
import { db } from '@/lib/db'

// GET /api/public/v1/dashboards
// Returns the caller's REAL dashboards from BIweb's `dashboards` table,
// including their widgets. Tenant-scoped via `userId = auth.user.id`.
//
// IMPORTANT: dashboards.user_id is TEXT and references users.id (cuid),
// same convention as data_sources. Filter with auth.user.id, NOT supabaseId.
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

  // Real tenant-scoped query — only dashboards owned by the API key's user.
  const rows = await db.dashboard.findMany({
    where: { userId: auth.user.id },
    orderBy: { updatedAt: 'desc' },
    include: {
      widgets: {
        orderBy: { positionY: 'asc' },
      },
    },
  })

  const dashboards = rows.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    widgetCount: d.widgets.length,
    widgets: d.widgets.map((w) => ({
      id: w.id,
      title: w.title,
      type: w.widgetType,
      dataSourceId: w.dataSourceId,
      sqlQuery: w.sqlQuery,
      visualization: w.visualization,
      position: { x: w.positionX, y: w.positionY },
      size: { width: w.width, height: w.height },
    })),
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }))

  const durationMs = Date.now() - started
  await logApiRequest({
    apiKeyId: auth.apiKey.id,
    endpoint: '/api/public/v1/dashboards',
    method: 'GET',
    statusCode: 200,
    durationMs,
    rowCount: dashboards.length,
    ip: getClientIp(req),
  })

  return NextResponse.json(
    {
      ok: true,
      count: dashboards.length,
      dashboards,
    },
    { headers: rateLimitHeaders(auth) },
  )
}
