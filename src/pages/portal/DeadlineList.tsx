// DeadlineList: the Deadlines List view on the shared sleek row
// (components/table/SleekRows, Nick's 2026-10-10 mock; evaluation items 8, 9).
// One line per deadline, no gridlines, the Today card's chips: the due pill in
// card words and colors, the project as a muted short name, the owner's face,
// the gold diamond for a milestone (the Type column is gone), and no "To Do" /
// "Upcoming" pill for the default status.
//
// Kept from the ruled grid: the Overdue / This week / Next week / Later /
// Completed groups (Completed starts folded and shows 5 with Show all), inline
// due and status edits, title click opens the task drawer, bulk select, large
// groups virtualized. Added to match the Tasks Table: header sort (asc, desc,
// clear; it sorts within each group; the old header never applied its sort),
// j/k cursor, x / shift-click / ctrl-click / long-press select, e or Enter
// opens, Esc clears. The square is COMPLETE (Hub Rule 68), not select.

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SleekTable, SleekRow, type SleekColumn, type SleekSort } from '../../components/table/SleekRows'
import { TaskTitleCell, TaskCheckCell, TaskDueCell, TaskStatusPill, MilestoneDueCell, taskHasDuePill } from '../../components/tasks/taskSleekCells'
import { CardProjectLine } from '../../components/tasks/TaskCardRow'
import { Face } from '../../components/today/skin'
import InlineSelect from '../../components/InlineSelect'
import InlineDatePicker from '../../components/InlineDatePicker'
import { useListKeyboard } from '../MyTasks/hooks/useListKeyboard'
import { useLongPress } from '../../hooks/useLongPress'
import { useSelectMode } from '../../hooks/useSelectMode'
import { useIsMobile } from '../../hooks/useIsMobile'
import { getPersonInfo } from '../../data/team'
import { formatShortDate, isDoneStatus } from '../../lib/dateUtils'
import { STATUS_ORDER } from '../../lib/taskConstants'
import { PATHS } from '../../constants/paths'
import type { TaskRow } from '../../lib/api'

export interface DeadlineItem {
  id: string
  /** What every row shows: a task's SHORT label (displayNames.taskShortLabel). */
  title: string
  /** The full title, for hover and the .ics export; unset when title already is it. */
  fullTitle?: string
  due_date: string
  /** 'milestone' = a GRANT milestone. A task milestone (kind='milestone') is a 'task'. */
  type: 'task' | 'milestone'
  assignee?: string
  project?: string
  status: string
  priority?: string
  isOverdue: boolean
  daysUntil: number
  future_note?: string | null
  future_note_author?: string | null
  /** The task behind a task row; unset for a grant milestone. */
  task?: TaskRow
}

export interface DeadlineGroup {
  title: string
  items: DeadlineItem[]
  /** Rows shown before "Show all" (Completed). */
  limit?: number
}

export type DeadlineProject = { name: string; slug: string; fullTitle?: string }

const TASK_STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do', color: 'var(--slate)' },
  { value: 'in_progress', label: 'In Progress', color: 'var(--job-accent)' },
  { value: 'waiting_external', label: 'Waiting External', color: 'var(--st-waiting)' },
  { value: 'blocked', label: 'Blocked', color: 'var(--st-blocked)' },
  { value: 'done', label: 'Done', color: 'var(--st-done)' },
]

// S12: grant-milestone status vocab (mirrors GrantsPage MILESTONE_STATUS_OPTIONS).
const GRANT_MILESTONE_STATUS_OPTIONS = [
  { value: 'upcoming', label: 'Upcoming', color: 'var(--slate)' },
  { value: 'in_progress', label: 'In Progress', color: 'var(--job-accent)' },
  { value: 'completed', label: 'Completed', color: 'var(--st-done)' },
  { value: 'overdue', label: 'Overdue', color: 'var(--job-overdue)' },
]
const GRANT_MILESTONE_PILL: Record<string, { word: string; dot: string }> = {
  in_progress: { word: 'In Progress', dot: 'sr-ip' },
  completed: { word: 'Completed', dot: '' },
  overdue: { word: 'Overdue', dot: 'sr-od' },
}
const GRANT_MILESTONE_ORDER: Record<string, number> = { overdue: 0, in_progress: 2, upcoming: 3, completed: 4 }

