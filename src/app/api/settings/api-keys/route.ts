import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  auditContext,
  generateApiKey,
  getDemoUser,
  maskApiKey,
  parseScopes,
  serializeScopes,
  writeAuditLog,
  type ApiScope,
} from '@/lib/api-auth'
import { withDbSafe } from '@/lib/api-wrapper'

// ---------------------------------------------------------------------------
// GET /api/settings/api-keys
// Lists active (non-revoked) keys for the current user. Never returns plaintext.
// ---------------------------------------------------------------------------

export const GET = withDbSafe<NextRequest>(async (req) => {
  const user = await getDemoUser(req)

  const keys = await db.apiKey.findMany({
    where: {
      userId: user.id,
      revokedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      label: true,
      keyPrefix: true,
      scopes: true,
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

  const { label, scopes, expiresInDays } = parsed.data
  const user = await getDemoUser(req)

  // Cap active keys per user to prevent runaway growth
  const activeCount = await db.apiKey.count({
    where: { userId: user.id, revokedAt: null },
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

  const created = await db.apiKey.create({
    data: {
      userId: user.id,
      keyHash: hash,
      keyPrefix: prefix,
      label,
      scopes: serializeScopes(scopes as ApiScope[]),
      expiresAt,
    },
  })

  // Audit: record creation (no plaintext, no hash — just metadata)
  // NOTE: userId must be the Supabase Auth UUID (user.supabaseId), NOT
  // user.id (cuid), because settings_audit_logs.user_id is a uuid column
  // referencing auth.users(id). apiKeyId is set to null because api_keys.id
  // is a cuid (text) which can't be stored in the uuid column.
  const ctx = auditContext(req)
  await writeAuditLog({
    userId: user.supabaseId,
    action: 'api_key.create',
    apiKeyId: null,
    apiKeyLabel: created.label,
    diff: {
      label: created.label,
      scopes: parseScopes(created.scopes),
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
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
    },
    { status: 201 },
  )
})
