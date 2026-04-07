import { useEffect, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'

const LS_KEY = 'mn-ccore-recently-viewed'
const MAX_ITEMS = 6

interface RecentPage {
  path: string
  label: string
  timestamp: number
}

// Map paths to human-readable labels
const PATH_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/personal': 'My Hub',
  '/tasks': 'Tasks',
  '/my-tasks': 'My Tasks',
  '/calendar': 'Calendar',
  '/deadlines': 'Deadlines',
  '/projects': 'Projects',
  '/manuscripts': 'Manuscripts',
  '/ideas': 'Ideas',
  '/digest': 'Research Digest',
  '/grants': 'Grants',
  '/meetings': 'Meetings',
  '/activity': 'Activity',
  '/analytics': 'Analytics',
  '/search': 'Search',
  '/settings': 'Settings',
  '/meeting-notes': 'Meeting Transcripts',
}

function labelForPath(path: string): string | null {
  // Exact match
  if (PATH_LABELS[path]) return PATH_LABELS[path]

  // Dynamic routes
  if (path.startsWith('/projects/')) return path.split('/')[2]?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Project'
  if (path.startsWith('/meetings/')) return 'Meeting Detail'
  if (path.startsWith('/publications/')) return 'Publication'
  if (path.startsWith('/team/')) return 'Team Member'

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
