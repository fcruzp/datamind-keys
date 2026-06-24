import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  authenticateApiKey,
  requireScope,
  getClientIp,
  logApiRequest,
  rateLimitHeaders,
} from '@/lib/api-auth'

// POST /api/public/v1/queries
// Executes a (sandboxed demo) SQL SELECT. Requires `execute` scope.
const bodySchema = z.object({
  sql: z
    .string()
    .trim()
    .min(1, 'SQL query is required')
    .max(4000, 'SQL query too long (max 4000 chars)'),
  datasourceId: z.string().optional(),
  limit: z.number().int().min(1).max(1000).optional().default(100),
})

export async function POST(req: Request) {
  const started = Date.now()
  const auth = await authenticateApiKey(req)
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: rateLimitHeaders(auth) },
    )
  }
  const scoped = requireScope(auth, 'execute')
  if (!scoped.ok) {
    return NextResponse.json(
      { error: scoped.error },
      { status: scoped.status, headers: rateLimitHeaders(auth) },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  const { sql, limit } = parsed.data
  const lower = sql.toLowerCase().trim()

  // Demo-safe: refuse anything that doesn't start with SELECT
  if (!lower.startsWith('select')) {
    return NextResponse.json(
      { error: 'Only SELECT statements are permitted on this endpoint.' },
      { status: 400 },
    )
  }

  // Demo result: synthesize a tiny result set so OpenFN/N8N flows can wire end-to-end.
  const rows = Array.from({ length: Math.min(limit, 3) }, (_, i) => ({
    id: i + 1,
    label: `row_${i + 1}`,
    value: Math.round(Math.random() * 1000) / 10,
    generated_at: new Date().toISOString(),
  }))

  const durationMs = Date.now() - started
  await logApiRequest({
    apiKeyId: auth.apiKey.id,
    endpoint: '/api/public/v1/queries',
    method: 'POST',
    statusCode: 200,
    durationMs,
    rowCount: rows.length,
    ip: getClientIp(req),
  })

  return NextResponse.json(
    {
      ok: true,
      sql,
      datasourceId: parsed.data.datasourceId ?? 'demo',
      rowCount: rows.length,
      durationMs,
      rows,
    },
    { headers: rateLimitHeaders(auth) },
  )
}
