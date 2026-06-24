import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Next.js middleware — runs on every matched request. We use it exclusively
 * to refresh the Supabase Auth session cookie so Server Components see an
 * up-to-date session.
 *
 * Matcher excludes:
 *   - _next/static, _next/image — static assets
 *   - favicon.ico, robots.txt, logo.svg, etc. — public files
 *   - /api/public/* — public API gateway (uses Bearer API key, no Supabase session needed)
 */
export async function middleware(req: NextRequest) {
  return await updateSession(req)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static, _next/image (static files)
     * - favicon.ico, robots.txt, logo.svg, *.png, *.jpg etc (public files)
     * - /api/public/* (the public API gateway uses Bearer tokens, no session)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|logo.svg|api/public|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
