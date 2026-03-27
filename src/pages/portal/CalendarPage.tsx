import { useState, useMemo } from 'react'
import { Calendar, List, ChevronLeft, ChevronRight, Users, CheckSquare, Diamond } from 'lucide-react'
import SectionHeader from '../../components/SectionHeader'
import { useCalendarEvents } from '../../hooks/useApiData'
import { getPersonInfo } from '../../data/team'
import { formatLongDate } from '../../lib/dateUtils'
import type { CalendarEvent } from '../../lib/api'

type ViewMode = 'month' | 'agenda'

const eventColors: Record<string, { color: string; bg: string }> = {
  meeting: { color: 'var(--teal)', bg: 'rgba(45,138,138,0.12)' },
  task: { color: 'var(--gold)', bg: 'rgba(201,168,76,0.12)' },
  milestone: { color: 'var(--maroon)', bg: 'rgba(122,0,25,0.12)' },
}

const eventIcons: Record<string, typeof Calendar> = {
  meeting: Users,
  task: CheckSquare,
  milestone: Diamond,
}

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())

  // Get first/last of visible month range (with buffer)
  const { start, end } = useMemo(() => {
    const y = currentDate.getFullYear()
    const m = currentDate.getMonth()
    const first = new Date(y, m - 1, 1)
    const last = new Date(y, m + 2, 0)
    return {
      start: first.toISOString().split('T')[0],
      end: last.toISOString().split('T')[0],
    }
  }, [currentDate])

  const { data: events = [] } = useCalendarEvents({ start, end })

  const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const goToPrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }
  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }
  const goToToday = () => setCurrentDate(new Date())

  return (
    <div>
      <SectionHeader title="Lab Calendar" subtitle="Meetings, deadlines, and milestones" />

      {/* Controls */}
      <div className="mt-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {([
            { key: 'month' as ViewMode, label: 'Month', icon: Calendar },
            { key: 'agenda' as ViewMode, label: 'Agenda', icon: List },
          ]).map((v) => {
            const Icon = v.icon
            const active = view === v.key
            return (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors"
                style={{
                  borderColor: active ? 'var(--teal)' : 'var(--border-light)',
                  backgroundColor: active ? 'rgba(45,138,138,0.1)' : 'transparent',
                  color: active ? 'var(--teal)' : 'var(--slate)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                <Icon size={14} />
                {v.label}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={goToPrevMonth} className="p-1.5 rounded-md border transition-colors hover:bg-black/5" style={{ borderColor: 'var(--border-light)', cursor: 'pointer', background: 'none' }}>
            <ChevronLeft size={16} style={{ color: 'var(--ink)' }} />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1 rounded-md text-sm font-medium"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)', cursor: 'pointer', background: 'none', border: 'none', minWidth: 160, textAlign: 'center' }}
          >
            {monthLabel}
          </button>
          <button onClick={goToNextMonth} className="p-1.5 rounded-md border transition-colors hover:bg-black/5" style={{ borderColor: 'var(--border-light)', cursor: 'pointer', background: 'none' }}>
            <ChevronRight size={16} style={{ color: 'var(--ink)' }} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="mt-5">
        {view === 'month' ? (
          <MonthView currentDate={currentDate} events={events} />
        ) : (
          <AgendaView events={events} />
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t" style={{ borderColor: 'var(--border-light)' }}>
        {Object.entries(eventColors).map(([type, config]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color }} />
            <span className="text-[10px] capitalize" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.6 }}>
              {type === 'task' ? 'Task Due' : type}s
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Month View ───────────────────────────────────────────────

function MonthView({ currentDate, events }: { currentDate: Date; events: CalendarEvent[] }) {
  const today = new Date().toISOString().split('T')[0]
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // Build calendar grid
  const { days, startOffset } = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const offset = firstDay.getDay() // 0=Sun
    const numDays = lastDay.getDate()
    const dayList: string[] = []
    for (let d = 1; d <= numDays; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      dayList.push(iso)
    }
    return { days: dayList, startOffset: offset }
  }, [year, month])

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const list = map.get(e.date) || []
      list.push(e)
      map.set(e.date, list)
    }
    return map
  }, [events])

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-light)' }}>
      {/* Week header */}
      <div className="grid grid-cols-7">
        {weekDays.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-[10px] uppercase tracking-wider font-semibold border-b"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5, borderColor: 'var(--border-light)', backgroundColor: 'var(--cream)' }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {/* Empty cells for offset */}
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="min-h-[80px] border-b border-r" style={{ borderColor: 'var(--border-light)', backgroundColor: 'rgba(0,0,0,0.02)' }} />
        ))}

        {days.map((dateStr) => {
          const dayNum = parseInt(dateStr.split('-')[2])
          const isToday = dateStr === today
          const dayEvents = eventsByDate.get(dateStr) || []

          return (
            <div
              key={dateStr}
              className="min-h-[80px] p-1.5 border-b border-r relative"
              style={{
                borderColor: 'var(--border-light)',
                backgroundColor: isToday ? 'rgba(45,138,138,0.04)' : 'white',
              }}
            >
              {/* Day number */}
              <span
                className={`inline-flex items-center justify-center text-xs font-medium ${isToday ? 'rounded-full' : ''}`}
                style={{
                  width: isToday ? 24 : 'auto',
                  height: isToday ? 24 : 'auto',
                  fontFamily: 'var(--font-mono)',
                  color: isToday ? 'white' : 'var(--ink)',
                  backgroundColor: isToday ? 'var(--teal)' : 'transparent',
                }}
              >
                {dayNum}
              </span>

              {/* Event dots/pills */}
              <div className="flex flex-col gap-0.5 mt-0.5">
                {dayEvents.slice(0, 3).map((e) => {
                  const config = eventColors[e.type] || eventColors.task
                  return (
                    <div
                      key={e.id}
                      className="text-[8px] px-1 py-0.5 rounded truncate"
                      style={{ fontFamily: 'var(--font-sans)', color: config.color, backgroundColor: config.bg }}
                      title={e.title}
                    >
                      {e.title.length > 18 ? e.title.slice(0, 18) + '...' : e.title}
                    </div>
                  )
                })}
                {dayEvents.length > 3 && (
                  <span className="text-[8px] px-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>
                    +{dayEvents.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Agenda View ──────────────────────────────────────────────

function AgendaView({ events }: { events: CalendarEvent[] }) {
  const today = new Date().toISOString().split('T')[0]

  // Only show events from today forward
  const upcoming = events.filter((e) => e.date >= today)

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of upcoming) {
      const list = map.get(e.date) || []
      list.push(e)
      map.set(e.date, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [upcoming])

  return (
    <div className="flex flex-col gap-5">
      {grouped.map(([date, dayEvents]) => {
        const isToday = date === today
        return (
          <div key={date}>
            {/* Date header */}
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: isToday ? 'var(--teal)' : 'var(--slate)', opacity: isToday ? 1 : 0.3 }}
              />
              <span
                className="text-sm font-semibold"
                style={{ fontFamily: 'var(--font-display)', color: isToday ? 'var(--teal)' : 'var(--ink)' }}
              >
                {isToday ? 'Today' : formatLongDate(date)}
              </span>
            </div>

            {/* Events */}
            <div className="flex flex-col gap-1.5 pl-4 border-l-2" style={{ borderColor: isToday ? 'var(--teal)' : 'var(--border-light)' }}>
              {dayEvents.map((e) => {
                const config = eventColors[e.type] || eventColors.task
                const Icon = eventIcons[e.type] || Calendar
                const assignee = e.meta?.assignee as string | undefined

                return (
                  <div key={e.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-black/[0.02] transition-colors">
                    <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: config.bg }}>
                      <Icon size={12} style={{ color: config.color }} />
                    </div>
                    <span className="flex-1 text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
                      {e.title}
                    </span>
                    {assignee && (
                      <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>
                        {getPersonInfo(assignee).name.split(' ')[0]}
                      </span>
                    )}
                    <span className="text-[10px] capitalize px-1.5 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-mono)', color: config.color, backgroundColor: config.bg }}>
                      {e.type}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {grouped.length === 0 && (
        <div className="text-center py-16 text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.5 }}>
          No upcoming events
        </div>
      )}
    </div>
  )
}
