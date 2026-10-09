// AgendaListView — linear read-mostly list for the Today Agenda mode.
//
// Nick's "just see a line of things while I work" surface. Designed for:
//   AM → Timeline to plan & drag
//   Day → Agenda to scan a clean line of meetings + tasks
//
// Design:
//   - Today meetings: chronological, chip + time + title + location.
//     All-day events rendered first in an all-day band.
//   - Interleaved planned tasks between meetings (the Hub's edge over native
//     calendar apps — Agenda shows tasks-to-work-through, not just meetings).
//   - Drop zones between rows (Phase 6 / GH#150): thin separators that accept
//     dnd-kit drops from the task list. Slot-only write (no plan_start_min
//     — Agenda has no time axis). Uses useDroppable() (same model as TimelineGrid).
//   - Read-mostly: complete tasks (DoneBox) + open drawer (click title).
//   - Tomorrow section: shows tomorrow's D1 meetings so Nick can scan ahead.
//   - No notes textarea (scan-mode; click title → drawer for details).
//   - Now-marker chip on the current meeting/task block.
//
// SLOT IDENTITY (Phase 6): buildTimelineModel is now the single source of truth
// for between-N slot keys. The old local heuristic (between-N = before Nth
// timed meeting, ignoring untimedCount offset) is DELETED. Both Agenda and
// Timeline now compute slot identity identically — fixes the slot-offset mismatch
// bug on days with untimed events (backlog 2026-06-19 OPEN).
//
// DEPRECATES: the local between-N heuristic (~AgendaListView.tsx:271-292 in the
// pre-Phase-6 version), which diverged from buildTimelineModel on days with
// untimed events.

