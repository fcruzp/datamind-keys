'use client'

import * as React from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  KeyRound,
  Plus,
  Moon,
  Sun,
  Monitor,
  FlaskConical,
  Archive,
  Globe,
  Github,
  BookOpen,
  Webhook,
} from 'lucide-react'
import { useTheme } from 'next-themes'

export interface CommandAction {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  onSelect: () => void
  keywords?: string
  group: 'actions' | 'navigate' | 'theme'
}

export function CommandPalette({
  open,
  onOpenChange,
  onCreateKey,
  onOpenRevoked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateKey: () => void
  onOpenRevoked: () => void
}) {
  const { setTheme } = useTheme()

  const actions: CommandAction[] = React.useMemo(
    () => [
      {
        id: 'create-key',
        label: 'Generate new API key',
        description: 'Create a scoped bearer token',
        icon: <Plus className="size-4" />,
        onSelect: () => {
          onOpenChange(false)
          onCreateKey()
        },
        keywords: 'create new generate api key token',
        group: 'actions',
      },
      {
        id: 'test-key',
        label: 'Test an API key',
        description: 'Verify a key against /api/public/v1/me',
        icon: <FlaskConical className="size-4" />,
        onSelect: () => {
          onOpenChange(false)
          // Scroll to keys table; test popover is per-row
          document
            .getElementById('keys-section')
            ?.scrollIntoView({ behavior: 'smooth' })
        },
        keywords: 'test verify validate check',
        group: 'actions',
      },
      {
        id: 'view-revoked',
        label: 'View revoked keys',
        description: 'Audit historical revoked keys',
        icon: <Archive className="size-4" />,
        onSelect: () => {
          onOpenChange(false)
          onOpenRevoked()
        },
        keywords: 'revoked audit history archive',
        group: 'actions',
      },
      {
        id: 'theme-light',
        label: 'Light theme',
        icon: <Sun className="size-4" />,
        onSelect: () => {
          setTheme('light')
          onOpenChange(false)
        },
        keywords: 'theme light mode',
        group: 'theme',
      },
      {
        id: 'theme-dark',
        label: 'Dark theme',
        icon: <Moon className="size-4" />,
        onSelect: () => {
          setTheme('dark')
          onOpenChange(false)
        },
        keywords: 'theme dark mode',
        group: 'theme',
      },
      {
        id: 'theme-system',
        label: 'System theme',
        icon: <Monitor className="size-4" />,
        onSelect: () => {
          setTheme('system')
          onOpenChange(false)
        },
        keywords: 'theme system auto',
        group: 'theme',
      },
      {
        id: 'openfn',
        label: 'OpenFN — official site',
        icon: <Webhook className="size-4" />,
        onSelect: () => {
          window.open('https://openfn.org', '_blank')
          onOpenChange(false)
        },
        keywords: 'openfn n8n integration workflow',
        group: 'navigate',
      },
      {
        id: 'docs',
        label: 'DataMind BI docs',
        icon: <BookOpen className="size-4" />,
        onSelect: () => {
          window.open('https://docs.datamind.mooo.com', '_blank')
          onOpenChange(false)
        },
        keywords: 'docs documentation help',
        group: 'navigate',
      },
      {
        id: 'github',
        label: 'GitHub repository',
        icon: <Github className="size-4" />,
        onSelect: () => {
          window.open('https://github.com/fcruzp/BIweb', '_blank')
          onOpenChange(false)
        },
        keywords: 'github repo source code',
        group: 'navigate',
      },
    ],
    [onOpenChange, onCreateKey, onOpenRevoked, setTheme],
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          {actions
            .filter((a) => a.group === 'actions')
            .map((a) => (
              <CommandItem
                key={a.id}
                value={`${a.label} ${a.keywords ?? ''}`}
                onSelect={() => a.onSelect()}
                className="gap-2"
              >
                {a.icon}
                <div className="flex flex-col">
                  <span>{a.label}</span>
                  {a.description && (
                    <span className="text-xs text-muted-foreground">
                      {a.description}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Theme">
          {actions
            .filter((a) => a.group === 'theme')
            .map((a) => (
              <CommandItem
                key={a.id}
                value={`${a.label} ${a.keywords ?? ''}`}
                onSelect={() => a.onSelect()}
                className="gap-2"
              >
                {a.icon}
                <span>{a.label}</span>
              </CommandItem>
            ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Links">
          {actions
            .filter((a) => a.group === 'navigate')
            .map((a) => (
              <CommandItem
                key={a.id}
                value={`${a.label} ${a.keywords ?? ''}`}
                onSelect={() => a.onSelect()}
                className="gap-2"
              >
                {a.icon}
                <span>{a.label}</span>
              </CommandItem>
            ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

/**
 * Hook that wires up the Cmd/Ctrl+K shortcut and exposes the dialog state.
 */
export function useCommandPalette(onCreateKey: () => void, onOpenRevoked: () => void) {
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const palette = (
    <CommandPalette
      open={open}
      onOpenChange={setOpen}
      onCreateKey={onCreateKey}
      onOpenRevoked={onOpenRevoked}
    />
  )

  return { open, setOpen, palette }
}
