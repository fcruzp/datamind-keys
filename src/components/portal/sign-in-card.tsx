'use client'

import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { Mail, Lock, Loader2, ArrowRight, Sparkles, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

/**
 * Sign-in card — supports both magic-link (email OTP) and email/password.
 *
 * On success:
 *   - Magic link: toast "check your email", the user clicks the link in
 *     the email which hits /api/auth/callback and establishes a session.
 *   - Password: server sets the auth cookies directly, we hard-refresh
 *     the page so the server components re-evaluate the session.
 *
 * The card is rendered inside the dashboard view when the user is on the
 * demo session, so they can upgrade to a real account at any time without
 * leaving the page.
 */
export function SignInCard() {
  const router = useRouter()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [mode, setMode] = React.useState<'magic' | 'password'>('magic')

  const signinMutation = useMutation({
    mutationFn: async (vars: { email: string; password?: string }) => {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(vars),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        mode?: string
        message?: string
      }
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      return data
    },
    onSuccess: (data) => {
      if (data.mode === 'magic-link') {
        toast.success('Magic link sent', {
          description: data.message ?? `Check ${email} for the sign-in link.`,
        })
      } else if (data.mode === 'password') {
        toast.success('Signed in')
        // Hard refresh so server components see the new session cookie.
        router.refresh()
        window.location.assign('/')
      }
    },
    onError: (err: Error) => {
      toast.error('Sign in failed', { description: err.message })
    },
  })

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    signinMutation.mutate({
      email,
      password: mode === 'password' ? password : undefined,
    })
  }

  return (
    <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.03] to-transparent">
      <CardHeader className="gap-1.5">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
            <ShieldCheck className="size-4" />
          </div>
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Sign in with Supabase
              <Badge
                variant="outline"
                className="text-[9px] font-mono px-1 py-0 text-emerald-600 border-emerald-500/40 bg-emerald-500/5"
              >
                REAL
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Upgrade from the demo session to a real Supabase Auth account.
              Your API keys stay where they are; the session is just stronger.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'magic' | 'password')}>
          <TabsList className="grid grid-cols-2 w-full mb-3">
            <TabsTrigger value="magic" className="text-xs gap-1.5">
              <Sparkles className="size-3" />
              Magic link
            </TabsTrigger>
            <TabsTrigger value="password" className="text-xs gap-1.5">
              <Lock className="size-3" />
              Password
            </TabsTrigger>
          </TabsList>

          <TabsContent value="magic">
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="signin-email" className="text-xs">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="you@company.com"
                    className="pl-8 h-9 text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full h-9 gap-1.5 bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                disabled={signinMutation.isPending || !email}
              >
                {signinMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <>
                    Send magic link
                    <ArrowRight className="size-3.5" />
                  </>
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                We&apos;ll email you a one-click sign-in link. No password needed.
              </p>
            </form>
          </TabsContent>

          <TabsContent value="password">
            <form onSubmit={onSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="signin-email-p" className="text-xs">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    id="signin-email-p"
                    type="email"
                    placeholder="you@company.com"
                    className="pl-8 h-9 text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signin-password" className="text-xs">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder="••••••••"
                    className="pl-8 h-9 text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="current-password"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full h-9 gap-1.5 bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
                disabled={signinMutation.isPending || !email || !password}
              >
                {signinMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="size-3.5" />
                  </>
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                New to DataMind? Use the magic-link tab — your account is
                created automatically on first sign-in.
              </p>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="pt-0 text-[10px] text-muted-foreground justify-center">
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="size-3" />
          Secured by Supabase Auth · cookies + JWT · RLS-protected
        </span>
      </CardFooter>
    </Card>
  )
}
