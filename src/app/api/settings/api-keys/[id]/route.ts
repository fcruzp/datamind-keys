import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getDemoUser } from '@/lib/api-auth'

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
