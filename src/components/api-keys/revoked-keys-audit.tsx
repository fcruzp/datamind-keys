'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Archive,
  ChevronDown,
  Loader2,
  RotateCcw,
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
import { ScopeBadgeList } from './scope-badge'
import type { RevokedApiKey } from './types'
import { cn } from '@/lib/utils'

export function RevokedKeysAudit() {
  const [open, setOpen] = React.useState(false)

  const query = useQuery({
    queryKey: ['api-keys-revoked'],
    queryFn: async () => {
      const res = await fetch('/api/settings/api-keys/revoked')
      if (!res.ok) throw new Error('Failed to load revoked keys')
      const json = (await res.json()) as { keys: RevokedApiKey[] }
      return json.keys
    },
    enabled: open, // only fetch when expanded
  })

  const keys = query.data ?? []

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden border-border/60 border-dashed">
        <CollapsibleTrigger asChild>
          <CardHeader className="flex flex-row items-center justify-between gap-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Archive className="size-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">Revoked keys audit</h2>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {keys.length} revoked
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Historical record of revoked keys for audit & forensics.
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
            ) : keys.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                <RotateCcw className="size-5 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  No revoked keys yet. Revoked keys will appear here for audit.
                </p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-6">Label</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Scopes</TableHead>
                      <TableHead>Revoked</TableHead>
                      <TableHead className="pr-6">Last used</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys.map((key) => (
                      <TableRow key={key.id} className="opacity-70">
                        <TableCell className="pl-6 py-2.5">
                          <span className="text-sm font-medium line-through decoration-muted-foreground/50">
                            {key.label}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <code className="font-mono text-xs text-muted-foreground">
                            {key.keyMasked}
                          </code>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <ScopeBadgeList scopes={key.scopes} />
                        </TableCell>
                        <TableCell className="py-2.5">
                          {key.revokedAt && (
                            <span
                              className="text-xs text-muted-foreground"
                              title={format(new Date(key.revokedAt), 'PPpp')}
                            >
                              {formatDistanceToNow(new Date(key.revokedAt), {
                                addSuffix: true,
                              })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="pr-6 py-2.5">
                          {key.lastUsedAt ? (
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(key.lastUsedAt), {
                                addSuffix: true,
                              })}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              never
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
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
