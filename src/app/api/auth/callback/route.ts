import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Supabase Auth callback.
 *
 * Handles the redirect from a magic-link email or an OAuth provider. The
 * URL contains a `code` query param that we exchange for a session, then
 * redirect the browser to `next` (defaults to `/`).
 *
 * This is a Route Handler (not a Server Component) so it can set cookies.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const errorDescription = searchParams.get('error_description')

  if (errorDescription) {
    return NextResponse.redirect(
      `${origin}/?auth_error=${encodeURIComponent(errorDescription)}`,
    )
  }

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll().map((c) => ({ name: c.name, value: c.value }))
          },
          setAll(cookiesToSet) {
            // NextRequest.cookies.set only accepts (name, value) — we set
            // options on the response cookies below.
            cookiesToSet.forEach(({ name, value }) =>
              req.cookies.set(name, value),
            )
          },
        },
      },
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(
        `${origin}/?auth_error=${encodeURIComponent(error.message)}`,
      )
    }

    // The cookies set on `req.cookies` above are NOT automatically propagated
    // to the response. We re-read them and set them on the redirect response
    // with sensible defaults for a session cookie.
    const res = NextResponse.redirect(`${origin}${next}`)
    req.cookies.getAll().forEach((c) => {
      res.cookies.set(c.name, c.value, {
        path: '/',
        sameSite: 'lax',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      })
    })
    return res
  }

  // No code present — redirect home.
  return NextResponse.redirect(`${origin}${next}`)
}
