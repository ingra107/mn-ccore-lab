import { useState, useCallback, useEffect } from 'react'

export type ViewStatus = 'all' | 'pending' | 'overdue' | 'completed'
export type ViewSort = 'due_asc' | 'due_desc' | 'created_desc' | 'alpha'

export type ViewGroupBy = 'none' | 'status' | 'priority' | 'assignee'

export interface ViewFilters {
  assignee: string   // '__me__' resolves to current user slug; '' = all
  status: ViewStatus
  search: string
  sort: ViewSort
  groupBy?: ViewGroupBy
}

export interface SavedView {
  id: string
  name: string
  filters: ViewFilters
  isDefault?: boolean  // Default views cannot be deleted
}

const STORAGE_KEY = 'mnccore-saved-views-v1'
const ACTIVE_KEY = 'mnccore-active-view-v1'

export const DEFAULT_VIEWS: SavedView[] = [
  {
    id: 'default-my-items',
    name: 'My Items',
    filters: { assignee: '__me__', status: 'pending', search: '', sort: 'due_asc' },
    isDefault: true,
  },
  {
    id: 'default-overdue',
    name: 'Overdue',
    filters: { assignee: '__me__', status: 'overdue', search: '', sort: 'due_asc' },
    isDefault: true,
  },
  {
    id: 'default-all-open',
    name: 'All Open',
    filters: { assignee: '', status: 'pending', search: '', sort: 'due_asc' },
    isDefault: true,
  },
]

function loadCustomViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SavedView[]
  } catch {
    return []
  }
}

function saveCustomViews(views: SavedView[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views))
}

export function useSavedViews(userSlug: string) {
  const [customViews, setCustomViews] = useState<SavedView[]>(() => loadCustomViews())
  const [activeViewId, setActiveViewIdRaw] = useState<string>(() => {
    return localStorage.getItem(ACTIVE_KEY) ?? 'default-my-items'
  })

  useEffect(() => { saveCustomViews(customViews) }, [customViews])

  const setActiveViewId = useCallback((id: string) => {
    setActiveViewIdRaw(id)
    localStorage.setItem(ACTIVE_KEY, id)
  }, [])

  const allViews = [...DEFAULT_VIEWS, ...customViews]
  const activeView = allViews.find((v) => v.id === activeViewId) ?? DEFAULT_VIEWS[0]

  function resolveFilters(filters: ViewFilters): ViewFilters {
    return { ...filters, assignee: filters.assignee === '__me__' ? userSlug : filters.assignee }
  }

  const resolvedFilters = resolveFilters(activeView.filters)

  const saveView = useCallback((name: string, filters: ViewFilters) => {
    const newView: SavedView = { id: `custom-${Date.now()}`, name: name.trim(), filters }
    setCustomViews((prev) => [...prev, newView])
    return newView.id
  }, [])

  const renameView = useCallback((id: string, name: string) => {
    setCustomViews((prev) => prev.map((v) => (v.id === id ? { ...v, name: name.trim() } : v)))
  }, [])

  const deleteView = useCallback((id: string) => {
    setCustomViews((prev) => prev.filter((v) => v.id !== id))
    if (activeViewId === id) setActiveViewIdRaw('default-all-open')
  }, [activeViewId])

  return {
    views: allViews,
    activeViewId,
    activeView,
    activeViewFilters: resolvedFilters,
    setActiveViewId,
    saveView,
    renameView,
    deleteView,
  }
}
