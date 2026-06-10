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
import { isOverdue } from '../../../lib/dateUtils'
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
  // P1-12 (decision #2): WITHIN the active tier, overdue floats to the top,
  // oldest-late first — so "where do I focus" is answered by the page's shape.
  // This rides INSIDE the planned→active→done ordering (Rule 62), it does not
  // fight the group model: planned still floats above overdue, done still sinks.
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
    // Overdue tasks sort first inside the active tier, oldest-late first.
    const overdueRank = (t: TaskRow): number =>
      (!isTaskDone(t) && t.due_date && isOverdue(t.due_date, t.status)) ? 0 : 1
    for (const k of GROUP_ORDER) {
      g[k].sort((a, b) => {
        const r = rank(a) - rank(b)
        if (r !== 0) return r
        const o = overdueRank(a) - overdueRank(b)
        if (o !== 0) return o
        // both overdue → oldest-late first (earliest due_date wins)
        if (overdueRank(a) === 0 && a.due_date && b.due_date) {
          return a.due_date.slice(0, 10) < b.due_date.slice(0, 10) ? -1
            : a.due_date.slice(0, 10) > b.due_date.slice(0, 10) ? 1 : 0
        }
        return 0
      })
    }
    return g
  }, [filtered, plannedSet])

  // P1-12: live count of overdue (not-done) tasks across the filtered set, for
  // the coral group header. One source of truth so every view agrees.
  const overdueCount = useMemo(
    () => filtered.filter((t) => !isTaskDone(t) && t.due_date && isOverdue(t.due_date, t.status)).length,
    [filtered],
  )

  return { filtered, byGroup, overdueCount }
}
