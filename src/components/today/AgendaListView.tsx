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
//   - Read-mostly: complete tasks (DoneBox) + open drawer (click title).
//     No drag-to-plan — that stays in Timeline mode.
//   - Tomorrow section: shows tomorrow's D1 meetings so Nick can scan ahead.
//   - No notes textarea (scan-mode; click title → drawer for details).
//   - Now-marker chip on the current meeting/task block.
//
// DOES NOT: accept drag-drop, show gap drop-zones, render service-block rail.
// Those are Timeline-only surfaces.

import { useMemo, useState } from 'react'
import { PlannedTaskRow } from './PlannedTaskRow'
import {
  ACCENT_GOLD, ACCENT_TEAL, ACCENT_CORAL, INK, INK_DIM, INK_MUTED,
  withAlpha, type TodayEvent, type PlannedSlot,
} from './constants'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'

// ── helpers ───────────────────────────────────────────────────────────────

function fmtMin(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h
  const ampm = h < 12 ? 'am' : 'pm'
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, '0')}${ampm}`
}

function durationLabel(startMin: number, endMin: number): string {
  const mins = endMin - startMin
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
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
        </div>
        {event.loc && (
          <div style={{ fontSize: 11, color: INK_DIM, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {event.loc}
          </div>
        )}
        {event.meetingUrl && (
          <a
            href={event.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 11, color: ACCENT_TEAL, textDecoration: 'none', display: 'inline-block', marginTop: 2 }}
          >
            Join
          </a>
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

// ── AgendaListView props ───────────────────────────────────────────────────
export interface AgendaListViewProps {
  events: TodayEvent[]
  tomorrowEvents?: TodayEvent[]
  tasks: TaskRow[]
  state: TodayStateApi
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null }>
  expandedId: string | null
  onExpand: (id: string) => void
  now: number   // minutes since midnight
}

// ── AgendaListView ─────────────────────────────────────────────────────────
export function AgendaListView({
  events,
  tomorrowEvents = [],
  tasks,
  state,
  projectsByPid,
  expandedId,
  onExpand,
  now,
}: AgendaListViewProps) {
  const [dismissedIds, setDismissedIds] = useState<Record<string, boolean>>({})
  const onDismiss = (id: string) => setDismissedIds((s) => ({ ...s, [id]: true }))

  const visibleEvents = events.filter((e) => !dismissedIds[e.id])
  const visibleTomorrow = tomorrowEvents.filter((e) => !dismissedIds[e.id])

  // Partition into all-day + timed (sorted by startMin).
  const allDayEvents = useMemo(() =>
    visibleEvents.filter((e) => !!e.isAllDay),
    [visibleEvents])

  const timedEvents = useMemo(() =>
    visibleEvents
      .filter((e) => !e.isAllDay && typeof e.startMin === 'number')
      .sort((a, b) => (a.startMin as number) - (b.startMin as number)),
    [visibleEvents])

  const untimedMeetings = useMemo(() =>
    visibleEvents.filter((e) => !e.isAllDay && typeof e.startMin !== 'number'),
    [visibleEvents])

  // All planned task ids.
  const plannedIds = state.plannedIds()

  // For each timed meeting, find which planned tasks to interleave before it.
  // A task is "before meeting N" if its slot key resolves to that gap.
  // We use a simple heuristic: tasks with slot 'between-N' are shown before
  // the Nth timed meeting cluster (N=0 = before first, N=1 = before second, etc).
  // The AgendaListView doesn't need per-gap drop targets, so we just show them
  // in slot order between the meeting they precede.
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

  // Build the interleaved list for today's timed items.
  // For each gap index, show planned tasks then the meeting.
  const rows: Array<
    | { type: 'task-group'; slot: PlannedSlot; tasks: TaskRow[] }
    | { type: 'meeting'; event: TodayEvent }
    | { type: 'now' }
  > = []

  let nowInserted = false
  const tryInsertNow = (beforeMin: number) => {
    if (!nowInserted && now < beforeMin) {
      nowInserted = true
      rows.push({ type: 'now' })
    }
  }

  timedEvents.forEach((event, idx) => {
    // Show tasks planned "between-N" before the Nth meeting.
    const slot = `between-${idx}` as PlannedSlot
    const slotTasks = plannedTasksBySlot.get(slot) ?? []
    if (slotTasks.length > 0) {
      rows.push({ type: 'task-group', slot, tasks: slotTasks })
    }
    tryInsertNow(event.startMin as number)
    rows.push({ type: 'meeting', event })
  })

  // Trailing tasks (strip + last between slot).
  const trailingSlots: PlannedSlot[] = [
    `between-${timedEvents.length}` as PlannedSlot,
    'strip',
  ]
  for (const slot of trailingSlots) {
    const slotTasks = plannedTasksBySlot.get(slot) ?? []
    if (slotTasks.length > 0) {
      rows.push({ type: 'task-group', slot, tasks: slotTasks })
    }
  }

  // Insert now-line at end if not yet inserted.
  if (!nowInserted) rows.push({ type: 'now' })

  const nowColor = rows.some((r) => r.type === 'meeting') ? ACCENT_CORAL : ACCENT_GOLD

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
            {allDayEvents.map((e) => (
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

      {/* Untimed meetings */}
      {untimedMeetings.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {allDayEvents.length === 0 && <SectionHeader label="Meetings" />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {untimedMeetings.map((e) => (
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
      {(timedEvents.length > 0 || rows.some((r) => r.type === 'task-group')) && (
        <SectionHeader label="Today" />
      )}

      {/* Interleaved timed meetings + tasks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
          // task-group
          return (
            <div key={`tg-${row.slot}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
      </div>

      {/* Restore dismissed */}
      {Object.keys(dismissedIds).length > 0 && (
        <button
          onClick={() => setDismissedIds({})}
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
