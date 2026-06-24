import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@supabase/ssr'

/**
 * POST /api/auth/signin
 * Body: { email: string, password?: string }
 *
 * - If `password` is provided: signs in with email/password.
 * - Otherwise: sends a magic-link email. The link redirects to
 *   /api/auth/callback?code=... which exchanges the code for a session.
 *
 * The Supabase cookies set during sign-in (or in the magic-link flow) are
 * propagated back to the browser via Set-Cookie headers on the response.
 */
const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
})

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof BodySchema>
  try {
    parsed = BodySchema.parse(await req.json())
  } catch (e) {
    const err = e as { issues?: { message: string }[] }
    return NextResponse.json(
      { error: err.issues?.[0]?.message ?? 'Invalid request body' },
      { status: 400 },
    )
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
    new URL(req.url).origin

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

  if (parsed.password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.email,
      password: parsed.password,
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    const res = NextResponse.json({
      ok: true,
      mode: 'password',
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    })
    setCookies.forEach(({ name, value, options }) =>
      res.cookies.set(name, value, options as never),
    )
    return res
  }

  // Magic link
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${siteUrl}/api/auth/callback`,
    },
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    mode: 'magic-link',
    message: `Magic link sent to ${parsed.email}. Click the link in the email to sign in.`,
  })
}
