'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Loader2,
  Pencil,
  Shield,
  Gauge,
  X,
  Globe,
} from 'lucide-react'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ApiKeyListItem } from './types'
import { cn } from '@/lib/utils'

const RATE_LIMIT_OPTIONS: Array<{
  label: string
  value: string
  rpm: number | null
}> = [
  { label: 'Default (60/min)', value: 'default', rpm: null },
  { label: '10/min — conservative', value: '10', rpm: 10 },
  { label: '30/min', value: '30', rpm: 30 },
  { label: '60/min — default', value: '60', rpm: 60 },
  { label: '120/min', value: '120', rpm: 120 },
  { label: '300/min — bursty', value: '300', rpm: 300 },
  { label: '1000/min — high volume', value: '1000', rpm: 1000 },
]

function rateLimitToValue(rpm: number | null): string {
  return rpm === null ? 'default' : String(rpm)
}

function valueToRateLimit(value: string): number | null {
  return value === 'default' ? null : parseInt(value, 10)
}

export function EditApiKeyDialog({
  apiKey,
  trigger,
}: {
  apiKey: ApiKeyListItem
  trigger?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [label, setLabel] = React.useState(apiKey.label)
  const [rateLimit, setRateLimit] = React.useState(rateLimitToValue(apiKey.rateLimitPerMinute))
  const [ipInput, setIpInput] = React.useState('')
  const [allowedIps, setAllowedIps] = React.useState<string[]>(apiKey.allowedIps)

  const qc = useQueryClient()

  // Reset state when dialog opens (in case apiKey prop changed)
  React.useEffect(() => {
    if (open) {
      setLabel(apiKey.label)
      setRateLimit(rateLimitToValue(apiKey.rateLimitPerMinute))
      setAllowedIps(apiKey.allowedIps)
      setIpInput('')
    }
  }, [open, apiKey])

  const addIp = () => {
    const v = ipInput.trim()
    if (!v) return
    if (allowedIps.includes(v)) {
      setIpInput('')
      return
    }
    if (allowedIps.length >= 20) {
      toast.warning('Max 20 IPs per allowlist')
      return
    }
    setAllowedIps([...allowedIps, v])
    setIpInput('')
  }

  const removeIp = (ip: string) => {
    setAllowedIps(allowedIps.filter((x) => x !== ip))
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {}
      if (label.trim() !== apiKey.label) body.label = label.trim()
      const newRpm = valueToRateLimit(rateLimit)
      if (newRpm !== apiKey.rateLimitPerMinute) body.rateLimitPerMinute = newRpm
      // Compare arrays
      const sameIps =
        allowedIps.length === apiKey.allowedIps.length &&
        allowedIps.every((ip, i) => ip === apiKey.allowedIps[i])
      if (!sameIps) body.allowedIps = allowedIps

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
            Update the label, rate limit, or IP allowlist for{' '}
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
            />
          </div>

          {/* Rate limit */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs">
              <Gauge className="size-3.5" /> Rate limit
            </Label>
            <Select value={rateLimit} onValueChange={setRateLimit}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATE_LIMIT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* IP allowlist */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs">
              <Globe className="size-3.5" /> IP allowlist
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="127.0.0.1 or 10.0.0.0/8"
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addIp()
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={addIp}
                className="shrink-0"
              >
                Add
              </Button>
            </div>
            {allowedIps.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {allowedIps.map((ip) => (
                  <span
                    key={ip}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-300"
                  >
                    <Globe className="size-3" />
                    {ip}
                    <button
                      type="button"
                      onClick={() => removeIp(ip)}
                      className="ml-0.5 hover:text-rose-500 transition-colors"
                      aria-label={`Remove ${ip}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Empty = allow all IPs.
              </p>
            )}
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
              <Shield className="size-4" />
            )}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
