// TaskGroup: one Today section (Sort, Review, Writing, Analysis & Build,
// Replies & admin, CLIF ETL, With others). Header (label + count + extending
// rule) over its rows. Which tasks land here is lib/taskSections.ts; the order
// inside is orderSection (planned, urgent, high, due date, done last); the fold
// is isAlwaysVisible (planned, overdue, due or deadline within the Today window (7/14/30, default 14), urgent or
// high, New, a parent with such a step stay; the rest folds behind "Show N
// more"). Replaces the fixed 5-row preview slice (2026-11-03).
//
// Extracted from src/pages/portal/TodayPage.tsx (B2_Group).

import { useMemo, useState, useCallback } from 'react'
import { TaskRow } from './TaskRow'
import { CollapseChevron } from './SectionCollapseToggle'
import { collapseToggleProps } from './collapseToggleProps'
import { isTaskDone } from './constants'
import { SortKindButtons } from '../tasks/SortPicker'
import { isAlwaysVisible, orderSection, othersSummary, SECTION_LABEL, TODAY_WINDOW_DEFAULT, type SectionKey } from '../../lib/taskSections'
import type { MilestoneEntry } from '../../lib/taskGrouping'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow as TaskRowData } from '../../lib/api'

// expandedId/onExpand no longer come from TodayPage: TaskGroup owns its own
// expand state so clicking a row here never expands the same task in Timeline
// or PlanSection (Item 2 fix, 2026-06-22).
export function TaskGroup({ skey, tasks, projectsByPid, state, stepsByParent, viewerSlug, windowDays = TODAY_WINDOW_DEFAULT, loading = false }: {
  skey: SectionKey
  tasks: TaskRowData[]
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null; primary_folder?: string | null }>
  state: TodayStateApi
  stepsByParent?: Map<string, TaskRowData[]>
  /** Whose Today this is: the New test (assigned to you, never opened) reads it. */
  viewerSlug: string
  /** Days ahead a row shows without a click (Today's 7 / 14 / 30 pick); past it, and undated, fold. */
  windowDays?: number
  /** A read that feeds this section has not answered: its count would be partial, so a dash. */
  loading?: boolean
}) {
  const label = SECTION_LABEL[skey]
  const isDoneRow = useCallback((t: TaskRowData) => !!state.done[t.id] || isTaskDone(t), [state.done])
  const doneCount = tasks.filter(isDoneRow).length
  // Return type is MilestoneEntry[] (a TaskRow + optional milestoneRole/
  // milestoneDate): orderSection stamps those on the milestone rules it emits
  // (Nick 2026-09-17 two-date rendering).
  // Nick 2026-10-12: a ticked row sinks at once; no settling hold.
  const sorted = useMemo(
    (): MilestoneEntry[] => orderSection(tasks, { isPlanned: (t) => !!state.planned[t.id], isDone: isDoneRow }),
    [tasks, state.planned, isDoneRow],
  )

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const onExpand = useCallback((id: string) => { setExpandedId((p) => (p === id ? null : id)) }, [])
  // Session-only collapse, per-instance, no localStorage. Every section starts
  // open except With others: it is other people's work, so its header carries
  // the counts and the rows wait behind a click.
  const [open, setOpen] = useState(skey !== 'others')

  // The fold. A SEPARATE affordance from the collapse chevron: the chevron hides
  // the whole section, this bounds how much of an open one you see. Reveal is
  // inline (these rows are work you do here).
  const [showAll, setShowAll] = useState(false)
  // Slices `sorted`, never `tasks`: the order is settled (orderSection), and
  // folding the raw array would bury planned work under the API's order.
  const kept = useMemo(
    () => sorted.filter((t) => isAlwaysVisible(t, {
      viewerSlug,
      windowDays,
      isPlanned: (r) => !!state.planned[r.id],
      stepsOf: (r) => stepsByParent?.get(r.id),
    })),
    [sorted, viewerSlug, windowDays, state.planned, stepsByParent],
  )
  const visible = showAll ? sorted : kept
  const hiddenCount = sorted.length - kept.length

  // Collapsing must not strand the expanded drawer on a row that just left the
  // list: the drawer would keep rendering with no visible parent row.
  const collapseRows = useCallback(() => {
    setShowAll(false)
    setExpandedId((id) => (id && !kept.some((t) => t.id === id) ? null : id))
  }, [kept])

  const others = useMemo(() => (skey === 'others' ? othersSummary(tasks) : null), [skey, tasks])

  if (tasks.length === 0) return null
  return (
    <section className="tk-panel tk-blk" data-group={skey}>
      <div {...collapseToggleProps(open, () => setOpen((o) => !o), label)} className="tk-ph tk-clk">
        <div className="tk-ctog">
          <CollapseChevron open={open} />
          <h3>{label}</h3>
          {others && loading ? (
            <span className="tk-cnt" data-others-summary>—</span>
          ) : others ? (
            <span className="tk-cnt" data-others-summary>
              {others.total}
              {others.urgent > 0 && ` · ${others.urgent} urgent`}
              {others.overdue > 0 && ` · ${others.overdue} overdue`}
            </span>
          ) : (
            <span className="tk-cnt" title={`${doneCount} of ${tasks.length} done`}>{doneCount} of {tasks.length}</span>
          )}
        </div>
      </div>
      {open && (
        <>
          <div className="tk-stack">
            {visible.map((t) => (
              // Key includes milestoneRole (not just t.id): a slipped
              // milestone renders as TWO rows sharing one id (Nick 2026-09-17)
              // and React needs distinct keys for both. Expand state stays keyed
              // by task id (both rows open the same drawer; acceptable).
              <div key={`${t.id}:${t.milestoneRole ?? 'row'}`}>
                <TaskRow
                  task={t}
                  project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                  state={state}
                  expandedId={expandedId}
                  onExpand={onExpand}
                  projectsByPid={projectsByPid}
                  milestoneRole={t.milestoneRole}
                  done={isTaskDone(t)}
                  // Someone else's task (With others) is not yours to plan.
                  noDrag={!!t.assignee && !!viewerSlug && t.assignee !== viewerSlug}
                  openSteps={stepsByParent?.get(t.id)}
                />
                {/* Sort: one tap places the task. It is the first thing Nick does. */}
                {skey === 'sort' && !isDoneRow(t) && <SortKindButtons task={t} />}
              </div>
            ))}
          </div>
          {(hiddenCount > 0 || showAll) && (
            <button
              type="button"
              onClick={showAll ? collapseRows : () => setShowAll(true)}
              aria-expanded={showAll}
              className="tk-further"
              style={{ padding: '8px 2px 0' }}
            >
              {showAll ? 'Show fewer' : `Show ${hiddenCount} more`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
