'use client'

import { Construction, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Placeholder for portal views that aren't built yet. Keeps the navigation
 * discoverable without dead-ends.
 */
export function ComingSoon({
  title,
  description,
  onBack,
}: {
  title: string
  description: string
  onBack?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center min-h-[60vh]">
      <div className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-500/15 to-orange-500/10 text-amber-600 dark:text-amber-400 mb-5">
        <Construction className="size-8" />
      </div>
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground leading-relaxed mb-6">
        {description}
      </p>
      {onBack && (
        <Button variant="outline" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="size-3.5" /> Back to dashboard
        </Button>
      )}
    </div>
  )
}
