import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import type { User } from '@prisma/client'
import type { NextRequest } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'

// ===========================================================================
// Session layer — FULL INTEGRATION with BIweb (datamind.mooo.com)
// ===========================================================================
// The `users` table is shared with BIweb. When a user signs in via Supabase
// Auth, we look them up by `supabase_id` (which mirrors auth.users.id).
//
// There are NO demo tenants in this mode — the sandbox demo-seeding logic
// has been removed because we must not pollute the shared `users` table
// with fake accounts.
//
// `tenantName` and `avatarColor` are NOT columns in BIweb's schema. They are
// derived in-memory from the user's `company` field and email so the
// existing UI (tenant badge, avatar gradient) continues to work without
// any DB changes.
// ===========================================================================

export const SESSION_COOKIE = 'dm_session_email'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionUser {
  /** users.id (cuid) — used as FK for api_keys.user_id */
  id: string
  /** users.supabase_id (UUID) — used for settings_audit_logs.user_id */
  supabaseId: string
  email: string
  name: string | null
  /** users.company — used as the tenant/workspace display name */
  company: string | null
  /** users.avatar_url from Supabase user_metadata (if any) */
  avatarUrl: string | null
  role: string
  /** Derived from company or email — NOT stored in DB */
  tenantName: string
  /** Derived from email hash — NOT stored in DB */
  avatarColor: string
  /** True when the session comes from Supabase Auth (production). */
  isSupabase?: boolean
}

// ---------------------------------------------------------------------------
// Derivation helpers (tenantName + avatarColor are UI-only, not in DB)
// ---------------------------------------------------------------------------

const AVATAR_GRADIENTS = [
  'from-emerald-500 to-teal-600',
  'from-sky-500 to-cyan-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-violet-500 to-purple-600',
  'from-lime-500 to-green-600',
  'from-fuchsia-500 to-pink-600',
  'from-indigo-500 to-blue-600',
]

function deriveAvatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]!
}

function deriveTenantName(company: string | null, email: string): string {
  if (company && company.trim()) return company.trim()
  const domain = email.split('@')[1]?.toLowerCase() ?? 'personal'
  const tenant = domain.split('.')[0] ?? 'personal'
  return tenant.charAt(0).toUpperCase() + tenant.slice(1)
}

// ---------------------------------------------------------------------------
// Current-user resolution
// ---------------------------------------------------------------------------

/**
 * Returns the currently logged-in user via Supabase Auth.
 *
 * Resolution:
 *   1. Supabase Auth session → look up `users` row by `supabase_id`.
 *   2. If no Supabase session or user not found in DB → return null
 *      (the UI shows a Sign In card).
 *
 * There is NO demo-cookie fallback in integrated mode — the shared `users`
 * table must not be polluted with fake accounts.
 */
export async function getCurrentUser(
  _req?: NextRequest,
): Promise<SessionUser | null> {
  // --- 1. Try Supabase Auth -------------------------------------------------
  try {
    const supabase = await getSupabaseServer()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const email = user.email ?? ''
      const supabaseId = user.id

      // Look up the user in BIweb's `users` table by supabase_id.
      // The row should exist (created by BIweb's signup trigger), but if it
      // doesn't we create a minimal row so API key operations work.
      let dbUser: User | null = null
      try {
        dbUser = await db.user.findUnique({
          where: { supabaseId },
        })
      } catch (e) {
        console.error('[session] DB lookup by supabaseId failed:', e)
      }

      // If the user doesn't exist in the `users` table yet (e.g. they signed
      // up through Supabase Auth but BIweb's trigger hasn't run), create a
      // minimal row. This is safe — it uses the same schema as BIweb.
      if (!dbUser) {
        try {
          dbUser = await db.user.create({
            data: {
              supabaseId,
              email,
              name:
                (user.user_metadata?.full_name as string | undefined) ??
                (user.user_metadata?.name as string | undefined) ??
                (email ? email.split('@')[0] : 'User'),
              avatarUrl:
                (user.user_metadata?.avatar_url as string | undefined) ??
                (user.user_metadata?.picture as string | undefined) ??
                null,
            },
          })
        } catch (e) {
          console.error('[session] Failed to create user row:', e)
          // Last resort: return a transient user object (no DB row).
          // API key operations will fail, but the page can still render.
          return {
            id: '',
            supabaseId,
            email,
            name: email ? email.split('@')[0] ?? null : null,
            company: null,
            avatarUrl: null,
            role: 'user',
            tenantName: deriveTenantName(null, email),
            avatarColor: deriveAvatarColor(email || supabaseId),
            isSupabase: true,
          }
        }
      }

      // After the above, dbUser is guaranteed non-null (we either found it
      // or created it, or returned early). Assert non-null for TypeScript.
      const u = dbUser!

      const name =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        u.name ??
        (email ? email.split('@')[0] : 'User')
      const avatarUrl =
        (user.user_metadata?.avatar_url as string | undefined) ??
        (user.user_metadata?.picture as string | undefined) ??
        u.avatarUrl ??
        null

      return {
        id: u.id,
        supabaseId: u.supabaseId,
        email: u.email,
        name,
        company: u.company,
        avatarUrl,
        role: u.role,
        tenantName: deriveTenantName(u.company, u.email),
        avatarColor: deriveAvatarColor(u.email || supabaseId),
        isSupabase: true,
      }
    }
  } catch (e) {
    console.error('[session] Supabase Auth failed:', e)
  }

  // --- 2. No session --------------------------------------------------------
  return null
}

// ---------------------------------------------------------------------------
// Tenant switcher (kept for backwards compat — returns empty in integrated mode)
// ---------------------------------------------------------------------------

/**
 * In integrated mode there are no switchable demo tenants. Returns an empty
 * array. The tenant switcher UI is hidden when isSupabase=true (see page.tsx).
 */
export async function listSwitchableUsers(): Promise<SessionUser[]> {
  return []
}

// ---------------------------------------------------------------------------
// Cookie helpers (used by /api/auth/switch — now a no-op in integrated mode)
// ---------------------------------------------------------------------------

export const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
}

// ---------------------------------------------------------------------------
// Backwards-compat: touchLastLogin (no-op — BIweb's users table has no
// lastLoginAt column; we rely on Supabase Auth's last_sign_in_at instead)
// ---------------------------------------------------------------------------

export async function touchLastLogin(_email: string): Promise<void> {
  /* no-op in integrated mode */
}
