// TimelineGrid — normal-flow proportional timeline replacing the absolute canvas.
// (Renamed from AgendaGrid.tsx — "Timeline" is the drag-to-plan axis surface;
//  "Agenda" now refers to the new linear read-mostly list view.)
//
// GH#80 codex-plan (2026-06-18): implements the layout model from the spec.
//
// LAYOUT:
//   The outer container is a flex row:
//     - Left zone (flex:1): time-spine (44px) + agenda column (minmax(0,1fr))
//     - Right zone (minmax(96px,25%)): service blocks — translucent, stacked
//
//   The agenda column is a NORMAL FLOW flex column. Each unit has a
//   min-height = proportional px (pxForMeeting/pxForGap). Expanded notes
//   render INSIDE the same unit, pushing later units down.
//   This makes transparency-bleed UNREPRESENTABLE (Level-1, ethos #15).
//
// Nick's 5 requirements:
//   1. Proportional duration: min-height ∝ minutes, readable floor MEETING_FLOOR=40/GAP_FLOOR=28
//   2. Overlaps side-by-side, NO "conflict"/"overlap" label
//   3. Service blocks → right ~25%, translucent, do NOT consume gap free-minutes
//   4. Solid drag-drop: AgendaGapRow is a real flow row with dragover + proportional height
//   5. Opaque inline notes that push content down (Level-1: no absolute positioning)
//
// DEPRECATES (from GH#80 P1-P4):
//   - AbsoluteDropZone transparent overlay
//   - absolute canvas wrapper, canvasWrapRef, canvasW, ResizeObserver
//   - TimeRuler as absolute full-canvas ruler
//   - absolute now-line placement (top: toY(...))
//   - absolute event block wrappers (top/left math)
//   - OverlapBand coral badge / "conflict" copy for timed overlaps
//   - boxed right-fixed-width service rail

import { useMemo, useState, type CSSProperties } from 'react'
import { useTaskBlockGesture } from './useTaskBlockGesture'
import { EventRow, type SaveStatus } from './MeetingRow'
import { PlannedTaskRow } from './PlannedTaskRow'
import {
  buildTimelineModel, pxForMeeting, PX_PER_MIN, GAP_FLOOR,
  TIMELINE_TASK_BLOCKS, packTaskBlocks,
} from './timelineModel'
import {
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_CORAL, INK, INK_DIM, withAlpha,
  type TodayEvent, type PlannedSlot,
} from './constants'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'

// ── Time label helper ──────────────────────────────────────────────────
function fmtMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h
  const ampm = h < 12 ? 'AM' : 'PM'
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

