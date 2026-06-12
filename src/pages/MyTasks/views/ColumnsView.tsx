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

import { TaskRow as SharedTaskRow } from '../../../components/tasks/TaskRow'
import { useLabPrefs } from '../../../hooks/useLabPrefs'
import { Chip } from '../primitives'
import { InlineDetail } from '../components/InlineDetail'
import { OverdueBanner } from './OverdueBanner'
import { NoTasksMatch, LaneEmpty } from './MyTasksEmpty'
import {
  GROUP_META, GROUP_ORDER,
  ACCENT_ORANGE,
  INK_DIM, PAGE_BG,
  daysSince, withAlpha, isTaskDone,
  type GroupKey,
} from '../constants'
import type { TaskRow } from '../../../lib/api'

export function ColumnsView({ filtered, byGroup, selected, toggleSelect, onToggleComplete, onOpenEditor, expanded, setExpanded, projectsByPid, plannedSet, filterGroup }: { filtered: TaskRow[]; byGroup: Record<GroupKey, TaskRow[]>; selected: Set<string>; toggleSelect: (id: string) => void; onToggleComplete: (task: TaskRow) => void; onOpenEditor: (id: string) => void; expanded: string | null; setExpanded: (id: string | null) => void; projectsByPid: Map<string, { name: string; slug: string }>; plannedSet: Set<string>; filterGroup?: GroupKey | null }) {
  // MT-16 — when a Group filter is active, only render the matching column
  // (others would just be "nothing here" empty lanes that eat horizontal
  // space and obscure the filter result).
  const visibleGroups = filterGroup ? GROUP_ORDER.filter(g => g === filterGroup) : GROUP_ORDER
  const colCount = visibleGroups.length
  // 2026-06-10b: align the grid's intrinsic floor to the column minmax floor
  // (260px) instead of 280px. Inside .band-anchored-wide the grid fills the
  // fluid width and only overflows (h-scroll) when colCount*260 + gaps exceeds
  // the available viewport — so the floor must match the minmax(260px,...) below
  // or the grid would force a scroll a touch early.
  const minWidth = colCount * 260
  const selectionActive = selected.size > 0
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
    <div className="band-anchored-wide" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
    <div className="mt-columns-scroll fab-clear" style={{ flex: 1, overflow: 'auto', paddingTop: 12, paddingBottom: 20, position: 'relative', width: '100%' }}>
      <style>{`
        .mt-columns-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent; }
        .mt-columns-scroll::-webkit-scrollbar { height: 8px; }
        .mt-columns-scroll::-webkit-scrollbar-track { background: transparent; }
        .mt-columns-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 4px; }
        @media (max-width: 1024px) {
          .mt-columns-scroll::after {
            content: '';
            position: sticky;
            top: 0; right: 0;
            float: right;
            width: 32px;
            height: 100%;
            margin-left: -32px;
            pointer-events: none;
            background: linear-gradient(to right, transparent, ${PAGE_BG} 80%);
            z-index: 2;
          }
        }
      `}</style>
      <OverdueBanner tasks={filtered} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, minmax(260px, 1fr))`, gap: 14, minWidth }}>
        {visibleGroups.map((gkey) => {
          const meta = GROUP_META[gkey]
          const tasks = byGroup[gkey]
          const incomplete = tasks.filter((t) => !isTaskDone(t)).length
          return (
            <div key={gkey} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px 8px', borderBottom: `1px solid ${withAlpha(meta.color, 15)}`, marginBottom: 8, position: 'sticky', top: 0, background: PAGE_BG, zIndex: 1 }}>
                <span style={{ fontSize: 14 }}>{meta.icon}</span>
                <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: meta.color, margin: 0 }}>{meta.label}</h3>
                <span style={{ fontSize: 11, color: INK_DIM, marginLeft: 'auto' }}>
                  {incomplete}{tasks.length > incomplete && <span> · {tasks.length - incomplete}✓</span>}
                </span>
              </div>
              <div style={{ background: 'var(--task-panel-bg)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
                {tasks.length === 0 && <LaneEmpty compact />}
                {tasks.map((t) => (
                  <MyTasksRow
                    key={t.id}
                    task={t}
                    project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                    selected={selected.has(t.id)}
                    selectionActive={selectionActive}
                    onSelect={() => toggleSelect(t.id)}
                    onToggleComplete={() => onToggleComplete(t)}
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
      {filtered.length === 0 && <NoTasksMatch />}
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

export function MyTasksRow({ task, project, selected, selectionActive, onSelect, onToggleComplete, onOpenEditor, expanded, onExpand, planned, stack }: { task: TaskRow; project: { name: string; slug: string } | null; selected: boolean; selectionActive: boolean; onSelect: () => void; onToggleComplete: () => void; onOpenEditor?: () => void; expanded: boolean; onExpand: () => void; planned: boolean; stack?: boolean }) {
  const isDone = isTaskDone(task)
  const { prefs } = useLabPrefs()
  return (
    <SharedTaskRow
      task={task}
      project={project}
      dense
      stack={stack}
      isDone={isDone}
      onToggleDone={onToggleComplete}
      onOpenEditor={onOpenEditor}
      isExpanded={expanded}
      onToggleExpand={onExpand}
      isSelected={selected}
      selectionActive={selectionActive}
      onToggleSelect={onSelect}
      isPlanned={planned}
      plannedLabel="today"
      showGroupOverridePin
      leadingTag={(task as TaskRow & { _tag?: string })._tag ?? '📝'}
      extraMeta={rowExtraMeta(task, prefs.taskStaleDays)}
    >
      <InlineDetail task={task} projectName={project?.name} onOpenEditor={onOpenEditor} />
    </SharedTaskRow>
  )
}
