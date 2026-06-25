'use client'

import * as React from 'react'
import { Check, Copy, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'

/**
 * A compact icon-only copy-to-clipboard button.
 *
 * Shows a Copy icon by default, swaps to a green Check icon for 2s after
 * a successful copy. Uses sonner for toast feedback.
 */
export const CopyButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> & {
    /** The text to copy to the clipboard. */
    value: string
    /** Optional tooltip / aria-label text. Defaults to "Copy". */
    label?: string
    /** Icon size. Defaults to size-3.5 (14px). */
    iconSize?: string
    /** Show a toast on success? Defaults to true. */
    showToast?: boolean
    /** Custom icon to override the default Copy icon. */
    copyIcon?: LucideIcon
    /** Custom icon to override the default Check icon. */
    checkIcon?: LucideIcon
  }
>(function CopyButton(
  {
    value,
    label = 'Copy',
    iconSize = 'size-3.5',
    showToast = true,
    copyIcon: Copy = Copy,
    checkIcon: Check = Check,
    className,
    onClick,
    ...props
  },
  ref,
) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (showToast) toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      if (showToast) toast.error('Copy failed — select and copy manually')
    }
    onClick?.(e)
  }

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      onClick={handleCopy}
      className={cn(
        'inline-grid place-items-center rounded-md p-1.5 text-muted-foreground/70',
        'hover:text-foreground hover:bg-accent transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        copied && 'text-emerald-500 hover:text-emerald-500',
        className,
      )}
      {...props}
    >
      {copied ? <Check className={cn(iconSize)} /> : <Copy className={cn(iconSize)} />}
    </button>
  )
})
