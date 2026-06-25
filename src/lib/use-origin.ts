'use client'

import * as React from 'react'

/**
 * Returns the current window.location.origin.
 *
 * On the server (SSR) and during the first client render, returns the
 * provided `fallback` (defaults to 'https://datamind-api.mooo.com') to
 * avoid hydration mismatches. After mount, updates to the real origin.
 *
 * Use this anywhere the UI shows the API host (curl examples, docs links,
 * etc.) so the domain is always correct regardless of where the app is
 * deployed.
 */
export function useOrigin(fallback = 'https://datamind-api.mooo.com'): string {
  const [origin, setOrigin] = React.useState(fallback)

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin)
    }
  }, [])

  return origin
}
