// TableView — the power-mode table (it was the List view until the Today card
// landed on List, 2026-10-09). j/k cursor nav, e/Enter open the right-side
// drawer, x/Space toggle select, Esc clears. Drawer instead of inline expand
// because j/k navigation can't push rows down without disorienting the user
// (CD spec / CLAUDE.md Rule 60). Click Title / Project / Due / Priority /
// Status / Owner to sort; click again to reverse, a third time to restore the
// default (overdue-first) order.
//
// Rows are the shared sleek row (components/table/SleekRows, Nick's
// 2026-10-10 mock): one line, no gridlines, the Today card's chips, inline
// edit on Project / Due / Priority / Status / Owner (caret on hover, wired to
// useTaskFieldEditors), links + folder + Work on in fixed slots. Virtualized
// via @tanstack/react-virtual (MT-04).

import { useEffect, useLayoutEffect, useRef, useMemo, useCallback, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SleekTable, SleekRow, SleekOverdueLine, type SleekColumn, type SleekSort } from '../../../components/table/SleekRows'
import { TaskTitleCell, TaskStatusPill, TaskPriorityLabel, TaskCheckCell, TaskDueCell, taskHasDuePill } from '../../../components/tasks/taskSleekCells'
import { Face } from '../../../components/today/skin'
import { LinkRow, type TaskLink } from '../../../components/today/primitives'
import { useListKeyboard } from '../hooks/useListKeyboard'
import { useSelectMode } from '../../../hooks/useSelectMode'
import InlineSelect from '../../../components/InlineSelect'
import InlineDatePicker from '../../../components/InlineDatePicker'
import InlineAssigneePicker from '../../../components/InlineAssigneePicker'
import { useTaskFieldEditors } from '../../../hooks/useTaskFieldEditors'
import { useLabPrefs } from '../../../hooks/useLabPrefs'
import { STATUS_OPTIONS, PRIORITY_OPTIONS, STATUS_ORDER, PRIORITY_ORDER } from '../../../lib/taskConstants'
import { daysSince, isTaskDone, type FilterOption } from '../constants'
import { isOverdue } from '../../../lib/dateUtils'
import { NoTasksMatch, AllCaughtUp } from './MyTasksEmpty'
import WorkOnActions from '../../../components/WorkOnActions'
import type { TaskRow } from '../../../lib/api'
import { getPersonInfo } from '../../../data/team'
import { taskShortLabel } from '../../../lib/displayNames'
import { useProjectPairs } from '../../../hooks/useProjectPairs'
import { decodePair } from '../../../lib/projectPairs'

type Project = { name: string; slug: string; fullTitle?: string; primary_folder?: string | null }

interface TableViewProps {
  filtered: TaskRow[]
  /** True when the page has NO tasks at all (not a filter artifact). */
  isEmpty: boolean
  selected: Set<string>
  toggleSelect: (id: string) => void
  selectRange: (targetId: string, orderedIds: string[], anchor: string | null) => void
  anchorId: string | null
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>
  setDrawer: (id: string | null) => void
  projectsByPid: Map<string, Project>
  projectOptions: FilterOption[]
  plannedSet: Set<string>
}

const rowLinks = (t: TaskRow): TaskLink[] => (
  [[t.key_link_1, t.key_link_1_desc], [t.key_link_2, t.key_link_2_desc], [t.key_link_3, t.key_link_3_desc]] as const
).flatMap(([url, desc]) => (url ? [{ url, desc: desc ?? undefined }] : []))