// ── TimedTaskBlock ─────────────────────────────────────────────────────────
// Compact absolute-positioned block for a TIMED planned task inside a gap.
//
// Phase 4: pointer-driven MOVE + RESIZE via useTaskBlockGesture.
//   - Body drag (onPointerDownBody) → moves the block vertically → writes plan_start_min.
//   - Bottom-edge 6px strip (11px on touch, @media hover:none) → resizes → writes estimated_minutes.
//   - Click (movement < 4px) → onExpand(id) — expand behavior preserved.
//   - Live preview: translateY for move, heightDelta for resize (no PATCH on pointermove).
//   - Commit once on pointerup, snap to 15min, clamp move to gap bounds.
//   - Cursor: grab on body, grabbing while dragging, ns-resize on strip.
//
// Phase 3 ONLY rendered when TIMELINE_TASK_BLOCKS === true.
function TimedTaskBlock({
  task,
  topPx,
  heightPx,
  colIdx,
  colCount,
  gapStartMin,
  gapEndMin,
  onExpand,
  expandedId,
  onMove,
  onResize,
}: {
  task: TaskRow
  topPx: number
  heightPx: number
  colIdx: number
  colCount: number
  /** Gap start in minutes-since-midnight — for move clamp lower bound. */
  gapStartMin: number
  /** Gap end in minutes-since-midnight — for move clamp upper bound. */
  gapEndMin: number
  onExpand: (id: string) => void
  expandedId: string | null
  /** Called to commit move: writes plan_start_min. */
  onMove: (id: string, newPlanStartMin: number) => void
  /** Called to commit resize: writes estimated_minutes. */
  onResize: (id: string, newEstimatedMinutes: number) => void
}) {
  const expanded = expandedId === task.id
  const visibleColCount = Math.min(colCount, 3)
  const leftPct = (colIdx / visibleColCount) * 100
  const widthPct = (1 / visibleColCount) * 100
  const dur = task.estimated_minutes ?? 30

  const [{ translatePx, heightDeltaPx, mode }, { onPointerDownBody, onPointerDownResize }] =
    useTaskBlockGesture({
      taskId: task.id,
      planStartMin: task.plan_start_min ?? gapStartMin,
      estimatedMinutes: task.estimated_minutes,
      gapStartMin,
      gapEndMin,
      onExpand,
      onMove,
      onResize,
    })

  const isDragging = mode === 'move'
  const isResizing = mode === 'resize'
  const liveHeightPx = Math.max(heightPx + heightDeltaPx, 15)  // never collapse below 15px

  const blockStyle: CSSProperties = {
    position: 'absolute',
    top: topPx,
    height: liveHeightPx,
    left: `${leftPct}%`,
    width: `${widthPct}%`,
    boxSizing: 'border-box',
    padding: '3px 6px 3px 6px',
    background: withAlpha(ACCENT_GOLD, isDragging || isResizing ? 18 : expanded ? 16 : 10),
    border: `1px solid ${withAlpha(ACCENT_GOLD, isDragging || isResizing ? 50 : expanded ? 55 : 30)}`,
    borderRadius: 5,
    // overflow: 'visible' (NOT 'hidden') — the "▾ expanded below" hint and any
    // overflow content must remain readable. 'hidden' was clipping the indicator
    // inside small blocks, making expand appear to do nothing (Bug 1 fix).
    overflow: 'visible',
    cursor: isDragging ? 'grabbing' : 'grab',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    zIndex: isDragging || isResizing ? 10 : expanded ? 3 : 1,
    // Live preview: translateY while dragging (unsnapped, no PATCH per frame)
    transform: translatePx !== 0 ? `translateY(${translatePx}px)` : undefined,
    transition: isDragging || isResizing ? 'none' : 'transform 0ms',
    touchAction: 'none',  // prevent browser scroll-hijack during pointer gesture
    userSelect: 'none',
    willChange: isDragging ? 'transform' : isResizing ? 'height' : 'auto',
  }

  const durLabel = dur < 60 ? `${dur}m` : `${Math.floor(dur / 60)}h${dur % 60 > 0 ? ` ${dur % 60}m` : ''}`

  // The expansion (TaskDetailDrawer) renders in NORMAL FLOW in AgendaGapRow
  // below the timed-blocks layer — keeps the GH#80 invariant (expandable
  // content never absolute, always pushes the gap down).
  return (
    <div
      style={blockStyle}
      onPointerDown={onPointerDownBody}
      title={task.title}
      data-task-id={task.id}
      aria-label={`${task.short_title || task.title} — ${durLabel}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onExpand(task.id) }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
        <span style={{
          fontSize: 11,
          fontWeight: 500,
          color: INK,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }}>
          {task.short_title || task.title}
        </span>
        <span style={{
          fontSize: 9,
          color: ACCENT_GOLD,
          padding: '1px 4px',
          background: withAlpha(ACCENT_GOLD, 12),
          border: `1px solid ${withAlpha(ACCENT_GOLD, 25)}`,
          borderRadius: 999,
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {durLabel}
        </span>
      </div>
      {expanded && (
        <span style={{
          fontSize: 9,
          color: ACCENT_GOLD,
          fontWeight: 600,
          marginLeft: 2,
          // Visible even when the block is short — overflow:visible on parent.
          whiteSpace: 'nowrap',
        }}>▾ details below</span>
      )}
      {/* Resize strip — bottom 6px (11px on touch via @media hover:none).
          Must NOT propagate pointerdown to body handler (stopPropagation in hook). */}
      <div
        onPointerDown={onPointerDownResize}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 6,
          cursor: 'ns-resize',
          // @media (hover:none) / touch: wider 11px strip for touch targets
          // We achieve the wider strip with a CSS class; inline style covers mouse.
          touchAction: 'none',
        }}
        className="task-block-resize-strip"
        aria-hidden="true"
      />
    </div>
  )
}

// ── AgendaGapRow ─────────────────────────────────────────────────────────
// Real in-flow drop target — replaces AbsoluteDropZone.
// Proportional baseHeight + visible dragover state + free-minutes label.
//
// Phase 3 (TIMELINE_TASK_BLOCKS):
//   - Timed tasks (plan_start_min != null) render as absolute blocks inside the
//     gap's local coordinate space. Gap auto-grows to contain all blocks.
//   - Untimed tasks keep the existing full-width stacked PlannedTaskRow render
//     (graceful fallback — drop from Phase-1 regression-free).
//   - Drop into a timed gap writes plan_start_min=gap.startMin + estimated_minutes.
//
// Phase 1 fallback (TIMELINE_TASK_BLOCKS === false):
//   All tasks render as full-width stacked PlannedTaskRows (unchanged).
function AgendaGapRow({
  slot,
  freeMinutes,
  baseHeight,
  gapStartMin,
  gapEndMin,
  tasks,
  state,
  projectsByPid,
  expandedId,
  onExpand,
  onDropTask,
}: {
  slot: PlannedSlot
  freeMinutes: number
  baseHeight: number
  /** Minutes-since-midnight of the gap start. Used for absolute block top/height.
   *  Zero for untimed gaps (UntimedUnit) — those never use the absolute lane. */
  gapStartMin: number
  /** Minutes-since-midnight of the gap end. Used for move-clamp upper bound. */
  gapEndMin: number
  tasks: TaskRow[]
  state: TodayStateApi
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null }>
  expandedId: string | null
  onExpand: (id: string) => void
  /** Phase 3: includes plan_start_min + estimated_minutes for timed drops. */
  onDropTask: (id: string, slot: PlannedSlot, plan_start_min?: number, estimated_minutes?: number) => void
}) {
  const [dragOver, setDragOver] = useState(false)

  const tasksInGap = useMemo(() =>
    state.plannedIds()
      .filter((id) => state.planned[id]?.slot === slot)
      .map((id) => tasks.find((t) => t.id === id))
      .filter((t): t is TaskRow => !!t),
    [state, slot, tasks],
  )

  // Phase 3: partition into timed (absolute lane) vs untimed (stacked).
  // Memoized so the downstream useMemos for placements/height don't over-fire.
  const { timedTasks, untimedTasks } = useMemo(() => {
    if (TIMELINE_TASK_BLOCKS && gapStartMin > 0) {
      return {
        timedTasks: tasksInGap.filter((t) => t.plan_start_min != null),
        untimedTasks: tasksInGap.filter((t) => t.plan_start_min == null),
      }
    }
    // Phase 1 fallback: all tasks are "untimed" (full-width stack)
    return { timedTasks: [] as typeof tasksInGap, untimedTasks: tasksInGap }
  }, [tasksInGap, gapStartMin])

  // Compute absolute placements once; derive container height from them.
  // Gap auto-grow: max(pxForGap(freeMinutes), tasksExtentPx).
  // Level-1: timed-block overflow into the next unit is unrepresentable.
  const timedPlacements = useMemo(
    () => packTaskBlocks(timedTasks, gapStartMin),
    [timedTasks, gapStartMin],
  )
  const containerMinHeight = useMemo(() => {
    const base = baseHeight  // already = pxForGap(freeMinutes) from the model
    if (timedPlacements.length === 0) return base
    const tasksExtent = Math.max(...timedPlacements.map((p) => p.topPx + p.heightPx))
    return Math.max(base, tasksExtent)
  }, [baseHeight, timedPlacements])

  const fmtFree = freeMinutes >= 60
    ? `${Math.floor(freeMinutes / 60)}h${freeMinutes % 60 > 0 ? ` ${freeMinutes % 60}m` : ''} free`
    : freeMinutes > 0 ? `${freeMinutes}m free` : 'drop here'

  return (
    <div
      // .today-drop-zone class → hidden on touch (index.css, native DnD doesn't fire there)
      className="today-drop-zone"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const id = e.dataTransfer.getData('text/plain')
        if (!id) return
        if (TIMELINE_TASK_BLOCKS && gapStartMin > 0) {
          // Timed drop: snap to gap start, default 30m if task has no duration.
          const droppedTask = tasks.find((t) => t.id === id)
          const estimatedMins = droppedTask?.estimated_minutes ?? 30
          onDropTask(id, slot, gapStartMin, estimatedMins)
        } else {
          onDropTask(id, slot)
        }
      }}
      style={{
        minHeight: containerMinHeight,
        borderTop: `1px dashed ${withAlpha(ACCENT_GOLD, dragOver ? 55 : 15)}`,
        background: dragOver ? withAlpha(ACCENT_GOLD, 8) : 'transparent',
        transition: 'all 120ms',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',  // Phase 3: absolute task blocks position within this container
      }}
    >
      {/* Phase 3: Absolute-lane timed task blocks */}
      {timedTasks.length > 0 && (
        // Overflow-x scroll when colCount > 3 (matches AgendaOverlapRegion posture)
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflowX: timedPlacements[0]?.colCount > 3 ? 'auto' : 'visible',
          overflowY: 'visible',
          pointerEvents: 'none',  // children re-enable their own pointer events
        }}>
          {timedTasks.map((t, i) => {
            const p = timedPlacements[i]
            if (!p) return null
            return (
              <div key={t.id} style={{ pointerEvents: 'auto' }}>
                <TimedTaskBlock
                  task={t}
                  topPx={p.topPx}
                  heightPx={p.heightPx}
                  colIdx={p.colIdx}
                  colCount={p.colCount}
                  gapStartMin={gapStartMin}
                  gapEndMin={gapEndMin}
                  onExpand={onExpand}
                  expandedId={expandedId}
                  onMove={(id, newPlanStartMin) =>
                    state.planAt(id, slot, newPlanStartMin, null)
                  }
                  onResize={(id, newEstimatedMinutes) =>
                    state.planAt(id, slot, null, newEstimatedMinutes)
                  }
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Normal-flow area: below the timed blocks' extent.
          Renders (a) the expanded PlannedTaskRow for any timed task whose
          drawer is open — keeps TaskDetailDrawer in normal flow so it pushes
          the gap down (GH#80 invariant: absolute content never clips/bleeds);
          (b) untimed tasks: full-width stacked (Phase-1 graceful fallback). */}
      <div style={timedTasks.length > 0 ? { marginTop: containerMinHeight } : undefined}>
        {/* Expanded timed task drawer: render full PlannedTaskRow in normal flow.
            Gold left border provides a visual link from the block above to this
            expanded surface, making the connection legible. */}
        {timedTasks
          .filter((t) => expandedId === t.id)
          .map((t) => (
            <div
              key={`expanded-${t.id}`}
              style={{
                borderLeft: `3px solid ${withAlpha(ACCENT_GOLD, 55)}`,
                marginBottom: 4,
              }}
            >
              <PlannedTaskRow
                task={t}
                project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                state={state}
                small
                onExpand={onExpand}
                expandedId={expandedId}
                projectsByPid={projectsByPid}
              />
            </div>
          ))
        }
        {/* Untimed tasks: full-width stacked (Phase-1 behavior, graceful fallback) */}
        {untimedTasks.map((t) => (
          <PlannedTaskRow
            key={t.id}
            task={t}
            project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
            state={state}
            small
            onExpand={onExpand}
            expandedId={expandedId}
            projectsByPid={projectsByPid}
          />
        ))}
      </div>

      {/* Free-time label — bottom of the gap */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 16,
        fontSize: 10,
        color: dragOver ? ACCENT_GOLD : withAlpha(ACCENT_GOLD, 40),
        fontStyle: 'italic',
        userSelect: 'none',
        pointerEvents: 'none',
      }}>
        {dragOver ? '↓ drop here' : fmtFree}
      </div>
    </div>
  )
}

// ── AgendaMeetingRow ─────────────────────────────────────────────────────
// In-flow meeting row: duration frame + notes expand below (OPAQUE, pushes down).
// Wraps EventRow; the minHeight = baseHeight is applied to the outer shell.
// EventRow's notes textarea is in normal flow → no absolute bleed.
function AgendaMeetingRow({
  event,
  startMin,
  baseHeight,
  notes,
  onNote,
  saveStatus,
  onDismiss,
  isPhone,
}: {
  event: TodayEvent
  startMin: number
  baseHeight: number
  notes: Record<string, string>
  onNote: (id: string, v: string) => void
  saveStatus: Record<string, SaveStatus>
  onDismiss: (id: string) => void
  isPhone: boolean
}) {
  return (
    <div
      data-agenda-unit="meeting"
      style={{
        minHeight: baseHeight,
        // Notes expand inside this shell below EventRow — no absolute needed
        position: 'relative',
        borderTop: `1px solid ${withAlpha(ACCENT_TEAL, 10)}`,
      }}
    >
      {/* Time label in left 44px spine */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: -44,
          top: 4,
          width: 40,
          textAlign: 'right',
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: withAlpha(ACCENT_TEAL, 70),
          lineHeight: 1,
          userSelect: 'none',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {fmtMin(startMin)}
      </div>
      <EventRow
        e={event}
        onDismiss={onDismiss}
        note={notes[event.id]}
        onNote={onNote}
        saveStatus={saveStatus[event.id] ?? 'idle'}
        isCalEvent={event.id.startsWith('cal-')}
        isPhone={isPhone}
        minHeight={baseHeight}
      />
    </div>
  )
}

// ── AgendaOverlapRegion ──────────────────────────────────────────────────
// Side-by-side overlap — NO conflict badge, NO "overlap" label, NO coral.
// packColumns() drives the column count. minmax(160px,1fr) → horizontal scroll
// if too narrow. Start-offset spacers preserve the stagger signal.
// Per-event notes expand inline (OPAQUE, push down).
function AgendaOverlapRegion({
  unit,
  notes,
  onNote,
  saveStatus,
  onDismiss,
  isPhone,
}: {
  unit: {
    events: TodayEvent[]
    startMin: number
    endMin: number
    spanMinutes: number
    baseHeight: number
    placements: Array<{ colIdx: number; colCount: number }>
  }
  notes: Record<string, string>
  onNote: (id: string, v: string) => void
  saveStatus: Record<string, SaveStatus>
  onDismiss: (id: string) => void
  isPhone: boolean
}) {
  const colCount = unit.placements[0]?.colCount ?? 1

  // Build columns: array of arrays, indexed by colIdx
  const columns: TodayEvent[][] = Array.from({ length: colCount }, () => [])
  unit.events.forEach((e, i) => {
    const { colIdx } = unit.placements[i]
    columns[colIdx].push(e)
  })

  // Start offset for stagger: minutes from cluster start → px
  const startOffsetPx = (e: TodayEvent): number =>
    typeof e.startMin === 'number'
      ? Math.round((e.startMin - unit.startMin) * PX_PER_MIN)
      : 0

  return (
    <div
      data-agenda-unit="overlap"
      style={{
        minHeight: unit.baseHeight,
        borderTop: `1px solid ${withAlpha(ACCENT_TEAL, 10)}`,
        position: 'relative',
      }}
    >
      {/* Time label */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: -44,
          top: 4,
          width: 40,
          textAlign: 'right',
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: withAlpha(ACCENT_TEAL, 70),
          lineHeight: 1,
          userSelect: 'none',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {fmtMin(unit.startMin)}
      </div>
      {/* Side-by-side columns — #116: wider min (200px) to reduce title truncation */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${colCount}, minmax(200px, 1fr))`,
          gap: 4,
          overflowX: colCount > 1 ? 'auto' : 'visible',
          alignItems: 'start',
        }}
      >
        {columns.map((colEvents, ci) => (
          <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {colEvents.map((e) => {
              const topPad = startOffsetPx(e)
              const eDuration = typeof e.endMin === 'number'
                ? e.endMin - (e.startMin as number)
                : 30
              return (
                <div key={e.id} style={topPad > 0 ? { marginTop: topPad } : undefined}>
                  <EventRow
                    e={e}
                    overlap
                    onDismiss={onDismiss}
                    note={notes[e.id]}
                    onNote={onNote}
                    saveStatus={saveStatus[e.id] ?? 'idle'}
                    isCalEvent={e.id.startsWith('cal-')}
                    isPhone={isPhone}
                    minHeight={pxForMeeting(eDuration)}
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── TimelineGrid props ────────────────────────────────────────────────────
export interface TimelineGridProps {
  events: TodayEvent[]
  tasks: TaskRow[]
  state: TodayStateApi
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null }>
  expandedId: string | null
  onExpand: (id: string) => void
  notes: Record<string, string>
  onNote: (id: string, v: string) => void
  saveStatus: Record<string, SaveStatus>
  onDismiss: (id: string) => void
  isPhone: boolean
  now: number        // minutes since midnight
  inMeeting: boolean
}

// ── TimelineGrid ──────────────────────────────────────────────────────────
export function TimelineGrid({
  events,
  tasks,
  state,
  projectsByPid,
  expandedId,
  onExpand,
  notes,
  onNote,
  saveStatus,
  onDismiss,
  isPhone,
  now,
  inMeeting,
}: TimelineGridProps) {
  const onDropTask = (
    id: string,
    slot: PlannedSlot,
    plan_start_min?: number,
    estimated_minutes?: number,
  ) => state.planAt(id, slot, plan_start_min, estimated_minutes)
  const nowColor = inMeeting ? ACCENT_CORAL : ACCENT_GOLD
  const nowLabel = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  const model = useMemo(() => buildTimelineModel(events), [events])
  const { allDayEvents, serviceBlocks, units, dayStart } = model

  const nowLineElement = (
    <div
      aria-hidden="true"
      style={{
        height: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        zIndex: 10,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: nowColor, flexShrink: 0, marginLeft: -4 }} />
      <div style={{ flex: 1, height: 1, background: nowColor, boxShadow: `0 0 4px ${nowColor}80` }} />
      <span style={{
        padding: '1px 5px',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: nowColor,
        borderRadius: 3,
        flexShrink: 0,
        marginRight: 2,
        whiteSpace: 'nowrap',
      }}>
        {nowLabel} now
      </span>
    </div>
  )

  // Build agenda unit elements with now-line injection
  const agendaElements: React.ReactNode[] = []
  let nowInserted = false

  const tryInsertNow = (unitStart: number) => {
    if (!nowInserted && now >= (model.dayStart) && now <= (model.dayEnd) && now < unitStart) {
      nowInserted = true
      agendaElements.push(
        <div key="__now__" style={{ pointerEvents: 'none' }}>
          {nowLineElement}
        </div>
      )
    }
  }

  for (const unit of units) {
    if (unit.kind === 'gap') {
      tryInsertNow(unit.startMin)
      agendaElements.push(
        <AgendaGapRow
          key={unit.slot}
          slot={unit.slot}
          freeMinutes={unit.freeMinutes}
          baseHeight={unit.baseHeight}
          gapStartMin={unit.startMin}
          gapEndMin={unit.endMin}
          tasks={tasks}
          state={state}
          projectsByPid={projectsByPid}
          expandedId={expandedId}
          onExpand={onExpand}
          onDropTask={onDropTask}
        />
      )
    } else if (unit.kind === 'meeting') {
      tryInsertNow(unit.startMin)
      agendaElements.push(
        <AgendaMeetingRow
          key={unit.event.id}
          event={unit.event}
          startMin={unit.startMin}
          baseHeight={unit.baseHeight}
          notes={notes}
          onNote={onNote}
          saveStatus={saveStatus}
          onDismiss={onDismiss}
          isPhone={isPhone}
        />
      )
    } else if (unit.kind === 'overlap') {
      tryInsertNow(unit.startMin)
      agendaElements.push(
        <AgendaOverlapRegion
          key={unit.events.map((e) => e.id).join('|')}
          unit={unit}
          notes={notes}
          onNote={onNote}
          saveStatus={saveStatus}
          onDismiss={onDismiss}
          isPhone={isPhone}
        />
      )
    } else if (unit.kind === 'untimed') {
      // Untimed events: drop zone + event rows, no time-based now-injection.
      // gapStartMin=0 → absolute lane disabled (no minute axis for untimed units).
      agendaElements.push(
        <div key={`untimed-${unit.slot}`}>
          <AgendaGapRow
            slot={unit.slot}
            freeMinutes={0}
            baseHeight={GAP_FLOOR}
            gapStartMin={0}
            gapEndMin={0}
            tasks={tasks}
            state={state}
            projectsByPid={projectsByPid}
            expandedId={expandedId}
            onExpand={onExpand}
            onDropTask={onDropTask}
          />
          {unit.events.map((e) => (
            <EventRow
              key={e.id}
              e={e}
              onDismiss={onDismiss}
              note={notes[e.id]}
              onNote={onNote}
              saveStatus={saveStatus[e.id] ?? 'idle'}
              isCalEvent={e.id.startsWith('cal-')}
              isPhone={isPhone}
            />
          ))}
        </div>
      )
    }
  }

  // Insert now-line at end if past all units
  if (!nowInserted && now >= model.dayStart && now <= model.dayEnd) {
    agendaElements.push(
      <div key="__now_trail__" style={{ pointerEvents: 'none' }}>
        {nowLineElement}
      </div>
    )
  }

  return (
    <div>
      {/* All-day banner */}
      {allDayEvents.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: ACCENT_TEAL, padding: '0 2px 4px' }}>All-day events</div>
          {/* Same unbounded-stack class as the Service column (fixed 21709195):
              cap the all-day banner so a conference-week pile of all-day events
              scrolls internally instead of pushing the timeline down the page. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto', overscrollBehavior: 'contain' }}>
            {allDayEvents.map((e) => (
              <EventRow
                key={e.id}
                e={e}
                onDismiss={onDismiss}
                note={notes[e.id]}
                onNote={onNote}
                saveStatus={saveStatus[e.id] ?? 'idle'}
                isCalEvent={e.id.startsWith('cal-')}
                isPhone={isPhone}
              />
            ))}
          </div>
        </div>
      )}

      {/* Outer layout: time-spine + agenda | service */}
      <div style={{
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
      }}>
        {/* Time spine + agenda column */}
        <div style={{ flex: 1, minWidth: 0, paddingLeft: 44, position: 'relative' }}>
          {/* Day-start time label */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              top: 6,
              width: 40,
              textAlign: 'right',
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: withAlpha(ACCENT_TEAL, 60),
              lineHeight: 1,
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            {fmtMin(dayStart)}
          </div>

          {/* Agenda units — normal flow */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {agendaElements}
          </div>
        </div>

        {/* Service blocks — right ~25%, translucent (z-index 1).
            GH#80 #117 (Nick 2026-06-19): COMPACT 2-up grid, capped to the day
            height. Prior #109 made each block's minHeight ∝ duration (a 7am–3pm
            block ≈ 432px); four stacked vertically blew the rail to ~1700px and,
            being a flex sibling of the agenda, pushed Planned/Tasks far below the
            fold. Fix: fixed-height compact cards in a 2-column grid (1 col when a
            single block), bounded by maxHeight = the model's day height so the
            rail can NEVER elongate the page past the agenda's own day window
            (internal scroll if there are ever many blocks). The time-range text
            still conveys the span, so dropping proportional height loses nothing. */}
        {serviceBlocks.length > 0 && (() => {
          // Same axis the agenda uses (dayStart→dayEnd × PX_PER_MIN): bounds the
          // rail to "the full day" with no measurement / ResizeObserver.
          const serviceDayHeight = Math.round((model.dayEnd - dayStart) * PX_PER_MIN)
          const serviceCols = serviceBlocks.length <= 1 ? 1 : 2
          return (
          <div style={{
            width: 'clamp(96px, 25%, 180px)',
            flexShrink: 0,
            zIndex: 1,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: withAlpha(ACCENT_TEAL, 55), padding: '0 0 3px', whiteSpace: 'nowrap' }}>
              Service
            </div>
            <div style={{
              maxHeight: serviceDayHeight,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              display: 'grid',
              gridTemplateColumns: `repeat(${serviceCols}, minmax(0, 1fr))`,
              gridAutoRows: 72,
              gap: 4,
              alignContent: 'start',
            }}>
              {serviceBlocks.map((e) => (
                <div
                  key={e.id}
                  style={{
                    background: withAlpha(ACCENT_TEAL, 5),
                    border: `1px solid ${withAlpha(ACCENT_TEAL, 20)}`,
                    borderRadius: 4,
                    padding: '5px 6px',
                    // Translucent — agenda content renders over (z-index 2 on parent)
                    opacity: 0.85,
                    minHeight: 0,
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ fontSize: 9, color: ACCENT_TEAL, fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.time}{e.end ? ` – ${e.end}` : ''}
                  </div>
                  <div style={{ fontSize: 10, color: INK, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.3 }}>
                    {e.title}
                  </div>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); onDismiss(e.id) }}
                    title="Remove from today's view"
                    aria-label={`Hide ${e.title}`}
                    className="hov-opacity"
                    style={{ background: 'none', border: 'none', color: INK_DIM, fontSize: 10, cursor: 'pointer', padding: '2px 0 0', lineHeight: 1, opacity: 0.4, transition: 'opacity 120ms', '--hov-opacity': '1' } as React.CSSProperties}
                  >× hide</button>
                </div>
              ))}
            </div>
          </div>
          )
        })()}
      </div>
    </div>
  )
}
