'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Pencil, ShieldCheck } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ApiKeyListItem } from './types'

export function EditApiKeyDialog({
  apiKey,
  trigger,
}: {
  apiKey: ApiKeyListItem
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [label, setLabel] = React.useState(apiKey.label)

  const qc = useQueryClient()

  // Reset state when dialog opens (in case apiKey prop changed)
  React.useEffect(() => {
    if (open) {
      setLabel(apiKey.label)
    }
  }, [open, apiKey])

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {}
      if (label.trim() !== apiKey.label) body.label = label.trim()

      if (Object.keys(body).length === 0) {
        toast.info('No changes to save.')
        return null
      }

      const res = await fetch(`/api/settings/api-keys/${apiKey.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error((json as { error?: string }).error ?? 'Failed to update key')
      }
      return json
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] })
      // Refresh auth/me too — keeps the dashboard stats consistent even
      // though editing the label doesn't change the active count.
      qc.invalidateQueries({ queryKey: ['auth-me'] })
      setOpen(false)
      toast.success('API key updated')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
            aria-label="Edit key"
          >
            <Pencil className="size-3.5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-4 text-muted-foreground" />
            Edit API key
          </DialogTitle>
          <DialogDescription>
            Update the label for{' '}
            <code className="font-mono text-xs text-foreground">
              {apiKey.keyMasked}
            </code>
            . Scopes cannot be changed — revoke and recreate if needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Label */}
          <div className="space-y-2">
            <Label htmlFor="edit-label">Label</Label>
            <Input
              id="edit-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="gap-2"
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
