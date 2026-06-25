'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, format } from 'date-fns'
import {
  AlertTriangle,
  Clock,
  Copy,
  FlaskConical,
  Globe,
  Hash,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Activity,
  CheckCircle2,
  CalendarClock,
  Filter,
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
import { EditApiKeyDialog } from './edit-api-key-dialog'
import { InlineSparkline } from './inline-sparkline'
import { NewKeyRevealDialog } from './new-key-reveal-dialog'
import { RevokedKeysAudit } from './revoked-keys-audit'
import { AuditLogPanel } from './audit-log-panel'
import { OpenApiExplorer } from './openapi-explorer'
import { ScopeBadgeList } from './scope-badge'
import { TestKeyPopover } from './test-key-popover'
import { UsageHistogram } from './usage-chart'
import { useCommandPalette, buildCurlExample } from './command-palette'
import { useRowKeyboardNav } from './use-row-keyboard-nav'
import type { ApiKeyListItem, CreatedApiKey, UsageData } from './types'
import { cn } from '@/lib/utils'

export function ApiKeysManager() {
  const qc = useQueryClient()
  const [revealKey, setRevealKey] = React.useState<CreatedApiKey | null>(null)
  const [expiringOnly, setExpiringOnly] = React.useState(false)
  const createKeyRef = React.useRef<HTMLButtonElement>(null)
  const revokedRef = React.useRef<HTMLDivElement>(null)

  // Open the Edit dialog for a key by programmatically clicking its row's Edit button.
  // Used by the keyboard-nav Enter handler.
  const handleActivateRow = React.useCallback((rowId: string) => {
    const btn = document.querySelector(
      `[data-row-id="${rowId}"] [aria-label^="Edit "]`,
    ) as HTMLButtonElement | null
    btn?.click()
  }, [])

  const handleCopyCurl = React.useCallback(async () => {
    const host =
      typeof window !== 'undefined' ? window.location.origin : 'https://datamind-api.mooo.com'
    const example = buildCurlExample(host)
    try {
      await navigator.clipboard.writeText(example)
      toast.success('curl example copied to clipboard')
    } catch {
      toast.error('Copy failed — select and copy manually')
    }
  }, [])

  const { palette } = useCommandPalette(
    () => createKeyRef.current?.click(),
    () => revokedRef.current?.scrollIntoView({ behavior: 'smooth' }),
    handleCopyCurl,
  )

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
      // Refresh auth/me so the dashboard "Active keys" stat card + sidebar
      // badge stay in sync after a key is revoked (activeKeys decreases).
      qc.invalidateQueries({ queryKey: ['auth-me'] })
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
  const allKeys = keysQuery.data ?? []
  const usage = usageQuery.data

  // Filter to "expiring soon" (within 7 days or already expired) when the
  // filter toggle is on. Helps users find keys that need rotation.
  const EXPIRING_SOON_DAYS = 7
  const isExpiringSoon = (k: ApiKeyListItem): boolean => {
    if (!k.expiresAt) return false
    const ms = new Date(k.expiresAt).getTime() - Date.now()
    return ms < EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000
  }
  const expiringCount = allKeys.filter(isExpiringSoon).length
  const keys = expiringOnly ? allKeys.filter(isExpiringSoon) : allKeys

  const keyboardNav = useRowKeyboardNav(keys.map((k) => k.id), {
    onActivate: handleActivateRow,
  })

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <StatsRow
        activeCount={keys.length}
        usage={usage}
        usageLoading={usageQuery.isLoading}
      />

      {/* Keys card */}
      <Card
        id="keys-section"
        className="overflow-hidden border-border/60 shadow-sm scroll-mt-24"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b bg-muted/30 py-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <KeyRound className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Active API keys</h2>
              <Badge variant="secondary" className="font-mono text-[11px]">
                {keys.length}/25
              </Badge>
              {expiringCount > 0 && (
                <button
                  onClick={() => setExpiringOnly((v) => !v)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                    expiringOnly
                      ? 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20',
                  )}
                  title="Toggle filter: only show keys expiring within 7 days"
                >
                  <CalendarClock className="size-3" />
                  {expiringCount} expiring
                  {expiringOnly && <span className="ml-1">· filtered</span>}
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Keys are SHA-256 hashed at rest. Plaintext is shown only at creation.
              {keys.length > 0 && (
                <span className="ml-2 hidden sm:inline-flex items-center gap-1 text-[10px]">
                  <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono">↑</kbd>
                  <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono">↓</kbd>
                  to navigate
                  <kbd className="ml-1 rounded border border-border bg-background px-1 py-0.5 font-mono">Enter</kbd>
                  to edit
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {expiringCount > 0 && (
              <Button
                size="sm"
                variant={expiringOnly ? 'secondary' : 'ghost'}
                className="gap-1.5"
                onClick={() => setExpiringOnly((v) => !v)}
                title="Toggle 'expiring soon' filter"
              >
                <Filter className="size-3.5" />
                <span className="hidden sm:inline">
                  {expiringOnly ? 'Show all' : 'Expiring soon'}
                </span>
              </Button>
            )}
            <CreateApiKeyDialog
              onCreated={setRevealKey}
              trigger={
                <Button ref={createKeyRef} className="gap-2 shadow-sm">
                  <Plus className="size-4" />
                  Generate new key
                </Button>
              }
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading keys…
            </div>
          ) : allKeys.length === 0 ? (
            <EmptyState onCreate={(k) => setRevealKey(k)} />
          ) : expiringOnly && keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="grid size-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-3">
                <CheckCircle2 className="size-5" />
              </div>
              <p className="text-sm font-medium">No keys expiring soon</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                All your active keys have more than 7 days of life remaining,
                or never expire.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-3"
                onClick={() => setExpiringOnly(false)}
              >
                Clear filter
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto" {...keyboardNav.containerProps}>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Label</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Scopes</TableHead>
                    <TableHead className="text-center">24h</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="pr-6 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => {
                    const perKey = usage?.perKey.find((p) => p.apiKeyId === key.id)
                    return (
                      <KeyRow
                        key={key.id}
                        apiKey={key}
                        histogram24h={perKey?.histogram24h ?? []}
                        count7d={perKey?.count ?? 0}
                        isActive={keyboardNav.activeRowId === key.id}
                        onRevoke={(id) => revokeMutation.mutate(id)}
                        onCopyMasked={() => copyMasked(key)}
                        revoking={revokeMutation.isPending}
                      />
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent requests table */}
      <RecentRequests usage={usage} loading={usageQuery.isLoading} />

      {/* OpenAPI spec explorer */}
      <OpenApiExplorer />

      {/* Revoked keys audit */}
      <div ref={revokedRef} className="scroll-mt-24">
        <RevokedKeysAudit />
      </div>

      {/* Settings audit log (create / edit / revoke history) */}
      <AuditLogPanel />

      {/* Security note */}
      <SecurityNote />

      {/* One-time reveal modal */}
      <NewKeyRevealDialog
        created={revealKey}
        onClose={() => setRevealKey(null)}
      />

      {/* Command palette (Cmd/Ctrl+K) */}
      {palette}
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
        tone="amber"
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
  tone: 'emerald' | 'sky' | 'amber'
  loading?: boolean
}) {
  const tones = {
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
    sky: 'text-sky-600 dark:text-sky-400 bg-sky-500/10',
    amber: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
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
  histogram24h,
  count7d,
  isActive,
  onRevoke,
  onCopyMasked,
  revoking,
}: {
  apiKey: ApiKeyListItem
  histogram24h: number[]
  count7d: number
  isActive: boolean
  onRevoke: (id: string) => void
  onCopyMasked: () => void
  revoking: boolean
}) {
  const isExpired =
    apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() < Date.now()

  const total24h = histogram24h.reduce((a, b) => a + b, 0)

  return (
    <TableRow
      data-row-id={apiKey.id}
      className={cn(
        'group transition-colors',
        isActive && 'bg-emerald-500/[0.04] shadow-[inset_2px_0_0_0_rgb(16_185_129)]',
      )}
    >
      <TableCell className="pl-6 py-3 align-top">
        <div className="font-medium text-sm">{apiKey.label}</div>
      </TableCell>
      <TableCell className="py-3 align-top">
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
      <TableCell className="py-3 align-top">
        <ScopeBadgeList scopes={apiKey.scopes} />
      </TableCell>
      <TableCell className="py-3 align-top text-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex flex-col items-center gap-0.5 cursor-default">
              <InlineSparkline data={histogram24h} />
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {total24h}
                {count7d > total24h && (
                  <span className="text-muted-foreground/60"> / {count7d}</span>
                )}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <div>{total24h} request{total24h === 1 ? '' : 's'} in last 24h</div>
            <div className="text-muted-foreground">{count7d} in last 7 days</div>
          </TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="py-3 align-top">
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
      <TableCell className="py-3 align-top">
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
      <TableCell className="py-3 align-top">
        {apiKey.expiresAt ? (
          <ExpiryCell expiresAt={apiKey.expiresAt} isExpired={!!isExpired} />
        ) : (
          <span className="text-xs text-muted-foreground">Never</span>
        )}
      </TableCell>
      <TableCell className="pr-6 py-3 text-right align-top">
        <div className="inline-flex items-center gap-1">
          {/* Edit */}
          <EditApiKeyDialog
            apiKey={apiKey}
            trigger={
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                aria-label={`Edit ${apiKey.label}`}
                title="Edit label"
              >
                <Pencil className="size-3.5" />
              </Button>
            }
          />

          {/* Test */}
          <TestKeyPopover expectedPrefix={apiKey.keyMasked}>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10"
              aria-label={`Test ${apiKey.label}`}
              title="Test key against /api/public/v1/me"
            >
              <FlaskConical className="size-3.5" />
            </Button>
          </TestKeyPopover>

          {/* Revoke */}
          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10"
                    disabled={revoking}
                    aria-label={`Revoke ${apiKey.label}`}
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
        </div>
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
// Expiry cell — shows date + warning chip if expiring soon
// ---------------------------------------------------------------------------

function ExpiryCell({
  expiresAt,
  isExpired,
}: {
  expiresAt: string
  isExpired: boolean
}) {
  const date = new Date(expiresAt)
  const msRemaining = date.getTime() - Date.now()
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000))

  // Expired
  if (isExpired) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs text-rose-500 font-medium cursor-default">
            <CalendarClock className="size-3" />
            Expired
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Expired {format(date, 'PPpp')}
        </TooltipContent>
      </Tooltip>
    )
  }

  // Expiring soon (within 7 days)
  if (daysRemaining <= 7) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 cursor-default">
            <CalendarClock className="size-3" />
            {daysRemaining <= 0
              ? 'today'
              : daysRemaining === 1
                ? '1 day'
                : `${daysRemaining}d`}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div>Expires {format(date, 'PPpp')}</div>
          <div className="text-muted-foreground">
            Consider rotating this key soon.
          </div>
        </TooltipContent>
      </Tooltip>
    )
  }

  // Normal expiry
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-xs text-muted-foreground cursor-default">
          {format(date, 'PP')}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {format(date, 'PPpp')}
      </TooltipContent>
    </Tooltip>
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
