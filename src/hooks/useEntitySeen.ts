// useEntitySeen — frontend half of per-viewer seen tracking (schema v81).
//
// Two DISTINCT attention signals (Nick 2026-06-11):
//   • NEW (gold pill)   = assigned to you, never opened (acknowledged_at —
//                         see useAutoAcknowledge).
//   • new activity (●)  = a task/project you HAVE seen has team-visible
//                         activity by OTHERS since your last look (teal —
//                         Rule 59: teal = communication/system, never gold).
//
// useUnseenActivity() → { tasks, projects } Maps keyed by entity id.
// useMarkSeen()       → fire-and-forget POST /api/seen; invalidates the maps.
// Detail surfaces call markSeen on open (tasks: inside useAutoAcknowledge;
// projects: ProjectDetail mount), so looking at the thing IS the mark.

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

export interface UnseenActivityRow {
  entity_type: 'task' | 'project'
  entity_id: string
  new_count: number
  latest_at: string
  title: string | null
  project_slug: string | null
}

export interface UnseenActivityMaps {
  tasks: Map<string, UnseenActivityRow>
  projects: Map<string, UnseenActivityRow>
  rows: UnseenActivityRow[]
}

const EMPTY: UnseenActivityMaps = { tasks: new Map(), projects: new Map(), rows: [] }

export function useUnseenActivity() {
  return useQuery<UnseenActivityMaps>({
    queryKey: ['unseen-activity'],
    queryFn: async () => {
      const res = await fetch('/api/seen/unseen')
      if (!res.ok) return EMPTY
      const json = await res.json() as { data: UnseenActivityRow[] }
      const rows = json.data ?? []
      const tasks = new Map<string, UnseenActivityRow>()
      const projects = new Map<string, UnseenActivityRow>()
      for (const r of rows) (r.entity_type === 'task' ? tasks : projects).set(r.entity_id, r)
      return { tasks, projects, rows }
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  })
}

export function useMarkSeen() {
  const queryClient = useQueryClient()
  return useCallback((entityType: 'task' | 'project', entityId: string) => {
    fetch('/api/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId }),
    })
      .then(() => queryClient.invalidateQueries({ queryKey: ['unseen-activity'] }))
      .catch(() => { /* fire-and-forget — a missed mark self-heals on next open */ })
  }, [queryClient])
}
