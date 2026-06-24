'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Terminal,
} from 'lucide-react'
import { format } from 'date-fns'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScopeBadgeList } from './scope-badge'
import type { CreatedApiKey } from './types'

export function NewKeyRevealDialog({
  created,
  onClose,
}: {
  created: CreatedApiKey | null
  onClose: () => void
}) {
  const [revealed, setRevealed] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [acknowledged, setAcknowledged] = React.useState(false)

  // Reset state every time a new key comes in
  React.useEffect(() => {
    if (created) {
      setRevealed(true)
      setCopied(false)
      setAcknowledged(false)
    }
  }, [created])

  const open = created !== null

  const handleCopy = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.plaintext)
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copy failed — select and copy manually')
    }
  }

  const curlExample = created
    ? `curl https://datamind.mooo.com/api/public/v1/me \\
  -H "Authorization: Bearer ${created.plaintext}"`
    : ''

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && acknowledged) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="sm:max-w-2xl gap-0 p-0 overflow-hidden"
      >
        {/* Header band */}
        <div className="relative bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent border-b border-amber-500/20 px-6 pt-6 pb-5">
          <div className="flex items-start gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
              <AlertTriangle className="size-5" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                Save your API key now
              </DialogTitle>
              <DialogDescription className="mt-1 text-amber-900 dark:text-amber-200/80">
                We show the plaintext <strong>only once</strong>. After you
                close this dialog, it can never be retrieved — only the hash is
                stored.
              </DialogDescription>
            </div>
          </div>
        </div>

        {created && (
          <div className="px-6 py-5 space-y-5">
            {/* Key display */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Your new API key
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setRevealed((r) => !r)}
                  >
                    {revealed ? (
                      <>
                        <EyeOff className="size-3.5" /> Hide
                      </>
                    ) : (
                      <>
                        <Eye className="size-3.5" /> Show
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <>
                        <Check className="size-3.5 text-emerald-500" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" /> Copy
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <div className="relative rounded-lg border border-amber-500/30 bg-amber-500/[0.03] p-3 font-mono text-sm break-all">
                {revealed ? (
                  <span className="text-foreground select-all">
                    {created.plaintext}
                  </span>
                ) : (
                  <span className="text-muted-foreground tracking-widest">
                    {'•'.repeat(created.plaintext.length)}
                  </span>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <MetaRow label="Label" value={created.label} />
              <MetaRow
                label="Created"
                value={format(new Date(created.createdAt), 'PPpp')}
              />
              <MetaRow
                label="Expires"
                value={
                  created.expiresAt
                    ? format(new Date(created.expiresAt), 'PP')
                    : 'Never'
                }
              />
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Scopes
                </span>
                <ScopeBadgeList scopes={created.scopes} />
              </div>
            </div>

            {/* Curl example */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <Terminal className="size-3.5" /> Quick test
              </div>
              <pre className="overflow-x-auto rounded-lg bg-zinc-950 text-zinc-100 p-3 text-xs font-mono leading-relaxed border border-border">
                <code>{curlExample}</code>
              </pre>
              <p className="text-xs text-muted-foreground">
                This endpoint calls <code className="text-foreground">/api/public/v1/me</code>{' '}
                to verify the key without side-effects.
              </p>
            </div>

            {/* Acknowledge + close */}
            <div className="space-y-3 border-t border-border pt-4">
              <label className="flex items-start gap-2.5 cursor-pointer group">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={acknowledged}
                  onClick={() => setAcknowledged((a) => !a)}
                  className={`mt-0.5 grid size-5 place-items-center rounded border transition-colors ${
                    acknowledged
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-input group-hover:bg-accent'
                  }`}
                >
                  {acknowledged && <Check className="size-3.5" />}
                </button>
                <span className="text-sm text-muted-foreground leading-relaxed">
                  I’ve saved my key in a secure location. I understand it{' '}
                  <strong className="text-foreground">cannot be recovered</strong>{' '}
                  if lost.
                </span>
              </label>

              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (!acknowledged) {
                      toast.warning(
                        'Please confirm you’ve saved the key first.',
                      )
                      return
                    }
                    onClose()
                  }}
                  className="gap-2"
                >
                  <Lock className="size-3.5" />
                  I’ve saved my key
                </Button>
                <Button
                  onClick={async () => {
                    await navigator.clipboard
                      .writeText(created.plaintext)
                      .catch(() => {})
                    if (!acknowledged) {
                      toast.warning(
                        'Please confirm you’ve saved the key first.',
                      )
                      return
                    }
                    onClose()
                  }}
                  disabled={!acknowledged}
                  className="gap-2"
                >
                  <Check className="size-4" />
                  Done
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <p className="text-sm font-medium truncate">{value}</p>
    </div>
  )
}

// Re-export for the "loading" placeholder variant
export function RevealLoading() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Generating key…
    </div>
  )
}
