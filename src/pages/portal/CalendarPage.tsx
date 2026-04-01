import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, ChevronLeft, ChevronRight, Users, CheckSquare, Diamond, Download } from 'lucide-react'
import SectionHeader from '../../components/SectionHeader'
import ToggleButton from '../../components/ToggleButton'
import { formatBrandName } from '../../components/BrandName'
import { useCalendarEvents } from '../../hooks/useApiData'
import { getPersonInfo } from '../../data/team'
import { formatLongDate, formatShortDate } from '../../lib/dateUtils'
import type { CalendarEvent } from '../../lib/api'

type ViewMode = 'month' | 'week' | 'day' | 'agenda'

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

  // Week label
  const weekStart = useMemo(() => {
    const d = new Date(currentDate)
    const day = d.getDay()
    d.setDate(d.getDate() - day)
    return d
  }, [currentDate])
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekLabel = `${formatShortDate(weekStart.toISOString().split('T')[0])} — ${formatShortDate(weekEnd.toISOString().split('T')[0])}, ${weekEnd.getFullYear()}`

  // Day label
  const dayLabel = formatLongDate(currentDate.toISOString().split('T')[0])

  const goToPrev = () => {
    const d = new Date(currentDate)
    if (view === 'month') d.setMonth(d.getMonth() - 1)
    else if (view === 'week') d.setDate(d.getDate() - 7)
    else d.setDate(d.getDate() - 1)
    setCurrentDate(d)
  }
  const goToNext = () => {
    const d = new Date(currentDate)
    if (view === 'month') d.setMonth(d.getMonth() + 1)
    else if (view === 'week') d.setDate(d.getDate() + 7)
    else d.setDate(d.getDate() + 1)
    setCurrentDate(d)
  }
  const goToToday = () => setCurrentDate(new Date())

  const headerLabel = view === 'month' ? monthLabel : view === 'week' ? weekLabel : view === 'day' ? dayLabel : monthLabel

  // iCal export
  const exportICal = () => {
    let ical = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//MN-CCORE Lab//Hub//EN\nCALSCALE:GREGORIAN\n'
    for (const e of events) {
      const dateStr = e.date.replace(/-/g, '')
      ical += `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${dateStr}\nSUMMARY:${e.title.replace(/[,;\\]/g, ' ')}\nDESCRIPTION:${e.type}\nUID:${e.id}@mn-ccore-lab\nEND:VEVENT\n`
    }
    ical += 'END:VCALENDAR'
    const blob = new Blob([ical], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'mnccore-calendar.ics'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <SectionHeader icon={Calendar} title="Lab Calendar" subtitle={`${events.length} events — meetings, deadlines, and milestones`} />

      {/* Controls */}
      <div className="mt-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1">
          {(['month', 'week', 'day', 'agenda'] as ViewMode[]).map((v) => {
            const active = view === v
            return (
              <ToggleButton
                key={v}
                active={active}
                onClick={() => setView(v)}
                className="capitalize"
              >
                {v}
              </ToggleButton>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={goToPrev} className="p-1.5 rounded-md border transition-colors hover:bg-black/5" style={{ borderColor: 'var(--border-light)', cursor: 'pointer', background: 'none' }}>
            <ChevronLeft size={16} style={{ color: 'var(--ink)' }} />
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1 rounded-md text-sm font-medium min-w-[180px] text-center"
            style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)', cursor: 'pointer', background: 'none', border: 'none' }}
          >
            {headerLabel}
          </button>
          <button onClick={goToNext} className="p-1.5 rounded-md border transition-colors hover:bg-black/5" style={{ borderColor: 'var(--border-light)', cursor: 'pointer', background: 'none' }}>
            <ChevronRight size={16} style={{ color: 'var(--ink)' }} />
          </button>

          {currentDate.toDateString() !== new Date().toDateString() && (
            <button
              onClick={goToToday}
              className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
              style={{ fontFamily: 'var(--font-sans)', color: 'var(--teal)', borderColor: 'var(--teal)', cursor: 'pointer', background: 'none' }}
            >
              Today
            </button>
          )}

          <button
            onClick={exportICal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors hover:bg-black/5 ml-1"
            style={{ borderColor: 'var(--border-light)', color: 'var(--slate)', fontFamily: 'var(--font-sans)', cursor: 'pointer', background: 'none' }}
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="mt-5">
        {view === 'month' && <MonthView currentDate={currentDate} events={events} />}
        {view === 'week' && <WeekView weekStart={weekStart} events={events} />}
        {view === 'day' && <DayView date={currentDate} events={events} />}
        {view === 'agenda' && <AgendaView events={events} />}
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

  const { days, startOffset } = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const offset = firstDay.getDay()
    const numDays = lastDay.getDate()
    const dayList: string[] = []
    for (let d = 1; d <= numDays; d++) {
      dayList.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
    return { days: dayList, startOffset: offset }
  }, [year, month])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const list = map.get(e.date) || []
      list.push(e)
      map.set(e.date, list)
    }
    return map
  }, [events])

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-light)' }}>
      <div className="grid grid-cols-7">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="px-2 py-2 text-center text-[10px] uppercase tracking-wider font-semibold border-b" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5, borderColor: 'var(--border-light)', backgroundColor: 'var(--cream)' }}>
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`empty-${i}`} className="min-h-[80px] border-b border-r" style={{ borderColor: 'var(--border-light)', backgroundColor: 'rgba(0,0,0,0.02)' }} />
        ))}
        {days.map((dateStr) => {
          const dayNum = parseInt(dateStr.split('-')[2])
          const isToday = dateStr === today
          const dayEvents = eventsByDate.get(dateStr) || []
          return (
            <div key={dateStr} className="min-h-[80px] p-1.5 border-b border-r relative" style={{ borderColor: 'var(--border-light)', backgroundColor: isToday ? 'rgba(45,138,138,0.04)' : 'var(--cream)' }}>
              <span className={`inline-flex items-center justify-center text-xs font-medium ${isToday ? 'rounded-full' : ''}`} style={{ width: isToday ? 24 : 'auto', height: isToday ? 24 : 'auto', fontFamily: 'var(--font-mono)', color: isToday ? 'white' : 'var(--ink)', backgroundColor: isToday ? 'var(--teal)' : 'transparent' }}>
                {dayNum}
              </span>
              <div className="flex flex-col gap-0.5 mt-0.5">
                {dayEvents.slice(0, 3).map((e) => {
                  const config = eventColors[e.type] || eventColors.task
                  const Wrapper = e.type === 'meeting' ? Link : 'div' as any
                  const wrapperProps = e.type === 'meeting' ? { to: `/meetings/${e.id}` } : {}
                  return (
                    <Wrapper key={e.id} {...wrapperProps} className="text-[8px] px-1 py-0.5 rounded truncate block" style={{ fontFamily: 'var(--font-sans)', color: config.color, backgroundColor: config.bg, textDecoration: 'none', cursor: e.type === 'meeting' ? 'pointer' : 'default' }} title={formatBrandName(e.title)}>
                      {(() => { const t = formatBrandName(e.title); return t.length > 20 ? t.slice(0, 20) + '...' : t })()}
                    </Wrapper>
                  )
                })}
                {dayEvents.length > 3 && (
                  <span className="text-[8px] px-1" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>+{dayEvents.length - 3} more</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Week View ────────────────────────────────────────────────

function WeekView({ weekStart, events }: { weekStart: Date; events: CalendarEvent[] }) {
  const today = new Date().toISOString().split('T')[0]

  const days = useMemo(() => {
    const result: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      result.push(d.toISOString().split('T')[0])
    }
    return result
  }, [weekStart])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const list = map.get(e.date) || []
      list.push(e)
      map.set(e.date, list)
    }
    return map
  }, [events])

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="grid grid-cols-7 gap-3">
      {days.map((dateStr, i) => {
        const isToday = dateStr === today
        const dayNum = parseInt(dateStr.split('-')[2])
        const dayEvents = eventsByDate.get(dateStr) || []

        return (
          <div key={dateStr} className="rounded-lg border min-h-[300px]" style={{ borderColor: isToday ? 'var(--teal)' : 'var(--border-light)', backgroundColor: isToday ? 'rgba(45,138,138,0.02)' : 'var(--cream)' }}>
            {/* Day header */}
            <div className="px-2 py-2 border-b text-center" style={{ borderColor: 'var(--border-light)' }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>{dayNames[i]}</div>
              <div className={`text-lg font-semibold mt-0.5 ${isToday ? 'rounded-full inline-flex items-center justify-center w-8 h-8' : ''}`} style={{ fontFamily: 'var(--font-sans)', color: isToday ? 'white' : 'var(--ink)', backgroundColor: isToday ? 'var(--teal)' : 'transparent' }}>
                {dayNum}
              </div>
            </div>

            {/* Events */}
            <div className="p-1.5 flex flex-col gap-1">
              {dayEvents.map((e) => {
                const config = eventColors[e.type] || eventColors.task
                const Icon = eventIcons[e.type] || Calendar
                return (
                  <div key={e.id} className="flex items-start gap-1 p-1.5 rounded" style={{ backgroundColor: config.bg }}>
                    <Icon size={10} style={{ color: config.color, marginTop: 2, flexShrink: 0 }} />
                    <span className="text-[9px] leading-tight" style={{ fontFamily: 'var(--font-sans)', color: config.color }}>
                      {(() => { const t = formatBrandName(e.title); return t.length > 32 ? t.slice(0, 32) + '...' : t })()}
                    </span>
                  </div>
                )
              })}
              {dayEvents.length === 0 && (
                <div className="text-center py-4 text-[9px]" style={{ color: 'var(--slate)', opacity: 0.3, fontFamily: 'var(--font-sans)' }}>—</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Day View ─────────────────────────────────────────────────

function DayView({ date, events }: { date: Date; events: CalendarEvent[] }) {
  const dateStr = date.toISOString().split('T')[0]
  const dayEvents = events.filter((e) => e.date === dateStr)
  const isToday = dateStr === new Date().toISOString().split('T')[0]

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-light)' }}>
      <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-light)', backgroundColor: isToday ? 'rgba(45,138,138,0.04)' : 'var(--cream)' }}>
        <h3 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-sans)', color: isToday ? 'var(--teal)' : 'var(--ink)' }}>
          {isToday ? 'Today' : formatLongDate(dateStr)}
        </h3>
        <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>
          {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="p-4">
        {dayEvents.length > 0 ? (
          <div className="flex flex-col gap-3">
            {dayEvents.map((e) => {
              const config = eventColors[e.type] || eventColors.task
              const Icon = eventIcons[e.type] || Calendar
              const assignee = e.meta?.assignee as string | undefined
              const Wrapper = e.type === 'meeting' ? Link : 'div' as any
              const wrapperProps = e.type === 'meeting' ? { to: `/meetings/${e.id}` } : {}

              return (
                <Wrapper key={e.id} {...wrapperProps} className="flex items-center gap-4 px-4 py-3 rounded-lg border transition-colors hover:shadow-sm" style={{ borderColor: 'var(--border-light)', textDecoration: 'none', cursor: e.type === 'meeting' ? 'pointer' : 'default' }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: config.bg }}>
                    <Icon size={18} style={{ color: config.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>{formatBrandName(e.title)}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] capitalize px-1.5 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-mono)', color: config.color, backgroundColor: config.bg }}>{e.type}</span>
                      {assignee && (
                        <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>{getPersonInfo(assignee).name}</span>
                      )}
                    </div>
                  </div>
                </Wrapper>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-20">
            <div
              className="mx-auto mb-4"
              style={{ width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,138,138,0.08)' }}
            >
              <Calendar size={28} style={{ color: 'var(--teal)', opacity: 0.6 }} />
            </div>
            <p className="text-base font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
              No events on this day
            </p>
            <p className="text-sm mt-1.5 max-w-sm mx-auto" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.7 }}>
              Meetings, task deadlines, and milestones will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Agenda View ──────────────────────────────────────────────

function AgendaView({ events }: { events: CalendarEvent[] }) {
  const today = new Date().toISOString().split('T')[0]

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      if (e.date < today) continue
      const list = map.get(e.date) || []
      list.push(e)
      map.set(e.date, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [events, today])

  return (
    <div className="flex flex-col gap-5">
      {grouped.map(([date, dayEvents]) => {
        const isToday = date === today
        return (
          <div key={date}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: isToday ? 'var(--teal)' : 'var(--slate)', opacity: isToday ? 1 : 0.3 }} />
              <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-sans)', color: isToday ? 'var(--teal)' : 'var(--ink)' }}>
                {isToday ? 'Today' : formatLongDate(date)}
              </span>
            </div>
            <div className="flex flex-col gap-1.5 pl-4 border-l-2" style={{ borderColor: isToday ? 'var(--teal)' : 'var(--border-light)' }}>
              {dayEvents.map((e) => {
                const config = eventColors[e.type] || eventColors.task
                const Icon = eventIcons[e.type] || Calendar
                const assignee = e.meta?.assignee as string | undefined
                const AgendaWrapper = e.type === 'meeting' ? Link : 'div' as any
                const agendaProps = e.type === 'meeting' ? { to: `/meetings/${e.id}` } : {}
                return (
                  <AgendaWrapper key={e.id} {...agendaProps} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-black/[0.02] transition-colors" style={{ textDecoration: 'none' }}>
                    <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: config.bg }}>
                      <Icon size={12} style={{ color: config.color }} />
                    </div>
                    <span className="flex-1 text-sm" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>{formatBrandName(e.title)}</span>
                    {assignee && (
                      <span className="text-[10px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--slate)', opacity: 0.5 }}>{getPersonInfo(assignee).name.split(' ')[0]}</span>
                    )}
                    <span className="text-[10px] capitalize px-1.5 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-mono)', color: config.color, backgroundColor: config.bg }}>{e.type}</span>
                  </AgendaWrapper>
                )
              })}
            </div>
          </div>
        )
      })}
      {grouped.length === 0 && (
        <div className="text-center py-20">
          <div
            className="mx-auto mb-4"
            style={{ width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(45,138,138,0.08)' }}
          >
            <Calendar size={28} style={{ color: 'var(--teal)', opacity: 0.6 }} />
          </div>
          <p className="text-base font-medium" style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink)' }}>
            No upcoming events
          </p>
          <p className="text-sm mt-1.5 max-w-sm mx-auto" style={{ fontFamily: 'var(--font-sans)', color: 'var(--slate)', opacity: 0.7 }}>
            Scheduled meetings, task deadlines, and milestones will appear in the agenda.
          </p>
        </div>
      )}
    </div>
  )
}
