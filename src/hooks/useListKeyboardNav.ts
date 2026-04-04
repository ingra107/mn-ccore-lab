import { useEffect, useCallback, useRef } from 'react'

interface UseListKeyboardNavOptions {
  /** Total items in the list */
  itemCount: number
  /** Current focused index (-1 = none) */
  focusedIndex: number
  /** Set focused index */
  setFocusedIndex: (index: number | ((prev: number) => number)) => void
  /** Callback when Enter is pressed on focused item */
  onEnter?: () => void
  /** Callback when Escape is pressed */
  onEscape?: () => void
  /** Whether keyboard nav is disabled (e.g., modal open) */
  disabled?: boolean
}

/**
 * Generic J/K keyboard navigation for list pages.
 *
 * J = move focus down, K = move focus up
 * Enter = action on focused item
 * Escape = clear focus / close overlay
 */
export function useListKeyboardNav({
  itemCount,
  focusedIndex,
  setFocusedIndex,
  onEnter,
  onEscape,
  disabled = false,
}: UseListKeyboardNavOptions) {
  const countRef = useRef(itemCount)
  const indexRef = useRef(focusedIndex)
  const disabledRef = useRef(disabled)

  useEffect(() => { countRef.current = itemCount }, [itemCount])
  useEffect(() => { indexRef.current = focusedIndex }, [focusedIndex])
  useEffect(() => { disabledRef.current = disabled }, [disabled])

  const handler = useCallback((e: KeyboardEvent) => {
    if (disabledRef.current) return

    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return
    if (e.metaKey || e.ctrlKey || e.altKey) return

    const count = countRef.current

    switch (e.key) {
      case 'j':
      case 'J':
        e.preventDefault()
        if (count === 0) return
        setFocusedIndex((prev) => prev < 0 ? 0 : Math.min(prev + 1, count - 1))
        break

      case 'k':
      case 'K':
        e.preventDefault()
        if (count === 0) return
        setFocusedIndex((prev) => prev < 0 ? 0 : Math.max(prev - 1, 0))
        break

      case 'Enter':
        if (indexRef.current >= 0 && onEnter) {
          e.preventDefault()
          onEnter()
        }
        break

      case 'Escape':
        if (onEscape) {
          e.preventDefault()
          onEscape()
        }
        break
    }
  }, [setFocusedIndex, onEnter, onEscape])

  useEffect(() => {
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handler])
}
