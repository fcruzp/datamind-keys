'use client'

import * as React from 'react'
import { LogOut, ShieldCheck, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import type { PortalUser } from './types'

/**
 * Authenticated-user menu (shown when `isSupabase === true`).
 *
 * Displays the user's avatar (or initials fallback), and a dropdown with:
 *   - Identity summary (email, tenant, role)
 *   - "Supabase" badge to make it obvious the session is real, not demo
 *   - Sign out button — clears Supabase cookies + the demo cookie, refreshes
 *
 * This replaces the <TenantSwitcher/> when a Supabase session is active,
 * because tenants are tied to Supabase accounts in production — you switch
 * tenants by signing in with a different account, not by toggling a cookie.
 *
 * If `user` is null (unauthenticated), falls back to a compact Sign In button.
 */
export function AuthMenu({ user }: { user: PortalUser | null }) {
  const router = useRouter()
  const [signingOut, setSigningOut] = React.useState(false)

  const initials = React.useMemo(() => {
    if (!user) return '?'
    const src = user.name ?? user.email ?? '?'
    return src
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]!.toUpperCase())
      .join('')
  }, [user])

  if (!user) {
    return (
      <SignInCTA
        onClick={() => {
          if (typeof window !== 'undefined') {
            document
              .getElementById('signin')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }}
      />
    )
  }

  async function handleSignOut() {
    setSigningOut(true)
    try {
      const res = await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Sign out failed')
      }
      toast.success('Signed out')
      // Hard refresh so server components re-evaluate the session.
      router.refresh()
      // Also invalidate any cached queries.
      window.location.assign('/')
    } catch (e) {
      const err = e as Error
      toast.error(err.message)
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 px-1.5 gap-2 rounded-full"
          aria-label="Account menu"
        >
          <Avatar className="size-7 rounded-full ring-1 ring-border/60">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.email} /> : null}
            <AvatarFallback
              className={`rounded-full bg-gradient-to-br ${user.avatarColor} text-white text-[10px] font-semibold`}
            >
              {initials || '?'}
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline text-xs font-medium max-w-[120px] truncate">
            {user.name ?? user.email}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Avatar className="size-8 rounded-full">
              {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.email} /> : null}
              <AvatarFallback
                className={`rounded-full bg-gradient-to-br ${user.avatarColor} text-white text-xs font-semibold`}
              >
                {initials || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{user.name ?? user.email}</div>
              <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 pt-1">
            <Badge
              variant="outline"
              className="text-[9px] font-mono px-1 py-0 gap-0.5 text-emerald-600 border-emerald-500/40 bg-emerald-500/5"
            >
              <ShieldCheck className="size-2.5" />
              Supabase
            </Badge>
            <Badge variant="outline" className="text-[9px] font-mono px-1 py-0">
              {user.role}
            </Badge>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-[11px] text-muted-foreground flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full bg-gradient-to-br ${user.avatarColor}`} />
          Tenant: <strong className="text-foreground font-medium">{user.tenantName}</strong>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            handleSignOut()
          }}
          disabled={signingOut}
          className="text-rose-600 focus:text-rose-600 focus:bg-rose-500/10 cursor-pointer"
        >
          <LogOut className="size-3.5" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Compact sign-in CTA (shown when no Supabase session is active).
 *
 * The actual sign-in form lives in the <SignInCard/> component, which is
 * rendered in the dashboard view when the user is on the demo session.
 * This button just nudges them to scroll there.
 */
export function SignInCTA({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="h-8 gap-1.5 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
    >
      <Zap className="size-3.5" />
      Sign in
    </Button>
  )
}
