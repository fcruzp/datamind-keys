import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  allowedIpsToJson,
  auditContext,
  generateApiKey,
  getDemoUser,
  maskApiKey,
  parseAllowedIps,
  parseScopes,
  scopesToJson,
  writeAuditLog,
  type ApiScope,
} from '@/lib/api-auth'
import { withDbSafe } from '@/lib/api-wrapper'

// ---------------------------------------------------------------------------
// GET /api/settings/api-keys
// Lists active (non-revoked) keys for the current user. Never returns plaintext.
//
// NOTE: api_keys.user_id is a uuid = users.supabase_id (NOT users.id).
// We filter by user.supabaseId.
// ---------------------------------------------------------------------------

export const GET = withDbSafe<NextRequest>(async (req) => {
  const user = await getDemoUser(req)

  const keys = await db.apiKey.findMany({
    where: {
      userId: user.supabaseId,
      revokedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      label: true,
      keyPrefix: true,
      scopes: true,
      allowedIps: true,
      rateLimitPerMinute: true,
      lastUsedAt: true,
      lastUsedIp: true,
      expiresAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    keys: keys.map((k) => ({
      id: k.id,
      label: k.label,
      keyMasked: maskApiKey(k.keyPrefix),
      keyPrefix: k.keyPrefix,
      scopes: parseScopes(k.scopes),
      allowedIps: parseAllowedIps(k.allowedIps),
      rateLimitPerMinute: k.rateLimitPerMinute,
      lastUsedAt: k.lastUsedAt,
      lastUsedIp: k.lastUsedIp,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
    })),
  })
})

// ---------------------------------------------------------------------------
// POST /api/settings/api-keys
// Creates a new key. Returns the plaintext ONE TIME ONLY with 201 Created.
//
// NOTE: api_keys.user_id is a uuid. We pass user.supabaseId (the Supabase
// Auth UUID) as the userId — NOT user.id (the cuid from users.id).
// ---------------------------------------------------------------------------

const createSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Label is required')
    .max(60, 'Label must be 60 characters or less'),
  scopes: z
    .array(z.enum(['read', 'execute', 'admin']))
    .min(1, 'At least one scope is required'),
  allowedIps: z
    .array(z.string().trim().min(1))
    .max(50, 'At most 50 IP allowlist entries')
    .optional()
    .default([]),
  rateLimitPerMinute: z
    .number()
    .int()
    .min(1, 'Rate limit must be at least 1/min')
    .max(10000, 'Rate limit must be at most 10000/min')
    .nullable()
    .optional(),
  expiresInDays: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .or(z.literal(null)),
})

export const POST = withDbSafe<NextRequest>(async (req) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 },
    )
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation failed.',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    )
  }

  const { label, scopes, allowedIps, rateLimitPerMinute, expiresInDays } = parsed.data
  const user = await getDemoUser(req)

  // Diagnostic: log the user state so we can see if user.supabaseId is valid
  console.log('[POST /api/settings/api-keys] user:', {
    id: user.id,
    supabaseId: user.supabaseId,
    email: user.email,
  })

  // If user.supabaseId is empty, we can't create the api_keys row (user_id
  // is NOT NULL uuid). Return a clear error.
  if (!user.supabaseId) {
    return NextResponse.json(
      {
        error:
          'Your account is missing a Supabase Auth UUID. ' +
          'This usually means the Supabase session is malformed. ' +
          'Visit /api/debug/db-health for diagnostics.',
        errorDetail: {
          userId: '(empty)',
          supabaseId: user.supabaseId,
          email: user.email,
        },
      },
      { status: 503 },
    )
  }

  // Cap active keys per user to prevent runaway growth.
  // Filter by supabaseId (api_keys.user_id is the supabase UUID).
  const activeCount = await db.apiKey.count({
    where: { userId: user.supabaseId, revokedAt: null },
  })
  if (activeCount >= 25) {
    return NextResponse.json(
      {
        error:
          'Maximum number of active API keys (25) reached. Revoke an existing key before creating a new one.',
      },
      { status: 409 },
    )
  }

  const { plaintext, hash, prefix } = generateApiKey()
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null

  console.log('[POST /api/settings/api-keys] creating key:', {
    userId: user.supabaseId,
    keyPrefix: prefix,
    label,
  })

  // Create the key.
  // - userId: supabaseId (uuid) — NOT users.id (text/cuid)
  // - scopes: Json → pass the array directly (Prisma serializes to jsonb)
  // - allowedIps: Json → pass the array directly
  const created = await db.apiKey.create({
    data: {
      userId: user.supabaseId,
      keyHash: hash,
      keyPrefix: prefix,
      label,
      scopes: scopesToJson(scopes as ApiScope[]),
      allowedIps: allowedIpsToJson(allowedIps),
      rateLimitPerMinute: rateLimitPerMinute ?? null,
      expiresAt,
    },
  })

  console.log('[POST /api/settings/api-keys] key created:', created.id)

  // Audit: record creation (no plaintext, no hash — just metadata).
  // - userId: supabaseId (uuid) for settings_audit_logs.user_id
  // - apiKeyId: created.id (uuid) — now matches the column type!
  const ctx = auditContext(req)
  await writeAuditLog({
    userId: user.supabaseId,
    action: 'api_key.create',
    apiKeyId: created.id,
    apiKeyLabel: created.label,
    diff: {
      label: created.label,
      scopes: parseScopes(created.scopes),
      allowedIps: parseAllowedIps(created.allowedIps),
      rateLimitPerMinute: created.rateLimitPerMinute,
      expiresAt: created.expiresAt?.toISOString() ?? null,
      keyPrefix: created.keyPrefix,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  })

  return NextResponse.json(
    {
      id: created.id,
      label: created.label,
      plaintext, // ← returned ONCE. Never retrievable again.
      keyMasked: maskApiKey(prefix),
      scopes: parseScopes(created.scopes),
      allowedIps: parseAllowedIps(created.allowedIps),
      rateLimitPerMinute: created.rateLimitPerMinute,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
    },
    { status: 201 },
  )
})