import { useMemo, useState, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { PlannedTaskRow } from './PlannedTaskRow'
import { buildTimelineModel } from './timelineModel'
import type { TodayEvent, PlannedSlot } from './constants'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'
import { useNowMinutes, formatNowLabel } from './useNowMinutes'
import { fmtDuration } from './utils'

// ── helpers ───────────────────────────────────────────────────────────────

function fmtMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h
  const ampm = h < 12 ? 'am' : 'pm'
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, '0')}${ampm}`
}

function durationLabel(startMin: number, endMin: number): string {
  return fmtDuration(endMin - startMin)
}

// ── AgendaEventRow ────────────────────────────────────────────────────────
// A single meeting row in the Agenda list: chip-time | title | loc | duration.
// Click-to-dismiss only (no notes — this is scan mode).
function AgendaEventRow({
  event,
  isNow,
  onDismiss,
}: {
  event: TodayEvent
  isNow: boolean
  onDismiss: (id: string) => void
}) {
  const hasTime = typeof event.startMin === 'number'
  const timeStr = hasTime ? fmtMin(event.startMin as number) : event.time
  const durStr = hasTime && typeof event.endMin === 'number'
    ? durationLabel(event.startMin as number, event.endMin)
    : null

  const sub = [timeStr, durStr, event.loc].filter(Boolean).join(' · ')

  return (
    <div data-agenda-list-row="meeting" className={`tk-card tk-mc${isNow ? ' tk-nowm' : ''}`}>
      <div className="tk-mch" style={{ cursor: 'default' }}>
        <div className="tk-hdr">
          <div className="tk-ct" style={{ fontSize: 13 }}>{event.title}</div>
          <div className="tk-cs" title={sub}>{sub}</div>
        </div>
        <div className="tk-tr-r">
          {isNow && <span className="tk-pill tk-box"><i />Now</span>}
          {event.meetingUrl && (
            // Join: the filled primary only while the meeting is on now, a plain
            // link the rest of the day (same rule as the timeline card).
            <a
              href={event.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Join meeting"
              aria-label="Join meeting"
              className={isNow ? 'tk-join' : 'tk-joinq'}
            >
              Join
            </a>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDismiss(event.id) }}
            title="Hide from today's view"
            aria-label={`Hide ${event.title}`}
            className="tk-x"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return <div className="tk-ash">{label}</div>
}

// ── AgendaDropSeparator ───────────────────────────────────────────────────
// Thin dnd-kit droppable separator that accepts a task dragged from the task
// list. Slot-only write (no plan_start_min — Agenda has no time axis).
// GH#150: replaced HTML5 onDragOver/onDrop with useDroppable() to match the
// TimelineGrid pattern. No className needed; visibility controlled by isOver.
function AgendaDropSeparator({ slot }: { slot: PlannedSlot }) {
  const { isOver, setNodeRef } = useDroppable({ id: `slot:${slot}` })

  return (
    <div
      ref={setNodeRef}
      className={`tk-asep${isOver ? ' tk-over' : ''}`}
      style={{
        height: isOver ? 22 : 8,
        transition: 'all 120ms',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'default',
        overflow: 'hidden',
      }}
    >
      {isOver && (
        <span className="tk-gapl" style={{ position: 'static', color: 'var(--sk-ac)', userSelect: 'none', pointerEvents: 'none' }}>
          drop here
        </span>
      )}
    </div>
  )
}

// ── AgendaListView props ───────────────────────────────────────────────────
export interface AgendaListViewProps {
  events: TodayEvent[]
  tomorrowEvents?: TodayEvent[]
  tasks: TaskRow[]
  state: TodayStateApi
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null; primary_folder?: string | null }>
  // expandedId/onExpand removed: AgendaListView owns its own expand state so
  // clicking a row here never expands the same task on Timeline (Item 2 fix).
  // Lifted dismiss state (#170 — shared with Timeline so toggling views
  // does not reset dismissed meetings).
  dismissedIds: Record<string, boolean>
  onDismiss: (id: string) => void
  // `now` is NO LONGER a prop (#168 — was computed once at render in TodayPage,
  // freezing the now-marker. AgendaListView now calls useNowMinutes() itself
  // for a live 60s ticker, same as Timeline.
}

// ── AgendaListView ─────────────────────────────────────────────────────────
export function AgendaListView({
  events,
  tomorrowEvents = [],
  tasks,
  state,
  projectsByPid,
  dismissedIds,
  onDismiss,
}: AgendaListViewProps) {
  // Live 60s ticker — fixes #168 (stale now-marker in Agenda mode).
  const now = useNowMinutes()
  // Per-surface expand state (Item 2 fix, 2026-06-22).
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const onExpand = useCallback((id: string) => { setExpandedId((p) => (p === id ? null : id)) }, [])

  const visibleEvents = events.filter((e) => !dismissedIds[e.id])
  const visibleTomorrow = tomorrowEvents.filter((e) => !dismissedIds[e.id])

  // Partition into all-day + timed (sorted by startMin) using buildTimelineModel.
  // buildTimelineModel is the single source of truth for slot identity (Phase 6).
  // Agenda passes visibleEvents — dismissed events are excluded before the model.
  const model = useMemo(() => buildTimelineModel(visibleEvents), [visibleEvents])
  // #107: serviceBlocks was destructured away here, so EVERY long (>=3h) event
  // was silently invisible in Agenda mode — not just overnight ones. Agenda is
  // the "scan your day" surface; dropping a 4-hour commitment from it is the
  // opposite of scanning. Rendered in its own section below.
  const { allDayEvents, units, serviceBlocks } = model

  // All planned task ids (excluding done).
  const plannedIds = state.plannedIds()

  // Build plannedTasksBySlot map: slot → TaskRow[] for rendering tasks
  // interleaved in their correct gap positions, keyed off the model's slot
  // (one source of truth — kills the heuristic divergence).
  const plannedTasksBySlot = useMemo(() => {
    const m = new Map<PlannedSlot, TaskRow[]>()
    for (const id of plannedIds) {
      const slot = state.planned[id]?.slot
      if (!slot) continue
      const task = tasks.find((t) => t.id === id)
      if (!task) continue
      const arr = m.get(slot) ?? []
      arr.push(task)
      m.set(slot, arr)
    }
    return m
  }, [plannedIds, state.planned, tasks])

  // Build the interleaved rows list from model units.
  //
  // Model unit → Agenda row mapping:
  //   gap      → AgendaDropSeparator (drop zone) + planned tasks in that slot
  //   meeting  → AgendaEventRow
  //   overlap  → multiple AgendaEventRow (stacked — Agenda is linear scan, not time axis)
  //   untimed  → AgendaDropSeparator (for the slot) + AgendaEventRow(s)
  //
  // now-marker is injected before the first unit whose startMin > now.
  type AgendaRow =
    | { type: 'drop'; slot: PlannedSlot; tasks: TaskRow[] }
    | { type: 'meeting'; event: TodayEvent }
    | { type: 'now' }

  const rows: AgendaRow[] = []
  let nowInserted = false

  const tryInsertNow = (beforeMin: number) => {
    if (!nowInserted && now < beforeMin) {
      nowInserted = true
      rows.push({ type: 'now' })
    }
  }

  for (const unit of units) {
    if (unit.kind === 'gap') {
      tryInsertNow(unit.startMin)
      const slotTasks = plannedTasksBySlot.get(unit.slot) ?? []
      rows.push({ type: 'drop', slot: unit.slot, tasks: slotTasks })
    } else if (unit.kind === 'meeting') {
      tryInsertNow(unit.startMin)
      rows.push({ type: 'meeting', event: unit.event })
    } else if (unit.kind === 'overlap') {
      tryInsertNow(unit.startMin)
      // Overlap: render each event as a separate meeting row (stacked in linear Agenda).
      // Side-by-side is a Timeline-only affordance (requires a time axis).
      for (const event of unit.events) {
        rows.push({ type: 'meeting', event })
      }
    } else if (unit.kind === 'untimed') {
      // Untimed events: drop zone for their slot + the event row(s).
      const slotTasks = plannedTasksBySlot.get(unit.slot) ?? []
      rows.push({ type: 'drop', slot: unit.slot, tasks: slotTasks })
      for (const event of unit.events) {
        rows.push({ type: 'meeting', event })
      }
    }
  }

  // Trailing now-marker if not yet inserted.
  if (!nowInserted) rows.push({ type: 'now' })

  // Trailing tasks in 'strip' slot (strip planned tasks not in any calendar gap).
  // These live outside the model units — render them after the interleaved section.
  const stripTasks = plannedTasksBySlot.get('strip') ?? []

  const hasTodayContent = units.length > 0 || plannedIds.length > 0

  // Coral means "you are IN something right now" (Rule 59). This used to go
  // coral whenever the day contained any meeting at all, so it was coral all
  // day on any day with a meeting and carried no information.
  const inMeetingNow = [...units.flatMap((u) =>
    u.kind === 'meeting' ? [u.event] : u.kind === 'overlap' ? u.events : [],
  ), ...serviceBlocks].some(
    (e) => typeof e.startMin === 'number' && typeof e.endMin === 'number' && e.startMin <= now && now < e.endMin,
  )
  // One teal rule: the coral-while-in-a-meeting variant is dropped (the meeting
  // card says "Now" itself).
  void inMeetingNow
  const nowColor = 'var(--sk-ac)'

  const renderNowMarker = () => (
    <div
      aria-hidden="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'none',
        overflow: 'visible',
        marginLeft: 2,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: nowColor, flexShrink: 0 }} />
      <div style={{ flex: 1, height: 1.5, background: nowColor }} />
      <span style={{
        padding: '0 4px',
        fontSize: 10,
        fontWeight: 600,
        color: nowColor,
        flexShrink: 0,
        marginRight: 4,
        whiteSpace: 'nowrap',
      }}>
        {formatNowLabel(now)} now
      </span>
    </div>
  )

  return (
    <div>
      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <SectionHeader label="All day" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {allDayEvents
              .filter((e) => !dismissedIds[e.id])
              .map((e) => (
                <AgendaEventRow
                  key={e.id}
                  event={e}
                  isNow={false}
                  onDismiss={onDismiss}
                />
              ))}
          </div>
        </div>
      )}

      {/* #107: long + cross-day blocks. These are deliberately kept out of the
          interleaved scan (they would swamp it), but they must still be VISIBLE —
          they were dropped entirely before. */}
      {serviceBlocks.filter((e) => !dismissedIds[e.id]).length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <SectionHeader label="Long / multi-day" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {serviceBlocks
              .filter((e) => !dismissedIds[e.id])
              .map((e) => (
                <AgendaEventRow
                  key={e.id}
                  event={e}
                  isNow={typeof e.startMin === 'number' && typeof e.endMin === 'number' && e.startMin <= now && now < e.endMin}
                  onDismiss={onDismiss}
                />
              ))}
          </div>
        </div>
      )}

      {/* Today section header */}
      {hasTodayContent && <SectionHeader label="Today" />}

      {/* Interleaved timed meetings, gaps (drop zones + tasks), now-marker */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((row, i) => {
          if (row.type === 'now') {
            return <div key={`now-${i}`}>{renderNowMarker()}</div>
          }
          if (row.type === 'meeting') {
            const isNow = typeof row.event.startMin === 'number' &&
              typeof row.event.endMin === 'number' &&
              row.event.startMin <= now && now < row.event.endMin
            return (
              <AgendaEventRow
                key={row.event.id}
                event={row.event}
                isNow={isNow}
                onDismiss={onDismiss}
              />
            )
          }
          // drop zone + any tasks in this slot
          return (
            <div key={`drop-${row.slot}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <AgendaDropSeparator slot={row.slot} />
              {row.tasks.map((task) => (
                <PlannedTaskRow
                  key={task.id}
                  task={task}
                  project={task.project_id ? projectsByPid.get(task.project_id) ?? null : null}
                  state={state}
                  small
                  onExpand={onExpand}
                  expandedId={expandedId}
                  projectsByPid={projectsByPid}
                />
              ))}
            </div>
          )
        })}

        {/* Strip tasks: planned tasks not in any gap slot */}
        {stripTasks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {stripTasks.map((task) => (
              <PlannedTaskRow
                key={task.id}
                task={task}
                project={task.project_id ? projectsByPid.get(task.project_id) ?? null : null}
                state={state}
                small
                onExpand={onExpand}
                expandedId={expandedId}
                projectsByPid={projectsByPid}
              />
            ))}
          </div>
        )}
      </div>

      {/* Tomorrow section */}
      {visibleTomorrow.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <SectionHeader label="Tomorrow" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {visibleTomorrow
              .sort((a, b) => {
                if (a.isAllDay && !b.isAllDay) return -1
                if (!a.isAllDay && b.isAllDay) return 1
                return (a.startMin ?? 0) - (b.startMin ?? 0)
              })
              .map((e) => (
                <AgendaEventRow
                  key={e.id}
                  event={e}
                  isNow={false}
                  onDismiss={onDismiss}
                />
              ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {visibleEvents.length === 0 && plannedIds.length === 0 && (
        <div className="tk-empty">
          No meetings or planned tasks today
        </div>
      )}
    </div>
  )
}
