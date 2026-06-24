'use client'

import * as React from 'react'

/**
 * Hook that enables ↑/↓ keyboard navigation through table rows.
 * - ArrowDown / ArrowUp move the focus between rows
 * - Home / End jump to first / last row
 * - Enter activates the active row (calls `onActivate`)
 * - The focused row gets a visible ring; the active element's data-row-id
 *   is exposed via `activeRowId` so the parent can react (e.g. scroll into view)
 *
 * Usage:
 *   const { activeRowId, rowProps } = useRowKeyboardNav(rowIds, { onActivate: (id) => openEdit(id) })
 *   <TableRow {...rowProps(row.id)}>...</TableRow>
 *
 * The hook attaches a keydown listener to the container returned by
 * `containerProps`. Pressing ↑/↓ when focus is inside the container moves
 * the active row.
 */
export function useRowKeyboardNav(
  rowIds: string[],
  options?: { onActivate?: (rowId: string) => void },
) {
  const [activeIndex, setActiveIndex] = React.useState<number>(-1)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const onActivateRef = React.useRef(options?.onActivate)
  // Keep the ref in sync with the latest callback (without touching it during render)
  React.useEffect(() => {
    onActivateRef.current = options?.onActivate
  }, [options?.onActivate])

  const activeRowId = activeIndex >= 0 ? rowIds[activeIndex] : null

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (rowIds.length === 0) return
      // Only react to arrow keys when not typing in an input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          setActiveIndex((prev) => {
            const next = prev + 1
            if (next >= rowIds.length) return 0 // wrap
            return next
          })
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          setActiveIndex((prev) => {
            if (prev <= 0) return rowIds.length - 1 // wrap
            return prev - 1
          })
          break
        }
        case 'Home': {
          e.preventDefault()
          setActiveIndex(0)
          break
        }
        case 'End': {
          e.preventDefault()
          setActiveIndex(rowIds.length - 1)
          break
        }
        case 'Enter': {
          // Only fire if a row is active
          if (activeIndex >= 0 && onActivateRef.current) {
            e.preventDefault()
            const id = rowIds[activeIndex]
            if (id) onActivateRef.current(id)
          }
          break
        }
      }
    },
    [rowIds, activeIndex],
  )

  // Scroll the active row into view when it changes
  React.useEffect(() => {
    if (activeRowId && containerRef.current) {
      const row = containerRef.current.querySelector(
        `[data-row-id="${activeRowId}"]`,
      )
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeRowId])

  const containerProps = {
    ref: containerRef,
    onKeyDown: handleKeyDown,
    tabIndex: 0,
    role: 'grid' as const,
    'aria-label': 'API keys table. Use arrow keys to navigate rows. Press Enter to edit.',
  }

  const rowProps = (rowId: string) => ({
    'data-row-id': rowId,
    'data-active': activeRowId === rowId,
    className: activeRowId === rowId
      ? 'outline outline-2 outline-emerald-500/40 outline-offset-[-2px]'
      : '',
  })

  return {
    activeRowId,
    activeIndex,
    containerProps,
    rowProps,
    clearActive: () => setActiveIndex(-1),
  }
}
