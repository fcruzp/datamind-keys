'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Github, KeyRound, Menu, X, BookOpen, Webhook, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/theme-toggle'
import { TenantSwitcher } from './tenant-switcher'
import { AuthMenu, SignInCTA } from './auth-menu'
import { Sidebar } from './sidebar'
import { DashboardView } from './dashboard-view'
import { DeploymentView } from './deployment-view'
import { ApiKeysManager } from '@/components/api-keys/api-keys-manager'
import { ComingSoon } from './coming-soon'
import type { AuthMeResponse, PortalView } from './types'

/**
 * The portal shell: header (with tenant switcher + theme toggle + GitHub),
 * sidebar (Dashboard / API Keys / Datasources / Activity / Docs), and the
 * main content area that swaps based on the active view.
 *
 * All view switching is client-side state because the sandbox only exposes
 * a single `/` route (per the project constraints). In production with a
 * real router these would be /portal, /portal/api-keys, etc.
 */
export function PortalShell({ initial }: { initial: AuthMeResponse }) {
  const [view, setView] = React.useState<PortalView>('dashboard')
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)
  const qc = useQueryClient()

  // Keep the auth/me data fresh — re-fetch on window focus so switching
  // tenant in another tab reflects here too.
  const authQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me')
      if (!res.ok) throw new Error('Failed to load session')
      return (await res.json()) as AuthMeResponse
    },
    initialData: initial,
    staleTime: 30_000,
  })

  // Whenever the user switches tenant, the auth/me query invalidates (the
  // switch mutation calls qc.invalidateQueries()). When that resolves,
  // reset to the dashboard so the user lands on the new tenant's overview.
  const currentTenantId = authQuery.data?.current.id
  React.useEffect(() => {
    setView('dashboard')
  }, [currentTenantId])

  const current = authQuery.data?.current ?? initial.current
  const switchable = authQuery.data?.switchable ?? initial.switchable
  const stats = authQuery.data?.stats ?? initial.stats

  const handleViewChange = (v: PortalView) => {
    setView(v)
    setMobileNavOpen(false)
    // Scroll to top on view change
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6 gap-3">
          {/* Left: logo + mobile nav trigger */}
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Mobile sidebar trigger */}
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden size-8"
                  aria-label="Open navigation"
                >
                  <Menu className="size-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="px-4 py-3 border-b">
                  <SheetTitle className="flex items-center gap-2 text-sm">
                    <div className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
                      <KeyRound className="size-3.5" />
                    </div>
                    DataMind BI
                  </SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto h-[calc(100vh-3.5rem)]">
                  <Sidebar
                    view={view}
                    onViewChange={handleViewChange}
                    stats={{ activeKeys: stats.activeKeys, requests7d: stats.requests7d }}
                  />
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-2.5 min-w-0">
              <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shrink-0">
                <KeyRound className="size-4" />
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-sm tracking-tight truncate">
                  DataMind BI
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono px-1.5 py-0 hidden sm:inline-flex"
                >
                  Portal
                </Badge>
              </div>
            </div>
          </div>

          {/* Right: links + tenant switcher + theme */}
          <div className="flex items-center gap-1.5">
            <a
              href="https://openfn.org"
              target="_blank"
              rel="noreferrer"
              className="hidden md:inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="OpenFN"
            >
              <Webhook className="size-3.5" /> OpenFN
            </a>
            <a
              href="https://docs.datamind.mooo.com"
              target="_blank"
              rel="noreferrer"
              className="hidden md:inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Docs"
            >
              <BookOpen className="size-3.5" /> Docs
            </a>
            <a
              href="https://github.com/fcruzp/BIweb"
              target="_blank"
              rel="noreferrer"
              className="hidden md:inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="GitHub"
            >
              <Github className="size-3.5" /> GitHub
            </a>

            <div className="h-5 w-px bg-border/60 hidden md:block mx-1" />

            {/* Auth surface:
                - Supabase session → AuthMenu (avatar + sign out)
                - Demo session w/ switchable tenants → TenantSwitcher
                - Demo session w/ no switcher → SignInCTA */}
            {current.isSupabase ? (
              <AuthMenu user={current} />
            ) : switchable.length > 0 ? (
              <TenantSwitcher current={current} switchable={switchable} />
            ) : (
              <SignInCTA
                onClick={() => {
                  setView('dashboard')
                  if (typeof window !== 'undefined') {
                    window.setTimeout(() => {
                      document
                        .getElementById('signin')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }, 50)
                  }
                }}
              />
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex-1 mx-auto w-full max-w-7xl flex gap-0 lg:gap-6 px-0 lg:px-6 py-0 lg:py-6">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-60 shrink-0">
          <div className="sticky top-20 rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm overflow-hidden">
            <Sidebar
              view={view}
              onViewChange={handleViewChange}
              stats={{ activeKeys: stats.activeKeys, requests7d: stats.requests7d }}
            />
            {/* Sidebar footer: tenant hint */}
            <div className="border-t border-border/40 p-3 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span
                  className={`size-2 rounded-full bg-gradient-to-br ${current.avatarColor}`}
                />
                <span className="truncate">Signed in as {current.email}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-4 lg:px-0 py-6 lg:py-0">
          {view === 'dashboard' && (
            <DashboardView
              current={current}
              stats={stats}
              onNavigateToApiKeys={() => setView('api-keys')}
              onScrollToSignIn={() => {
                if (typeof window !== 'undefined') {
                  document
                    .getElementById('signin')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              }}
            />
          )}
          {view === 'api-keys' && <ApiKeysManager />}
          {view === 'datasources' && (
            <ComingSoon
              title="Datasources"
              description="Per-tenant datasource management — connection strings, schema introspection, sync schedule. The read-only /api/public/v1/datasources endpoint already works; this UI is coming next."
            />
          )}
          {view === 'activity' && (
            <ComingSoon
              title="Activity feed"
              description="Real-time stream of API requests across all keys in this tenant, with filtering by endpoint / status / IP. Currently visible per-key under API Keys."
            />
          )}
          {view === 'docs' && (
            <ComingSoon
              title="API documentation"
              description="Interactive OpenAPI explorer with copy-paste curl examples. Available today as the OpenAPI Explorer panel under API Keys."
            />
          )}
          {view === 'deployment' && <DeploymentView />}
        </main>
      </div>

      {/* Footer (sticky bottom) */}
      <footer className="mt-auto border-t border-border/60 bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span
              className={`inline-grid size-4 place-items-center rounded bg-gradient-to-br ${current.avatarColor} text-white text-[8px] font-bold`}
            >
              {current.name?.[0] ?? current.email[0]!.toUpperCase()}
            </span>
            <span>
              Tenant: <strong className="text-foreground">{current.tenantName}</strong>{' '}
              · {current.email}
            </span>
            {current.isSupabase && (
              <Badge
                variant="outline"
                className="text-[9px] font-mono px-1 py-0 gap-0.5 text-emerald-600 border-emerald-500/40 bg-emerald-500/5"
              >
                <ShieldCheck className="size-2.5" />
                Supabase
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span>
              Built with Next.js 16 · Prisma ·{' '}
              <span className="font-mono">SQLite</span> (sandbox) ·{' '}
              <span className="text-emerald-600 dark:text-emerald-400">Supabase Auth</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
