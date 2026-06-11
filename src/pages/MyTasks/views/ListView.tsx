// ListView — power-mode dense table renderer. j/k cursor nav, e/Enter open
// right-side drawer, x/Space toggle select. Drawer instead of inline expand
// because j/k navigation in a dense table can't push rows down without
// disorienting the user (CD spec / CLAUDE.md Rule 60).
//
// Inline editing (MT-05) on Status / Priority / Due / Owner / Project — wired
// to useUpdateTask. Virtualized via @tanstack/react-virtual (MT-04) so 600+
// task accounts don't paint every row up-front. Owner column resolves slug
// → name + Avatar via getPersonInfo (MT-19).

import { useEffect, useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { DoneBox } from '../../../components/tasks/TaskRow'
import { LinksBar } from '../primitives'
import { useListKeyboard } from '../hooks/useListKeyboard'
import InlineSelect from '../../../components/InlineSelect'
import InlineDatePicker from '../../../components/InlineDatePicker'
import InlineAssigneePicker from '../../../components/InlineAssigneePicker'
import { useTaskFieldEditors } from '../../../hooks/useTaskFieldEditors'
import { useLabPrefs } from '../../../hooks/useLabPrefs'
import { STATUS_OPTIONS, PRIORITY_OPTIONS } from '../../../lib/taskConstants'
import {
  GROUP_META,
  ACCENT_GOLD, ACCENT_ORANGE, ACCENT_CORAL, ACCENT_TEAL,
  INK, INK_MUTED, INK_DIM, PAGE_BG,
  daysSince, withAlpha, isTaskDone,
  type GroupKey, type FilterOption,
} from '../constants'
import { isOverdue } from '../../../lib/dateUtils'
import { OverdueBanner } from './OverdueBanner'
import { NoTasksMatch } from './MyTasksEmpty'
import type { TaskRow } from '../../../lib/api'

interface ListViewProps {
  filtered: TaskRow[]
  selected: Set<string>
  toggleSelect: (id: string) => void
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>
  setDrawer: (id: string | null) => void
  projectsByPid: Map<string, { name: string; slug: string }>
  projectOptions: FilterOption[]
  plannedSet: Set<string>
}

export function ListView({ filtered, selected, toggleSelect, setSelected, setDrawer, projectsByPid, projectOptions, plannedSet }: ListViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { cursor, setCursor } = useListKeyboard({ filtered, toggleSelect, setDrawer, setSelected })

  // P2-3: the five common-field handlers (status/priority/assignee/due/project)
  // come from the shared useTaskFieldEditors hook — one optimistic + undo
  // implementation across ListView, Deadlines and any future task surface. The
  // power-grid's keyboard model + inline-edit columns are untouched (Rule 60);
  // only the duplicated mutation+undo bodies were lifted out.
  const { onStatusChange, onPriorityChange, onAssigneeChange, onDateChange, onProjectChange } = useTaskFieldEditors()
  // P2-9: one shared staleness threshold (days-since-meaningful-movement).
  const { prefs } = useLabPrefs()

  // MT-04 — virtualize. 44px row + 1px border ≈ 45. Use measureElement for
  // any future expanded-state without changing this default.
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 45,
    overscan: 12,
  })

  // Scroll cursor into view across virtualized list.
  useEffect(() => {
    if (cursor < 0 || cursor >= filtered.length) return
    virtualizer.scrollToIndex(cursor, { align: 'auto', behavior: 'auto' })
  }, [cursor, filtered.length, virtualizer])

  // Project options for the inline select — include "—" / clear option.
  const projectSelectOptions = useMemo<{ value: string; label: string }[]>(() => (
    [{ value: '', label: '—' }, ...projectOptions
      .filter((o): o is { v: string; l: string } => o.v !== null)
      .map(o => ({ value: o.v, label: o.l }))]
  ), [projectOptions])

  const kbdStyle = { fontFamily: 'var(--font-mono), JetBrains Mono, monospace', fontSize: 9, padding: '1px 4px', background: 'rgba(255,255,255,0.08)', borderRadius: 2, color: INK_MUTED }

  return (
    // Bug #70 (Nick 2026-06-11): the List grid was capped at --col-main (960px),
    // leaving the 1fr Title column ~250px at 1920. Now .band-anchored-wide —
    // left edge anchored identical to the toolbar + data pages, right edge
    // FLUID to the viewport (same treatment as the Columns view / Projects
    // Pipeline) — so the Title column absorbs the extra width. FULL width, no
    // cap (Nick follow-up: "same full width of hub").
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto' }}>
       <div className="band-anchored-wide">
        <div>
        <div style={{ padding: '10px 16px 0' }}><OverdueBanner tasks={filtered} /></div>
        <div className="list-view-header" style={{ display: 'grid', gridTemplateColumns: '32px 26px 1fr 150px 100px 80px 110px 110px 70px', padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: INK_DIM, position: 'sticky', top: 0, background: PAGE_BG, zIndex: 1 }}>
          <div className="list-view-col-cursor"></div>
          <div className="list-view-col-done"></div>
          <div>Title</div>
          <div className="list-view-col-project">Project</div>
          <div className="list-view-col-due">Due</div>
          <div className="list-view-col-priority">P</div>
          <div className="list-view-col-status">Status</div>
          <div className="list-view-col-owner">Owner</div>
          <div className="list-view-col-links" style={{ textAlign: 'right' }}>Links</div>
        </div>
        {filtered.length === 0 && <NoTasksMatch />}
        {filtered.length > 0 && (
          <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map((row) => {
              const t = filtered[row.index]
              return (
                <div
                  key={t.id}
                  style={{
                    position: 'absolute',
                    top: 0, left: 0,
                    width: '100%',
                    transform: `translateY(${row.start}px)`,
                  }}
                >
                  <ListRow
                    task={t}
                    project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                    isCursor={row.index === cursor}
                    isSelected={selected.has(t.id)}
                    onClick={() => setCursor(row.index)}
                    onDouble={() => setDrawer(t.id)}
                    onSelect={() => toggleSelect(t.id)}
                    planned={plannedSet.has(t.id)}
                    onStatusChange={(next) => onStatusChange(t.id, t.status, next)}
                    onPriorityChange={(next) => onPriorityChange(t.id, t.priority, next)}
                    onAssigneeChange={(next) => onAssigneeChange(t.id, t.assignee, next)}
                    onDateChange={(next) => onDateChange(t.id, t.due_date, next)}
                    onProjectChange={(next) => onProjectChange(t.id, t.project_id, next)}
                    projectSelectOptions={projectSelectOptions}
                    staleDays={prefs.taskStaleDays}
                  />
                </div>
              )
            })}
          </div>
        )}
        </div>
       </div>
      </div>
      {/* P1-1: full-width footer border; hints share the table's anchored band
          (Bug #70: matches the widened grid, not the old centered band). */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)', flexShrink: 0 }}>
       <div className="band-anchored-wide" style={{ paddingTop: 5, paddingBottom: 5, fontSize: 10, color: INK_DIM, display: 'flex', gap: 14 }}>
        <span style={{ fontFamily: 'var(--font-mono), JetBrains Mono, monospace' }}>{filtered.length > 0 ? `${cursor + 1}/${filtered.length}` : '0/0'}</span>
        <span style={{ flex: 1 }} />
        <span><kbd style={kbdStyle}>j</kbd>/<kbd style={kbdStyle}>k</kbd> move</span>
        <span><kbd style={kbdStyle}>x</kbd>/⇧click select</span>
        <span><kbd style={kbdStyle}>e</kbd>/<kbd style={kbdStyle}>⏎</kbd> drawer</span>
        <span><kbd style={kbdStyle}>esc</kbd> deselect</span>
       </div>
      </div>
    </div>
  )
}

