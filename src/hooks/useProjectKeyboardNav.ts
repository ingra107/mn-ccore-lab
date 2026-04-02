import { useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

interface UseProjectKeyboardNavOptions {
  /** Total number of projects in the list */
  projectCount: number
  /** Current focused index (-1 = none) */
  focusedIndex: number
  /** Set focused index */
  setFocusedIndex: (index: number | ((prev: number) => number)) => void
  /** Slugs array matching the displayed project order */
  slugs: string[]
  /** Whether keyboard nav is enabled (e.g., only in list view) */
  enabled: boolean
}

/**
 * Project-specific keyboard navigation for the project list view.
 *
 * J/K or ArrowDown/ArrowUp = move focus between project rows
 * Enter = navigate to project detail page
 * Escape = clear selection
 */
export function useProjectKeyboardNav({
  projectCount,
  focusedIndex,
  setFocusedIndex,
  slugs,
  enabled,
}: UseProjectKeyboardNavOptions) {
  const navigate = useNavigate()

  // Refs to avoid stale closures
  const focusedIndexRef = useRef(focusedIndex)
  const projectCountRef = useRef(projectCount)
  const slugsRef = useRef(slugs)
  const enabledRef = useRef(enabled)

  useEffect(() => { focusedIndexRef.current = focusedIndex }, [focusedIndex])
  useEffect(() => { projectCountRef.current = projectCount }, [projectCount])
  useEffect(() => { slugsRef.current = slugs }, [slugs])
  useEffect(() => { enabledRef.current = enabled }, [enabled])

  const handler = useCallback((e: KeyboardEvent) => {
    if (!enabledRef.current) return

    // Don't trigger when typing in inputs
    const target = e.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    ) {
      return
    }

    // Don't trigger with modifier keys
    if (e.metaKey || e.ctrlKey || e.altKey) return

    const count = projectCountRef.current
    const idx = focusedIndexRef.current

    switch (e.key) {
      case 'j':
      case 'J':
      case 'ArrowDown': {
        e.preventDefault()
        if (count === 0) return
        setFocusedIndex((prev) => {
          if (prev < 0) return 0
          return Math.min(prev + 1, count - 1)
        })
        break
      }

      case 'k':
      case 'K':
      case 'ArrowUp': {
        e.preventDefault()
        if (count === 0) return
        setFocusedIndex((prev) => {
          if (prev < 0) return 0
          return Math.max(prev - 1, 0)
        })
        break
      }

      case 'Enter': {
        if (idx >= 0 && idx < slugsRef.current.length) {
          e.preventDefault()
          navigate(`/projects/${slugsRef.current[idx]}`)
        }
        break
      }

      case 'Escape': {
        if (idx >= 0) {
          e.preventDefault()
          setFocusedIndex(() => -1)
        }
        break
      }
    }
  }, [navigate, setFocusedIndex])

  useEffect(() => {
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handler])
}
