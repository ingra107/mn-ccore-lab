// ColumnsView — Kanban renderer. All 5 task groups side-by-side. Runs full
// width (the one Tasks view past --page-width), so all five fit at 1440+; below
// that the grid scrolls sideways with a thin scrollbar and an in-flow pager row.
//
// Rows now use the shared <TaskRow> (src/components/tasks/TaskRow.tsx) in
// `stack` mode (narrow column → title gets full width, meta stacks beneath it
// per handoff rule #5). Square = complete; shift-click / long-press = select
// (the old persistent select-checkbox is gone, handoff §0 rule 2-3); body
// click = inline expand within the column. Surface-specific chips (waiting /
// stale) ride in via `extraMeta`; the InlineDetail action panel is the
// expanded `children`.
//
// Extracted from src/pages/portal/UnifiedMyTasks.tsx (ColumnsView + Card).

import { useEffect, useRef, useState } from 'react'
import { TaskRow as SharedTaskRow } from '../../../components/tasks/TaskRow'
import { useLabPrefs } from '../../../hooks/useLabPrefs'
import { useDensity } from '../../../components/DensityToggle'
import { useSelectMode } from '../../../hooks/useSelectMode'
import { Chip } from '../primitives'
import { InlineDetail } from '../components/InlineDetail'
import { MilestoneDrawer } from '../../../components/today/MilestoneDrawer'
import { OverdueBanner } from './OverdueBanner'
import { NoTasksMatch, AllCaughtUp, LaneEmpty } from './MyTasksEmpty'
import {
  GROUP_META, GROUP_ORDER,
  ACCENT_ORANGE,
  INK_DIM, INK_MUTED, PAGE_BG,
  daysSince, isTaskDone,
  type GroupKey,
} from '../constants'
import type { TaskRow } from '../../../lib/api'
import { isMilestone } from '../../../../shared/taskKinds'

// Column floor and gap (px). See minWidth below for why 190.
const COL_MIN = 190
const COL_GAP = 14

