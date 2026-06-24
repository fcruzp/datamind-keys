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
  allowedIps: string[]
  rateLimitPerMinute: number | null
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

  // IP allowlist check (strict if allowlist non-empty)
  const clientIp = getClientIp(req)
  const allowlist = parseAllowedIps(apiKey.allowedIps)
  if (!isIpAllowed(clientIp, allowlist)) {
    return {
      ok: false,
      error: `IP ${clientIp ?? '(unknown)'} is not in this key's IP allowlist.`,
      status: 403,
    }
  }

  // Rate limit (token bucket per key)
  const rate = checkRateLimit(apiKey.id, apiKey.rateLimitPerMinute)
  if (!rate.ok) {
    return {
      ok: false,
      error: `Rate limit exceeded. Try again in ${rate.retryAfter}s.`,
      status: 429,
    }
  }

  // Fire-and-forget: update lastUsedAt + IP without blocking the response
  db.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date(), lastUsedIp: clientIp },
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
      allowedIps: allowlist,
      rateLimitPerMinute: apiKey.rateLimitPerMinute,
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

// ---------------------------------------------------------------------------
// IP allowlist
// ---------------------------------------------------------------------------

export const DEFAULT_RATE_LIMIT_PER_MINUTE = 60

export function parseAllowedIps(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

export function serializeAllowedIps(ips: string[]): string {
  return JSON.stringify([...new Set(ips.map((s) => s.trim()).filter(Boolean))])
}

/**
 * Validates a client IP against the key's allowlist.
 * - Empty allowlist → allow all
 * - Otherwise the IP must match exactly OR fall within a CIDR range (e.g. "10.0.0.0/8")
 *   IPv4 only for simplicity; IPv6 exact-match only.
 *
 * Returns true if allowed (or if allowlist is empty / client IP unknown).
 */
export function isIpAllowed(clientIp: string | null, allowlist: string[]): boolean {
  if (!allowlist.length) return true
  if (!clientIp) return false // strict: if allowlist set but no IP detected, deny

  // Strip IPv6-mapped IPv4 prefix "::ffff:"
  const ip = clientIp.startsWith('::ffff:') ? clientIp.slice(7) : clientIp

  for (const rule of allowlist) {
    if (rule === ip) return true
    if (rule.includes('/')) {
      // CIDR
      if (ipInCidr(ip, rule)) return true
    }
  }
  return false
}

function ipInCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split('/')
  if (!base || !bitsStr) return false
  const bits = parseInt(bitsStr, 10)
  if (isNaN(bits) || bits < 0 || bits > 32) return false

  const ipParts = ip.split('.').map((p) => parseInt(p, 10))
  const baseParts = base.split('.').map((p) => parseInt(p, 10))
  if (ipParts.length !== 4 || baseParts.length !== 4) return false
  if (ipParts.some((p) => isNaN(p) || p < 0 || p > 255)) return false
  if (baseParts.some((p) => isNaN(p) || p < 0 || p > 255)) return false

  const ipNum =
    (ipParts[0]! << 24) | (ipParts[1]! << 16) | (ipParts[2]! << 8) | ipParts[3]!
  const baseNum =
    (baseParts[0]! << 24) | (baseParts[1]! << 16) | (baseParts[2]! << 8) | baseParts[3]!
  // Note: the >>> 0 coerces to unsigned 32-bit (the bitwise ops above produce signed)
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (ipNum >>> 0) & mask === (baseNum >>> 0) & mask
}

// ---------------------------------------------------------------------------
// In-memory rate limiting (token bucket per API key)
// ---------------------------------------------------------------------------

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
 * Bucket capacity = rateLimitPerMinute tokens, refilled continuously at
 * rateLimitPerMinute/60 tokens per ms.
 */
export function checkRateLimit(
  apiKeyId: string,
  rateLimitPerMinute: number | null,
): { ok: true; remaining: number } | { ok: false; retryAfter: number; remaining: 0 } {
  const capacity = rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE
  const now = Date.now()

  let bucket = buckets.get(apiKeyId)
  if (!bucket) {
    bucket = { tokens: capacity, lastRefill: now }
    buckets.set(apiKeyId, bucket)
  }

  // Refill: tokens added = (elapsed_ms / 60_000) * capacity
  const elapsed = now - bucket.lastRefill
  const refill = (elapsed / DEFAULT_REFILL_INTERVAL_MS) * capacity
  bucket.tokens = Math.min(capacity, bucket.tokens + refill)
  bucket.lastRefill = now

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1
    return { ok: true, remaining: Math.floor(bucket.tokens) }
  }

  // Empty: time until 1 token refills
  const msUntilNext = Math.ceil((1 - bucket.tokens) * (DEFAULT_REFILL_INTERVAL_MS / capacity))
  const retryAfter = Math.max(1, Math.ceil(msUntilNext / 1000))
  return { ok: false, retryAfter, remaining: 0 }
}

// Lightweight cleanup: drop empty stale buckets occasionally to bound memory
export function pruneRateBuckets(maxSize = 10_000): void {
  if (buckets.size < maxSize) return
  // Drop the oldest 25% by lastRefill
  const entries = [...buckets.entries()].sort(
    (a, b) => a[1].lastRefill - b[1].lastRefill,
  )
  const dropCount = Math.floor(entries.length * 0.25)
  for (let i = 0; i < dropCount; i++) {
    buckets.delete(entries[i]![0])
  }
}
