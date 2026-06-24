'use client'

import * as React from 'react'
import { Loader2, FlaskConical, CheckCircle2, XCircle, KeyRound } from 'lucide-react'
import { toast } from 'sonner'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScopeBadgeList } from './scope-badge'
import { cn } from '@/lib/utils'

interface TestResult {
  ok: boolean
  status: number
  user?: { email: string; name: string | null }
  apiKey?: { label: string; scopes: string[]; prefix: string }
  error?: string
  durationMs?: number
}

export function TestKeyPopover({
  expectedPrefix,
  children,
}: {
  expectedPrefix?: string
  children?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const [plaintext, setPlaintext] = React.useState('')
  const [result, setResult] = React.useState<TestResult | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setPlaintext('')
      setResult(null)
    }
  }, [open])

  const runTest = async () => {
    if (!plaintext.trim()) {
      toast.warning('Paste a key to test')
      return
    }
    setLoading(true)
    setResult(null)
    const started = Date.now()
    try {
      const res = await fetch('/api/public/v1/me', {
        headers: { Authorization: `Bearer ${plaintext.trim()}` },
      })
      const json = await res.json()
      const durationMs = Date.now() - started
      if (res.ok) {
        setResult({
          ok: true,
          status: res.status,
          durationMs,
          user: json.user,
          apiKey: json.apiKey,
        })
        toast.success('Key is valid')
      } else {
        setResult({
          ok: false,
          status: res.status,
          durationMs,
          error: json.error ?? `HTTP ${res.status}`,
        })
      }
    } catch (err) {
      setResult({
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : 'Network error',
      })
    } finally {
      setLoading(false)
    }
  }

  const prefixMatches =
    !expectedPrefix || plaintext.startsWith(expectedPrefix.replace(/•+$/, ''))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-muted-foreground hover:text-foreground"
            aria-label="Test key"
          >
            <FlaskConical className="size-3.5" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <FlaskConical className="size-3.5 text-emerald-500" />
              Test API key
            </h4>
            <p className="text-xs text-muted-foreground">
              Paste the key plaintext to verify it works against{' '}
              <code className="text-foreground">/api/public/v1/me</code>.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="test-key" className="text-xs">
              API key
            </Label>
            <Input
              id="test-key"
              type="password"
              placeholder="dm_live_••••••••••••••••••••••••••••"
              value={plaintext}
              onChange={(e) => setPlaintext(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  runTest()
                }
              }}
              className={cn(
                'font-mono text-xs',
                plaintext && !prefixMatches && 'border-amber-500/50',
              )}
            />
            {plaintext && !prefixMatches && expectedPrefix && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                Prefix doesn’t match this key ({expectedPrefix}).
              </p>
            )}
          </div>

          <Button
            size="sm"
            className="w-full gap-2"
            onClick={runTest}
            disabled={loading || !plaintext.trim()}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FlaskConical className="size-3.5" />
            )}
            Run test
          </Button>

          {result && (
            <div
              className={cn(
                'rounded-lg border p-3 space-y-2 text-xs',
                result.ok
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-rose-500/30 bg-rose-500/5',
              )}
            >
              <div className="flex items-center gap-2 font-medium">
                {result.ok ? (
                  <>
                    <CheckCircle2 className="size-4 text-emerald-500" />
                    <span className="text-emerald-700 dark:text-emerald-300">
                      Valid key
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="size-4 text-rose-500" />
                    <span className="text-rose-700 dark:text-rose-300">
                      {result.error}
                    </span>
                  </>
                )}
                {result.durationMs !== undefined && (
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {result.durationMs}ms
                  </span>
                )}
              </div>
              {result.ok && result.user && (
                <div className="space-y-1 border-t border-emerald-500/20 pt-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">User</span>
                    <span className="font-mono">{result.user.email}</span>
                  </div>
                  {result.apiKey && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Label</span>
                        <span>{result.apiKey.label}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Scopes</span>
                        <ScopeBadgeList
                          scopes={result.apiKey.scopes as never}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
              {!result.ok && (
                <p className="text-[11px] text-muted-foreground">
                  HTTP {result.status}. Check the key is not revoked or expired,
                  and that your IP is in the allowlist if one is set.
                </p>
              )}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground flex items-start gap-1">
            <KeyRound className="size-3 mt-0.5 shrink-0" />
            Plaintext is sent only to your own DataMind BI instance — never
            logged or persisted.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
