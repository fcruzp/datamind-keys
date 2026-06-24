'use client'

import * as React from 'react'
import {
  LayoutDashboard,
  KeyRound,
  Database,
  Activity,
  BookOpen,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { PortalView } from './types'

interface NavEntry {
  id: PortalView
  label: string
  icon: LucideIcon
  description: string
  soon?: boolean
}

const NAV: NavEntry[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    description: 'Overview of this tenant',
  },
  {
    id: 'api-keys',
    label: 'API Keys',
    icon: KeyRound,
    description: 'Bearer tokens for OpenFN / N8N',
  },
  {
    id: 'datasources',
    label: 'Datasources',
    icon: Database,
    description: 'Connected databases & warehouses',
    soon: true,
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: Activity,
    description: 'Recent API requests & audit trail',
    soon: true,
  },
  {
    id: 'docs',
    label: 'Docs',
    icon: BookOpen,
    description: 'OpenAPI spec + quickstart',
    soon: true,
  },
]

export function Sidebar({
  view,
  onViewChange,
  stats,
}: {
  view: PortalView
  onViewChange: (v: PortalView) => void
  stats?: { activeKeys: number; requests7d: number }
}) {
  return (
    <nav
      aria-label="Portal navigation"
      className="flex flex-col gap-1 p-3"
    >
      {NAV.map((entry) => {
        const Icon = entry.icon
        const isActive = view === entry.id
        return (
          <button
            key={entry.id}
            onClick={() => onViewChange(entry.id)}
            className={cn(
              'group flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
              isActive
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shadow-[inset_2px_0_0_0_rgb(16_185_129)]'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              entry.soon && 'opacity-70',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon
              className={cn(
                'size-4 shrink-0 mt-0.5 transition-colors',
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-muted-foreground group-hover:text-foreground',
              )}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{entry.label}</span>
                {entry.id === 'api-keys' && stats && stats.activeKeys > 0 && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-mono px-1.5 py-0 h-4"
                  >
                    {stats.activeKeys}
                  </Badge>
                )}
                {entry.soon && (
                  <span className="ml-auto text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70 border border-border/60 rounded px-1 py-0.5">
                    soon
                  </span>
                )}
              </div>
              <p
                className={cn(
                  'text-[11px] leading-snug mt-0.5',
                  isActive
                    ? 'text-emerald-700/70 dark:text-emerald-300/70'
                    : 'text-muted-foreground/80',
                )}
              >
                {entry.description}
              </p>
            </div>
          </button>
        )
      })}
    </nav>
  )
}
