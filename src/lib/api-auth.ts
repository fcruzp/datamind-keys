import { createHash, randomBytes, randomUUID } from 'crypto'
import { db } from '@/lib/db'
import type { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApiScope = 'read' | 'execute' | 'admin'

export const ALL_SCOPES: ApiScope[] = ['read', 'execute', 'admin']

export interface AuthenticatedUser {
  id: string
  email: string
  name: string | null
}

export interface AuthenticatedApiKey {
  id: string
  label: string
  scopes: ApiScope[]
  prefix: string
  lastUsedAt: Date | null
}

export interface AuthSuccess {
  ok: true
  user: AuthenticatedUser
  apiKey: AuthenticatedApiKey
}

export interface AuthFailure {
  ok: false
  error: string
  status: number
}

export type AuthResult = AuthSuccess | AuthFailure

// ---------------------------------------------------------------------------
// Demo user bootstrap (no Supabase in this sandbox)
// In production DataMind BI, replace this with Supabase session resolution.
// ---------------------------------------------------------------------------

const DEMO_USER_EMAIL = 'demo@datamind.bi'
const DEMO_USER_NAME = 'DataMind Demo'

/**
 * Returns the sandbox demo user, creating it on first call.
 * In real DataMind BI this would resolve the Supabase session user instead.
 */
export async function getDemoUser(): Promise<AuthenticatedUser> {
  let user = await db.user.findUnique({
    where: { email: DEMO_USER_EMAIL },
  })
  if (!user) {
    user = await db.user.create({
      data: { email: DEMO_USER_EMAIL, name: DEMO_USER_NAME },
    })
  }
  return { id: user.id, email: user.email, name: user.name }
}

// ---------------------------------------------------------------------------
// Key generation & hashing
// ---------------------------------------------------------------------------

const KEY_PREFIX_FULL = 'dm_live_'

/**
 * Generates a new API key.
 * Returns plaintext (shown ONCE to user), SHA-256 hash (stored), and prefix (stored).
 */
export function generateApiKey(): {
  plaintext: string
  hash: string
  prefix: string
} {
  // 32 random chars, base62-ish (strip ambiguous chars)
  const rand = randomBytes(32).toString('base64url').replace(/[-_]/g, '')
  const body = rand.slice(0, 32)
  const plaintext = `${KEY_PREFIX_FULL}${body}`
  const hash = hashApiKey(plaintext)
  const prefix = plaintext.slice(0, KEY_PREFIX_FULL.length + 4) // "dm_live_a1B2"
  return { plaintext, hash, prefix }
}

/** SHA-256 hash of the plaintext key. We never store plaintext. */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

/** Mask a stored prefix for display: "dm_live_a1B2••••" */
export function maskApiKey(prefix: string): string {
  return `${prefix}${'•'.repeat(4)}`
}

// ---------------------------------------------------------------------------
// Scope helpers
// ---------------------------------------------------------------------------

export function parseScopes(scopesJson: string): ApiScope[] {
  try {
    const parsed = JSON.parse(scopesJson) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is ApiScope =>
      typeof s === 'string' && ALL_SCOPES.includes(s as ApiScope),
    )
  } catch {
    return []
  }
}

export function serializeScopes(scopes: ApiScope[]): string {
  return JSON.stringify([...new Set(scopes)])
}

/**
 * Checks if the key has the required scope.
 * `admin` scope implies all other scopes.
 */
export function requireScope(
  auth: AuthResult,
  scope: ApiScope,
): AuthResult {
  if (!auth.ok) return auth
  const hasIt =
    auth.apiKey.scopes.includes('admin') ||
    auth.apiKey.scopes.includes(scope)
  if (!hasIt) {
    return {
      ok: false,
      error: `Insufficient scope. Required: ${scope}. Key scopes: ${auth.apiKey.scopes.join(', ') || '(none)'}`,
      status: 403,
    }
  }
  return auth
}

// ---------------------------------------------------------------------------
// Request authentication (Bearer token)
// ---------------------------------------------------------------------------

export function extractBearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!auth) return null
  const m = auth.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

export function getClientIp(req: Request | NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return null
}

/**
 * Validates an incoming Bearer token against the DB.
 * - Rejects revoked / expired keys
 * - Updates lastUsedAt + lastUsedIp as a side effect
 *
 * Returns discriminated union — callers should check `result.ok`.
 */
export async function authenticateApiKey(req: Request): Promise<AuthResult> {
  const token = extractBearerToken(req)
  if (!token) {
    return {
      ok: false,
      error: 'Missing Authorization header. Expected: Bearer dm_live_...',
      status: 401,
    }
  }
  if (!token.startsWith(KEY_PREFIX_FULL)) {
    return {
      ok: false,
      error: `Invalid API key format. Keys must start with "${KEY_PREFIX_FULL}".`,
      status: 401,
    }
  }

  const hash = hashApiKey(token)
  const apiKey = await db.apiKey.findUnique({
    where: { keyHash: hash },
    include: { user: true },
  })

  if (!apiKey) {
    return { ok: false, error: 'Invalid API key.', status: 401 }
  }
  if (apiKey.revokedAt) {
    return { ok: false, error: 'API key has been revoked.', status: 401 }
  }
  if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: 'API key has expired.', status: 401 }
  }

  // Fire-and-forget: update lastUsedAt + IP without blocking the response
  const ip = getClientIp(req)
  db.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date(), lastUsedIp: ip },
    })
    .catch(() => {
      /* best-effort, ignore */
    })

  return {
    ok: true,
    user: {
      id: apiKey.user.id,
      email: apiKey.user.email,
      name: apiKey.user.name,
    },
    apiKey: {
      id: apiKey.id,
      label: apiKey.label,
      scopes: parseScopes(apiKey.scopes),
      prefix: apiKey.keyPrefix,
      lastUsedAt: apiKey.lastUsedAt,
    },
  }
}

// ---------------------------------------------------------------------------
// Request logging (used by public API endpoints)
// ---------------------------------------------------------------------------

export async function logApiRequest(params: {
  apiKeyId: string
  endpoint: string
  method: string
  statusCode: number
  durationMs: number
  rowCount?: number
  ip?: string | null
}): Promise<void> {
  try {
    await db.apiRequestLog.create({
      data: {
        id: randomUUID(),
        apiKeyId: params.apiKeyId,
        endpoint: params.endpoint,
        method: params.method,
        statusCode: params.statusCode,
        durationMs: params.durationMs,
        rowCount: params.rowCount ?? null,
        ip: params.ip ?? null,
      },
    })
  } catch {
    /* best-effort */
  }
}
