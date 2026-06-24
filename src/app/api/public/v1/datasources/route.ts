import { NextResponse } from 'next/server'
import {
  authenticateApiKey,
  requireScope,
  getClientIp,
  logApiRequest,
  rateLimitHeaders,
} from '@/lib/api-auth'

// GET /api/public/v1/datasources
// Lists demo datasources. Requires `read` scope.
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

  // Demo data — in real DataMind BI this would query the `DataSource` table.
  const datasources = [
    {
      id: 'ds_postgres_main',
      name: 'Production Postgres',
      type: 'postgres',
      host: 'db.datamind.mooo.com',
      port: 5432,
      database: 'datamind_prod',
      status: 'connected',
      lastSyncAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    },
    {
      id: 'ds_bigquery_analytics',
      name: 'BigQuery Analytics',
      type: 'bigquery',
      project: 'datamind-analytics',
      dataset: 'events',
      status: 'connected',
      lastSyncAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    },
    {
      id: 'ds_mysql_legacy',
      name: 'Legacy MySQL',
      type: 'mysql',
      host: 'legacy.internal',
      port: 3306,
      status: 'degraded',
      lastSyncAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    },
  ]

  const durationMs = Date.now() - started
  await logApiRequest({
    apiKeyId: auth.apiKey.id,
    endpoint: '/api/public/v1/datasources',
    method: 'GET',
    statusCode: 200,
    durationMs,
    rowCount: datasources.length,
    ip: getClientIp(req),
  })

  return NextResponse.json(
    {
      ok: true,
      count: datasources.length,
      datasources,
    },
    { headers: rateLimitHeaders(auth) },
  )
}
