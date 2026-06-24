'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Database,
  KeyRound,
  Lock,
  ShieldCheck,
  Terminal,
  Webhook,
  Zap,
  Clock,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { PortalUser, PortalStats } from './types'

// ---------------------------------------------------------------------------
// Inline mini usage chart (no chart lib needed — pure SVG)
// ---------------------------------------------------------------------------

function MiniBars({ data, color = 'emerald' }: { data: number[]; color?: 'emerald' | 'sky' | 'amber' }) {
  const max = Math.max(1, ...data)
  const colorClass = {
    emerald: 'bg-emerald-500',
    sky: 'bg-sky-500',
    amber: 'bg-amber-500',
  }[color]
  return (
    <div className="flex items-end gap-0.5 h-12">
      {data.map((v, i) => (
        <div
          key={i}
          className={cn('flex-1 rounded-sm transition-all', colorClass)}
          style={{
            height: `${Math.max(2, (v / max) * 100)}%`,
            opacity: 0.4 + 0.6 * (i / data.length),
          }}
          title={`${v} requests`}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  loading,
}: {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  tone: 'emerald' | 'sky' | 'amber' | 'rose'
  loading?: boolean
}) {
  const tones = {
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    sky: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
    amber: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    rose: 'text-rose-600 dark:text-rose-400 bg-rose-500/10',
  } as const
  return (
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </span>
          <span className={cn('grid size-7 place-items-center rounded-md', tones[tone])}>
            <Icon className="size-4" />
          </span>
        </div>
        <div className="text-2xl font-semibold tabular-nums tracking-tight">
          {loading ? <Skeleton className="h-7 w-16" /> : value}
        </div>
        {hint && (
          <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
            {hint}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Quickstart card (curl example)
// ---------------------------------------------------------------------------

function QuickstartCard({ tenantName }: { tenantName: string }) {
  return (
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <CardHeader className="border-b bg-muted/30 py-3 px-4 flex flex-row items-center gap-2">
        <Terminal className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Quickstart</span>
        <Badge variant="outline" className="ml-auto text-[10px] font-mono">
          curl
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <div className="bg-zinc-950 text-zinc-200 p-4 font-mono text-[11px] leading-relaxed overflow-x-auto">
          <pre>{`# 1. Generate a key under Settings → API Keys
#    (visible only ONCE, hashed at rest with SHA-256)

# 2. Call any /api/public/v1/* endpoint with Bearer auth
curl https://datamind.mooo.com/api/public/v1/me \\
  -H "Authorization: Bearer dm_live_••••"

# 3. List datasources for tenant: ${tenantName}
curl https://datamind.mooo.com/api/public/v1/datasources \\
  -H "Authorization: Bearer dm_live_••••"`}</pre>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Endpoint reference card
// ---------------------------------------------------------------------------

function EndpointReference() {
  const endpoints = [
    { method: 'GET', path: '/api/public/v1/me', scope: 'read', desc: 'Validate key + tenant info' },
    { method: 'GET', path: '/api/public/v1/datasources', scope: 'read', desc: 'List connected databases' },
    { method: 'GET', path: '/api/public/v1/dashboards', scope: 'read', desc: 'List dashboards + widgets' },
    { method: 'POST', path: '/api/public/v1/queries', scope: 'execute', desc: 'Run a sandboxed SQL SELECT' },
  ]
  const methodTones: Record<string, string> = {
    GET: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    POST: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
  }
  const scopeTones: Record<string, string> = {
    read: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    execute: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    admin: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  }
  return (
    <Card className="overflow-hidden border-border/60 shadow-sm">
      <CardHeader className="border-b bg-muted/30 py-3 px-4 flex flex-row items-center gap-2">
        <Webhook className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Public API endpoints</span>
      </CardHeader>
      <CardContent className="p-0 divide-y divide-border/40">
        {endpoints.map((e) => (
          <div
            key={e.path}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
          >
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold shrink-0',
                methodTones[e.method],
              )}
            >
              {e.method}
            </span>
            <code className="font-mono text-xs text-foreground flex-1 min-w-0 truncate">
              {e.path}
            </code>
            <span className="hidden sm:inline text-[11px] text-muted-foreground truncate max-w-[180px]">
              {e.desc}
            </span>
            <span
              className={cn(
                'font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0',
                scopeTones[e.scope],
              )}
            >
              {e.scope}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Integration cards (OpenFN, N8N)
// ---------------------------------------------------------------------------

function IntegrationCard({
  name,
  description,
  href,
  initials,
  gradient,
}: {
  name: string
  description: string
  href: string
  initials: string
  gradient: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group rounded-lg border border-border/60 bg-card p-4 hover:border-border hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-3 mb-2">
        <span
          className={cn(
            'grid size-9 place-items-center rounded-md bg-gradient-to-br text-white text-xs font-bold shadow-sm',
            gradient,
          )}
        >
          {initials}
        </span>
        <span className="font-semibold text-sm">{name}</span>
        <ArrowUpRight className="size-3.5 ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {description}
      </p>
    </a>
  )
}

// ---------------------------------------------------------------------------
// Main DashboardView
// ---------------------------------------------------------------------------

export function DashboardView({
  current,
  stats,
  onNavigateToApiKeys,
}: {
  current: PortalUser
  stats: PortalStats
  onNavigateToApiKeys: () => void
}) {
  // Fetch the 24h histogram for the hero sparkline (tenant-scoped)
  const usageQuery = useQuery({
    queryKey: ['portal-usage', current.id],
    queryFn: async () => {
      const res = await fetch('/api/settings/api-keys/usage')
      if (!res.ok) throw new Error('Failed to load usage')
      return (await res.json()) as {
        totals: { requests7d: number; avgDurationMs: number; lastRequestAt: string | null }
        hourlyHistogram: number[]
      }
    },
    staleTime: 30_000,
  })

  const histogram = usageQuery.data?.hourlyHistogram ?? new Array(24).fill(0)
  const totals = usageQuery.data?.totals
  const usageLoading = usageQuery.isLoading

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="rounded-xl border border-border/60 bg-gradient-to-br from-emerald-500/[0.06] via-background to-sky-500/[0.04] p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Tenant: {current.tenantName}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Welcome back, {current.name?.split(' ')[0] ?? current.email.split('@')[0]}
            </h1>
            <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
              Generate scoped bearer tokens so external tools —{' '}
              <strong className="text-foreground">OpenFN</strong>,{' '}
              <strong className="text-foreground">N8N</strong>, custom
              scripts — can securely access this tenant's data via REST.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onNavigateToApiKeys} className="gap-2 shadow-sm">
              <KeyRound className="size-4" />
              Manage API Keys
            </Button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={KeyRound}
          label="Active keys"
          value={String(stats.activeKeys)}
          hint={<><ShieldCheck className="size-3" /> SHA-256 hashed at rest</>}
          tone="emerald"
        />
        <StatCard
          icon={Activity}
          label="Requests (7d)"
          value={totals ? String(totals.requests7d) : '—'}
          hint={
            totals?.lastRequestAt
              ? `last ${formatDistanceToNow(new Date(totals.lastRequestAt), { addSuffix: true })}`
              : 'no activity yet'
          }
          tone="sky"
          loading={usageLoading}
        />
        <StatCard
          icon={Clock}
          label="Avg latency"
          value={totals ? `${totals.avgDurationMs}ms` : '—'}
          hint={<><TrendingUp className="size-3" /> last 7 days</>}
          tone="amber"
          loading={usageLoading}
        />
        <Card className="overflow-hidden border-border/60 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                24h activity
              </span>
              <Zap className="size-3.5 text-muted-foreground" />
            </div>
            {usageLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <MiniBars data={histogram} color="emerald" />
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Hourly request volume · current hour on the right
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Two-column: quickstart + endpoints */}
      <section className="grid gap-4 lg:grid-cols-2">
        <QuickstartCard tenantName={current.tenantName} />
        <EndpointReference />
      </section>

      {/* Integrations */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Integrations
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <IntegrationCard
            name="OpenFN"
            description="Workflow automation. Trigger DataMind BI queries from OpenFN jobs using a bearer token."
            href="https://openfn.org"
            initials="OF"
            gradient="from-emerald-500 to-teal-600"
          />
          <IntegrationCard
            name="N8N"
            description="Self-hostable automation. Pull dashboards or run SQL from any N8N workflow node."
            href="https://n8n.io"
            initials="N8"
            gradient="from-rose-500 to-pink-600"
          />
          <IntegrationCard
            name="Custom scripts"
            description="Anything that speaks HTTP + Bearer auth — Python, curl, Postman, Retool, Metabase models."
            href="https://docs.datamind.mooo.com"
            initials="</>"
            gradient="from-amber-500 to-orange-600"
          />
        </div>
      </section>

      {/* Security note */}
      <section className="rounded-lg border border-border/60 bg-muted/20 p-4 flex items-start gap-3">
        <Lock className="size-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Tenant isolation:</strong>{' '}
          every API key is bound to your account ({current.email}). Keys
          created here can only read or execute against data sources owned by{' '}
          <strong className="text-foreground">{current.tenantName}</strong>.
          Switching tenants via the header changes which keys are visible and
          which data the public API serves — exactly mirroring the production
          Supabase org-switch behavior.
        </div>
      </section>
    </div>
  )
}

// Re-export for the sidebar to use
export { Sidebar } from './sidebar'
