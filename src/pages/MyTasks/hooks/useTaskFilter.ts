// useTaskFilter — derive filtered + byGroup from raw tasks + filter state.
// Mirrors the original inline useMemo blocks from UnifiedMyTasks. Pure
// transform; no side effects. Group sort: planned → active → done
// (CLAUDE.md Rule 62).
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.

import { useMemo } from 'react'
import {
  GROUP_ORDER,
  MENTEE_SLUGS,
  todayKey, daysSince,
  getGroupForTask, tagForTask, isTaskDone,
  type GroupKey, type FilterState, type QuickViewKey,
} from '../constants'
import type { TaskRow } from '../../../lib/api'

export interface UseTaskFilterArgs {
  allTasks: TaskRow[]
  filter: FilterState
  search: string
  quickView: QuickViewKey
  plannedSet: Set<string>
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null }>
}

export function useTaskFilter({ allTasks, filter, search, quickView, plannedSet, projectsByPid }: UseTaskFilterArgs) {
  const today = todayKey()

  // Apply quick-view + filters + search.
  const filtered = useMemo(() => {
    let base: TaskRow[] = allTasks
    if (quickView === 'today') base = base.filter((t) => plannedSet.has(t.id) || t.due_date?.slice(0, 10) === today)
    if (quickView === 'overdue') base = base.filter((t) => t.due_date && t.due_date.slice(0, 10) < today && !isTaskDone(t))
    if (quickView === 'waiting') base = base.filter((t) => t.status === 'waiting_external' && !isTaskDone(t))
    if (quickView === 'stale') base = base.filter((t) => daysSince(t.updated_at) >= 10 && t.status === 'in_progress' && !isTaskDone(t))
    return base.filter((t) => {
      if (filter.hideCompleted && isTaskDone(t)) return false
      if (filter.priority && t.priority !== filter.priority) return false
      if (filter.project && t.project_id !== filter.project) return false
      if (filter.mentee) {
        // '__any_mentee__' = any researchTeam slug; specific slug = exact match
        if (filter.mentee === '__any_mentee__') {
          if (!t.assignee || !MENTEE_SLUGS.has(t.assignee)) return false
        } else if (t.assignee !== filter.mentee) return false
      }
      if (filter.group) {
        if (getGroupForTask(t, projectsByPid) !== filter.group) return false
      }
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    }).map((t) => ({ ...t, _group: getGroupForTask(t, projectsByPid), _tag: tagForTask(t, projectsByPid) }) as TaskRow & { _group: GroupKey; _tag: string })
  }, [allTasks, filter, search, quickView, plannedSet, today, projectsByPid])

  // Bucket by group, then sort each bucket: planned → active → done.
  // CLAUDE.md Rule 62: planned tasks float to top, done sinks to bottom with strikethrough.
  const byGroup = useMemo(() => {
    const g: Record<GroupKey, TaskRow[]> = { deep: [], priorities: [], quick: [], pb: [], etl: [] }
    for (const t of filtered) {
      const k = (t as TaskRow & { _group: GroupKey })._group
      g[k].push(t)
    }
    const rank = (t: TaskRow): number => {
      if (isTaskDone(t)) return 2           // done sinks
      if (plannedSet.has(t.id)) return 0   // planned floats
      return 1                              // active middle
    }
    for (const k of GROUP_ORDER) {
      g[k].sort((a, b) => rank(a) - rank(b))
    }
    return g
  }, [filtered, plannedSet])

  return { filtered, byGroup }
}
