// OverlapBand — side-by-side dashed band that renders when two or more
// meetings collide on the timeline. CD spec: detect via
// `timeToMin(a.start) < timeToMin(b.end) && timeToMin(a.end) > timeToMin(b.start)`.
//
// TP-11 (Phase 39 audit): now implemented. Personal calendar feed events
// carry startMin/endMin (constants.ts:calendarEventToTodayEvent), so Timeline
// can group overlapping events into clusters and pass them here.

import { EventRow } from './MeetingRow'
import { ACCENT_CORAL, INK_DIM } from './constants'
import type { TodayEvent } from './constants'

interface OverlapBandProps {
  events: TodayEvent[]
  onDismiss: (id: string) => void
  notes: Record<string, string>
  onNote: (id: string, v: string) => void
}

export function OverlapBand({ events, onDismiss, notes, onNote }: OverlapBandProps) {
  if (events.length < 2) return null
  return (
    <div
      role="group"
      aria-label={`${events.length} overlapping events`}
      style={{
        position: 'relative',
        padding: '8px 8px 6px',
        margin: '4px 0',
        border: `1px dashed ${ACCENT_CORAL}66`,
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
        }}
      >
        {events.map((e) => (
          <EventRow
            key={e.id}
            e={e}
            overlap
            onDismiss={onDismiss}
            note={notes[e.id]}
            onNote={onNote}
          />
        ))}
      </div>
      <div style={{ marginTop: 4, fontSize: 10, color: INK_DIM, fontStyle: 'italic' }}>
        These events conflict — pick one or reschedule.
      </div>
    </div>
  )
}