export function TableView({ filtered: unsorted, isEmpty, selected, toggleSelect, selectRange, anchorId, setSelected, setDrawer, projectsByPid, plannedSet }: TableViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Header sort. null = the filter hook's order (overdue first within each group).
  const [sort, setSort] = useState<SleekSort>(null)
  const filtered = useMemo(() => {
    if (!sort) return unsorted
    const sign = sort.dir === 'asc' ? 1 : -1
    // null = blank owner / project / date: always last, in both directions.
    const rank = (t: TaskRow): number | string | null => {
      switch (sort.key) {
        case 'priority': return PRIORITY_ORDER[t.priority] ?? 9
        case 'status': return STATUS_ORDER[t.status] ?? 9
        case 'owner': return t.assignee ? getPersonInfo(t.assignee).name.toLowerCase() : null
        case 'due': return t.due_date ? t.due_date.slice(0, 10) : null
        case 'project': return t.project_id ? (projectsByPid.get(t.project_id)?.name ?? t.project_id).toLowerCase() : null
        default: return taskShortLabel(t).toLowerCase()
      }
    }
    return [...unsorted].sort((a, b) => {
      const ra = rank(a), rb = rank(b)
      if (ra === null || rb === null) return ra === rb ? 0 : ra === null ? 1 : -1
      return (ra < rb ? -1 : ra > rb ? 1 : 0) * sign
    })
  }, [unsorted, sort, projectsByPid])

  // cursorShown: the ring shows only after j/k or a click moved the cursor (prod check 2026-10-11).
  const { cursor, setCursor, cursorShown } = useListKeyboard({ filtered, toggleSelect, setDrawer, setSelected })

  // Phase G: Ctrl/Meta held → cursor:cell affordance on rows.
  const selectModeActive = useSelectMode(true)

  // Stable ordered id array for range-select (mirrors filtered order).
  const filteredIds = useMemo(() => filtered.map(t => t.id), [filtered])

  // P2-3: the five common-field handlers come from the shared useTaskFieldEditors
  // hook — one optimistic + undo implementation across task surfaces.
  const { onStatusChange, onPriorityChange, onAssigneeChange, onDateChange, onProjectChange } = useTaskFieldEditors()
  // P2-9: one shared staleness threshold (days-since-meaningful-movement).
  const { prefs } = useLabPrefs()

  // MT-04 — virtualize. 40px rows; the phone layout is taller (two lines), so
  // every row is measured.
  // The rows start below the page padding, the overdue line and the sticky column
  // header, all inside the same scroller. The virtualizer has to know both: the
  // list's offset (scrollMargin) so "scroll to the bottom row" lands on the
  // scroller's real bottom, and the sticky header's height (scrollPaddingStart) so
  // k never parks the cursor row under it.
  const listRef = useRef<HTMLDivElement>(null)
  const [lead, setLead] = useState({ margin: 0, head: 0 })
  useLayoutEffect(() => {
    const sc = scrollRef.current
    const list = listRef.current
    if (!sc || !list) return
    const measure = () => {
      const margin = Math.round(list.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop)
      const hd = sc.querySelector<HTMLElement>('.sr-hd')
      const head = hd ? Math.round(hd.offsetHeight + (parseFloat(getComputedStyle(hd).marginBottom) || 0)) : 0
      setLead((p) => (p.margin === margin && p.head === head ? p : { margin, head }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(list)
    if (sc.firstElementChild) ro.observe(sc.firstElementChild)
    return () => ro.disconnect()
  }, [filtered.length])

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 12,
    scrollMargin: lead.margin,
    scrollPaddingStart: lead.head,
  })

  // Scroll cursor into view across virtualized list.
  useEffect(() => {
    if (!cursorShown || cursor < 0 || cursor >= filtered.length) return
    virtualizer.scrollToIndex(cursor, { align: 'auto', behavior: 'auto' })
  }, [cursorShown, cursor, filtered.length, virtualizer])

  // Project ~ Product pairs (Nick, 2026-10-12): one option per product for a
  // project with 2+ products. projectOptions (the filter list) still feeds the TopBar.
  const pairs = useProjectPairs()

  const priorityOptions = useMemo(() => PRIORITY_OPTIONS.map(p => ({ value: p.value, label: p.label })), [])
  const statusOptions = useMemo(() => STATUS_OPTIONS.map(s => ({ value: s.value, label: s.label })), [])

  const overdueCount = filtered.filter((t) => !isTaskDone(t) && t.due_date && isOverdue(t.due_date, t.status)).length

  const columns = useMemo<SleekColumn<TaskRow>[]>(() => {
    const projectOf = (t: TaskRow) => (t.project_id ? projectsByPid.get(t.project_id) ?? null : null)
    const nameOf = (t: TaskRow) => pairs.labelFor(projectOf(t)?.name ?? 'No project', t.project_id, t.product_id)
    const stale = (t: TaskRow) => (t.updated_at && t.status === 'in_progress' && daysSince(t.updated_at) >= prefs.taskStaleDays ? daysSince(t.updated_at) : 0)
    return [
      {
        key: 'done', width: '28px', interactive: true, phone: 'lead',
        // Completion on the side: the square is COMPLETE (Rule 68). Selection
        // stays on x / shift-click; undo comes from the shared status toast.
        render: (t) => <TaskCheckCell task={t} isDone={isTaskDone(t)} onToggle={() => onStatusChange(t.id, t.status, isTaskDone(t) ? 'todo' : 'done')} />,
      },
      {
        key: 'title', label: 'Title', width: 'minmax(0,1fr)', sortable: true, phone: 'title',
        render: (t) => (
          <TaskTitleCell
            task={t}
            isDone={isTaskDone(t)}
            onOpen={() => setDrawer(t.id)}
            planned={plannedSet.has(t.id)}
            staleDays={stale(t)}
          />
        ),
      },
      {
        key: 'project', label: 'Project', width: '168px', sortable: true, interactive: true, phone: 'line',
        render: (t) => (
          <InlineSelect
            value={pairs.valueFor(t.project_id, t.product_id)}
            options={[{ value: '', label: 'No project' }, ...pairs.optionsWith(pairs.valueFor(t.project_id, t.product_id)).map(o => ({ value: o.value, label: o.label }))]}
            onChange={(next) => { const d = decodePair(next); onProjectChange(t.id, t.project_id, d.project_id ?? '', d.product_id, t.product_id ?? null) }}
            display={<span className="tk-cs" title={projectOf(t)?.fullTitle}>{nameOf(t)}</span>}
          />
        ),
        renderPhone: (t) => <span className="tk-cs">{nameOf(t)}</span>,
      },
      {
        key: 'due', label: 'Due', width: '116px', sortable: true, interactive: true, phone: 'line',
        render: (t) => (
          <InlineDatePicker
            value={t.due_date ?? null}
            onChange={(next) => onDateChange(t.id, t.due_date, next)}
            done={isTaskDone(t)}
            display={taskHasDuePill(t) ? <TaskDueCell task={t} isDone={isTaskDone(t)} /> : <span className="sr-m">{t.due_date ? t.due_date.slice(0, 10) : '—'}</span>}
          />
        ),
        // Phone: the same editor behind the plain pill (the mock's look); no pill, no editor.
        renderPhone: (t) => (taskHasDuePill(t) ? (
          <InlineDatePicker
            value={t.due_date ?? null}
            onChange={(next) => onDateChange(t.id, t.due_date, next)}
            done={isTaskDone(t)}
            display={<TaskDueCell task={t} isDone={isTaskDone(t)} />}
          />
        ) : null),
      },
      {
        key: 'priority', label: 'Priority', width: '84px', sortable: true, interactive: true, minTableWidth: 820, phone: 'line',
        render: (t) => (
          <InlineSelect
            value={t.priority}
            options={priorityOptions}
            onChange={(next) => onPriorityChange(t.id, t.priority, next)}
            display={<TaskPriorityLabel priority={t.priority} done={isTaskDone(t)} />}
          />
        ),
        renderPhone: (t) => (t.priority === 'urgent' && !isTaskDone(t) ? <TaskPriorityLabel priority="urgent" /> : null),
      },
      {
        key: 'status', label: 'Status', width: '112px', sortable: true, interactive: true,
        render: (t) => (
          <InlineSelect
            value={t.status}
            options={statusOptions}
            onChange={(next) => onStatusChange(t.id, t.status, next)}
            display={<TaskStatusPill status={t.status} />}
          />
        ),
      },
      {
        key: 'owner', label: 'Owner', width: '40px', sortable: true, interactive: true, minTableWidth: 960, phone: 'trail',
        render: (t) => (
          <InlineAssigneePicker
            value={t.assignee}
            onChange={(next) => onAssigneeChange(t.id, t.assignee, next)}
            display={t.assignee ? <Face slug={t.assignee} /> : <span className="sr-m">—</span>}
          />
        ),
        renderPhone: (t) => (t.assignee ? <Face slug={t.assignee} lg /> : null),
      },
      {
        key: 'links', label: 'Links', width: '120px', align: 'end', interactive: true, minTableWidth: 960,
        // Fixed slots (rules-ui-design 14): links keep their place; folder and
        // Work on fade in on hover or on the j/k row, and keep their space.
        render: (t) => {
          const project = projectOf(t)
          const links = rowLinks(t)
          return (
            <span className="sr-slots">
              <span className="sr-lks">{links.length > 0 && <LinkRow links={links} slot />}</span>
              <span className="sr-wk sr-hv">
                {project?.primary_folder && <WorkOnActions primaryFolder={project.primary_folder} projectLabel={project.name} variant="slot" />}
              </span>
            </span>
          )
        },
      },
    ]
  }, [projectsByPid, prefs.taskStaleDays, plannedSet, setDrawer, pairs, priorityOptions, statusOptions, onStatusChange, onProjectChange, onDateChange, onPriorityChange, onAssigneeChange])

  const onRowClick = useCallback((index: number, id: string, e: React.MouseEvent) => {
    // Shift-click → range-select; Ctrl/Meta-click → toggle. Plain click → cursor.
    if (e.shiftKey) { selectRange(id, filteredIds, anchorId); return }
    if (e.ctrlKey || e.metaKey) { toggleSelect(id); return }
    setCursor(index)
  }, [selectRange, filteredIds, anchorId, toggleSelect, setCursor])

  return (
    // Bug #70: the table fills .mt-band, which stops at --page-width (Today's
    // main + rail, principle 17), so its edges match Today and the other pages.
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div ref={scrollRef} className="fab-clear" style={{ flex: 1, overflow: 'auto' }}>
       <div className="mt-band" style={{ paddingTop: 12 }}>
        <SleekOverdueLine count={overdueCount} />
        <SleekTable columns={columns} sort={sort} onSort={setSort} defaultSortLabel="Overdue first">
          {filtered.length === 0 && (isEmpty ? <AllCaughtUp /> : <NoTasksMatch />)}
          {filtered.length > 0 && (
            <div ref={listRef} style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
              {virtualizer.getVirtualItems().map((row) => {
                const t = filtered[row.index]
                return (
                  <div
                    key={t.id}
                    data-index={row.index}
                    ref={virtualizer.measureElement}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start - lead.margin}px)` }}
                  >
                    <SleekRow
                      row={t}
                      className="list-view-row"
                      data={{ 'task-id': t.id }}
                      cursor={cursorShown && row.index === cursor}
                      selected={selected.has(t.id)}
                      urgent={t.priority === 'urgent' && !isTaskDone(t)}
                      done={isTaskDone(t)}
                      selectMode={selectModeActive}
                      onClick={(e) => onRowClick(row.index, t.id, e)}
                      // Stop the browser's text selection on modifier+mousedown.
                      onMouseDown={(e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault() }}
                      onDoubleClick={() => setDrawer(t.id)}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </SleekTable>
       </div>
      </div>
      {/* Keyboard-only footer (j/k cursor, keys): hidden below sm, where no
          keyboard drives it (as on Deadlines; overnight 2026-10-14 audit, G2-10). */}
      <div className="hidden sm:block" style={{ flexShrink: 0, boxShadow: '0 -1px 0 var(--sk-line)' }}>
       <div className="mt-band sr-foot" style={{ paddingTop: 6, paddingBottom: 6 }}>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{filtered.length > 0 ? `${cursor + 1} / ${filtered.length}` : '0 / 0'}</span>
        <span style={{ flex: 1 }} />
        <span><kbd>j</kbd> <kbd>k</kbd> move</span>
        <span><kbd>x</kbd> or ⇧click select</span>
        <span><kbd>e</kbd> <kbd>⏎</kbd> open</span>
        <span><kbd>esc</kbd> clear</span>
       </div>
      </div>
    </div>
  )
}