const VIRTUAL_THRESHOLD = 20 // a group longer than this scrolls in a virtualized window

/** The status cell. The default status (To Do, Upcoming) shows nothing; the
 *  caret on row hover still opens the menu, and a screen reader hears it. */
function StatusDisplay({ item }: { item: DeadlineItem }) {
  const isDefault = item.status === (item.task ? 'todo' : 'upcoming')
  if (isDefault) return <span className="sr-only">Status: {item.task ? 'To Do' : 'Upcoming'}</span>
  if (item.task) return <TaskStatusPill status={item.status} />
  const p = GRANT_MILESTONE_PILL[item.status]
  return <span className={`tk-pill ${p?.dot ?? ''}`}><i />{p?.word ?? item.status}</span>
}

function sortRank(d: DeadlineItem, key: string, projects: Map<string, DeadlineProject>): number | string | null {
  switch (key) {
    case 'due': return d.due_date.slice(0, 10)
    case 'project': return d.project ? (d.type === 'task' ? projects.get(d.project)?.name ?? d.project : d.project).toLowerCase() : null
    case 'owner': return d.assignee ? getPersonInfo(d.assignee).name.toLowerCase() : null
    case 'status': return (d.task ? STATUS_ORDER[d.status] : GRANT_MILESTONE_ORDER[d.status]) ?? 9
    default: return d.title.toLowerCase()
  }
}

/** Header sort within one group. Blank project / owner sort last both ways. */
// eslint-disable-next-line react-refresh/only-export-components -- exported for the unit test
export function sortDeadlines(items: DeadlineItem[], sort: SleekSort, projects: Map<string, DeadlineProject>): DeadlineItem[] {
  if (!sort) return items
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    const ra = sortRank(a, sort.key, projects), rb = sortRank(b, sort.key, projects)
    if (ra === null || rb === null) return ra === rb ? 0 : ra === null ? 1 : -1
    return (ra < rb ? -1 : ra > rb ? 1 : 0) * sign
  })
}

