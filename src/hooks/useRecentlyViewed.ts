import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { PATHS } from '../constants/paths'
import { PORTAL_PAGE_LABELS } from '../constants/pageLabels'

const LS_KEY = 'mn-ccore-recently-viewed'
const MAX_ITEMS = 6

interface RecentPage {
  path: string
  label: string
  timestamp: number
}

// Labels come from the one portal page-name map (constants/pageLabels.ts),
// the same names the sidebar and the tab titles use. /portal/tasks is the
// legacy alias of Tasks (it redirects to /portal/my-tasks).
const PATH_LABELS: Record<string, string> = {
  ...PORTAL_PAGE_LABELS,
  [PATHS.tasks]: PORTAL_PAGE_LABELS[PATHS.myTasks],
}

function labelForPath(path: string): string | null {
  if (PATH_LABELS[path]) return PATH_LABELS[path]
  if (path.startsWith(`${PATHS.projects}/`)) {
    return path.split('/').pop()?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Project'
  }
  if (path.startsWith(`${PATHS.meetings}/`)) return 'Meeting Detail'
  if (path.startsWith(`${PATHS.team}/`)) return 'Team Member'
  return null
}

// Only portal paths survive a load. Entries written before the /portal/*
// move (e.g. '/personal') are dropped rather than shown as a second "My Hub".
function loadRecent(): RecentPage[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const items: RecentPage[] = raw ? JSON.parse(raw) : []
    return items.filter((p) => typeof p?.path === 'string' && labelForPath(p.path) !== null)
  } catch {
    return []
  }
}

function saveRecent(items: RecentPage[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)) } catch { /* best-effort: quota / private mode */ }
}

/**
 * Record every portal page visit. Mounted ONCE, in PortalLayout.
 *
 * D3(a), 2026-10-09: recording used to live inside useRecentlyViewed(), whose
 * only caller was My Hub, so the list only ever learned about My Hub itself
 * and showed it to you while you were on it (plus a legacy '/personal' copy):
 * "My Hub" twice, and never the pages you had actually been to.
 */
export function useRecordRecentlyViewed() {
  const location = useLocation()
  useEffect(() => {
    const path = location.pathname
    const label = labelForPath(path)
    if (!label) return
    const prev = loadRecent().filter((p) => p.path !== path)
    saveRecent([{ path, label, timestamp: Date.now() }, ...prev].slice(0, MAX_ITEMS))
  }, [location.pathname])
}

/** Recently viewed portal pages, newest first, excluding the page you are on. */
export function useRecentlyViewed() {
  const location = useLocation()
  // Read once at mount: the recorder in PortalLayout writes this visit after
  // the page's own render, and the current page is filtered out regardless.
  const [stored] = useState<RecentPage[]>(loadRecent)
  return { recent: stored.filter((p) => p.path !== location.pathname) }
}
