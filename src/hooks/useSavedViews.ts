import { useCallback, useEffect, useState } from 'react'

/**
 * DD-2 v1 — saved views scoped per-page. Filter state + sort + mode captured
 * as a single URL-param blob, saved to localStorage under a user-chosen name.
 * No D1 migration; v1 is per-device + per-browser-profile. A v2 will add a
 * D1 `saved_views` table with owner slug + sidebar pinning for cross-device
 * persistence. For the pilot on MyTasks we keep it local.
 */
export interface SavedView {
  id: string
  name: string
  /** Serialized URL query string the page can parse back into state. */
  query: string
  createdAt: number
}

const LS_KEY_PREFIX = 'mnccore.savedViews.v1.'

function readViews(page: string): SavedView[] {
  try {
    const raw = localStorage.getItem(LS_KEY_PREFIX + page)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is SavedView =>
      v && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.query === 'string'
    )
  } catch {
    return []
  }
}

function writeViews(page: string, views: SavedView[]) {
  try { localStorage.setItem(LS_KEY_PREFIX + page, JSON.stringify(views)) } catch { /* unavailable */ }
}

export function useSavedViews(page: string) {
  const [views, setViews] = useState<SavedView[]>(() => readViews(page))

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY_PREFIX + page) setViews(readViews(page))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [page])

  const save = useCallback((name: string, query: string): SavedView => {
    const next: SavedView = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || 'Untitled view',
      query,
      createdAt: Date.now(),
    }
    setViews((prev) => {
      const out = [next, ...prev].slice(0, 25)
      writeViews(page, out)
      return out
    })
    return next
  }, [page])

  const remove = useCallback((id: string) => {
    setViews((prev) => {
      const out = prev.filter((v) => v.id !== id)
      writeViews(page, out)
      return out
    })
  }, [page])

  const rename = useCallback((id: string, name: string) => {
    setViews((prev) => {
      const out = prev.map((v) => v.id === id ? { ...v, name: name.trim() || v.name } : v)
      writeViews(page, out)
      return out
    })
  }, [page])

  return { views, save, remove, rename }
}
