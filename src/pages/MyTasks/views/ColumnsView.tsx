// ColumnsView — Kanban renderer. All 5 task groups side-by-side, horizontal
// scroll on small viewports w/ visible thin scrollbar + right-edge fade.
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
  // F39: show the right-edge fade whenever the grid really overflows, not at a
  // fixed viewport breakpoint (at 1680px the 5 columns still overflow the band).
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  // The cue is a sibling overlay, not a ::after inside the scroller: a float after
  // the grid lands below it and never reaches the right edge. It hides once the
  // scroller reaches its right end, and its button pages one column right.
  const [moreRight, setMoreRight] = useState(false)
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const measure = () => setMoreRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    el.addEventListener('scroll', measure, { passive: true })
    return () => { ro.disconnect(); el.removeEventListener('scroll', measure) }
  }, [colCount, filtered.length])

  const selectionActive = selectModeActive || selected.size > 0
  // 2026-06-10b: align the grid's intrinsic floor to the column minmax floor
  // (260px) instead of 280px. Inside .band-anchored-wide the grid fills the
  // fluid width and only overflows (h-scroll) when colCount*260 + gaps exceeds
  // the available viewport — so the floor must match the minmax(260px,...) below
  // or the grid would force a scroll a touch early.
  const minWidth = colCount * 236
  // Mobile scroll cue — right-edge fade gradient + visible thin scrollbar so
  // users discover the 5 columns scroll horizontally on small viewports
  // (eval Issue 5).
  return (
    // 2026-06-10b (Nick): Columns is WIDE multi-column content, so it uses
    // .band-anchored-wide — left edge anchored identical to the toolbar + data
    // pages, right edge FLUID to the viewport (minus standard right padding).
    // The kanban grid grows rightward to fit; it only h-scrolls when the columns
    // exceed the available viewport width (not when they exceed an arbitrary
    // 960px box). Dropped the maxWidth:--col-main cap that previously crammed
    // 4-5 columns into 960px and forced a horizontal scroll inside the band.
    <div className="band-anchored-wide" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
    <div
      ref={scrollerRef}
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
      <OverdueBanner tasks={filtered} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, minmax(236px, 1fr))`, gap: 14, minWidth }}>
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
    {moreRight && (
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 64, pointerEvents: 'none', zIndex: 3, background: `linear-gradient(to right, transparent, ${PAGE_BG} 85%)`, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingTop: 44 }}>
        <button
          type="button"
          aria-label="Scroll columns right"
          title="More columns to the right"
          onClick={() => scrollerRef.current?.scrollBy({ left: 260, behavior: 'smooth' })}
          style={{ pointerEvents: 'auto', width: 28, height: 28, marginRight: 4, borderRadius: '50%', border: '1px solid var(--border-strong)', background: PAGE_BG, color: INK_MUTED, cursor: 'pointer', fontSize: 16, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ›
        </button>
      </div>
    )}
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
