import { NextResponse } from 'next/server'
import {
  authenticateApiKey,
  requireScope,
  getClientIp,
  logApiRequest,
  rateLimitHeaders,
} from '@/lib/api-auth'
import { db } from '@/lib/db'

// GET /api/public/v1/datasources
// Returns the caller's REAL uploaded datasources from BIweb's `data_sources`
// table. Tenant-scoped via `userId = auth.user.id` (text cuid).
//
// IMPORTANT: data_sources.user_id is TEXT and references users.id (cuid),
// NOT auth.users.id (uuid). So we filter with auth.user.id, NOT supabaseId.
// This was verified empirically: count WHERE user_id = users.supabase_id → 0,
// count WHERE user_id = users.id → 1 (for Boceto Perez).
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

  // Real tenant-scoped query — only datasources owned by the API key's user.
  const rows = await db.dataSource.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      fileName: true,
      fileSize: true,
      fileType: true,
      status: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  const datasources = rows.map((ds) => ({
    id: ds.id,
    name: ds.name,
    type: ds.fileType,
    fileName: ds.fileName,
    fileSize: ds.fileSize,
    status: ds.status,
    errorMessage: ds.errorMessage,
    createdAt: ds.createdAt.toISOString(),
    updatedAt: ds.updatedAt.toISOString(),
  }))

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
