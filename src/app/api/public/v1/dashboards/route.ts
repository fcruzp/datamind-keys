import { NextResponse } from 'next/server'
import {
  authenticateApiKey,
  requireScope,
  getClientIp,
  logApiRequest,
} from '@/lib/api-auth'

// GET /api/public/v1/dashboards
// Lists demo dashboards owned by the account. Requires `read` scope.
export async function GET(req: Request) {
  const started = Date.now()
  const auth = await authenticateApiKey(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const scoped = requireScope(auth, 'read')
  if (!scoped.ok) {
    return NextResponse.json({ error: scoped.error }, { status: scoped.status })
  }

  // Demo data — in real DataMind BI this would query the `Dashboard` table.
  const dashboards = [
    {
      id: 'dash_revenue_overview',
      name: 'Revenue Overview',
      description: 'Monthly revenue, MRR, churn, and LTV across all plans.',
      widgets: 12,
      lastEditedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      url: 'https://datamind.mooo.com/dashboards/revenue-overview',
    },
    {
      id: 'dash_product_engagement',
      name: 'Product Engagement',
      description: 'DAU/MAU, feature adoption, session duration heatmaps.',
      widgets: 18,
      lastEditedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
      url: 'https://datamind.mooo.com/dashboards/product-engagement',
    },
    {
      id: 'dash_support_ops',
      name: 'Support Operations',
      description: 'Ticket volume, CSAT, response-time SLA, agent leaderboard.',
      widgets: 9,
      lastEditedAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
      url: 'https://datamind.mooo.com/dashboards/support-ops',
    },
    {
      id: 'dash_infra_health',
      name: 'Infrastructure Health',
      description: 'CPU, memory, p99 latency, error budget burn across services.',
      widgets: 24,
      lastEditedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      url: 'https://datamind.mooo.com/dashboards/infra-health',
    },
  ]

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

  return NextResponse.json({
    ok: true,
    count: dashboards.length,
    dashboards,
  })
}
