'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Plus, Sparkles } from 'lucide-react'
import { z } from 'zod'

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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScopeBadge } from './scope-badge'
import { SCOPE_META, type ApiScope, type CreatedApiKey } from './types'
import { cn } from '@/lib/utils'

const schema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Give your key a label so you remember what it’s for')
    .max(60, 'Label must be 60 characters or less'),
  scopes: z
    .array(z.enum(['read', 'execute', 'admin']))
    .min(1, 'Pick at least one scope'),
  expiresInDays: z.number().nullable(),
})

const EXPIRY_OPTIONS: Array<{
  label: string
  value: string
  days: number | null
}> = [
  { label: 'Never', value: 'never', days: null },
  { label: '30 days', value: '30', days: 30 },
  { label: '90 days', value: '90', days: 90 },
  { label: '1 year', value: '365', days: 365 },
]

export function CreateApiKeyDialog({
  onCreated,
  trigger,
}: {
  onCreated: (key: CreatedApiKey) => void
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [label, setLabel] = React.useState('')
  const [scopes, setScopes] = React.useState<ApiScope[]>(['read'])
  const [expiry, setExpiry] = React.useState<string>('never')
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const qc = useQueryClient()

  const reset = () => {
    setLabel('')
    setScopes(['read'])
    setExpiry('never')
    setErrors({})
  }

  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(reset, 200)
      return () => clearTimeout(t)
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: async () => {
      const expiryOpt = EXPIRY_OPTIONS.find((o) => o.value === expiry)
      const body = {
        label: label.trim(),
        scopes,
        expiresInDays: expiryOpt?.days ?? null,
      }
      const parsed = schema.safeParse(body)
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {}
        for (const issue of parsed.error.issues) {
          const key = issue.path[0]?.toString() ?? '_'
          if (!fieldErrors[key]) fieldErrors[key] = issue.message
        }
        setErrors(fieldErrors)
        throw new Error(fieldErrors._ ?? 'Validation failed')
      }
      setErrors({})

      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const json = await res.json()
      if (!res.ok) {
        const msg =
          (json as { error?: string }).error ?? 'Failed to create API key'
        throw new Error(msg)
      }
      return json as CreatedApiKey
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['api-keys'] })
      qc.invalidateQueries({ queryKey: ['api-keys-usage'] })
      setOpen(false)
      toast.success(`API key “${created.label}” created`)
      onCreated(created)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const toggleScope = (s: ApiScope) => {
    setScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="gap-2 shadow-sm">
            <Plus className="size-4" />
            Generate new key
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-emerald-500" />
            Create API Key
          </DialogTitle>
          <DialogDescription>
            Generate a new bearer token for OpenFN, N8N, or any third-party
            integration. The plaintext key will be shown{' '}
            <span className="font-semibold text-foreground">only once</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Label */}
          <div className="space-y-2">
            <Label htmlFor="ak-label">
              Label <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="ak-label"
              placeholder="OpenFN — nightly sync"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              autoFocus
            />
            {errors.label && (
              <p className="text-xs text-rose-500">{errors.label}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Helps you recognise the key later. Visible only to you.
            </p>
          </div>

          {/* Scopes */}
          <div className="space-y-2">
            <Label>Scopes</Label>
            <div className="grid gap-2">
              {(Object.keys(SCOPE_META) as ApiScope[]).map((s) => {
                const meta = SCOPE_META[s]
                const checked = scopes.includes(s)
                return (
                  <label
                    key={s}
                    htmlFor={`scope-${s}`}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                      checked
                        ? 'border-emerald-500/40 bg-emerald-500/[0.04]'
                        : 'border-border hover:bg-accent/50',
                    )}
                  >
                    <Checkbox
                      id={`scope-${s}`}
                      checked={checked}
                      onCheckedChange={() => toggleScope(s)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <ScopeBadge scope={s} />
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {meta.description}
                      </p>
                    </div>
                  </label>
                )
              })}
            </div>
            {errors.scopes && (
              <p className="text-xs text-rose-500">{errors.scopes}</p>
            )}
          </div>

          {/* Expiry */}
          <div className="space-y-2">
            <Label>Expires</Label>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Key stops working past this date. Leave at “Never” for long-lived
              integrations.
            </p>
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
            disabled={mutation.isPending || !label.trim() || scopes.length === 0}
            className="gap-2"
          >
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Generate key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
