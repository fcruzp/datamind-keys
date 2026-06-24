import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Wraps an API route handler so that any Prisma/DB error is caught and
 * returned as a graceful empty response instead of a 500 crash.
 *
 * Usage:
 *   export const GET = withDbSafe(async (req) => { ... })
 *
 * The handler receives the request and may return any NextResponse. If it
 * throws a Prisma error (P1001, P2003, P2021, etc.) or any error that looks
 * DB-related, we return:
 *   - For GET: 200 with empty payload ({ keys: [], logs: [], ... })
 *   - For POST/PATCH/DELETE: 503 with { error: 'Database unavailable' }
 *
 * In all error cases, the Prisma error code + message are included in the
 * response body so the frontend (and the user via DevTools Network tab) can
 * see exactly what went wrong.
 */
export function withDbSafe<T extends NextRequest>(
  handler: (req: T) => Promise<NextResponse>,
): (req: T) => Promise<NextResponse> {
  return async (req: T) => {
    try {
      return await handler(req)
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string; meta?: unknown }
      const code = err?.code ?? ''
      const msg = err?.message ?? ''
      const meta = err?.meta

      // Prisma error codes:
      // P1xxx = connection errors
      // P2xxx = CRUD errors (P2021 = table does not exist, P2002 = unique constraint)
      const isDbError =
        code.startsWith('P1') ||
        code.startsWith('P2') ||
        msg.includes('relation') ||
        msg.includes('database') ||
        msg.includes('connect') ||
        msg.includes('prisma')

      // Authentication errors (thrown by getDemoUser when no Supabase session)
      // are returned as 401, not 503.
      if (msg.includes('Not authenticated') || msg.includes('authentication')) {
        return NextResponse.json(
          { error: 'Not authenticated. Please sign in.' },
          { status: 401 },
        )
      }

      console.error('[api] DB error:', {
        code,
        message: msg,
        meta,
        url: req.url,
        method: req.method,
      })

      // Detailed error info — included in ALL responses so the user can
      // diagnose via DevTools → Network → Response tab.
      const errorDetail = {
        prismaCode: code || undefined,
        message: msg.slice(0, 500),
        meta: meta ? JSON.stringify(meta).slice(0, 500) : undefined,
      }

      if (req.method === 'GET') {
        // Return empty payload for GETs so the UI can render.
        return NextResponse.json(
          {
            keys: [],
            logs: [],
            stats: {
              activeKeys: 0,
              revokedKeys: 0,
              requests7d: 0,
              lastRequestAt: null,
            },
            recentLogs: [],
            perKeyStats: [],
            // Dashboard usage query expects these fields:
            totals: {
              requests7d: 0,
              avgDurationMs: 0,
              lastRequestAt: null,
            },
            hourlyHistogram: new Array(24).fill(0),
            logs24h: 0,
            auditLogs: [],
            revokedKeys: [],
            error: isDbError ? 'Database unavailable' : 'Internal error',
            errorDetail,
          },
          { status: 200 },
        )
      }

      return NextResponse.json(
        {
          error: 'Database temporarily unavailable',
          errorDetail,
        },
        { status: 503 },
      )
    }
  }
}
