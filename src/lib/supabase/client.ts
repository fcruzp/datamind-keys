'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client. Use this in Client Components for sign-in,
 * sign-out, and listening to auth state changes.
 *
 * Auth state is persisted in cookies (not localStorage) by @supabase/ssr,
 * so it's automatically available to Server Components and Route Handlers
 * on the next request.
 */
export function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
