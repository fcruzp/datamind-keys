'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronsUpDown, Check, Building2, UserCircle2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { PortalUser } from './types'

/**
 * Multi-tenant switcher shown in the portal header.
 *
 * Lists every seeded demo tenant and POSTs to /api/auth/switch when the
 * operator picks one — the response sets a `dm_session_email` cookie and
 * the portal invalidates all queries so the new tenant's data loads.
 *
 * In production DataMind BI this would be the Supabase org-switcher; the
 * contract is identical: switch tenant → server sets a session cookie →
 * client refetches everything scoped to the new tenant.
 */
export function TenantSwitcher({
  current,
  switchable,
}: {
  current: PortalUser
  switchable: (PortalUser & { isCurrent: boolean })[]
}) {
  const qc = useQueryClient()

  const switchMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch('/api/auth/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error ?? 'Failed to switch tenant')
      }
      return res.json()
    },
    onSuccess: (_data, email) => {
      // Invalidate everything — every query in the portal is tenant-scoped
      qc.invalidateQueries()
      const target = switchable.find((u) => u.email === email)
      toast.success(`Switched to ${target?.tenantName ?? email}`)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Build initials for the avatar
  const initials = React.useMemo(() => {
    const name = current.name ?? current.email
    return name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]!.toUpperCase())
      .join('')
  }, [current])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="group inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card pl-1.5 pr-2 py-1.5 text-left hover:bg-accent hover:border-border transition-colors shadow-sm"
          aria-label="Switch tenant"
        >
          <span
            className={cn(
              'grid size-7 place-items-center rounded-md bg-gradient-to-br text-white text-[11px] font-semibold shadow-inner',
              current.avatarColor,
            )}
          >
            {initials}
          </span>
          <span className="hidden sm:flex flex-col leading-tight min-w-0">
            <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
              {current.tenantName}
            </span>
            <span className="text-xs font-medium truncate max-w-[120px]">
              {current.name ?? current.email}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
          <Building2 className="size-3.5" />
          Switch tenant
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {switchable.map((u) => {
          const uInitials = (u.name ?? u.email)
            .split(/[\s@.]+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((s) => s[0]!.toUpperCase())
            .join('')
          return (
            <DropdownMenuItem
              key={u.id}
              onClick={() => switchMutation.mutate(u.email)}
              disabled={switchMutation.isPending || u.isCurrent}
              className="flex items-center gap-2.5 py-2 cursor-pointer"
            >
              <span
                className={cn(
                  'grid size-8 place-items-center rounded-md bg-gradient-to-br text-white text-[11px] font-semibold shadow-inner shrink-0',
                  u.avatarColor,
                )}
              >
                {uInitials}
              </span>
              <span className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium truncate">
                  {u.tenantName}
                </span>
                <span className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                  <UserCircle2 className="size-3" />
                  {u.name ?? u.email}
                  <span className="text-muted-foreground/70">·</span>
                  <span className="capitalize">{u.role}</span>
                </span>
              </span>
              {u.isCurrent && (
                <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
