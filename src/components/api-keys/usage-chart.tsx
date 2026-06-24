'use client'

import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Lightweight 24-hour sparkline histogram. No external chart lib needed.
 * Each bar represents one hour; rightmost = current hour.
 */
export function UsageHistogram({
  data,
  className,
}: {
  data: number[]
  className?: string
}) {
  const max = Math.max(1, ...data)
  return (
    <div
      className={cn(
        'flex items-end gap-[3px] h-20 w-full',
        className,
      )}
    >
      {data.map((count, i) => {
        const pct = count === 0 ? 4 : Math.max(8, (count / max) * 100)
        const isPeak = count === max && count > 0
        return (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <div className="flex-1 group flex flex-col items-center justify-end h-full cursor-default">
                <div
                  className={cn(
                    'w-full rounded-sm transition-all duration-200',
                    count === 0
                      ? 'bg-muted-foreground/15'
                      : isPeak
                        ? 'bg-gradient-to-t from-emerald-600 to-emerald-400'
                        : 'bg-gradient-to-t from-emerald-500/70 to-emerald-400/70 group-hover:from-emerald-500 group-hover:to-emerald-300',
                  )}
                  style={{ height: `${pct}%` }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <div className="font-medium">
                {count} request{count === 1 ? '' : 's'}
              </div>
              <div className="text-muted-foreground">
                {hoursAgoLabel(i, data.length)}
              </div>
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

function hoursAgoLabel(index: number, total: number): string {
  const hoursAgo = total - 1 - index
  if (hoursAgo === 0) return 'current hour'
  if (hoursAgo === 1) return '1h ago'
  return `${hoursAgo}h ago`
}
