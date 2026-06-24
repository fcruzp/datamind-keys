import { createHash, randomBytes } from 'crypto'
import { db } from '@/lib/db'
import type { NextRequest } from 'next/server'
import { getCurrentUser, type SessionUser } from '@/lib/session'

// ===========================================================================
// API authentication + authorization layer
// ===========================================================================
// FULL INTEGRATION: The `api_keys` table is shared with BIweb and does NOT
// have `allowed_ips` or `rate_limit_per_minute` columns. Those features have
// been removed from persistence:
//   - Rate limiting is now in-memory only, using the global default (60/min).
//   - IP allowlisting is removed (always allows).
// ===========================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApiScope = 'read' | 'execute' | 'admin'

export const ALL_SCOPES: ApiScope[] = ['read', 'execute', 'admin']

export interface AuthenticatedUser {
  /** users.id (cuid) — used as FK for api_keys.user_id */
  id: string
  /** users.supabase_id (UUID) — used for settings_audit_logs.user_id */
  supabaseId: string
  email: string
  name: string | null
  /** Tenant / workspace name this user belongs to (derived). */
  tenantName?: string
  /** User role: "user" | "admin". */
  role?: string
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
  /** Rate-limit info to be exposed as X-RateLimit-* headers by the route. */
  rateLimit: {
    limit: number
    remaining: number
    retryAfter: null
  }
}

export interface AuthFailure {
  ok: false
  error: string
  status: number
  /** Set only when status === 429. */
  rateLimit?: {
    limit: number
    remaining: 0
    retryAfter: number
  }
}

export type AuthResult = AuthSuccess | AuthFailure

// ---------------------------------------------------------------------------
// Current-user resolution
// ---------------------------------------------------------------------------

/**
 * Returns the current user from the Supabase Auth session.
 * In integrated mode there is no demo-cookie fallback — if no Supabase
 * session exists, this throws so the caller can return 401.
 */
export async function getDemoUser(
  req?: NextRequest,
): Promise<AuthenticatedUser> {
  const u = await getCurrentUser(req)
  if (!u) {
    throw new Error('Not authenticated')
  }
  return toAuthenticatedUser(u)
}

export function toAuthenticatedUser(u: SessionUser): AuthenticatedUser {
  return {
    id: u.id,
    supabaseId: u.supabaseId,
    email: u.email,
    name: u.name,
    tenantName: u.tenantName,
    role: u.role,
  }
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

  // Rate limit (in-memory token bucket per key, global default 60/min)
  const limit = DEFAULT_RATE_LIMIT_PER_MINUTE
  const rate = checkRateLimit(apiKey.id)
  if (!rate.ok) {
    return {
      ok: false,
      error: `Rate limit exceeded. Try again in ${rate.retryAfter}s.`,
      status: 429,
      rateLimit: {
        limit,
        remaining: 0,
        retryAfter: rate.retryAfter,
      },
    }
  }

  // Fire-and-forget: update lastUsedAt + IP without blocking the response
  db.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date(), lastUsedIp: getClientIp(req) },
    })
    .catch(() => {
      /* best-effort, ignore */
    })

  return {
    ok: true,
    user: {
      id: apiKey.user.id,
      supabaseId: apiKey.user.supabaseId,
      email: apiKey.user.email,
      name: apiKey.user.name,
      role: apiKey.user.role,
    },
    apiKey: {
      id: apiKey.id,
      label: apiKey.label,
      scopes: parseScopes(apiKey.scopes),
      prefix: apiKey.keyPrefix,
      lastUsedAt: apiKey.lastUsedAt,
    },
    rateLimit: {
      limit,
      remaining: rate.remaining,
      retryAfter: null,
    },
  }
}

/**
 * Builds the standard rate-limit headers to attach to public API responses.
 * Works for both success (200) and rate-limited (429) responses.
 */
export function rateLimitHeaders(auth: AuthResult): Record<string, string> {
  if (!auth.rateLimit) return {}
  const { limit, remaining, retryAfter } = auth.rateLimit
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
  }
  if (retryAfter !== null) {
    headers['Retry-After'] = String(retryAfter)
  }
  return headers
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

