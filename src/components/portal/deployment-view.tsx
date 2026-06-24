'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Rocket,
  FileText,
  Copy,
  Check,
  Download,
  ExternalLink,
  Server,
  Container,
  Globe,
  Loader2,
  AlertCircle,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast as sonnerToast } from 'sonner'

interface DeployFile {
  name: string
  path: string
  content: string
  size: number
  language: 'yaml' | 'dockerfile' | 'bash' | 'env' | 'markdown' | 'text'
  description: string
}

const LANGUAGE_LABELS: Record<DeployFile['language'], { label: string; color: string }> = {
  yaml: { label: 'YAML', color: 'text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5' },
  dockerfile: { label: 'Docker', color: 'text-sky-600 dark:text-sky-400 border-sky-500/30 bg-sky-500/5' },
  bash: { label: 'Shell', color: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5' },
  env: { label: 'Env', color: 'text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-500/5' },
  markdown: { label: 'MD', color: 'text-violet-600 dark:text-violet-400 border-violet-500/30 bg-violet-500/5' },
  text: { label: 'Text', color: 'text-muted-foreground border-border' },
}

const FILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'docker-compose.yml': Container,
  'coolify.yaml': Rocket,
  'Dockerfile': Container,
  '.dockerignore': FileText,
  '.env.production.example': Server,
  'DEPLOY.md': FileText,
  'Caddyfile': Globe,
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function downloadFile(name: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function DeploymentView() {
  const [activeFile, setActiveFile] = React.useState<string>('docker-compose.yml')
  const [copied, setCopied] = React.useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['deployment-files'],
    queryFn: async () => {
      const res = await fetch('/api/deployment-files')
      if (!res.ok) throw new Error('Failed to load deployment files')
      const json = await res.json()
      return json.files as DeployFile[]
    },
    staleTime: 60_000,
  })

  const current = data?.find((f) => f.name === activeFile) ?? data?.[0]

  const handleCopy = async () => {
    if (!current) return
    try {
      await navigator.clipboard.writeText(current.content)
      setCopied(true)
      sonnerToast.success('Copied to clipboard', {
        description: current.name,
      })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      sonnerToast.error('Failed to copy')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <AlertCircle className="size-8 text-rose-500" />
        <p className="text-sm text-muted-foreground">
          No se pudieron cargar los archivos de despliegue.
        </p>
        <p className="text-xs text-muted-foreground/70 font-mono">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
              <Rocket className="size-4" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Deployment</h1>
            <Badge variant="outline" className="text-[10px] font-mono">
              Coolify
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1.5">
            Archivos listos para desplegar en{' '}
            <code className="text-emerald-600 dark:text-emerald-400 font-mono text-xs bg-emerald-500/5 px-1.5 py-0.5 rounded">
              datamind-api.mooo.com
            </code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://coolify.io/docs/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ExternalLink className="size-3.5" /> Coolify docs
          </a>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={Globe}
          label="Domain"
          value="datamind-api.mooo.com"
          color="from-emerald-500 to-teal-600"
        />
        <StatCard
          icon={Container}
          label="Container port"
          value="3000"
          color="from-sky-500 to-cyan-600"
        />
        <StatCard
          icon={Rocket}
          label="Files"
          value={String(data.length)}
          color="from-amber-500 to-orange-600"
        />
        <StatCard
          icon={Server}
          label="Runtime"
          value="Bun + Next.js"
          color="from-rose-500 to-pink-600"
        />
      </div>

      {/* Main: file list + viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        {/* File list */}
        <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border/60 bg-muted/30">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Files ({data.length})
            </span>
          </div>
          <ScrollArea className="h-[60vh] lg:h-[calc(100vh-22rem)]">
            <div className="p-2 space-y-0.5">
              {data.map((file) => {
                const Icon = FILE_ICONS[file.name] ?? FileText
                const isActive = (current?.name ?? activeFile) === file.name
                const langInfo = LANGUAGE_LABELS[file.language]
                return (
                  <button
                    key={file.name}
                    onClick={() => setActiveFile(file.name)}
                    className={cn(
                      'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors group',
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shadow-[inset_2px_0_0_0_rgb(16_185_129)]'
                        : 'hover:bg-accent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-4 shrink-0',
                        isActive
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-muted-foreground group-hover:text-foreground',
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono truncate">{file.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground/70 block truncate">
                        {formatBytes(file.size)}
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn('text-[9px] font-mono px-1 py-0 h-4', langInfo.color)}
                    >
                      {langInfo.label}
                    </Badge>
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        </div>

        {/* File viewer */}
        <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden flex flex-col min-w-0">
          {current && (
            <>
              {/* Viewer header */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60 bg-muted/30">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-medium truncate">
                      {current.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px] font-mono px-1.5 py-0 h-4 shrink-0',
                        LANGUAGE_LABELS[current.language].color,
                      )}
                    >
                      {LANGUAGE_LABELS[current.language].label}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {current.description}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopy}
                    className="h-7 gap-1.5 text-xs"
                  >
                    {copied ? (
                      <>
                        <Check className="size-3 text-emerald-500" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadFile(current.name, current.content)}
                    className="h-7 gap-1.5 text-xs"
                  >
                    <Download className="size-3" />
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                </div>
              </div>

              {/* Code content */}
              <ScrollArea className="flex-1 max-h-[60vh] lg:max-h-[calc(100vh-22rem)]">
                <pre className="text-xs leading-relaxed font-mono p-4 overflow-x-auto whitespace-pre">
                  <code>{current.content}</code>
                </pre>
              </ScrollArea>

              {/* Footer with line count */}
              <div className="px-4 py-2 border-t border-border/60 bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {current.content.split('\n').length} lines · {formatBytes(current.size)}
                </span>
                <span className="font-mono truncate max-w-[60%]">{current.path}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Helper note */}
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300">
        <strong className="font-medium">Cómo desplegar:</strong> copia el contenido de{' '}
        <code className="font-mono">docker-compose.yml</code> en Coolify → New Resource → Docker Compose Empty,
        configura las variables de entorno (ver <code className="font-mono">.env.production.example</code>) y
        deploy. Guía completa en <code className="font-mono">DEPLOY.md</code>.
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  color: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm p-3">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'grid size-7 place-items-center rounded-lg bg-gradient-to-br text-white shadow-sm',
            color,
          )}
        >
          <Icon className="size-3.5" />
        </div>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-sm font-mono font-medium mt-2 truncate">{value}</p>
    </div>
  )
}
