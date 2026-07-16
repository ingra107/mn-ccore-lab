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
import { Video } from 'lucide-react'
import { PlannedTaskRow } from './PlannedTaskRow'
import { buildTimelineModel } from './timelineModel'
import { ICON_PROPS } from '../../lib/iconProps'
import {
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_CORAL, INK, INK_DIM, INK_MUTED,
  withAlpha, type TodayEvent, type PlannedSlot,
} from './constants'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'
import { useNowMinutes } from './useNowMinutes'
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

  const borderColor = isNow ? ACCENT_CORAL : withAlpha(ACCENT_TEAL, 20)
  const bgColor = isNow ? withAlpha(ACCENT_CORAL, 6) : 'transparent'

  return (
    <div
      data-agenda-list-row="meeting"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 6,
        border: `1px solid ${borderColor}`,
        background: bgColor,
        transition: 'background 120ms',
        position: 'relative',
      }}
    >
      {/* Time chip */}
      <div style={{
        flexShrink: 0,
        width: 52,
        textAlign: 'right',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.02em',
        color: isNow ? ACCENT_CORAL : withAlpha(ACCENT_TEAL, 80),
        paddingTop: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {timeStr}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 13,
            fontWeight: 500,
            color: INK,
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}>
            {event.title}
          </span>
          {isNow && (
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: ACCENT_CORAL,
              background: withAlpha(ACCENT_CORAL, 12),
              padding: '1px 5px',
              borderRadius: 3,
              flexShrink: 0,
            }}>now</span>
          )}
          {durStr && (
            <span style={{ fontSize: 10, color: INK_MUTED, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
              {durStr}
            </span>
          )}
          {event.meetingUrl && (
            // #83/#86: petite "Join" pill in the title row — matches MeetingRow's
            // treatment (was a 🔗 icon that didn't read as "join the meeting").
            <a
              href={event.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Join meeting"
              aria-label="Join meeting"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                color: ACCENT_GOLD, background: withAlpha(ACCENT_GOLD, 12),
                border: `1px solid ${withAlpha(ACCENT_GOLD, 30)}`, borderRadius: 999,
                padding: '1px 7px', textDecoration: 'none', flexShrink: 0, lineHeight: 1.5,
              }}
            >
              <Video {...ICON_PROPS} size={11} aria-hidden />
              Join
            </a>
          )}
        </div>
        {event.loc && (
          <div style={{ fontSize: 11, color: INK_DIM, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {event.loc}
          </div>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(event.id) }}
        title="Hide from today's view"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: INK_DIM, fontSize: 14, lineHeight: 1, padding: '1px 4px',
          opacity: 0.35, flexShrink: 0, transition: 'opacity 120ms',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.9' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.35' }}
        aria-label={`Hide ${event.title}`}
      >
        ×
      </button>
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.10em',
      textTransform: 'uppercase',
      color: withAlpha(ACCENT_GOLD, 70),
      padding: '0 2px 4px',
      marginTop: 4,
    }}>
      {label}
    </div>
  )
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
      style={{
        height: isOver ? 20 : 6,
        marginTop: 1,
        marginBottom: 1,
        borderRadius: 4,
        border: `1px dashed ${withAlpha(ACCENT_GOLD, isOver ? 55 : 15)}`,
        background: isOver ? withAlpha(ACCENT_GOLD, 8) : 'transparent',
        transition: 'all 120ms',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'default',
        overflow: 'hidden',
      }}
    >
      {isOver && (
        <span style={{
          fontSize: 9,
          color: ACCENT_GOLD,
          userSelect: 'none',
          pointerEvents: 'none',
          letterSpacing: '0.04em',
        }}>
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
  onRestoreDismissed: () => void
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
  onRestoreDismissed,
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
  const { allDayEvents, units } = model

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

  const nowColor = units.some((u) => u.kind === 'meeting' || u.kind === 'overlap')
    ? ACCENT_CORAL
    : ACCENT_GOLD

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
        marginRight: 4,
        whiteSpace: 'nowrap',
      }}>
        {new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} now
      </span>
    </div>
  )

  return (
    <div>
      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <SectionHeader label="All day" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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

      {/* Restore dismissed */}
      {Object.keys(dismissedIds).length > 0 && (
        <button
          onClick={onRestoreDismissed}
          style={{
            marginTop: 8,
            background: 'none', border: 'none',
            color: ACCENT_TEAL, fontSize: 11, cursor: 'pointer',
          }}
        >
          Restore {Object.keys(dismissedIds).length} hidden
        </button>
      )}

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
        <div style={{
          padding: '24px 16px',
          textAlign: 'center',
          color: INK_DIM,
          fontSize: 13,
          fontStyle: 'italic',
          border: `1px dashed ${withAlpha(ACCENT_GOLD, 15)}`,
          borderRadius: 8,
        }}>
          No meetings or planned tasks today
        </div>
      )}
    </div>
  )
}
