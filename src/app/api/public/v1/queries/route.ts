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
import {
  executeSqliteQuery,
  SqliteQueryError,
} from '@/lib/sqlite-executor'

// POST /api/public/v1/queries
// Executes a SELECT against the caller's uploaded SQLite datasource.
// Tenant-scoped: the datasource must be owned by the API key's user.
//
// Storage: SQLite files live on a shared volume at /home/z/my-project/upload/
// (mounted from BIweb's persistent storage in Coolify). If the volume is not
// configured, the endpoint returns a clear error.
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

  // --- Tenant-scoped datasource resolution --------------------------------
  // data_sources.user_id is TEXT → users.id (cuid). Filter with auth.user.id.
  let datasource: {
    id: string
    name: string
    fileName: string
    fileSize: number
    fileType: string
    status: string
    filePath: string
    userId: string | null
  } | null = null

  if (parsed.data.datasourceId && parsed.data.datasourceId !== 'demo') {
    // Caller specified a datasource — verify ownership.
    datasource = await db.dataSource.findFirst({
      where: {
        id: parsed.data.datasourceId,
        userId: auth.user.id, // tenant scoping
      },
      select: {
        id: true,
        name: true,
        fileName: true,
        fileSize: true,
        fileType: true,
        status: true,
        filePath: true,
        userId: true,
      },
    })

    if (!datasource) {
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
        filePath: true,
        userId: true,
      },
    })
  }

  // If no datasource exists at all, return empty rows (still tenant-scoped).
  if (!datasource) {
    const durationMs = Date.now() - started
    await logApiRequest({
      apiKeyId: auth.apiKey.id,
      endpoint: '/api/public/v1/queries',
      method: 'POST',
      statusCode: 200,
      durationMs,
      rowCount: 0,
      ip: getClientIp(req),
    })
    return NextResponse.json(
      {
        ok: true,
        sql,
        datasourceId: 'none',
        rowCount: 0,
        durationMs,
        rows: [],
      },
      { headers: rateLimitHeaders(auth) },
    )
  }

  // --- Execute the SQL against the SQLite file ----------------------------
  let result: { rows: Record<string, unknown>[]; rowCount: number; durationMs: number }
  let statusCode = 200

  try {
    result = executeSqliteQuery(datasource.filePath, sql, limit)
  } catch (e) {
    if (e instanceof SqliteQueryError) {
      statusCode = e.code === 'VALIDATION' ? 400 : e.code === 'FILE_NOT_FOUND' ? 503 : 500
      const durationMs = Date.now() - started
      await logApiRequest({
        apiKeyId: auth.apiKey.id,
        endpoint: '/api/public/v1/queries',
        method: 'POST',
        statusCode,
        durationMs,
        ip: getClientIp(req),
      })
      return NextResponse.json(
        {
          ok: false,
          error: e.message,
          code: e.code,
          datasourceId: datasource.id,
        },
        { status: statusCode, headers: rateLimitHeaders(auth) },
      )
    }
    // Unexpected error
    statusCode = 500
    const durationMs = Date.now() - started
    await logApiRequest({
      apiKeyId: auth.apiKey.id,
      endpoint: '/api/public/v1/queries',
      method: 'POST',
      statusCode,
      durationMs,
      ip: getClientIp(req),
    })
    return NextResponse.json(
      {
        ok: false,
        error: 'An unexpected error occurred during query execution.',
        datasourceId: datasource.id,
      },
      { status: 500, headers: rateLimitHeaders(auth) },
    )
  }

  const durationMs = Date.now() - started
  await logApiRequest({
    apiKeyId: auth.apiKey.id,
    endpoint: '/api/public/v1/queries',
    method: 'POST',
    statusCode: 200,
    durationMs,
    rowCount: result.rowCount,
    ip: getClientIp(req),
  })

  return NextResponse.json(
    {
      ok: true,
      sql,
      datasourceId: datasource.id,
      rowCount: result.rowCount,
      durationMs: result.durationMs,
      rows: result.rows,
    },
    { headers: rateLimitHeaders(auth) },
  )
}
