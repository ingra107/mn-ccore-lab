// useEntitySeen — frontend half of per-viewer seen tracking (schema v81).
//
// Two DISTINCT attention signals (Nick 2026-06-11):
//   • NEW (gold pill)   = assigned to you, never opened (acknowledged_at —
//                         see useTaskViewTracking).
//   • new activity (●)  = a task/project you HAVE seen has team-visible
//                         activity by OTHERS since your last look (teal —
//                         Rule 59: teal = communication/system, never gold).
//
// §9.5.1 (Phase 9): a THIRD entity_type, 'day' (the Today-bar conversation —
// CLAUDE.md Rule 80), rides the same new_count shape as task/project. It is
// NOT a meeting — route it to its own bucket, not the meetings fallback.
// 'day' rows badge a private (@me) Hermes answer on the Today-bar thread
// (Rule 59: gold = "...Hermes..."), read by Sidebar's Today nav item and
// drained via useMarkSeen('day', todayKey()) when Today opens (TodayPage).
//
// useUnseenActivity() → { tasks, projects, meetings, days } Maps keyed by
// entity id ('day' rows are keyed by their YYYY-MM-DD entity_id).
// useMarkSeen()       → fire-and-forget POST /api/seen; invalidates the maps.
// Detail surfaces call markSeen on open (tasks: inside useTaskViewTracking;
// projects: ProjectDetail mount; day: TodayPage mount), so looking at the
// thing IS the mark.

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isMeetingUnseenWithinCap } from '../lib/seen'

export interface UnseenActivityRow {
  entity_type: 'task' | 'project' | 'meeting' | 'day'
  entity_id: string
  /** task/project/day rows — count of new activity_entries since last seen
   *  (day: unseen Hermes replies on that date's private thread). */
  new_count: number
  latest_at: string
  title: string | null
  project_slug: string | null
  /** meeting rows only (T11) — 1 = never opened (gold NEW), 0 = opened before
   *  but updated since (teal ●). Meetings have no activity_entries feed, so
   *  there's no new_count to show for them — branch on entity_type, not on
   *  new_count, when rendering. */
  never_seen?: number
}

export interface UnseenActivityMaps {
  tasks: Map<string, UnseenActivityRow>
  projects: Map<string, UnseenActivityRow>
  meetings: Map<string, UnseenActivityRow>
  /** §9.5.1 — keyed by civil-date entity_id (YYYY-MM-DD), not by row id. */
  days: Map<string, UnseenActivityRow>
  rows: UnseenActivityRow[]
}

const EMPTY: UnseenActivityMaps = { tasks: new Map(), projects: new Map(), meetings: new Map(), days: new Map(), rows: [] }

export function useUnseenActivity() {
  return useQuery<UnseenActivityMaps>({
    queryKey: ['unseen-activity'],
    queryFn: async () => {
      const res = await fetch('/api/seen/unseen')
      if (!res.ok) return EMPTY
      const json = await res.json() as { data: UnseenActivityRow[] }
      // #548: cap the cold-start never_seen flood on ancient, un-visited
      // meetings — see src/lib/seen.ts for the recency-window rationale.
      // Drops the row entirely (no badge signal) rather than flipping
      // never_seen to 0, which would just repaint the flood teal instead
      // of clearing it (a "seen" row still renders the update-since-seen
      // dot when meetingSeen is truthy).
      const rows = (json.data ?? []).filter(
        (r) => !(r.entity_type === 'meeting' && r.never_seen === 1 && !isMeetingUnseenWithinCap(r.latest_at)),
      )
      const tasks = new Map<string, UnseenActivityRow>()
      const projects = new Map<string, UnseenActivityRow>()
      const meetings = new Map<string, UnseenActivityRow>()
      const days = new Map<string, UnseenActivityRow>()
      for (const r of rows) {
        // 'day' is its own bucket — NOT the meetings fallback (the pre-§9.5.1
        // router had only 3 arms, so a 'day' row silently mis-routed there).
        const target = r.entity_type === 'task' ? tasks
          : r.entity_type === 'project' ? projects
          : r.entity_type === 'day' ? days
          : meetings
        target.set(r.entity_id, r)
      }
      return { tasks, projects, meetings, days, rows }
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  })
}

export function useMarkSeen() {
  const queryClient = useQueryClient()
  return useCallback((entityType: 'task' | 'project' | 'meeting' | 'day', entityId: string) => {
    fetch('/api/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId }),
    })
      .then(() => queryClient.invalidateQueries({ queryKey: ['unseen-activity'] }))
      .catch(() => { /* fire-and-forget — a missed mark self-heals on next open */ })
  }, [queryClient])
}
