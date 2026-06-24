import { cn } from '@/lib/utils'
import { ShieldCheck, Zap, Crown, type LucideIcon } from 'lucide-react'
import type { ApiScope } from './types'

const TONES: Record<
  'emerald' | 'sky' | 'rose',
  { icon: LucideIcon; className: string; dot: string }
> = {
  emerald: {
    icon: ShieldCheck,
    className:
      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  sky: {
    icon: Zap,
    className:
      'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
    dot: 'bg-sky-500',
  },
  rose: {
    icon: Crown,
    className:
      'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
    dot: 'bg-rose-500',
  },
}

export function ScopeBadge({
  scope,
  withIcon = true,
  className,
}: {
  scope: ApiScope
  withIcon?: boolean
  className?: string
}) {
  const tone =
    scope === 'read' ? 'emerald' : scope === 'execute' ? 'sky' : 'rose'
  const { icon: Icon, className: toneClass } = TONES[tone]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide',
        toneClass,
        className,
      )}
    >
      {withIcon && <Icon className="size-3" />}
      {scope}
    </span>
  )
}

export function ScopeBadgeList({
  scopes,
  className,
}: {
  scopes: ApiScope[]
  className?: string
}) {
  if (!scopes.length) {
    return (
      <span className="text-xs text-muted-foreground italic">no scopes</span>
    )
  }
  // Always show in a stable order: read, execute, admin
  const order: ApiScope[] = ['read', 'execute', 'admin']
  const sorted = [...scopes].sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  )
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {sorted.map((s) => (
        <ScopeBadge key={s} scope={s} />
      ))}
    </div>
  )
}
