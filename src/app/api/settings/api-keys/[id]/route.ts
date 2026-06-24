import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  auditContext,
  getDemoUser,
  parseScopes,
  writeAuditLog,
} from '@/lib/api-auth'

// PATCH /api/settings/api-keys/[id]
// Updates the label on an existing key.
// Verifies ownership. Does NOT allow changing scopes (require revoke + recreate).

const patchSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Label is required')
    .max(60, 'Label must be 60 characters or less')
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

  const existing = await db.apiKey.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      revokedAt: true,
      label: true,
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

  const updated = await db.apiKey.update({
    where: { id },
    data,
    select: {
      id: true,
      label: true,
    },
  })

  // Audit: record the change with before/after diff
  const auditCtx = auditContext(req)
  await writeAuditLog({
    userId: user.supabaseId,
    action: 'api_key.update',
    apiKeyId: null,
    apiKeyLabel: updated.label,
    diff,
    ip: auditCtx.ip,
    userAgent: auditCtx.userAgent,
  })

  return NextResponse.json({
    ok: true,
    id: updated.id,
    label: updated.label,
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

  const apiKey = await db.apiKey.findFirst({
    where: { id, userId: user.id },
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
  const auditCtx = auditContext(req)
  await writeAuditLog({
    userId: user.supabaseId,
    action: 'api_key.revoke',
    apiKeyId: null,
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
