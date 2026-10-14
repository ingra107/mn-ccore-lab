// LanesView — stacked-section renderer. Focus one group, peek at others
// (a lane shows its first 4 rows; "Show N more" reveals all). Each lane is a
// quiet heading over one soft panel of sleek rows (components/table/SleekRows,
// the same row as the Table, without column heads; Nick's 2026-10-10 mock).
// Square = complete, title = full editor, shift-click / ctrl-click /
// long-press = select (plain click too while selecting), body click = inline
// detail below the row.
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx (LanesView + LaneRow).

import { useEffect, useMemo, useState } from 'react'
import { SleekTable, SleekRow, SleekOverdueLine, type SleekColumn } from '../../../components/table/SleekRows'
import { TaskTitleCell, TaskCheckCell, TaskDueCell } from '../../../components/tasks/taskSleekCells'
import { CardProjectLine } from '../../../components/tasks/TaskCardRow'
import { Face } from '../../../components/today/skin'
import { InlineDetail } from '../components/InlineDetail'
import { MilestoneDrawer } from '../../../components/today/MilestoneDrawer'
import WorkOnActions from '../../../components/WorkOnActions'
import { useSelectMode } from '../../../hooks/useSelectMode'
import { useLabPrefs } from '../../../hooks/useLabPrefs'
import { LaneEmpty } from './MyTasksEmpty'
import { GROUP_META, GROUP_ORDER, daysSince, isTaskDone, type GroupKey } from '../constants'
import { isOverdue } from '../../../lib/dateUtils'
import type { TaskRow } from '../../../lib/api'
import { isMilestone } from '../../../../shared/taskKinds'

type Project = { name: string; slug: string; fullTitle?: string; primary_folder?: string | null }

