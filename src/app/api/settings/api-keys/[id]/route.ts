import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  getDemoUser,
  parseAllowedIps,
  serializeAllowedIps,
} from '@/lib/api-auth'

// PATCH /api/settings/api-keys/[id]
// Updates editable fields on an existing key (label, allowedIps, rateLimitPerMinute).
// Verifies ownership. Does NOT allow changing scopes (require revoke + recreate for that).

const patchSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Label is required')
    .max(60, 'Label must be 60 characters or less')
    .optional(),
  allowedIps: z
    .array(z.string().trim().min(1))
    .max(20, 'Max 20 IPs per allowlist')
    .optional(),
  rateLimitPerMinute: z
    .number()
    .int()
    .min(1, 'Rate limit must be at least 1 req/min')
    .max(10_000, 'Rate limit cannot exceed 10,000 req/min')
    .nullable()
    .optional()
    .or(z.literal(null)),
})

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const user = await getDemoUser()

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
    select: { id: true, revokedAt: true },
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
    data.allowedIps = serializeAllowedIps(parsed.data.allowedIps)
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
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params
  const user = await getDemoUser()

  const apiKey = await db.apiKey.findFirst({
    where: { id, userId: user.id },
    select: { id: true, revokedAt: true },
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

  await db.apiKey.update({
    where: { id: apiKey.id },
    data: { revokedAt: new Date() },
  })

  return NextResponse.json({ ok: true, revokedAt: new Date() })
}
