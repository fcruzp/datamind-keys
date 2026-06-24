'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import {
  ChevronDown,
  ClipboardList,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

export interface AuditEntry {
  id: string
  action: 'api_key.create' | 'api_key.update' | 'api_key.revoke'
  apiKeyId: string | null
  apiKeyLabel: string | null
  diff: Record<string, unknown>
  ip: string | null
  userAgent: string | null
  createdAt: string
}

const ACTION_META: Record<
  AuditEntry['action'],
  { label: string; icon: React.ReactNode; tone: string }
> = {
  'api_key.create': {
    label: 'Created',
    icon: <Plus className="size-3" />,
    tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  },
  'api_key.update': {
    label: 'Edited',
    icon: <Pencil className="size-3" />,
    tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
  },
  'api_key.revoke': {
    label: 'Revoked',
    icon: <Trash2 className="size-3" />,
    tone: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
  },
}

export function AuditLogPanel() {
  const [open, setOpen] = React.useState(false)

  const query = useQuery({
    queryKey: ['audit-log'],
    queryFn: async () => {
      const res = await fetch('/api/settings/api-keys/audit')
      if (!res.ok) throw new Error('Failed to load audit log')
      const json = (await res.json()) as { entries: AuditEntry[] }
      return json.entries
    },
    enabled: open,
  })

  const entries = query.data ?? []

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden border-border/60 border-dashed">
        <CollapsibleTrigger asChild>
          <CardHeader className="flex flex-row items-center justify-between gap-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
                <ClipboardList className="size-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">Settings audit log</h2>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    last 100
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Every key create / edit / revoke is recorded with IP + user-agent.
                </p>
              </div>
            </div>
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground transition-transform',
                open && 'rotate-180',
              )}
            />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-0 border-t">
            {query.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                <ClipboardList className="size-5 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No settings changes recorded yet. Create, edit, or revoke a
                  key to populate this audit trail.
                </p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-6">Action</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead className="pr-6 text-right">When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => {
                      const meta = ACTION_META[entry.action]
                      return (
                        <TableRow key={entry.id} className="align-top">
                          <TableCell className="pl-6 py-2.5">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                                meta.tone,
                              )}
                            >
                              {meta.icon}
                              {meta.label}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5">
                            <span className="text-xs font-medium">
                              {entry.apiKeyLabel ?? '—'}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5 max-w-md">
                            <DiffSummary
                              action={entry.action}
                              diff={entry.diff}
                            />
                          </TableCell>
                          <TableCell className="py-2.5">
                            {entry.ip ? (
                              <code className="font-mono text-[10px] text-muted-foreground">
                                {entry.ip}
                              </code>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="pr-6 py-2.5 text-right">
                            <Tooltip title={format(new Date(entry.createdAt), 'PPpp')}>
                              <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(entry.createdAt), {
                                  addSuffix: true,
                                })}
                              </span>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

/** Lightweight inline tooltip — avoids importing the TooltipProvider primitives here. */
function Tooltip({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <span title={title} className="cursor-default">
      {children}
    </span>
  )
}

/**
 * Renders a one-line summary of what changed in the audit entry.
 * - create: shows scopes + IP allowlist count + rate limit
 * - update: shows only the changed fields with before → after
 * - revoke: shows when revoked
 */
function DiffSummary({
  action,
  diff,
}: {
  action: AuditEntry['action']
  diff: Record<string, unknown>
}) {
  if (action === 'api_key.create') {
    const scopes = (diff.scopes as string[] | undefined) ?? []
    const allowedIps = (diff.allowedIps as string[] | undefined) ?? []
    const rate = diff.rateLimitPerMinute as number | null | undefined
    const expiresAt = diff.expiresAt as string | null | undefined
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <DiffChip label="scopes" value={scopes.join(', ') || 'none'} />
        <DiffChip label="IPs" value={String(allowedIps.length)} />
        <DiffChip
          label="rate"
          value={rate == null ? '60/min (default)' : `${rate}/min`}
        />
        {expiresAt ? (
          <DiffChip
            label="expires"
            value={format(new Date(expiresAt), 'PP')}
          />
        ) : (
          <DiffChip label="expires" value="never" />
        )}
      </div>
    )
  }

  if (action === 'api_key.revoke') {
    const revokedAt = diff.revokedAt as string | undefined
    return (
      <span className="text-[11px] text-muted-foreground">
        Revoked
        {revokedAt && (
          <> at {format(new Date(revokedAt), 'PPpp')}</>
        )}
      </span>
    )
  }

  // api_key.update — render changed fields with before → after
  const changed = Object.entries(diff).filter(
    ([, v]) =>
      v &&
      typeof v === 'object' &&
      'before' in (v as object) &&
      'after' in (v as object),
  )
  if (changed.length === 0) {
    return <span className="text-[11px] text-muted-foreground italic">no fields changed</span>
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {changed.map(([field, value]) => {
        const v = value as { before: unknown; after: unknown }
        return (
          <DiffBeforeAfter
            key={field}
            field={field}
            before={formatValue(v.before)}
            after={formatValue(v.after)}
          />
        )
      })}
    </div>
  )
}

function formatValue(v: unknown): string {
  if (v == null) return 'null'
  if (Array.isArray(v)) return v.length === 0 ? '[]' : v.join(', ')
  if (typeof v === 'string') return v
  return String(v)
}

function DiffChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5">
      <span className="text-muted-foreground/80">{label}:</span>
      <code className="font-mono text-foreground/80">{value}</code>
    </span>
  )
}

function DiffBeforeAfter({
  field,
  before,
  after,
}: {
  field: string
  before: string
  after: string
}) {
  // Truncate long values for the inline display
  const trunc = (s: string) => (s.length > 24 ? `${s.slice(0, 24)}…` : s)
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5">
      <span className="text-muted-foreground/80">{field}:</span>
      <code className="font-mono text-muted-foreground line-through decoration-muted-foreground/50">
        {trunc(before)}
      </code>
      <span className="text-muted-foreground/60">→</span>
      <code className="font-mono text-foreground/80">{trunc(after)}</code>
    </span>
  )
}
