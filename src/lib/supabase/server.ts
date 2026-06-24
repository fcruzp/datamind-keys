import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

/**
 * Server-side Supabase client for use in Server Components, Route Handlers,
 * and Server Actions. Reads + writes the auth cookies via next/headers.
 *
 * IMPORTANT: the cookies().set() call only works inside Route Handlers or
 * Server Actions — Server Components cannot set cookies. Supabase handles
 * this gracefully by attempting the set and silently no-op'ing if it fails.
 */
export async function getSupabaseServer() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions — see src/middleware.ts.
          }
        },
      },
    },
  )
}

/**
 * Server-side Supabase client that reads cookies off a NextRequest instead
 * of the next/headers store. Use this inside Route Handlers where you
 * already have the request object and don't want to await cookies().
 *
 * Returns both the client and a headers object containing any Set-Cookie
 * headers that need to be attached to the response.
 */
export function getSupabaseServerFromReq(req: NextRequest) {
  // We mutate a list of cookies as the Supabase client refreshes the session
  // and then attach them to the outgoing NextResponse in the route handler.
  const setCookies: { name: string; value: string; options: Record<string, unknown> }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll().map((c) => ({ name: c.name, value: c.value }))
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            setCookies.push({ name, value, options })
          })
        },
      },
    },
  )

  return { supabase, setCookies }
}

/**
 * Service-role Supabase client — bypasses RLS. Use ONLY in trusted server
 * contexts (webhooks, cron jobs, the public API gateway that authenticates
 * with a Bearer API key instead of a Supabase JWT).
 *
 * NEVER expose this client to the browser.
 */
export function getSupabaseService() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}
