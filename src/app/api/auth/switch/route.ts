import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  listSwitchableUsers,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTS,
  touchLastLogin,
} from '@/lib/session'

// POST /api/auth/switch
// Switches the sandbox session to a different demo tenant by setting the
// `dm_session_email` cookie. In production DataMind BI this would be a real
// Supabase sign-in / org-switch flow.

const schema = z.object({
  email: z.string().email().max(120),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid email.', details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  // Make sure the target email is one of our seeded demo tenants.
  // (Defensive: prevents random emails from being written into the cookie.)
  const switchable = await listSwitchableUsers()
  const target = switchable.find((u) => u.email === parsed.data.email)
  if (!target) {
    return NextResponse.json(
      { error: 'Unknown tenant. Pick one of the seeded demo users.' },
      { status: 404 },
    )
  }

  await touchLastLogin(target.email)

  const res = NextResponse.json({
    ok: true,
    current: {
      id: target.id,
      email: target.email,
      name: target.name,
      tenantName: target.tenantName,
      avatarColor: target.avatarColor,
      role: target.role,
    },
  })
  res.cookies.set(SESSION_COOKIE, target.email, SESSION_COOKIE_OPTS)
  return res
}
