import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  allowedIpsToJson,
  auditContext,
  getDemoUser,
  parseAllowedIps,
  writeAuditLog,
} from '@/lib/api-auth'

// PATCH /api/settings/api-keys/[id]
// Updates the label / IP allowlist / per-key rate limit on an existing key.
// Verifies ownership. Does NOT allow changing scopes (require revoke + recreate).
//
// NOTE: api_keys.user_id is a uuid = users.supabase_id. Ownership check
// filters by user.supabaseId (NOT user.id).

const patchSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Label is required')
    .max(60, 'Label must be 60 characters or less')
    .optional(),
  allowedIps: z
    .array(z.string().trim().min(1))
    .max(50, 'At most 50 IP allowlist entries')
    .optional(),
  rateLimitPerMinute: z
    .number()
    .int()
    .min(1, 'Rate limit must be at least 1/min')
    .max(10000, 'Rate limit must be at most 10000/min')
    .nullable()
    .optional(),
})

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  let user
  try {
    user = await getDemoUser(req)
  } catch {
    return NextResponse.json(
      { error: 'Not authenticated. Please sign in.' },
      { status: 401 },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation failed.',
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    )
  }

  // Ownership check: filter by user.supabaseId (api_keys.user_id is uuid).
  const existing = await db.apiKey.findFirst({
    where: { id, userId: user.supabaseId },
    select: {
      id: true,
      revokedAt: true,
      label: true,
      allowedIps: true,
      rateLimitPerMinute: true,
    },
  })
  if (!existing) {
    return NextResponse.json({ error: 'API key not found.' }, { status: 404 })
  }
  if (existing.revokedAt) {
    return NextResponse.json(
      { error: 'Cannot edit a revoked key.' },
      { status: 409 },
    )
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.label !== undefined) data.label = parsed.data.label
  if (parsed.data.allowedIps !== undefined) {
    data.allowedIps = allowedIpsToJson(parsed.data.allowedIps)
  }
  if (parsed.data.rateLimitPerMinute !== undefined) {
    data.rateLimitPerMinute = parsed.data.rateLimitPerMinute
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'No fields to update.' },
      { status: 422 },
    )
  }

  // Build a before/after diff for the audit log
  const diff: Record<string, { before: unknown; after: unknown }> = {}
  if (parsed.data.label !== undefined && parsed.data.label !== existing.label) {
    diff.label = { before: existing.label, after: parsed.data.label }
  }
  if (parsed.data.allowedIps !== undefined) {
    const beforeIps = parseAllowedIps(existing.allowedIps)
    const afterIps = allowedIpsToJson(parsed.data.allowedIps)
    // Only record the diff if the array actually changed.
    const changed =
      beforeIps.length !== afterIps.length ||
      beforeIps.some((ip, i) => ip !== afterIps[i])
    if (changed) {
      diff.allowedIps = { before: beforeIps, after: afterIps }
    }
  }
  if (parsed.data.rateLimitPerMinute !== undefined) {
    if (parsed.data.rateLimitPerMinute !== existing.rateLimitPerMinute) {
      diff.rateLimitPerMinute = {
        before: existing.rateLimitPerMinute,
        after: parsed.data.rateLimitPerMinute,
      }
    }
  }

  const updated = await db.apiKey.update({
    where: { id },
    data,
    select: {
      id: true,
      label: true,
      allowedIps: true,
      rateLimitPerMinute: true,
    },
  })

  // Audit: record the change with before/after diff.
  // - userId: supabaseId (uuid)
  // - apiKeyId: updated.id (uuid) — now matches the column type!
  const auditCtx = auditContext(req)
  await writeAuditLog({
    userId: user.supabaseId,
    action: 'api_key.update',
    apiKeyId: updated.id,
    apiKeyLabel: updated.label,
    diff,
    ip: auditCtx.ip,
    userAgent: auditCtx.userAgent,
  })

  return NextResponse.json({
    ok: true,
    id: updated.id,
    label: updated.label,
    allowedIps: parseAllowedIps(updated.allowedIps),
    rateLimitPerMinute: updated.rateLimitPerMinute,
  })
}

// ---------------------------------------------------------------------------
// DELETE /api/settings/api-keys/[id]
// Soft-revokes the key (sets revokedAt). Verifies ownership.
// ---------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  let user
  try {
    user = await getDemoUser(req)
  } catch {
    return NextResponse.json(
      { error: 'Not authenticated. Please sign in.' },
      { status: 401 },
    )
  }

  // Ownership check: filter by user.supabaseId (api_keys.user_id is uuid).
  const apiKey = await db.apiKey.findFirst({
    where: { id, userId: user.supabaseId },
    select: { id: true, revokedAt: true, label: true, keyPrefix: true },
  })

  if (!apiKey) {
    return NextResponse.json(
      { error: 'API key not found.' },
      { status: 404 },
    )
  }
  if (apiKey.revokedAt) {
    return NextResponse.json(
      { error: 'API key is already revoked.' },
      { status: 409 },
    )
  }

  const revokedAt = new Date()
  await db.apiKey.update({
    where: { id: apiKey.id },
    data: { revokedAt },
  })

  // Audit: record revocation
  // - userId: supabaseId (uuid)
  // - apiKeyId: apiKey.id (uuid) — now matches the column type!
  const auditCtx = auditContext(req)
  await writeAuditLog({
    userId: user.supabaseId,
    action: 'api_key.revoke',
    apiKeyId: apiKey.id,
    apiKeyLabel: apiKey.label,
    diff: {
      revokedAt: revokedAt.toISOString(),
      keyPrefix: apiKey.keyPrefix,
    },
    ip: auditCtx.ip,
    userAgent: auditCtx.userAgent,
  })

  return NextResponse.json({ ok: true, revokedAt })
}
