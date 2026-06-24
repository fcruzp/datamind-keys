import { ApiKeysManager } from '@/components/api-keys/api-keys-manager'
import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
import {
  BookOpen,
  Github,
  KeyRound,
  Lock,
  Terminal,
  Webhook,
} from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
              <KeyRound className="size-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight">DataMind BI</span>
              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                API Keys
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <a
              href="https://openfn.org"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Webhook className="size-3.5" /> OpenFN
            </a>
            <a
              href="https://docs.datamind.mooo.com"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <BookOpen className="size-3.5" /> Docs
            </a>
            <a
              href="https://github.com/fcruzp/BIweb"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Github className="size-3.5" /> GitHub
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 sm:py-10">
        {/* Hero */}
        <section className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Sandbox demo · live
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                API Keys
              </h1>
              <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
                Generate scoped bearer tokens so external tools —{' '}
                <strong className="text-foreground">OpenFN</strong>,{' '}
                <strong className="text-foreground">N8N</strong>, custom
                scripts — can securely access DataMind BI via REST.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <kbd className="inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  <span className="text-[9px]">⌘</span>K
                </kbd>
                <span className="text-xs text-muted-foreground">
                  to open the command palette
                </span>
              </div>
            </div>

            {/* Quick curl example */}
            <div className="w-full sm:max-w-md shrink-0">
              <div className="rounded-lg border border-border/60 bg-zinc-950 overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
                  <div className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-rose-500/70" />
                    <span className="size-2.5 rounded-full bg-amber-500/70" />
                    <span className="size-2.5 rounded-full bg-emerald-500/70" />
                    <span className="ml-2 text-[11px] text-zinc-400 font-mono">
                      quickstart.sh
                    </span>
                  </div>
                  <Terminal className="size-3.5 text-zinc-500" />
                </div>
                <pre className="p-3 text-[11px] font-mono text-zinc-200 leading-relaxed overflow-x-auto">
                  <code>{`# 1. Create a key (browser, one-time reveal)
#    Settings → API Keys → Generate

# 2. Call any /api/public/v1/* endpoint
curl https://datamind.mooo.com/api/public/v1/me \\
  -H "Authorization: Bearer dm_live_••••"`}</code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* Manager */}
        <ApiKeysManager />

        {/* Endpoints reference */}
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Public API endpoints
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <EndpointCard
              method="GET"
              path="/api/public/v1/me"
              scope="read"
              description="Validate a key and return the owning user + account summary."
            />
            <EndpointCard
              method="GET"
              path="/api/public/v1/datasources"
              scope="read"
              description="List datasources connected to the account with status + last sync."
            />
            <EndpointCard
              method="GET"
              path="/api/public/v1/dashboards"
              scope="read"
              description="List dashboards owned by the account with widget counts + URLs."
            />
            <EndpointCard
              method="POST"
              path="/api/public/v1/queries"
              scope="execute"
              description="Run a sandboxed SQL SELECT against a datasource. Returns rows."
            />
            <EndpointCard
              method="GET"
              path="/api/public/v1/usage"
              scope="read"
              description="Aggregated usage stats — request counts, latency, recent logs."
              soon
            />
          </div>
        </section>
      </main>

      {/* Footer (sticky bottom) */}
      <footer className="mt-auto border-t border-border/60 bg-muted/20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Lock className="size-3.5" />
            <span>
              SHA-256 hashed at rest · scope-aware · request-logged
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>
              Built with Next.js 16 · Prisma ·{' '}
              <span className="font-mono">SQLite</span> (sandbox)
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function EndpointCard({
  method,
  path,
  scope,
  description,
  soon,
}: {
  method: string
  path: string
  scope: 'read' | 'execute' | 'admin'
  description: string
  soon?: boolean
}) {
  const methodTones: Record<string, string> = {
    GET: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    POST: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
  }
  const scopeTones: Record<string, string> = {
    read: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    execute: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    admin: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  }
  return (
    <div className="group rounded-lg border border-border/60 bg-card p-3.5 hover:border-border transition-colors">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${methodTones[method]}`}
        >
          {method}
        </span>
        <code className="font-mono text-xs text-foreground">{path}</code>
        {soon && (
          <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            soon
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mb-2">
        {description}
      </p>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>requires</span>
        <span
          className={`font-mono px-1.5 py-0.5 rounded ${scopeTones[scope]}`}
        >
          {scope}
        </span>
      </div>
    </div>
  )
}
