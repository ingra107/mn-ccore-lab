import { useEffect, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'

const LS_KEY = 'mn-ccore-recently-viewed'
const MAX_ITEMS = 6

interface RecentPage {
  path: string
  label: string
  timestamp: number
}

import { PATHS } from '../constants/paths'

// Map paths (both portal canonical + legacy root equivalents) to human-readable labels
const PATH_LABELS: Record<string, string> = {
  [PATHS.dashboard]: 'Dashboard',
  [PATHS.personal]: 'My Hub',
  [PATHS.tasks]: 'Tasks',
  [PATHS.myTasks]: 'My Tasks',
  [PATHS.calendar]: 'Calendar',
  [PATHS.deadlines]: 'Deadlines',
  [PATHS.projects]: 'Projects',
  [PATHS.manuscripts]: 'Manuscripts',
  [PATHS.ideas]: 'Ideas',
  [PATHS.digest]: 'Research Digest',
  [PATHS.grants]: 'Grants',
  [PATHS.meetings]: 'Meetings',
  [PATHS.activity]: 'Activity',
  [PATHS.analytics]: 'Analytics',
  [PATHS.search]: 'Search',
  [PATHS.settings]: 'Settings',
  [PATHS.meetingNotes]: 'Meeting Transcripts',
}

function labelForPath(path: string): string | null {
  // Exact match (covers both /portal/x and /x if the legacy redirects haven't fired yet)
  if (PATH_LABELS[path]) return PATH_LABELS[path]

  // Dynamic routes — check /portal/<prefix>/ first, then legacy root as fallback
  if (path.startsWith(`${PATHS.projects}/`)) {
    return path.split('/').pop()?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Project'
  }
  if (path.startsWith(`${PATHS.meetings}/`)) return 'Meeting Detail'
  if (path.startsWith('/publications/')) return 'Publication'
  if (path.startsWith('/team/')) return 'Team Member'
  if (path.startsWith('/portal/team/')) return 'Team Member'

  return null
}

function loadRecent(): RecentPage[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveRecent(items: RecentPage[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(items))
}

/** Track page visits and return the most recent ones */
export function useRecentlyViewed() {
  const location = useLocation()
  const [recent, setRecent] = useState<RecentPage[]>(loadRecent)

  // Record visit on path change
  useEffect(() => {
    const path = location.pathname
    const label = labelForPath(path)
    if (!label) return // Skip unlabeled paths (home, contact, etc.)

    // Genuine external-system sync: records Date.now() and persists to
    // localStorage on every route change — not a pure prop->state mirror, so
    // this can't move to a render-time adjustment without making render impure.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    setRecent((prev) => {
      // Remove duplicate
      const filtered = prev.filter((p) => p.path !== path)
      const next = [{ path, label, timestamp: Date.now() }, ...filtered].slice(0, MAX_ITEMS)
      saveRecent(next)
      return next
    })
  }, [location.pathname])

  const clearRecent = useCallback(() => {
    setRecent([])
    localStorage.removeItem(LS_KEY)
  }, [])

  return { recent, clearRecent }
}
