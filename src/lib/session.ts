import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import type { NextRequest } from 'next/server'

/**
 * Multi-tenant session layer for the DataMind BI sandbox.
 *
 * In production, the logged-in user is resolved from the Supabase Auth session
 * (JWT in a cookie, validated server-side). The sandbox can't talk to Supabase,
 * so we simulate "logged-in user" with a plain cookie that stores the user's
 * email. Switching tenants = swapping the cookie.
 *
 * The set of switchable users is seeded deterministically so the demo always
 * has at least three tenants to flip between.
 */

export const SESSION_COOKIE = 'dm_session_email'

// ---------------------------------------------------------------------------
// Demo tenant seed
// ---------------------------------------------------------------------------

interface DemoTenantSeed {
  email: string
  name: string
  tenantName: string
  avatarColor: string
  role: 'owner' | 'admin' | 'viewer'
}

const DEMO_TENANTS: DemoTenantSeed[] = [
  {
    email: 'demo@datamind.bi',
    name: 'DataMind Demo',
    tenantName: 'DataMind BI',
    avatarColor: 'from-emerald-500 to-teal-600',
    role: 'owner',
  },
  {
    email: 'ana@acme.io',
    name: 'Ana Martínez',
    tenantName: 'Acme Analytics',
    avatarColor: 'from-sky-500 to-cyan-600',
    role: 'owner',
  },
  {
    email: 'luis@norte.com',
    name: 'Luis Pereira',
    tenantName: 'Norte Logistics',
    avatarColor: 'from-amber-500 to-orange-600',
    role: 'owner',
  },
  {
    email: 'viewer@acme.io',
    name: 'Marta (viewer)',
    tenantName: 'Acme Analytics',
    avatarColor: 'from-rose-500 to-pink-600',
    role: 'viewer',
  },
]

/**
 * Idempotently seeds the demo tenants. Safe to call on every request — it
 * upserts each seeded user so their tenantName / avatarColor / role always
 * match the spec below (important because older sandbox DBs may already
 * contain a `demo@datamind.bi` user created before the multi-tenant
 * schema migration, with the default `tenantName = "Personal"`).
 */
export async function seedDemoTenants(): Promise<void> {
  for (const seed of DEMO_TENANTS) {
    await db.user.upsert({
      where: { email: seed.email },
      create: {
        email: seed.email,
        name: seed.name,
        tenantName: seed.tenantName,
        avatarColor: seed.avatarColor,
        role: seed.role,
      },
      update: {
        name: seed.name,
        tenantName: seed.tenantName,
        avatarColor: seed.avatarColor,
        role: seed.role,
      },
    })
  }
}

// ---------------------------------------------------------------------------
// Current-user resolution
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string
  email: string
  name: string | null
  tenantName: string
  avatarColor: string
  role: string
}

const DEFAULT_SESSION_EMAIL = DEMO_TENANTS[0]!.email

/**
 * Returns the currently "logged-in" sandbox user, seeding the demo tenants
 * on first call and creating a fallback user if the cookie points at an
 * unknown email.
 *
 * Works in both Server Components (uses next/headers `cookies()`) and Route
 * Handlers (NextRequest cookies). Pass a NextRequest to use the request's
 * cookies instead of the async next/headers store.
 */
export async function getCurrentUser(
  req?: NextRequest,
): Promise<SessionUser> {
  await seedDemoTenants()

  let email: string | undefined
  if (req) {
    email = req.cookies.get(SESSION_COOKIE)?.value
  } else {
    const c = await cookies()
    email = c.get(SESSION_COOKIE)?.value
  }

  // Fall back to the default demo tenant if no / invalid cookie is set.
  let user = email
    ? await db.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          tenantName: true,
          avatarColor: true,
          role: true,
        },
      })
    : null

  if (!user) {
    user = await db.user.findUnique({
      where: { email: DEFAULT_SESSION_EMAIL },
      select: {
        id: true,
        email: true,
        name: true,
        tenantName: true,
        avatarColor: true,
        role: true,
      },
    })
  }

  // Extremely defensive: should never happen because seedDemoTenants() ran.
  if (!user) {
    throw new Error('Failed to resolve session user')
  }

  return user
}

/**
 * Lists every demo tenant the current operator is allowed to switch into.
 * In the sandbox, all seeded users are switchable (simulating an org admin
 * toggling between tenant workspaces).
 */
export async function listSwitchableUsers(): Promise<SessionUser[]> {
  await seedDemoTenants()
  const users = await db.user.findMany({
    orderBy: [{ tenantName: 'asc' }, { email: 'asc' }],
    select: {
      id: true,
      email: true,
      name: true,
      tenantName: true,
      avatarColor: true,
      role: true,
    },
  })
  return users
}

/**
 * Touch `lastLoginAt` for the user that just switched-in. Best-effort.
 */
export async function touchLastLogin(email: string): Promise<void> {
  try {
    await db.user.update({
      where: { email },
      data: { lastLoginAt: new Date() },
    })
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------------
// Cookie helpers (used by the /api/auth/switch route)
// ---------------------------------------------------------------------------

export const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
}
