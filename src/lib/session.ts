import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import type { NextRequest } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'

/**
 * Multi-tenant session layer for the DataMind BI portal.
 *
 * Resolution order:
 *   1. Supabase Auth session (JWT in cookies) — used in production.
 *      If a real Supabase user is signed in, we mirror them into the local
 *      SQLite `User` table (id = supabase uuid, email, name from metadata)
 *      so the rest of the codebase (which queries Prisma) continues to work
 *      unchanged.
 *   2. Demo cookie (`dm_session_email`) — sandbox fallback so the portal
 *      remains explorable without a Supabase account. Seeded with 4 demo
 *      tenants (DataMind BI, Acme Analytics, Norte Logistics, …).
 *
 * In a future phase, when the Prisma client is migrated to Postgres, the
 * local SQLite `User` mirror is no longer needed — the production tables
 * (`auth.users` + `public.user_profiles`) become the source of truth.
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
  /** True when the session comes from Supabase Auth (production). */
  isSupabase?: boolean
  /** Avatar URL from Supabase user_metadata (if any). */
  avatarUrl?: string | null
}

const DEFAULT_SESSION_EMAIL = DEMO_TENANTS[0]!.email

/**
 * Derives a tenant name + avatar color from a Supabase user's email /
 * metadata. Used when we mirror a Supabase user into the local User table
 * (the Supabase `user_profiles` table is authoritative in production, but
 * the sandbox SQLite mirror doesn't have those columns joined).
 */
function deriveTenantFromEmail(email: string): {
  tenantName: string
  avatarColor: string
} {
  const domain = email.split('@')[1]?.toLowerCase() ?? 'personal'
  // Map a handful of well-known domains to brand colours; everything else
  // gets a default emerald avatar and a tenant name based on the domain.
  const palette: Record<string, string> = {
    'datamind.bi': 'from-emerald-500 to-teal-600',
    'acme.io': 'from-sky-500 to-cyan-600',
    'norte.com': 'from-amber-500 to-orange-600',
  }
  const tenant = domain.split('.')[0]
  return {
    tenantName: tenant.charAt(0).toUpperCase() + tenant.slice(1),
    avatarColor: palette[domain] ?? 'from-emerald-500 to-teal-600',
  }
}

async function fetchUserFields(id: string, email: string, name: string | null) {
  // Look for an existing local row; if found, keep its tenant fields.
  const existing = await db.user.findUnique({
    where: { id },
    select: { tenantName: true, avatarColor: true, role: true, name: true },
  })
  if (existing) {
    // Refresh email + name in case they changed upstream.
    if (existing.name !== name) {
      await db.user.update({ where: { id }, data: { name } })
    }
    return existing
  }
  // First-time login from Supabase: mirror into local SQLite.
  const derived = deriveTenantFromEmail(email)
  return db.user
    .upsert({
      where: { email },
      create: {
        id,
        email,
        name,
        tenantName: derived.tenantName,
        avatarColor: derived.avatarColor,
        role: 'owner',
        lastLoginAt: new Date(),
      },
      update: { id, name, lastLoginAt: new Date() },
      select: { tenantName: true, avatarColor: true, role: true, name: true },
    })
    .then((r) => r ?? derived)
}

/**
 * Returns the currently logged-in user.
 *
 * Tries Supabase Auth first. If a real Supabase session exists, the user is
 * mirrored into the local SQLite `User` table so the rest of the codebase
 * (which queries Prisma) sees a consistent row. The returned SessionUser is
 * flagged `isSupabase: true` so the UI can show "Signed in via Supabase"
 * and offer a Sign Out button.
 *
 * If no Supabase session, falls back to the demo cookie (`dm_session_email`)
 * seeded with 4 deterministic demo tenants.
 */
export async function getCurrentUser(
  req?: NextRequest,
): Promise<SessionUser> {
  // Seed demo tenants — wrapped in try/catch so a transient DB issue
  // (e.g. pgbouncer connection reset) doesn't crash the entire page.
  try {
    await seedDemoTenants()
  } catch (e) {
    console.error('[session] seedDemoTenants failed:', e)
  }

  // --- 1. Try Supabase Auth -------------------------------------------------
  try {
    const supabase = await getSupabaseServer()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const email = user.email ?? ''
      const name =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        (email ? email.split('@')[0] : 'Supabase User')
      const avatarUrl = (user.user_metadata?.avatar_url as string | undefined) ??
        (user.user_metadata?.picture as string | undefined) ??
        null

      const fields = await fetchUserFields(user.id, email, name)

      return {
        id: user.id,
        email,
        name: fields.name ?? name,
        tenantName: fields.tenantName,
        avatarColor: fields.avatarColor,
        role: fields.role,
        isSupabase: true,
        avatarUrl,
      }
    }
  } catch {
    // Supabase unreachable (e.g. sandbox without network) — fall through
    // to the demo cookie session.
  }

  // --- 2. Fall back to demo cookie session ---------------------------------
  let email: string | undefined
  try {
    if (req) {
      email = req.cookies.get(SESSION_COOKIE)?.value
    } else {
      const c = await cookies()
      email = c.get(SESSION_COOKIE)?.value
    }
  } catch {
    // cookies() not available in this context — continue with no email.
  }

  // Defensive DB lookup — if the DB is unreachable or tables don't exist,
  // fall through to the hardcoded demo user instead of crashing the page.
  let user: SessionUser | null = null
  try {
    if (email) {
      user = await db.user.findUnique({
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
    }

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
  } catch (e) {
    console.error('[session] DB lookup failed:', e)
  }

  // Hard fallback: if the DB is down or the demo user doesn't exist,
  // return a synthetic anonymous demo user so the page can still render.
  if (!user) {
    return {
      id: 'anonymous-demo',
      email: DEFAULT_SESSION_EMAIL,
      name: 'DataMind Demo',
      tenantName: 'DataMind BI',
      avatarColor: 'from-emerald-500 to-teal-600',
      role: 'owner',
    }
  }

  return user
}

/**
 * Lists every demo tenant the current operator is allowed to switch into.
 *
 * NOTE: this is only relevant for the demo cookie session. When a Supabase
 * user is logged in, the tenant switcher is hidden (Supabase users switch
 * tenants by signing out + into a different account, OR by joining multiple
 * orgs — which is a future feature).
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