// ---------------------------------------------------------------------------
// In-memory rate limiting (token bucket per API key)
// ---------------------------------------------------------------------------

export const DEFAULT_RATE_LIMIT_PER_MINUTE = 60

interface RateBucket {
  tokens: number
  lastRefill: number
}

const DEFAULT_REFILL_INTERVAL_MS = 60_000 // 1 minute

// Persisted across hot reloads in dev
const globalForRate = globalThis as unknown as {
  __rateBuckets?: Map<string, RateBucket>
}
const buckets: Map<string, RateBucket> =
  globalForRate.__rateBuckets ?? new Map<string, RateBucket>()
globalForRate.__rateBuckets = buckets

/**
 * Token-bucket rate limiter.
 * Returns { ok: true } if the request is allowed, or { ok: false, retryAfter }
 * with seconds-to-wait if the bucket is empty.
 *
 * Uses the global default (60 req/min). Per-key custom limits are not
 * persisted in integrated mode (BIweb's api_keys table has no such column).
 */
export function checkRateLimit(
  apiKeyId: string,
): { ok: true; remaining: number } | { ok: false; retryAfter: number; remaining: 0 } {
  const capacity = DEFAULT_RATE_LIMIT_PER_MINUTE
  const now = Date.now()

  let bucket = buckets.get(apiKeyId)
  if (!bucket) {
    bucket = { tokens: capacity, lastRefill: now }
    buckets.set(apiKeyId, bucket)
  }

  const elapsed = now - bucket.lastRefill
  const refill = (elapsed / DEFAULT_REFILL_INTERVAL_MS) * capacity
  bucket.tokens = Math.min(capacity, bucket.tokens + refill)
  bucket.lastRefill = now

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1
    return { ok: true, remaining: Math.floor(bucket.tokens) }
  }

  const msUntilNext = Math.ceil((1 - bucket.tokens) * (DEFAULT_REFILL_INTERVAL_MS / capacity))
  const retryAfter = Math.max(1, Math.ceil(msUntilNext / 1000))
  return { ok: false, retryAfter, remaining: 0 }
}

// Lightweight cleanup: drop empty stale buckets occasionally to bound memory
export function pruneRateBuckets(maxSize = 10_000): void {
  if (buckets.size < maxSize) return
  const entries = [...buckets.entries()].sort(
    (a, b) => a[1].lastRefill - b[1].lastRefill,
  )
  const dropCount = Math.floor(entries.length * 0.25)
  for (let i = 0; i < dropCount; i++) {
    buckets.delete(entries[i]![0])
  }
}

// ---------------------------------------------------------------------------
// Settings audit log
// Records management actions on API keys (create / update / revoke) so the
// owner can review "who did what, when" — useful for compliance + debugging
// integration breakages ("who revoked the OpenFN key at 3am?").
//
// NOTE: settings_audit_logs.user_id is a UUID referencing auth.users(id).
// Callers must pass the Supabase Auth UUID (SessionUser.supabaseId), NOT
// the Prisma User.id (cuid).
// ---------------------------------------------------------------------------

export type AuditAction = 'api_key.create' | 'api_key.update' | 'api_key.revoke'

export interface AuditEntry {
  /** Supabase Auth UUID — NOT users.id. Used for settings_audit_logs.user_id. */
  userId: string
  action: AuditAction
  /** users.id (cuid) of the API key — stored as uuid (nullable) */
  apiKeyId?: string | null
  apiKeyLabel?: string | null
  /** Will be stored as jsonb. */
  diff?: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
}

/**
 * Persists a settings-audit entry. Best-effort: never throws.
 * Caller should not await unless it explicitly needs to.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await db.settingsAuditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        apiKeyId: entry.apiKeyId ?? null,
        apiKeyLabel: entry.apiKeyLabel ?? null,
        diff: (entry.diff ?? {}) as object,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    })
  } catch (e) {
    console.error('[audit] writeAuditLog failed:', e)
    /* best-effort — audit log must never break the user flow */
  }
}

/** Helper: pulls IP + UA off a Request, ready to drop into writeAuditLog. */
export function auditContext(req: Request): { ip: string | null; userAgent: string | null } {
  return {
    ip: getClientIp(req),
    userAgent: req.headers.get('user-agent'),
  }
}
