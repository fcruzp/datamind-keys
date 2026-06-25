import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  authenticateApiKey,
  requireScope,
  getClientIp,
  logApiRequest,
  rateLimitHeaders,
} from '@/lib/api-auth'
import { db } from '@/lib/db'

// POST /api/public/v1/queries
// Accepts a SQL SELECT + optional datasourceId. Tenant-scoped:
//   - If datasourceId is provided, verifies it belongs to the caller
//     (userId = auth.user.id). Returns 404 if not found or not owned.
//   - Returns the datasource's real metadata as the result row(s) so the
//     caller can confirm tenant isolation.
//
// NOTE: data_sources stores UPLOADED SQLITE FILES (file_name, file_path,
// file_type='sqlite'), NOT live database connections. Executing arbitrary
// SQL against an uploaded file requires reading it from disk/storage and
// using a SQLite driver — that's a future enhancement. For now, the endpoint
// validates ownership and returns real tenant-scoped datasource metadata.
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

  // Safety: refuse anything that doesn't start with SELECT
  if (!lower.startsWith('select')) {
    return NextResponse.json(
      { error: 'Only SELECT statements are permitted on this endpoint.' },
      { status: 400 },
    )
  }

  // --- Tenant-scoped datasource resolution --------------------------------
  // data_sources.user_id is TEXT → users.id (cuid). Filter with auth.user.id.
  let datasource: {
    id: string
    name: string
    fileName: string
    fileSize: number
    fileType: string
    status: string
    userId: string | null
  } | null = null

  if (parsed.data.datasourceId && parsed.data.datasourceId !== 'demo') {
    // Caller specified a datasource — verify ownership.
    datasource = await db.dataSource.findFirst({
      where: {
        id: parsed.data.datasourceId,
        userId: auth.user.id, // tenant scoping — only the caller's datasources
      },
      select: {
        id: true,
        name: true,
        fileName: true,
        fileSize: true,
        fileType: true,
        status: true,
        userId: true,
      },
    })

    if (!datasource) {
      // Don't reveal whether the datasource exists for another tenant.
      const durationMs = Date.now() - started
      await logApiRequest({
        apiKeyId: auth.apiKey.id,
        endpoint: '/api/public/v1/queries',
        method: 'POST',
        statusCode: 404,
        durationMs,
        ip: getClientIp(req),
      })
      return NextResponse.json(
        {
          error: `Datasource '${parsed.data.datasourceId}' not found in your account.`,
        },
        { status: 404, headers: rateLimitHeaders(auth) },
      )
    }
  } else {
    // No specific datasource — use the caller's most recent one (if any).
    datasource = await db.dataSource.findFirst({
      where: { userId: auth.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        fileName: true,
        fileSize: true,
        fileType: true,
        status: true,
        userId: true,
      },
    })
  }

  // Build a tenant-scoped result. If a datasource was found, return its real
  // metadata as a single row — proving the response is scoped to the caller.
  // If no datasource exists, return an empty rows array (still tenant-scoped).
  const rows: Record<string, unknown>[] = []
  if (datasource) {
    rows.push({
      datasource_id: datasource.id,
      datasource_name: datasource.name,
      file_name: datasource.fileName,
      file_size: datasource.fileSize,
      file_type: datasource.fileType,
      status: datasource.status,
      owner_user_id: datasource.userId,
      note: 'SQLite file upload — live SQL execution against uploaded files is not yet supported. Metadata is real and tenant-scoped.',
    })
  }

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
      datasourceId: datasource?.id ?? parsed.data.datasourceId ?? 'none',
      rowCount: rows.length,
      durationMs,
      rows: rows.slice(0, limit),
    },
    { headers: rateLimitHeaders(auth) },
  )
}
