import { NextResponse } from 'next/server'

/**
 * Lightweight health-check endpoint used by:
 *   - Docker / Coolify healthcheck (docker-compose.yml)
 *   - Load balancer liveness probes
 *
 * Returns 200 + JSON { ok: true, ts } when the process is up and serving
 * requests. Intentionally does NOT touch the database or Supabase — those
 * are checked by deeper monitoring, and a health endpoint that fails when
 * the DB has a hiccup causes cascading restarts we don't want.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'datamind-keys',
      ts: new Date().toISOString(),
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    },
  )
}
