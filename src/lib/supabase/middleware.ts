import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase Auth session on every navigation request by
 * calling `getUser()`. The act of calling getUser() causes the underlying
 * client to refresh the access token if it's about to expire, and to write
 * the new tokens back to the request cookies.
 *
 * The updated cookies are propagated to the response so the browser keeps
 * the latest tokens.
 *
 * Call this from src/middleware.ts on every matched route.
 */
export async function updateSession(req: NextRequest): Promise<NextResponse> {
  const res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll().map((c) => ({ name: c.name, value: c.value }))
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: getUser() is the call that refreshes the session. Don't remove.
  // We don't need the result here — the side-effect of refreshing the cookies
  // is what matters.
  await supabase.auth.getUser()

  return res
}
