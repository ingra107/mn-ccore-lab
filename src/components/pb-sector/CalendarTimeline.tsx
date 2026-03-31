import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Calendar } from 'lucide-react'

interface CalendarEvent {
  id: string
  date: string
  title: string
  type: 'meeting' | 'task' | 'milestone'
  meta?: any
}

interface CalendarTimelineProps {
  events: CalendarEvent[]
}

const HOUR_HEIGHT = 44
const START_HOUR = 7
const END_HOUR = 18

function parseTime(dateStr: string): number | null {
  // Try to extract hour from date string or meta
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return d.getHours() + d.getMinutes() / 60
}

export default function CalendarTimeline({ events }: CalendarTimelineProps) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  const currentHour = now.getHours() + now.getMinutes() / 60
  const nowOffset = (currentHour - START_HOUR) * HOUR_HEIGHT
  const isInRange = currentHour >= START_HOUR && currentHour <= END_HOUR

  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i)

  // Only show meetings for the timeline (tasks/milestones don't have specific times)
  const meetings = events.filter(e => e.type === 'meeting')

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Calendar size={13} style={{ color: 'var(--gold)', opacity: 0.6 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--gold)' }}>
          Today
        </span>
        {meetings.length > 0 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--slate)', opacity: 0.5 }}>
            {meetings.length} meeting{meetings.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div
        className="relative rounded-lg overflow-hidden"
        style={{
          border: '1px solid rgba(201,168,76,0.1)',
          height: (END_HOUR - START_HOUR + 1) * HOUR_HEIGHT,
        }}
      >
        {/* Hour lines */}
        {hours.map((hour) => {
          const top = (hour - START_HOUR) * HOUR_HEIGHT
          return (
            <div key={hour} className="absolute left-0 right-0 flex items-start" style={{ top }}>
              <span
                className="flex-shrink-0 text-right pr-2"
                style={{
                  width: 40,
                  fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--slate)', opacity: 0.4,
                  lineHeight: `${HOUR_HEIGHT}px`,
                }}
              >
                {hour === 0 ? '12a' : hour < 12 ? `${hour}a` : hour === 12 ? '12p' : `${hour - 12}p`}
              </span>
              <div className="flex-1" style={{ borderTop: '1px solid rgba(201,168,76,0.05)', marginTop: 0 }} />
            </div>
          )
        })}

        {/* Meeting blocks */}
        {meetings.map((event) => {
          // For meetings, place them based on title matching common patterns
          // or use a simple 1-hour block at the date's time
          const meetingDate = event.meta?.date || event.date
          const time = parseTime(meetingDate)
          if (time === null || time < START_HOUR || time > END_HOUR) return null

          const top = (time - START_HOUR) * HOUR_HEIGHT
          const height = HOUR_HEIGHT // Default 1-hour block

          return (
            <Link
              key={event.id}
              to={`/meetings/${event.id}`}
              className="absolute block"
              style={{
                left: 44, right: 4, top: top + 2, height: height - 4,
                background: 'rgba(45,138,138,0.12)',
                borderLeft: '3px solid var(--teal)',
                borderRadius: 4,
                textDecoration: 'none',
                padding: '3px 6px',
                overflow: 'hidden',
              }}
            >
              <span className="block truncate" style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--teal)', fontWeight: 500 }}>
                {event.title}
              </span>
            </Link>
          )
        })}

        {/* Current time indicator */}
        {isInRange && (
          <div className="absolute left-0 right-0 flex items-center" style={{ top: nowOffset, zIndex: 10 }}>
            <div style={{ width: 40, display: 'flex', justifyContent: 'flex-end', paddingRight: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)' }} />
            </div>
            <div className="flex-1" style={{ height: 1.5, background: 'var(--gold)' }} />
          </div>
        )}

        {/* "Now" label */}
        {isInRange && (
          <div className="absolute" style={{ right: 8, top: nowOffset + 4, zIndex: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--gold)', fontWeight: 600 }}>
              {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