interface ListRowProps {
  task: TaskRow
  project: { name: string; slug: string } | null
  isCursor: boolean
  isSelected: boolean
  onClick: () => void
  onDouble: () => void
  onSelect: () => void
  planned: boolean
  onStatusChange: (val: string) => void
  onPriorityChange: (val: string) => void
  onAssigneeChange: (slug: string) => void
  onDateChange: (val: string | null) => void
  onProjectChange: (val: string) => void
  projectSelectOptions: { value: string; label: string }[]
  staleDays: number
}

function ListRow({ task, project, isCursor, isSelected, onClick, onDouble, onSelect, planned, onStatusChange, onPriorityChange, onAssigneeChange, onDateChange, onProjectChange, projectSelectOptions, staleDays }: ListRowProps) {
  const meta = GROUP_META[(task as TaskRow & { _group?: GroupKey })._group ?? 'deep']
  // Rule 68: status-aware isOverdue(), never a hand-rolled date compare.
  const overdue = !!task.due_date && !isTaskDone(task) && isOverdue(task.due_date, task.status)
  const overdueDays = overdue && task.due_date ? daysSince(task.due_date) : 0
  const stale = task.updated_at && daysSince(task.updated_at) >= staleDays && task.status === 'in_progress' ? daysSince(task.updated_at) : 0
  const isCompleted = isTaskDone(task)

  // Stop click-bubbling on inline-edit cells so clicking them doesn't move
  // the cursor / open the drawer. Each cell wraps with this guard.
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div
      className="list-view-row"
      // Shift-click selects (matches the shared TaskRow contract) now that the
      // always-visible checkbox is gone; plain click still moves the cursor.
      onClick={(e) => { if (e.shiftKey) { onSelect(); return } onClick() }}
      onDoubleClick={onDouble}
      style={{ display: 'grid', gridTemplateColumns: '32px 26px 1fr 150px 100px 80px 110px 110px 70px', padding: '5px 16px', alignItems: 'center', fontSize: 12, height: 44, borderBottom: '1px solid rgba(255,255,255,0.04)', borderLeft: `3px solid ${isCursor ? meta.color : planned ? ACCENT_GOLD : overdue ? ACCENT_CORAL : 'transparent'}`, background: isCursor ? withAlpha(meta.color, 7) : isSelected ? 'rgba(201,168,76,0.06)' : 'transparent', cursor: 'pointer', boxSizing: 'border-box' }}
    >
      <div className="list-view-col-cursor" style={{ color: meta.color, fontSize: 10, fontWeight: 700, textAlign: 'center' }}>{isCursor ? '▶' : ''}</div>
      {/* Bug #70 (Nick 2026-06-11): completion on the side — the canonical
          DoneBox (square = complete, Rule 68) replaces the always-visible
          multiselect checkbox. Selection stays reachable via x / shift-click;
          undo comes from the shared onStatusChange toast. */}
      <div className="list-view-col-done" onClick={stop}>
        <DoneBox done={isCompleted} onToggle={() => onStatusChange(isCompleted ? 'todo' : 'done')} />
      </div>
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isCompleted ? INK_DIM : INK, textDecoration: isCompleted ? 'line-through' : 'none', fontWeight: 500, paddingRight: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color + '80', flexShrink: 0 }} />
        <span style={{ fontSize: 11, flexShrink: 0 }} aria-hidden="true">{(task as TaskRow & { _tag?: string })._tag ?? '📝'}</span>
        {/* Title-click opens the full editor (Nick 2026-06-10) — single click,
            not just the double-click/e/⏎ paths. stop() keeps the cursor-move
            row click from also firing. */}
        <span
          title={task.title}
          onClick={(e) => { e.stopPropagation(); onDouble() }}
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
        >{task.title}</span>
        {task.group_override && <span title={`Moved manually (${task.group_override})`} style={{ fontSize: 10, color: ACCENT_TEAL, flexShrink: 0 }}>📍</span>}
        {planned && <span style={{ fontSize: 9, color: ACCENT_GOLD, fontWeight: 700, letterSpacing: '0.1em' }}>PLANNED</span>}
        {overdueDays > 0 && <span style={{ fontSize: 9, color: ACCENT_CORAL, fontWeight: 700 }}>{overdueDays}d LATE</span>}
        {stale > 0 && <span style={{ fontSize: 9, color: ACCENT_ORANGE }}>{stale}d stale</span>}
      </div>
      {/* Project — inline editable */}
      <div className="list-view-col-project" onClick={stop} style={{ overflow: 'hidden' }}>
        <InlineSelect
          value={task.project_id ?? ''}
          options={projectSelectOptions}
          onChange={onProjectChange}
        />
      </div>
      {/* Due — inline date picker */}
      <div className="list-view-col-due" onClick={stop}>
        <InlineDatePicker value={task.due_date ?? null} onChange={onDateChange} />
      </div>
      {/* Priority — inline */}
      <div className="list-view-col-priority" onClick={stop}>
        <InlineSelect
          value={task.priority}
          options={PRIORITY_OPTIONS.map(p => ({ value: p.value, label: p.label, color: p.color }))}
          onChange={onPriorityChange}
        />
      </div>
      {/* Status — inline */}
      <div className="list-view-col-status" onClick={stop}>
        <InlineSelect
          value={task.status}
          options={STATUS_OPTIONS.map(s => ({ value: s.value, label: s.label, color: s.color }))}
          onChange={onStatusChange}
        />
      </div>
      {/* Owner — inline assignee picker w/ Avatar (MT-19, drops raw slug) */}
      <div className="list-view-col-owner" onClick={stop} style={{ overflow: 'hidden' }}>
        <InlineAssigneePicker value={task.assignee} onChange={onAssigneeChange} compact />
      </div>
      <div className="list-view-col-links" style={{ textAlign: 'right' }} onClick={stop}><LinksBar task={task} /></div>
    </div>
  )
}