// MT-17 — persist lane collapsed/peek state to localStorage so reload
// remembers what was open. Stored as two arrays keyed by GroupKey.
const LS_COLLAPSED = 'mt_lane_collapsed'
const LS_PEEK = 'mt_lane_peek'
function readSet(key: string): Set<GroupKey> {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as GroupKey[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch { return new Set() }
}
function writeSet(key: string, s: Set<GroupKey>) {
  try { window.localStorage.setItem(key, JSON.stringify([...s])) } catch { /* ignore */ }
}

export function LanesView({ byGroup, selected, toggleSelect, selectRange, anchorId, onToggleComplete, onOpenEditor, expanded, setExpanded, projectsByPid, plannedSet, filterGroup }: { byGroup: Record<GroupKey, TaskRow[]>; selected: Set<string>; toggleSelect: (id: string) => void; selectRange: (targetId: string, orderedIds: string[], anchor: string | null) => void; anchorId: string | null; onToggleComplete: (task: TaskRow) => void; onOpenEditor: (id: string) => void; expanded: string | null; setExpanded: (id: string | null) => void; projectsByPid: Map<string, Project>; plannedSet: Set<string>; filterGroup?: GroupKey | null }) {
  // MT-16 — when a Group filter is active, only render the matching lane.
  const visibleGroups = filterGroup ? GROUP_ORDER.filter(g => g === filterGroup) : GROUP_ORDER
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(() => readSet(LS_COLLAPSED))
  const [peek, setPeek] = useState<Set<GroupKey>>(() => readSet(LS_PEEK))
  useEffect(() => { writeSet(LS_COLLAPSED, collapsed) }, [collapsed])
  useEffect(() => { writeSet(LS_PEEK, peek) }, [peek])
  const toggleC = (k: GroupKey) => setCollapsed((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const toggleP = (k: GroupKey) => setPeek((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  // Phase G: Ctrl/Meta held → select-mode affordance on rows.
  const selectModeActive = useSelectMode(true)
  const selectionActive = selectModeActive || selected.size > 0
  const { prefs } = useLabPrefs()

  // The overdue line counts every visible lane.
  const allTasks = useMemo(() => visibleGroups.flatMap((g) => byGroup[g]), [visibleGroups, byGroup])
  const overdueOf = (tasks: TaskRow[]) => tasks.filter((t) => !isTaskDone(t) && t.due_date && isOverdue(t.due_date, t.status)).length

  const columns = useMemo<SleekColumn<TaskRow>[]>(() => {
    const projectOf = (t: TaskRow) => (t.project_id ? projectsByPid.get(t.project_id) ?? null : null)
    const stale = (t: TaskRow) => (t.updated_at && t.status === 'in_progress' && daysSince(t.updated_at) >= prefs.taskStaleDays ? daysSince(t.updated_at) : 0)
    return [
      { key: 'done', width: '24px', interactive: true, phone: 'lead', render: (t) => <TaskCheckCell task={t} isDone={isTaskDone(t)} onToggle={() => onToggleComplete(t)} /> },
      {
        key: 'title', width: 'minmax(0,1fr)', phone: 'title',
        render: (t) => (
          <TaskTitleCell
            task={t}
            isDone={isTaskDone(t)}
            onOpen={() => onOpenEditor(t.id)}
            selecting={selectionActive}
            planned={plannedSet.has(t.id)}
            staleDays={stale(t)}
            showWaiting
          />
        ),
      },
      { key: 'project', width: '160px', interactive: true, phone: 'line', render: (t) => <CardProjectLine project={projectOf(t)} task={t} /> },
      { key: 'due', width: '104px', phone: 'line', render: (t) => <TaskDueCell task={t} isDone={isTaskDone(t)} /> },
      { key: 'owner', width: '26px', phone: 'trail', render: (t) => (t.assignee ? <Face slug={t.assignee} /> : null) },
      {
        key: 'work', width: '56px', align: 'end', interactive: true, hover: true,
        render: (t) => {
          const p = projectOf(t)
          return p?.primary_folder ? <WorkOnActions primaryFolder={p.primary_folder} projectLabel={p.name} variant="slot" /> : null
        },
      },
    ]
  }, [projectsByPid, prefs.taskStaleDays, onToggleComplete, onOpenEditor, selectionActive, plannedSet])

  return (
    // P1-1: outer scroll fills the surface; .mt-band sets the same left edge as
    // the data pages and stops at --page-width; the --col-main block inside is
    // left-anchored so its left edge equals Projects, the other views and Today.
    <div className="fab-clear" style={{ flex: 1, overflow: 'auto', paddingTop: 12, paddingBottom: 40 }}>
     <div className="mt-band">
      <div style={{ maxWidth: 'var(--col-main)', width: '100%' }}>
      <SleekOverdueLine count={overdueOf(allTasks)} />
      {visibleGroups.map((gkey) => {
        const meta = GROUP_META[gkey]
        const tasks = byGroup[gkey]
        const isCollapsed = collapsed.has(gkey)
        const isPeek = peek.has(gkey)
        const visible = isCollapsed ? [] : isPeek ? tasks : tasks.slice(0, 4)
        const hidden = tasks.length - visible.length
        const overdueInLane = overdueOf(tasks)
        const plannedInLane = tasks.filter((t) => plannedSet.has(t.id) && !isTaskDone(t)).length
        const visibleIds = visible.map((r) => r.id)
        return (
          <section key={gkey}>
            <button type="button" className="sr-grp-h" aria-expanded={!isCollapsed} onClick={() => toggleC(gkey)}>
              <span className="sr-chev" aria-hidden="true" style={{ transform: isCollapsed ? 'rotate(-90deg)' : undefined }}>▾</span>
              <h3>{meta.label}</h3>
              <span className="sr-n">{tasks.length}</span>
              <span className="sr-sp" />
              {overdueInLane > 0 && <span className="sr-od">{overdueInLane} overdue</span>}
              {plannedInLane > 0 && <span className="sr-pl">{plannedInLane} planned</span>}
            </button>
            {!isCollapsed && (
              <SleekTable columns={columns} header={false} className="sr-panel">
                {visible.length === 0 && <LaneEmpty />}
                {visible.map((t) => (
                  <SleekRow
                    key={t.id}
                    row={t}
                    data={{ 'task-id': t.id }}
                    selected={selected.has(t.id)}
                    urgent={t.priority === 'urgent' && !isTaskDone(t)}
                    done={isTaskDone(t)}
                    expanded={expanded === t.id}
                    selectMode={selectModeActive}
                    // Stop text selection on a modifier+mousedown (a select click).
                    onMouseDown={(e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault() }}
                    // Long-press = select, touch included; the row swallows its click.
                    onLongPress={() => toggleSelect(t.id)}
                    onClick={(e) => {
                      if (e.shiftKey) { selectRange(t.id, visibleIds, anchorId); return }
                      if (e.ctrlKey || e.metaKey || selectionActive) { toggleSelect(t.id); return }
                      setExpanded(expanded === t.id ? null : t.id)
                    }}
                  >
                    {expanded === t.id && (isMilestone(t) ? (
                      // Same drawer Today uses: Mark complete, project links + documents, notes.
                      <MilestoneDrawer task={t} project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null} onToggleComplete={onToggleComplete} />
                    ) : (
                      <InlineDetail task={t} projectName={t.project_id ? projectsByPid.get(t.project_id)?.name : undefined} primaryFolder={t.project_id ? projectsByPid.get(t.project_id)?.primary_folder : undefined} onOpenEditor={() => onOpenEditor(t.id)} />
                    ))}
                  </SleekRow>
                ))}
                {(hidden > 0 || (isPeek && tasks.length > 4)) && (
                  <button type="button" className="sr-more" onClick={() => toggleP(gkey)}>
                    {isPeek ? 'Show less' : `Show ${hidden} more`}
                  </button>
                )}
              </SleekTable>
            )}
          </section>
        )
      })}
      </div>
     </div>
    </div>
  )
}
