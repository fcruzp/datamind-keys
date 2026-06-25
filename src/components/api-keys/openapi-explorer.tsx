'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Clipboard,
  Download,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Terminal,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CopyButton } from '@/components/ui/copy-button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types — minimal subset of OpenAPI 3.1 that we render.
// ---------------------------------------------------------------------------

interface OpenApiSpec {
  info: { title: string; version: string; description?: string }
  servers: Array<{ url: string; description?: string }>
  paths: Record<
    string,
    Record<
      string,
      {
        summary?: string
        description?: string
        operationId?: string
        tags?: string[]
        requestBody?: {
          required?: boolean
          content?: Record<string, { schema?: { $ref?: string; example?: unknown } }>
        }
        responses?: Record<
          string,
          { description?: string; headers?: Record<string, unknown> }
        >
      }
    >
  >
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OpenApiExplorer() {
  const [open, setOpen] = React.useState(false)
  const [activePath, setActivePath] = React.useState<string | null>(null)
  const [activeMethod, setActiveMethod] = React.useState<string | null>(null)

  const specQuery = useQuery({
    queryKey: ['openapi-spec'],
    queryFn: async () => {
      const res = await fetch('/api/openapi.json')
      if (!res.ok) throw new Error('Failed to load OpenAPI spec')
      return (await res.json()) as OpenApiSpec
    },
    enabled: open,
  })

  const spec = specQuery.data
  const paths = spec ? Object.entries(spec.paths) : []

  // Pick the first path automatically when the panel opens
  React.useEffect(() => {
    if (open && spec && !activePath) {
      const firstPath = Object.keys(spec.paths)[0]
      if (firstPath) {
        const firstMethod = Object.keys(spec.paths[firstPath]!)[0]
        setActivePath(firstPath)
        setActiveMethod(firstMethod ?? null)
      }
    }
  }, [open, spec, activePath])

  const downloadJson = () => {
    if (!spec) return
    const blob = new Blob([JSON.stringify(spec, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'datamind-bi-openapi.json'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('OpenAPI spec downloaded')
  }

  const copyJson = async () => {
    if (!spec) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(spec, null, 2))
      toast.success('OpenAPI spec copied to clipboard')
    } catch {
      toast.error('Copy failed')
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden border-border/60">
        <CollapsibleTrigger asChild>
          <CardHeader className="flex flex-row items-center justify-between gap-4 py-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2.5">
              <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-500/15 to-sky-500/10 text-emerald-600 dark:text-emerald-400">
                <Terminal className="size-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">OpenAPI 3.1 spec</h2>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    /api/openapi.json
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Importable by OpenFN, N8N, Postman, Swagger. Try each endpoint live.
                </p>
              </div>
            </div>
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground transition-transform',
                open && 'rotate-180',
              )}
            />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-0 border-t">
            {specQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading spec…
              </div>
            ) : specQuery.isError ? (
              <div className="flex items-center justify-center py-12 text-sm text-rose-600 dark:text-rose-400">
                Failed to load OpenAPI spec.
              </div>
            ) : spec ? (
              <div className="grid lg:grid-cols-[280px_1fr] divide-y lg:divide-y-0 lg:divide-x divide-border/60">
                {/* Sidebar: paths list */}
                <div className="lg:max-h-[480px] overflow-y-auto p-3 space-y-1">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                      Endpoints
                    </span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-6 p-0"
                        onClick={copyJson}
                        title="Copy spec as JSON"
                      >
                        <Clipboard className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-6 p-0"
                        onClick={downloadJson}
                        title="Download spec as JSON"
                      >
                        <Download className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {paths.map(([path, methods]) =>
                    Object.entries(methods).map(([method, op]) => {
                      const isActive = activePath === path && activeMethod === method
                      return (
                        <button
                          key={`${method}-${path}`}
                          onClick={() => {
                            setActivePath(path)
                            setActiveMethod(method)
                          }}
                          className={cn(
                            'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                            isActive
                              ? 'bg-muted/80 ring-1 ring-border'
                              : 'hover:bg-muted/40',
                          )}
                        >
                          <MethodTag method={method} />
                          <span className="font-mono text-[11px] truncate flex-1">
                            {path}
                          </span>
                          {isActive && (
                            <ChevronRight className="size-3 text-muted-foreground" />
                          )}
                        </button>
                      )
                    }),
                  )}
                </div>

                {/* Main panel: operation details + try-it */}
                <div className="lg:max-h-[480px] overflow-y-auto">
                  {activePath && activeMethod ? (
                    <OperationDetail
                      spec={spec}
                      path={activePath}
                      method={activeMethod}
                      operation={spec.paths[activePath]![activeMethod]!}
                    />
                  ) : (
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                      Select an endpoint on the left
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

// ---------------------------------------------------------------------------
// Operation detail with try-it
// ---------------------------------------------------------------------------

function OperationDetail({
  spec,
  path,
  method,
  operation,
}: {
  spec: OpenApiSpec
  path: string
  method: string
  operation: OpenApiSpec['paths'][string][string]
}) {
  const [bearerKey, setBearerKey] = React.useState('')
  const [requestBody, setRequestBody] = React.useState(
    operation.requestBody?.content?.['application/json']?.schema?.example
      ? JSON.stringify(
          operation.requestBody.content['application/json'].schema.example,
          null,
          2,
        )
      : method === 'post'
        ? '{\n  "sql": "SELECT 1"\n}'
        : '',
  )
  const [response, setResponse] = React.useState<{
    status: number
    body: string
    durationMs: number
    headers: Record<string, string>
  } | null>(null)
  const [sending, setSending] = React.useState(false)

  const runRequest = async () => {
    if (!bearerKey.trim()) {
      toast.error('Enter a bearer key (dm_live_…) to test')
      return
    }
    setSending(true)
    setResponse(null)
    const started = performance.now()
    try {
      const init: RequestInit = {
        method: method.toUpperCase(),
        headers: {
          Authorization: `Bearer ${bearerKey.trim()}`,
          ...(method === 'post'
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
      }
      if (method === 'post' && requestBody) {
        init.body = requestBody
      }
      const res = await fetch(path, init)
      const text = await res.text()
      const durationMs = Math.round(performance.now() - started)
      const headers: Record<string, string> = {}
      res.headers.forEach((value, key) => {
        headers[key] = value
      })
      let body = text
      try {
        body = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        // not JSON — keep raw text
      }
      setResponse({ status: res.status, body, durationMs, headers })
    } catch (err) {
      setResponse({
        status: 0,
        body: String(err),
        durationMs: Math.round(performance.now() - started),
        headers: {},
      })
    } finally {
      setSending(false)
    }
  }

  const serverUrl = spec.servers[0]?.url ?? ''
  const responses = operation.responses ?? {}

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <MethodTag method={method} />
          <code className="font-mono text-sm font-medium">{path}</code>
          {operation.operationId && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {operation.operationId}
            </Badge>
          )}
        </div>
        {operation.summary && (
          <p className="text-sm font-medium">{operation.summary}</p>
        )}
        {operation.description && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {operation.description}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground font-mono">
          Full URL: {serverUrl}{path}
        </p>
      </div>

      {/* Try-it form */}
      <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Try it live
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            onClick={() => setBearerKey('')}
          >
            <RefreshCw className="size-3 mr-1" /> Clear
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bearer-key" className="text-[11px] text-muted-foreground">
            Bearer token <span className="text-rose-500">*</span>
          </Label>
          <Input
            id="bearer-key"
            type="password"
            placeholder="dm_live_…"
            value={bearerKey}
            onChange={(e) => setBearerKey(e.target.value)}
            className="font-mono text-xs h-8"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {method === 'post' && (
          <div className="space-y-1.5">
            <Label htmlFor="req-body" className="text-[11px] text-muted-foreground">
              Request body (JSON)
            </Label>
            <textarea
              id="req-body"
              value={requestBody}
              onChange={(e) => setRequestBody(e.target.value)}
              className="w-full h-24 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              spellCheck={false}
            />
          </div>
        )}
        <Button
          size="sm"
          onClick={runRequest}
          disabled={sending || !bearerKey.trim()}
          className="w-full gap-1.5"
        >
          {sending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          Send {method.toUpperCase()} request
        </Button>
      </div>

      {/* Response */}
      {response && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Response
            </span>
            <div className="flex items-center gap-2">
              <StatusTag status={response.status} />
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {response.durationMs}ms
              </span>
            </div>
          </div>
          {/* Response headers (rate-limit etc.) */}
          {Object.keys(response.headers).length > 0 && (
            <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-[10px] font-mono space-y-0.5 max-h-24 overflow-y-auto">
              {Object.entries(response.headers)
                .filter(([k]) =>
                  ['x-ratelimit-limit', 'x-ratelimit-remaining', 'retry-after', 'content-type'].includes(k.toLowerCase()),
                )
                .map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-muted-foreground">{k}:</span>
                    <span className="text-foreground/80">{v}</span>
                  </div>
                ))}
            </div>
          )}
          <div className="relative">
            <pre className="rounded-md border border-border/60 bg-zinc-950 p-3 pr-10 text-[11px] font-mono text-zinc-200 overflow-x-auto max-h-72">
              <code>{response.body || '(empty body)'}</code>
            </pre>
            {response.body && (
              <div className="absolute top-2 right-2">
                <CopyButton
                  value={response.body}
                  label="Copy response"
                  iconSize="size-3"
                  className="bg-zinc-800/80 backdrop-blur-sm border border-zinc-700/50 text-zinc-300 hover:text-white hover:bg-zinc-700"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Response codes reference */}
      <div className="space-y-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          Possible responses
        </span>
        <div className="space-y-1">
          {Object.entries(responses).map(([code, r]) => (
            <div key={code} className="flex items-start gap-2 text-xs">
              <StatusTag status={Number(code)} />
              <span className="text-muted-foreground leading-relaxed">
                {r.description}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[11px] gap-1"
          onClick={() => {
            window.open('https://docs.datamind.mooo.com', '_blank')
          }}
        >
          <ExternalLink className="size-3" /> Full docs
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

function MethodTag({ method }: { method: string }) {
  const tones: Record<string, string> = {
    get: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    post: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
    put: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
    patch:
      'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30',
    delete:
      'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
  }
  return (
    <span
      className={cn(
        'inline-block rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase',
        tones[method.toLowerCase()] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {method.toUpperCase()}
    </span>
  )
}

function StatusTag({ status }: { status: number }) {
  let tone = 'bg-muted text-muted-foreground border-border/60'
  if (status >= 200 && status < 300)
    tone = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
  else if (status >= 300 && status < 400)
    tone = 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30'
  else if (status >= 400 && status < 500)
    tone = 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
  else if (status >= 500)
    tone = 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
  return (
    <span
      className={cn(
        'inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums',
        tone,
      )}
    >
      {status === 0 ? 'ERR' : status}
    </span>
  )
}
