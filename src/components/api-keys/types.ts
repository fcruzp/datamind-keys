export type ApiScope = 'read' | 'execute' | 'admin'

export interface ApiKeyListItem {
  id: string
  label: string
  keyMasked: string
  keyPrefix: string
  scopes: ApiScope[]
  lastUsedAt: string | null
  lastUsedIp: string | null
  expiresAt: string | null
  createdAt: string
}

export interface RevokedApiKey {
  id: string
  label: string
  keyMasked: string
  scopes: ApiScope[]
  lastUsedAt: string | null
  lastUsedIp: string | null
  expiresAt: string | null
  createdAt: string
  revokedAt: string | null
}

export interface CreatedApiKey {
  id: string
  label: string
  plaintext: string
  keyMasked: string
  scopes: ApiScope[]
  expiresAt: string | null
  createdAt: string
}

export interface UsageData {
  totals: {
    requests7d: number
    avgDurationMs: number
    lastRequestAt: string | null
  }
  perKey: Array<{
    apiKeyId: string
    count: number
    avgDurationMs: number
    histogram24h: number[]
  }>
  recent: Array<{
    id: string
    endpoint: string
    method: string
    statusCode: number
    durationMs: number
    rowCount: number | null
    ip: string | null
    createdAt: string
    apiKeyLabel: string
  }>
  hourlyHistogram: number[]
}

export const SCOPE_META: Record<
  ApiScope,
  { label: string; description: string; tone: 'emerald' | 'sky' | 'rose' }
> = {
  read: {
    label: 'read',
    description: 'GET endpoints — datasources, dashboards, schemas, /me.',
    tone: 'emerald',
  },
  execute: {
    label: 'execute',
    description: 'POST endpoints — run SQL SELECT queries.',
    tone: 'sky',
  },
  admin: {
    label: 'admin',
    description: 'All endpoints, including write operations. Implies read + execute.',
    tone: 'rose',
  },
}
