// AgendaGrid — normal-flow proportional agenda replacing the absolute canvas.
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

import { useMemo, useState } from 'react'
import { EventRow, type SaveStatus } from './MeetingRow'
import { PlannedTaskRow } from './PlannedTaskRow'
import { buildAgendaModel, pxForMeeting, PX_PER_MIN, GAP_FLOOR } from './agendaModel'
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
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${String(m).padStart(2, '0')}`
}

// ── AgendaGapRow ─────────────────────────────────────────────────────────
// Real in-flow drop target — replaces AbsoluteDropZone.
// Proportional baseHeight + visible dragover state + free-minutes label.
// Planned tasks render inside the row; label is below them.
function AgendaGapRow({
  slot,
  freeMinutes,
  baseHeight,
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
  tasks: TaskRow[]
  state: TodayStateApi
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null }>
  expandedId: string | null
  onExpand: (id: string) => void
  onDropTask: (id: string, slot: PlannedSlot) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const tasksInGap = state.plannedIds()
    .filter((id) => state.planned[id]?.slot === slot)
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is TaskRow => !!t)

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
        if (id) onDropTask(id, slot)
      }}
      style={{
        minHeight: baseHeight,
        borderTop: `1px dashed ${withAlpha(ACCENT_GOLD, dragOver ? 55 : 15)}`,
        background: dragOver ? withAlpha(ACCENT_GOLD, 8) : 'transparent',
        transition: 'all 120ms',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {tasksInGap.map((t) => (
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

// ── AgendaGrid props ─────────────────────────────────────────────────────
export interface AgendaGridProps {
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

// ── AgendaGrid ──────────────────────────────────────────────────────────
export function AgendaGrid({
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
}: AgendaGridProps) {
  const onDropTask = (id: string, slot: PlannedSlot) => state.planAt(id, slot)
  const nowColor = inMeeting ? ACCENT_CORAL : ACCENT_GOLD
  const nowLabel = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  const model = useMemo(() => buildAgendaModel(events), [events])
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
      // Untimed events: drop zone + event rows, no time-based now-injection
      agendaElements.push(
        <div key={`untimed-${unit.slot}`}>
          <AgendaGapRow
            slot={unit.slot}
            freeMinutes={0}
            baseHeight={GAP_FLOOR}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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

        {/* Service blocks — right ~25%, translucent (z-index 1) */}
        {serviceBlocks.length > 0 && (
          <div style={{
            width: 'clamp(96px, 25%, 180px)',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            zIndex: 1,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: withAlpha(ACCENT_TEAL, 55), padding: '0 0 3px', whiteSpace: 'nowrap' }}>
              Service
            </div>
            {serviceBlocks.map((e) => {
              // #109: service block height proportional to its duration so the
              // 7am–3pm ICU block visually spans the full morning, not a stub.
              const svcDuration = typeof e.startMin === 'number' && typeof e.endMin === 'number'
                ? e.endMin - e.startMin
                : 0
              const svcHeight = svcDuration > 0 ? pxForMeeting(svcDuration) : undefined
              return (
                <div
                  key={e.id}
                  style={{
                    background: withAlpha(ACCENT_TEAL, 5),
                    border: `1px solid ${withAlpha(ACCENT_TEAL, 20)}`,
                    borderRadius: 4,
                    padding: '5px 7px',
                    // Translucent — agenda content renders over (z-index 2 on parent)
                    opacity: 0.85,
                    // Proportional height mirrors the block's true duration
                    minHeight: svcHeight,
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
                    className="hov-opacity"
                    style={{ background: 'none', border: 'none', color: INK_DIM, fontSize: 10, cursor: 'pointer', padding: '2px 0 0', lineHeight: 1, opacity: 0.4, transition: 'opacity 120ms', '--hov-opacity': '1' } as React.CSSProperties}
                  >× hide</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
