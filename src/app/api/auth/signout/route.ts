import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * POST /api/auth/signout
 *
 * Signs the user out of Supabase Auth and clears the auth cookies. Also
 * clears the demo `dm_session_email` cookie so the sandbox demo session
 * doesn't leak back in.
 */
export async function POST(req: NextRequest) {
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

  await supabase.auth.signOut()

  const res = NextResponse.json({ ok: true })
  setCookies.forEach(({ name, value, options }) =>
    res.cookies.set(name, value, options as never),
  )
  // Also clear the demo session cookie.
  res.cookies.set('dm_session_email', '', { path: '/', maxAge: 0 })
  return res
}
