'use client'

import { cn } from '@/lib/utils'

/**
 * Tiny inline SVG sparkline for per-key usage.
 * Renders a smooth area chart with no axes — meant to sit inside table cells.
 */
export function InlineSparkline({
  data,
  className,
  width = 80,
  height = 24,
}: {
  data: number[]
  className?: string
  width?: number
  height?: number
}) {
  if (!data.length) {
    return (
      <div
        className={cn('inline-block', className)}
        style={{ width, height }}
      />
    )
  }

  const max = Math.max(1, ...data)
  const step = width / Math.max(1, data.length - 1)

  const points = data.map((v, i) => {
    const x = i * step
    const y = height - (v / max) * (height - 2) - 1
    return [x, y] as const
  })

  // Smooth path via simple line segments (good enough at this size)
  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`

  const total = data.reduce((a, b) => a + b, 0)
  const hasData = total > 0

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('inline-block', className)}
      aria-label={`${total} requests in 24h`}
    >
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {hasData ? (
        <>
          <path d={areaPath} fill="url(#spark-grad)" />
          <path
            d={linePath}
            fill="none"
            stroke="rgb(16 185 129)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* end dot */}
          <circle
            cx={points[points.length - 1]![0]}
            cy={points[points.length - 1]![1]}
            r="1.5"
            fill="rgb(16 185 129)"
          />
        </>
      ) : (
        <line
          x1="0"
          y1={height - 1}
          x2={width}
          y2={height - 1}
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      )}
    </svg>
  )
}