export function ColumnsView({ filtered, isEmpty, byGroup, selected, toggleSelect, selectRange, anchorId, onToggleComplete, onOpenEditor, expanded, setExpanded, projectsByPid, plannedSet, filterGroup }: { filtered: TaskRow[]; isEmpty: boolean; byGroup: Record<GroupKey, TaskRow[]>; selected: Set<string>; toggleSelect: (id: string) => void; selectRange: (targetId: string, orderedIds: string[], anchor: string | null) => void; anchorId: string | null; onToggleComplete: (task: TaskRow) => void; onOpenEditor: (id: string) => void; expanded: string | null; setExpanded: (id: string | null) => void; projectsByPid: Map<string, { name: string; slug: string; primary_folder?: string | null }>; plannedSet: Set<string>; filterGroup?: GroupKey | null }) {
  // MT-16 — when a Group filter is active, only render the matching column
  // (others would just be "nothing here" empty lanes that eat horizontal
  // space and obscure the filter result).
  const visibleGroups = filterGroup ? GROUP_ORDER.filter(g => g === filterGroup) : GROUP_ORDER
  const colCount = visibleGroups.length

  // Phase G: Ctrl/Meta held → select-mode affordance on rows.
  const selectModeActive = useSelectMode(true)

  // Track the last pointer-event modifiers in a capture-phase ref so that
  // onSelect (called by SharedTaskRow with no event arg) can read them.
  const lastModifiers = useRef({ shift: false, ctrlMeta: false })
  // Overflow is measured, not guessed from a breakpoint: the pager row below
  // exists only while the grid is really wider than its scroller.
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [edge, setEdge] = useState({ left: false, right: false })
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const measure = () => {
      const left = el.scrollLeft > 4
      const right = el.scrollWidth - el.clientWidth - el.scrollLeft > 4
      setEdge((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    el.addEventListener('scroll', measure, { passive: true })
    return () => { ro.disconnect(); el.removeEventListener('scroll', measure) }
  }, [colCount, filtered.length])
  const overflowing = edge.left || edge.right

  const selectionActive = selectModeActive || selected.size > 0
  // One column floor, used by both the grid template and its minWidth. 5 x 190
  // + 4 gaps = 1006px, which fits the 1,034px Columns gets at a 1440 viewport,
  // so all five columns show there with no scroll (Nick 2026-10-10, "Columns
  // may go full width"). Below that the grid scrolls inside its own box.
  const minWidth = colCount * COL_MIN + (colCount - 1) * COL_GAP
  const page = (dir: 1 | -1) => scrollerRef.current?.scrollBy({ left: dir * (COL_MIN + COL_GAP), behavior: 'smooth' })
  return (
    // Columns is the one Tasks view allowed past --page-width (principle 17
    // exception, Nick 2026-10-10): .band-anchored-full keeps the shared left
    // edge of .band-anchored-wide and lifts only its right-edge cap, so the
    // toolbar's left edge does not move when switching views.
    <div className="band-anchored-wide band-anchored-full" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
    {/* When the grid still overflows (about 1280 and below), the pager sits in
        its own row above the scroller. It is in flow, so it can never cover a
        column header, the Overdue banner or a card (the old overlay button and
        right-edge fade did, 2026-10-10 evaluation section 1). */}
    {overflowing && (
      <div data-testid="columns-pager" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, paddingTop: 8 }}>
        <span style={{ fontSize: 11, color: INK_DIM, marginRight: 4 }}>More columns</span>
        {([[-1, 'left', '‹', edge.left], [1, 'right', '›', edge.right]] as const).map(([dir, name, glyph, enabled]) => (
          <button
            key={name}
            type="button"
            aria-label={`Scroll columns ${name}`}
            aria-disabled={!enabled}
            onClick={() => { if (enabled) page(dir) }}
            style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--border-strong)', background: PAGE_BG, color: INK_MUTED, cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.4, fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {glyph}
          </button>
        ))}
      </div>
    )}
    <div
      ref={scrollerRef}
      tabIndex={-1}
      className="mt-columns-scroll fab-clear"
      style={{ flex: 1, overflow: 'auto', paddingTop: 12, paddingBottom: 20, position: 'relative', width: '100%' }}
      onClickCapture={(e) => {
        lastModifiers.current = { shift: e.shiftKey, ctrlMeta: e.ctrlKey || e.metaKey }
      }}
      // Issue 2: prevent text-selection on modifier+mousedown across ALL rows
      // in the columns container. Capture phase fires before any child handler.
      onMouseDownCapture={(e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault() }}
    >
      <style>{`
        .mt-columns-scroll { scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }
        .mt-columns-scroll::-webkit-scrollbar { height: 8px; }
        .mt-columns-scroll::-webkit-scrollbar-track { background: transparent; }
        .mt-columns-scroll::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 4px; }
      `}</style>
      {/* Sticky left: the banner stays in view while the columns scroll sideways. */}
      <div style={{ position: 'sticky', left: 0 }}>
        <OverdueBanner tasks={filtered} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, minmax(${COL_MIN}px, 1fr))`, gap: COL_GAP, minWidth }}>
        {visibleGroups.map((gkey) => {
          const meta = GROUP_META[gkey]
          const tasks = byGroup[gkey]
          const incomplete = tasks.filter((t) => !isTaskDone(t)).length
          return (
            <div key={gkey} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px 8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 8, position: 'sticky', top: 0, background: PAGE_BG, zIndex: 1 }}>
                <h3 style={{ fontSize: 13, fontWeight: 500, color: INK_MUTED, margin: 0 }}>{meta.label}</h3>
                <span style={{ fontSize: 11, color: INK_DIM, marginLeft: 'auto' }}>
                  {incomplete}{tasks.length > incomplete && <span> · {tasks.length - incomplete}✓</span>}
                </span>
              </div>
              <div style={{ overflow: 'hidden' }}>
                {tasks.length === 0 && <LaneEmpty compact />}
                {tasks.map((t) => (
                  <MyTasksRow
                    key={t.id}
                    task={t}
                    project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                    selected={selected.has(t.id)}
                    selectionActive={selectionActive}
                    onSelect={() => {
                      if (lastModifiers.current.shift) {
                        // Range-select from anchor to this task in column order
                        selectRange(t.id, tasks.map(r => r.id), anchorId)
                      } else {
                        toggleSelect(t.id)
                      }
                    }}
                    onToggleComplete={onToggleComplete}
                    onOpenEditor={() => onOpenEditor(t.id)}
                    expanded={expanded === t.id}
                    onExpand={() => setExpanded(expanded === t.id ? null : t.id)}
                    planned={plannedSet.has(t.id)}
                    stack
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {filtered.length === 0 && (isEmpty ? <AllCaughtUp /> : <NoTasksMatch />)}
    </div>
    </div>
  )
}

// Surface-specific chips (waiting / stale) that aren't part of the canonical
// row meta. planned / due / project / override-pin are all handled by the
// shared row itself.
function rowExtraMeta(task: TaskRow, staleDays: number) {
  const stale = task.updated_at && daysSince(task.updated_at) >= staleDays && task.status === 'in_progress' ? daysSince(task.updated_at) : 0
  if (task.status !== 'waiting_external' && stale <= 0) return null
  return (
    <>
      {task.status === 'waiting_external' && <Chip color={ACCENT_ORANGE} filled>⏳ waiting</Chip>}
      {stale > 0 && <Chip color={ACCENT_ORANGE}>{stale}d stale</Chip>}
    </>
  )
}

export function MyTasksRow({ task, project, selected, selectionActive, onSelect, onToggleComplete, onOpenEditor, expanded, onExpand, planned, stack }: { task: TaskRow; project: { name: string; slug: string; primary_folder?: string | null } | null; selected: boolean; selectionActive: boolean; onSelect: () => void; onToggleComplete: (t: TaskRow) => void; onOpenEditor?: () => void; expanded: boolean; onExpand: () => void; planned: boolean; stack?: boolean }) {
  const isDone = isTaskDone(task)
  const { prefs } = useLabPrefs()
  const [density] = useDensity()
  return (
    <SharedTaskRow
      task={task}
      project={project}
      dense={density === 'compact'}
      stack={stack}
      isDone={isDone}
      onToggleDone={() => onToggleComplete(task)}
      onOpenEditor={onOpenEditor}
      isExpanded={expanded}
      onToggleExpand={onExpand}
      isSelected={selected}
      selectionActive={selectionActive}
      onToggleSelect={onSelect}
      isPlanned={planned}
      plannedLabel="today"
      showGroupOverridePin
      leadingTag={isMilestone(task) ? undefined : ((task as TaskRow & { _tag?: string })._tag ?? undefined)}
      extraMeta={rowExtraMeta(task, prefs.taskStaleDays)}
    >
      {isMilestone(task) ? (
        // Same drawer Today uses (Nick 2026-09-16): Mark complete, project
        // links + documents, the project's open tasks, notes.
        <MilestoneDrawer task={task} project={project} onToggleComplete={onToggleComplete} />
      ) : (
        <InlineDetail task={task} projectName={project?.name} primaryFolder={project?.primary_folder} onOpenEditor={onOpenEditor} />
      )}
    </SharedTaskRow>
  )
}
