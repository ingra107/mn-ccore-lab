// OverlapBand — side-by-side dashed band that renders when two or more
// meetings collide on the timeline. CD spec: detect via
// `timeToMin(a.start) < timeToMin(b.end) && timeToMin(a.end) > timeToMin(b.start)`.
//
// TP-11 (Phase 39 audit): now implemented. Personal calendar feed events
// carry startMin/endMin (constants.ts:calendarEventToTodayEvent), so Timeline
// can group overlapping events into clusters and pass them here.
//
// TP-11b (2026-05-05): vertical stagger within overlap band. Events with
// different start times receive a top margin proportional to their offset from
// the cluster's earliest start. Scale: PX_PER_MIN px per minute so a 30-min
// stagger (e.g. 2:30 vs 3:00) is clearly visible without making the band
// excessively tall. alignItems: 'start' on the grid ensures each column
// renders at its natural height rather than stretching to the tallest column.

import { EventRow, type SaveStatus } from './MeetingRow'
import { ACCENT_CORAL, INK_DIM } from './constants'
import { withAlpha } from '../../lib/taskGrouping'
import type { TodayEvent } from './constants'

// 2px per minute: 30 min stagger → 60px, 1 hour → 120px.
const PX_PER_MIN = 2

interface OverlapBandProps {
  events: TodayEvent[]
  onDismiss: (id: string) => void
  notes: Record<string, string>
  onNote: (id: string, v: string) => void
  saveStates?: Record<string, SaveStatus>
}

export function OverlapBand({ events, onDismiss, notes, onNote, saveStates }: OverlapBandProps) {
  if (events.length < 2) return null

  // Compute per-event stagger offsets. Events without startMin (untimed) get
  // no stagger — they're already clustered correctly by the Timeline logic.
  const timedEvents = events.filter((e) => typeof e.startMin === 'number')
  const clusterStart = timedEvents.length > 0
    ? Math.min(...timedEvents.map((e) => e.startMin as number))
    : 0
  const staggerPx = (e: TodayEvent): number =>
    typeof e.startMin === 'number' ? (e.startMin - clusterStart) * PX_PER_MIN : 0

  return (
    <div
      role="group"
      aria-label={`${events.length} overlapping events`}
      style={{
        position: 'relative',
        padding: '8px 8px 6px',
        margin: '4px 0',
        border: `1px dashed ${withAlpha(ACCENT_CORAL, 40)}`,
        borderRadius: 8,
        background: 'rgba(240,115,126,0.04)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -8,
          left: 12,
          padding: '1px 6px',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: ACCENT_CORAL,
          background: 'rgba(11,16,23,0.95)',
          borderRadius: 3,
        }}
      >
        ⚠ Overlap · {events.length}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${events.length}, minmax(0, 1fr))`,
          gap: 6,
          alignItems: 'start',
        }}
      >
        {events.map((e) => {
          const topOffset = staggerPx(e)
          return (
            <div key={e.id} style={topOffset > 0 ? { marginTop: topOffset } : undefined}>
              <EventRow
                e={e}
                overlap
                onDismiss={onDismiss}
                note={notes[e.id]}
                onNote={onNote}
                saveStatus={saveStates?.[e.id] ?? 'idle'}
                isCalEvent={e.id.startsWith('cal-')}
              />
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 4, fontSize: 10, color: INK_DIM, fontStyle: 'italic' }}>
        These events conflict — pick one or reschedule.
      </div>
    </div>
  )
}
