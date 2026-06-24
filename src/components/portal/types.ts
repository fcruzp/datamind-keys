/**
 * Shared types for the DataMind BI portal shell.
 */

export interface PortalUser {
  id: string
  email: string
  name: string | null
  tenantName: string
  avatarColor: string
  role: string
  isCurrent?: boolean
}

export interface PortalStats {
  activeKeys: number
  revokedKeys: number
  requests7d: number
  lastRequestAt: string | null
}

export interface AuthMeResponse {
  current: PortalUser & { isDefault?: boolean }
  switchable: (PortalUser & { isCurrent: boolean })[]
  stats: PortalStats
}

/** The set of views the portal can show. */
export type PortalView = 'dashboard' | 'api-keys' | 'datasources' | 'activity' | 'docs'

export interface NavItem {
  id: PortalView
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** Optional soon/locked badge. */
  badge?: string
}
