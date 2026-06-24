import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// POST /api/auth/switch
// In integrated mode (shared BIweb database), tenant switching is done via
// Supabase Auth (sign out + into a different account). This endpoint is
// kept for backwards compatibility but always returns 404.

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error:
        'Tenant switching is not available in integrated mode. Sign out and into a different account to switch.',
    },
    { status: 404 },
  )
}