export function DeadlineList({ groups, projects, selected, toggleSelect, selectRange, anchorId, setSelected, onOpenTask, onStatusChange, onMilestoneStatusChange, onDueDateChange }: {
  groups: DeadlineGroup[]
  /** Projects by slug, short names. */
  projects: Map<string, DeadlineProject>
  selected: Set<string>
  toggleSelect: (id: string) => void
  selectRange: (targetId: string, orderedIds: string[], anchor: string | null) => void
  anchorId: string | null
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>
  onOpenTask: (task: TaskRow) => void
  onStatusChange: (id: string, newStatus: string, prevStatus: string) => void
  onMilestoneStatusChange: (id: string, newStatus: string, prevStatus: string) => void
  onDueDateChange: (id: string, newDate: string | null) => void
}) {
  const [sort, setSort] = useState<SleekSort>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(['Completed']))
  const [showAll, setShowAll] = useState<Set<string>>(() => new Set())
  const flip = (set: Set<string>, key: string) => { const n = new Set(set); if (n.has(key)) n.delete(key); else n.add(key); return n }

  // What is on screen, in order: j/k walks it and shift-click ranges over it.
  const shown = useMemo(() => groups.map((g) => {
    const items = sortDeadlines(g.items, sort, projects)
    const capped = g.limit !== undefined && items.length > g.limit
    const visible = collapsed.has(g.title) ? [] : capped && !showAll.has(g.title) ? items.slice(0, g.limit) : items
    return { title: g.title, count: items.length, capped, visible }
  }), [groups, sort, projects, collapsed, showAll])
  const flat = useMemo(() => shown.flatMap((g) => g.visible), [shown])
  const indexOf = useMemo(() => new Map(flat.map((d, i) => [d.id, i])), [flat])
  const taskIds = useMemo(() => flat.filter((d) => d.task).map((d) => d.id), [flat])
  const itemById = useMemo(() => new Map(flat.map((d) => [d.id, d])), [flat])

  // Bulk actions are task actions: a grant milestone never joins the selection.
  const toggleTask = useCallback((id: string) => { if (itemById.get(id)?.task) toggleSelect(id) }, [itemById, toggleSelect])
  const openById = useCallback((id: string | null) => { const t = id ? itemById.get(id)?.task : undefined; if (t) onOpenTask(t) }, [itemById, onOpenTask])
  const { cursor, setCursor, cursorShown } = useListKeyboard({ filtered: flat, toggleSelect: toggleTask, setDrawer: openById, setSelected })
  // No ring until j/k or a click uses the cursor (prod check 2026-10-11).
  const cursorId = cursorShown ? (flat[cursor]?.id ?? null) : null
  const selectModeActive = useSelectMode(true)

  // Touch: a long-press selects (the phone has no shift or ctrl key).
  const longPress = useLongPress((e) => {
    const id = (e.target as Element | null)?.closest?.('[data-dl-id]')?.getAttribute('data-dl-id')
    if (id) toggleTask(id)
  }, { thresholdMs: 420 })

  const columns = useMemo<SleekColumn<DeadlineItem>[]>(() => {
    const done = (d: DeadlineItem) => isDoneStatus(d.status)
    const dueCell = (d: DeadlineItem) => {
      const t = d.task
      if (!t) return done(d) ? <span className="sr-m">{formatShortDate(d.due_date)}</span> : <MilestoneDueCell due={d.due_date} isDone={false} />
      return (
        <InlineDatePicker
          value={t.due_date ?? null}
          onChange={(next) => onDueDateChange(d.id, next)}
          done={done(d)}
          display={taskHasDuePill(t) ? <TaskDueCell task={t} isDone={done(d)} /> : <span className="sr-m">{formatShortDate(d.due_date)}</span>}
        />
      )
    }
    const statusCell = (d: DeadlineItem) => (
      <InlineSelect
        value={d.status}
        options={d.task ? TASK_STATUS_OPTIONS : GRANT_MILESTONE_STATUS_OPTIONS}
        onChange={(next) => (d.task ? onStatusChange : onMilestoneStatusChange)(d.id, next, d.status)}
        display={<StatusDisplay item={d} />}
      />
    )
    return [
      {
        key: 'done', width: '28px', interactive: true, phone: 'lead',
        render: (d) => (d.task ? <TaskCheckCell task={d.task} isDone={done(d)} onToggle={() => onStatusChange(d.id, done(d) ? 'todo' : 'done', d.status)} /> : null),
      },
      {
        key: 'title', label: 'Title', width: 'minmax(0,1fr)', sortable: true, phone: 'title',
        render: (d) => (d.task ? (
          <TaskTitleCell task={d.task} isDone={done(d)} onOpen={() => onOpenTask(d.task!)} showMoved={false} hint={d.fullTitle} />
        ) : (
          <div className="sr-tt">
            <span className="sr-dia" aria-hidden="true">◆</span>
            <span className="sr-x">{d.title}</span>
            <span className="sr-only">Grant milestone</span>
          </div>
        )),
      },
      {
        key: 'project', label: 'Project', width: '168px', sortable: true, interactive: true, phone: 'line',
        render: (d) => (d.type === 'milestone' ? (
          // S12: a grant milestone's project is its grant; it links to Grants.
          <span className="tk-cs"><Link to={PATHS.grants} onClick={(e) => e.stopPropagation()} title={d.project}>{d.project}</Link></span>
        ) : (
          <CardProjectLine project={d.project ? projects.get(d.project) ?? { name: d.project, slug: d.project } : null} />
        )),
      },
      {
        key: 'due', label: 'Due', width: '116px', sortable: true, interactive: true, phone: 'line',
        render: dueCell,
      },
      {
        key: 'status', label: 'Status', width: '112px', sortable: true, interactive: true, minTableWidth: 720, phone: 'line',
        render: statusCell,
        // Phone: only a status worth reading; the default edits from the drawer.
        renderPhone: (d) => (d.status === (d.task ? 'todo' : 'upcoming') ? null : statusCell(d)),
      },
      {
        key: 'owner', label: 'Owner', width: '40px', sortable: true, phone: 'trail',
        render: (d) => (d.assignee ? <Face slug={d.assignee} /> : null),
        renderPhone: (d) => (d.assignee ? <Face slug={d.assignee} lg /> : null),
      },
    ]
  }, [projects, onOpenTask, onStatusChange, onMilestoneStatusChange, onDueDateChange])

  const onRowClick = useCallback((d: DeadlineItem, e: MouseEvent) => {
    // Shift-click ranges over the tasks on screen; ctrl/cmd-click toggles; a plain click moves the cursor.
    if (d.task && e.shiftKey) { selectRange(d.id, taskIds, anchorId); return }
    if (d.task && (e.ctrlKey || e.metaKey)) { toggleSelect(d.id); return }
    setCursor(indexOf.get(d.id) ?? 0)
  }, [selectRange, taskIds, anchorId, toggleSelect, setCursor, indexOf])

  const renderRow = (d: DeadlineItem) => {
    const isDone = isDoneStatus(d.status)
    return (
      <SleekRow
        key={d.id}
        row={d}
        data={{ 'dl-id': d.id }}
        cursor={d.id === cursorId}
        selected={selected.has(d.id)}
        urgent={d.priority === 'urgent' && !isDone}
        done={isDone}
        selectMode={selectModeActive}
        onClick={(e) => onRowClick(d, e)}
        // Stop the browser's text selection on modifier+mousedown.
        onMouseDown={(e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault() }}
        onDoubleClick={() => { if (d.task) onOpenTask(d.task) }}
      />
    )
  }

  return (
    <div {...longPress}>
      <SleekTable columns={columns} sort={sort} onSort={setSort} defaultSortLabel="By due date" className="sr-page">
        {shown.map((g) => {
          const isCollapsed = collapsed.has(g.title)
          return (
            <div key={g.title} role="rowgroup" aria-label={g.title} className="dl-group">
              <button type="button" className="sr-grp-h" aria-expanded={!isCollapsed} onClick={() => setCollapsed((s) => flip(s, g.title))}>
                <span className="sr-chev" aria-hidden="true" style={{ transform: isCollapsed ? 'rotate(-90deg)' : undefined }}>▾</span>
                <h3>{g.title}</h3>
                <span className="sr-n">{g.count}</span>
              </button>
              {!isCollapsed && <GroupRows items={g.visible} cursorId={cursorId} renderRow={renderRow} />}
              {!isCollapsed && g.capped && (
                <button type="button" className="sr-more" onClick={() => setShowAll((s) => flip(s, g.title))}>
                  {showAll.has(g.title) ? 'Show fewer' : `Show all ${g.count}`}
                </button>
              )}
            </div>
          )
        })}
      </SleekTable>
    </div>
  )
}

