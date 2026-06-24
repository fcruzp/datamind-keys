'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, format } from 'date-fns'
import {
  AlertTriangle,
  Clock,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  Activity,
  Globe,
  Hash,
  CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { CreateApiKeyDialog } from './create-api-key-dialog'
import { NewKeyRevealDialog } from './new-key-reveal-dialog'
import { ScopeBadgeList } from './scope-badge'
import { UsageHistogram } from './usage-chart'
import type { ApiKeyListItem, CreatedApiKey, UsageData } from './types'
import { cn } from '@/lib/utils'

export function ApiKeysManager() {
  const qc = useQueryClient()
  const [revealKey, setRevealKey] = React.useState<CreatedApiKey | null>(null)

  const keysQuery = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const res = await fetch('/api/settings/api-keys')
      if (!res.ok) throw new Error('Failed to load API keys')
      const json = (await res.json()) as { keys: ApiKeyListItem[] }
      return json.keys
    },
  })

  const usageQuery = useQuery({
    queryKey: ['api-keys-usage'],
    queryFn: async () => {
      const res = await fetch('/api/settings/api-keys/usage')
      if (!res.ok) throw new Error('Failed to load usage stats')
      return (await res.json()) as UsageData
    },
  })

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/settings/api-keys/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error ?? 'Failed to revoke key')
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] })
      qc.invalidateQueries({ queryKey: ['api-keys-usage'] })
      toast.success('API key revoked')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const copyMasked = async (key: ApiKeyListItem) => {
    // We copy the masked prefix only — never have plaintext client-side after creation
    try {
      await navigator.clipboard.writeText(key.keyMasked)
      toast.success('Masked key copied (for reference only)')
    } catch {
      toast.error('Copy failed')
    }
  }

  const isLoading = keysQuery.isLoading
  const keys = keysQuery.data ?? []
  const usage = usageQuery.data

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <StatsRow
        activeCount={keys.length}
        usage={usage}
        usageLoading={usageQuery.isLoading}
      />

      {/* Keys card */}
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b bg-muted/30 py-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Active API keys</h2>
              <Badge variant="secondary" className="font-mono text-[11px]">
                {keys.length}/25
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Keys are SHA-256 hashed at rest. Plaintext is shown only at creation.
            </p>
          </div>
          <CreateApiKeyDialog onCreated={setRevealKey} />
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading keys…
            </div>
          ) : keys.length === 0 ? (
            <EmptyState onCreate={(k) => setRevealKey(k)} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Label</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <KeyRow
                    key={key.id}
                    apiKey={key}
                    onRevoke={(id) => revokeMutation.mutate(id)}
                    onCopyMasked={() => copyMasked(key)}
                    revoking={revokeMutation.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent requests table */}
      <RecentRequests usage={usage} loading={usageQuery.isLoading} />

      {/* Security note */}
      <SecurityNote />

      {/* One-time reveal modal */}
      <NewKeyRevealDialog
        created={revealKey}
        onClose={() => setRevealKey(null)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stats row
// ---------------------------------------------------------------------------

function StatsRow({
  activeCount,
  usage,
  usageLoading,
}: {
  activeCount: number
  usage?: UsageData
  usageLoading: boolean
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={<KeyRound className="size-4" />}
        label="Active keys"
        value={String(activeCount)}
        hint="non-revoked"
        tone="emerald"
      />
      <StatCard
        icon={<Activity className="size-4" />}
        label="Requests (7d)"
        value={usage ? String(usage.totals.requests7d) : '—'}
        hint={
          usage?.totals.lastRequestAt
            ? `last ${formatDistanceToNow(new Date(usage.totals.lastRequestAt), { addSuffix: true })}`
            : 'no activity yet'
        }
        tone="sky"
        loading={usageLoading}
      />
      <StatCard
        icon={<Clock className="size-4" />}
        label="Avg latency"
        value={usage ? `${usage.totals.avgDurationMs}ms` : '—'}
        hint="last 7 days"
        tone="violet"
        loading={usageLoading}
      />
      <Card className="overflow-hidden border-border/60">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              24h activity
            </span>
            <Activity className="size-3.5 text-muted-foreground" />
          </div>
          {usageLoading ? (
            <div className="h-20 flex items-center justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <UsageHistogram data={usage?.hourlyHistogram ?? new Array(24).fill(0)} />
              <p className="mt-2 text-[11px] text-muted-foreground">
                Hourly request volume, current hour on the right
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
  loading,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  tone: 'emerald' | 'sky' | 'violet'
  loading?: boolean
}) {
  const tones = {
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    sky: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
    violet: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
  } as const
  return (
    <Card className="overflow-hidden border-border/60">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </span>
          <span className={cn('grid size-7 place-items-center rounded-md', tones[tone])}>
            {icon}
          </span>
        </div>
        <div className="text-2xl font-semibold tabular-nums tracking-tight">
          {loading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : value}
        </div>
        {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ onCreate }: { onCreate: (key: CreatedApiKey) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-sky-500/10 text-emerald-600 dark:text-emerald-400 mb-4">
        <KeyRound className="size-7" />
      </div>
      <h3 className="text-base font-semibold">No active API keys yet</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Generate your first key to let tools like OpenFN or N8N read
        datasources and run queries against your DataMind BI account.
      </p>
      <div className="mt-5">
        <CreateApiKeyDialog onCreated={onCreate} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table row
// ---------------------------------------------------------------------------

function KeyRow({
  apiKey,
  onRevoke,
  onCopyMasked,
  revoking,
}: {
  apiKey: ApiKeyListItem
  onRevoke: (id: string) => void
  onCopyMasked: () => void
  revoking: boolean
}) {
  const isExpired =
    apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() < Date.now()

  return (
    <TableRow className="group">
      <TableCell className="pl-6 py-3">
        <div className="font-medium text-sm">{apiKey.label}</div>
      </TableCell>
      <TableCell className="py-3">
        <button
          onClick={onCopyMasked}
          className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="Copy masked key"
        >
          <span className="rounded bg-muted px-2 py-1 border border-border/60">
            {apiKey.keyMasked}
          </span>
          <Copy className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </TableCell>
      <TableCell className="py-3">
        <ScopeBadgeList scopes={apiKey.scopes} />
      </TableCell>
      <TableCell className="py-3">
        {apiKey.lastUsedAt ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground cursor-default">
                {formatDistanceToNow(new Date(apiKey.lastUsedAt), { addSuffix: true })}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <div>{format(new Date(apiKey.lastUsedAt), 'PPpp')}</div>
              {apiKey.lastUsedIp && (
                <div className="text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Globe className="size-3" /> {apiKey.lastUsedIp}
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-xs text-muted-foreground italic">never</span>
        )}
      </TableCell>
      <TableCell className="py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs text-muted-foreground cursor-default">
              {formatDistanceToNow(new Date(apiKey.createdAt), { addSuffix: true })}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {format(new Date(apiKey.createdAt), 'PPpp')}
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="py-3">
        {apiKey.expiresAt ? (
          <span
            className={cn(
              'text-xs',
              isExpired
                ? 'text-rose-500 font-medium'
                : 'text-muted-foreground',
            )}
          >
            {format(new Date(apiKey.expiresAt), 'PP')}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Never</span>
        )}
      </TableCell>
      <TableCell className="pr-6 py-3 text-right">
        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10"
                  disabled={revoking}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Revoke key
            </TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-amber-500" />
                Revoke API key?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will immediately disable the key{' '}
                <span className="font-medium text-foreground">{apiKey.label}</span>.
                Any integration using it will start receiving{' '}
                <code className="text-foreground">401 Unauthorized</code> responses.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="rounded-md bg-muted/50 border p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <Hash className="size-3 text-muted-foreground" />
                <span className="font-mono">{apiKey.keyMasked}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <ShieldCheck className="size-3 text-muted-foreground" />
                <span>Scopes: {apiKey.scopes.join(', ') || 'none'}</span>
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onRevoke(apiKey.id)}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                Revoke key
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  )
}

// ---------------------------------------------------------------------------
// Recent requests
// ---------------------------------------------------------------------------

function RecentRequests({
  usage,
  loading,
}: {
  usage?: UsageData
  loading: boolean
}) {
  const recent = usage?.recent ?? []
  return (
    <Card className="overflow-hidden border-border/60">
      <CardHeader className="border-b bg-muted/30 py-4">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Recent API requests</h2>
          <Badge variant="secondary" className="font-mono text-[11px]">
            last 25 / 7d
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin mr-2" /> Loading…
          </div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground mb-3">
              <CheckCircle2 className="size-5" />
            </div>
            <p className="text-sm font-medium">No requests yet</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              Once a third-party tool calls a{' '}
              <code className="text-foreground">/api/public/v1/*</code>{' '}
              endpoint with one of your keys, requests will appear here.
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Time</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">Latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="pl-6 py-2.5">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDistanceToNow(new Date(log.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <MethodBadge method={log.method} />
                    </TableCell>
                    <TableCell className="py-2.5">
                      <code className="text-xs font-mono">{log.endpoint}</code>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <span className="text-xs text-muted-foreground">
                        {log.apiKeyLabel}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5">
                      <StatusBadge status={log.statusCode} />
                    </TableCell>
                    <TableCell className="pr-6 py-2.5 text-right">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {log.durationMs}ms
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MethodBadge({ method }: { method: string }) {
  const tones: Record<string, string> = {
    GET: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    POST: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    DELETE: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
    PUT: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    PATCH: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  }
  return (
    <span
      className={cn(
        'inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold',
        tones[method] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {method}
    </span>
  )
}

function StatusBadge({ status }: { status: number }) {
  let tone = 'bg-muted text-muted-foreground'
  if (status >= 200 && status < 300)
    tone = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  else if (status >= 300 && status < 400)
    tone = 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
  else if (status >= 400 && status < 500)
    tone = 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
  else if (status >= 500) tone = 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
  return (
    <span className={cn('font-mono text-xs px-1.5 py-0.5 rounded', tone)}>
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Security note
// ---------------------------------------------------------------------------

function SecurityNote() {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex gap-3">
        <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1.5 text-sm">
          <p className="font-medium">Security best practices</p>
          <ul className="space-y-1 text-muted-foreground text-[13px] leading-relaxed">
            <li className="flex gap-2">
              <span className="text-emerald-500">•</span>
              <span>
                Keys are stored as <strong className="text-foreground">SHA-256 hashes</strong> —
                plaintext is never persisted, only shown once at creation.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500">•</span>
              <span>
                Use the <ScopeInlineBadge scope="read" /> scope for
                integrations that only need to read data. Reserve{' '}
                <ScopeInlineBadge scope="admin" /> for trusted internal tools.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500">•</span>
              <span>
                Set an expiry for short-lived syncs, and{' '}
                <strong className="text-foreground">rotate keys</strong>{' '}
                periodically. Revoking is instant and irreversible.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500">•</span>
              <span>
                All API requests are logged with endpoint, status, latency and
                IP — visible above and via{' '}
                <code className="text-foreground">/api/public/v1/usage</code>.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function ScopeInlineBadge({ scope }: { scope: 'read' | 'execute' | 'admin' }) {
  return (
    <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded border border-border/60">
      {scope}
    </code>
  )
}
