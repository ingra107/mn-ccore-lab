// useTaskFilter — derive filtered + byGroup from raw tasks + filter state.
// Mirrors the original inline useMemo blocks from UnifiedMyTasks. Pure
// transform; no side effects. Group sort: planned → active → done
// (CLAUDE.md Rule 62).
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx.

import { useMemo } from 'react'
import {
  MENTEE_SLUGS,
  todayKey, daysSince,
  tagForTask, isTaskDone,
  type FilterState, type QuickViewKey,
} from '../constants'
import { SECTION_ORDER, bucketBySection, orderSection, sectionForTask, type SectionKey } from '../../../lib/taskSections'
import { isOverdue } from '../../../lib/dateUtils'
import { isToday } from '../../../components/today/constants'
import { useLabPrefs } from '../../../hooks/useLabPrefs'
import { useAuth } from '../../../hooks/useAuth'
import type { TaskRow } from '../../../lib/api'

export interface UseTaskFilterArgs {
  allTasks: TaskRow[]
  filter: FilterState
  search: string
  quickView: QuickViewKey
  plannedSet: Set<string>
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null }>
  /** Whose list this is (the member being viewed). Defaults to the signed-in person. */
  ownerSlug?: string
}

export function useTaskFilter({ allTasks, filter, search, quickView, plannedSet, projectsByPid, ownerSlug }: UseTaskFilterArgs) {
  const today = todayKey()
  // P2-9: ONE staleness threshold (days-since-meaningful-movement), shared
  // with every stale chip/filter and surfaced in Settings → Lab Preferences.
  const { prefs } = useLabPrefs()
  const taskStaleDays = prefs.taskStaleDays
  // 'new' quick view (Slack-style seen, 2026-06-11): YOUR tasks you haven't
  // opened yet (acknowledged_at IS NULL; auto-ack fires on open, draining it).
  const { user } = useAuth()
  const viewerSlug = user?.slug ?? ''
  // The list's owner: the member being viewed (?assignee=), else the viewer. The
  // section rules ask "is this with someone else" against THIS person, so a
  // member's own tasks never read as With others on their list.
  const listOwner = ownerSlug || viewerSlug
  const sectionCtx = useMemo(() => ({ viewerSlug: listOwner, projectsBySlug: projectsByPid }), [listOwner, projectsByPid])

  // Apply quick-view + filters + search.
  const filtered = useMemo(() => {
    let base: TaskRow[] = allTasks
    if (quickView === 'new') base = base.filter((t) => t.assignee === viewerSlug && !t.acknowledged_at && !isTaskDone(t))
    if (quickView === 'today') base = base.filter((t) => plannedSet.has(t.id) || t.due_date?.slice(0, 10) === today)
    // Today page stat-line links: planned for today, and finished today.
    if (quickView === 'planned') base = base.filter((t) => plannedSet.has(t.id) && !isTaskDone(t))
    if (quickView === 'done-today') base = base.filter((t) => t.completed === 1 && isToday(t.completed_at))
    if (quickView === 'overdue') base = base.filter((t) => t.due_date && t.due_date.slice(0, 10) < today && !isTaskDone(t))
    if (quickView === 'waiting') base = base.filter((t) => t.status === 'waiting_external' && !isTaskDone(t))
    if (quickView === 'stale') base = base.filter((t) => daysSince(t.updated_at) >= taskStaleDays && t.status === 'in_progress' && !isTaskDone(t))
    if (quickView === 'declined') base = base.filter((t) => t.approval_status === 'declined')
    return base.filter((t) => {
      // 'done-today' is the one view that is ABOUT completed rows.
      if (filter.hideCompleted && quickView !== 'done-today' && isTaskDone(t)) return false
      if (filter.priority && t.priority !== filter.priority) return false
      if (filter.project && t.project_id !== filter.project) return false
      if (filter.mentee) {
        // '__any_mentee__' = any researchTeam slug; specific slug = exact match
        if (filter.mentee === '__any_mentee__') {
          if (!t.assignee || !MENTEE_SLUGS.has(t.assignee)) return false
        } else if (t.assignee !== filter.mentee) return false
      }
      if (filter.group) {
        if (sectionForTask(t, sectionCtx) !== filter.group) return false
      }
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    }).map((t) => ({ ...t, _section: sectionForTask(t, sectionCtx), _tag: tagForTask(t, projectsByPid) }) as TaskRow & { _section: SectionKey; _tag: string | null })
  }, [allTasks, filter, search, quickView, plannedSet, today, projectsByPid, taskStaleDays, viewerSlug, sectionCtx])

  // Bucket by section (the ONE resolver, lib/taskSections), then order each
  // bucket the way Today does: planned, urgent, high, due date (overdue leads),
  // done last. A milestone is an ordinary row here (milestoneRules: false).
  const byGroup = useMemo(() => {
    const g = bucketBySection(filtered, sectionCtx)
    for (const k of SECTION_ORDER) {
      g[k] = orderSection(g[k], { isPlanned: (t) => plannedSet.has(t.id), isDone: isTaskDone, milestoneRules: false })
    }
    return g
  }, [filtered, plannedSet, sectionCtx])

  // P1-12: live count of overdue (not-done) tasks across the filtered set, for
  // the coral group header. One source of truth so every view agrees.
  const overdueCount = useMemo(
    () => filtered.filter((t) => !isTaskDone(t) && t.due_date && isOverdue(t.due_date, t.status)).length,
    [filtered],
  )

  return { filtered, byGroup, overdueCount }
}