/** One group's rows: plain when short, a measured virtualized window when long. */
function GroupRows({ items, cursorId, renderRow }: { items: DeadlineItem[]; cursorId: string | null; renderRow: (d: DeadlineItem) => ReactNode }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const useVirtual = items.length > VIRTUAL_THRESHOLD
  // Phone rows are two lines. The estimate only seeds the first paint;
  // measureElement reads the real box of each mounted row.
  const estimate = useIsMobile() ? 56 : 40
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimate,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 5,
    enabled: useVirtual,
  })

  // Keep the cursor row in view when j/k (or a click) moves it into this
  // group. Not on first paint: the page must not jump to the first row.
  const lastCursor = useRef(cursorId)
  useEffect(() => {
    if (lastCursor.current === cursorId) return
    lastCursor.current = cursorId
    const i = cursorId ? items.findIndex((d) => d.id === cursorId) : -1
    if (i < 0) return
    if (useVirtual) virtualizer.scrollToIndex(i, { align: 'auto' })
    else parentRef.current?.querySelector(`[data-dl-id="${CSS.escape(cursorId!)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursorId, items, useVirtual, virtualizer])

  if (!useVirtual) return <div ref={parentRef}>{items.map(renderRow)}</div>
  const windowHeight = Math.min(items.length * estimate, 440)
  return (
    <div ref={parentRef} style={{ height: windowHeight, overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((v) => (
          <div
            key={items[v.index].id}
            data-index={v.index}
            ref={virtualizer.measureElement}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }}
          >
            {renderRow(items[v.index])}
          </div>
        ))}
      </div>
    </div>
  )
}
