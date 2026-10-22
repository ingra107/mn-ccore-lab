import { useCallback } from 'react'
import { useUserPref } from './useUserPref'

/**
 * DD-2 — saved views scoped per page. Filter state + sort + mode captured as
 * a single URL-param blob, saved under a user-chosen name. Stored on the
 * server per person (pref 'savedViews.<page>', useUserPref), so a view saved
 * on one laptop is on the other (PB #911). Newest first, at most 25.
 */
export interface SavedView {
  id: string
  name: string
  /** Serialized URL query string the page can parse back into state. */
  query: string
  createdAt: number
}

const NONE: SavedView[] = []
const MAX_VIEWS = 25

function validate(stored: unknown): SavedView[] {
  if (!Array.isArray(stored)) return NONE
  return stored.filter((v): v is SavedView =>
    !!v && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.query === 'string'
  )
}

export function useSavedViews(page: string) {
  const [views, setViews] = useUserPref<SavedView[]>(`savedViews.${page}`, NONE, validate)

  const save = useCallback((name: string, query: string): SavedView => {
    const next: SavedView = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || 'Untitled view',
      query,
      createdAt: Date.now(),
    }
    setViews((prev) => [next, ...prev].slice(0, MAX_VIEWS))
    return next
  }, [setViews])

  const remove = useCallback((id: string) => {
    setViews((prev) => prev.filter((v) => v.id !== id))
  }, [setViews])

  const rename = useCallback((id: string, name: string) => {
    setViews((prev) => prev.map((v) => v.id === id ? { ...v, name: name.trim() || v.name } : v))
  }, [setViews])

  return { views, save, remove, rename }
}
