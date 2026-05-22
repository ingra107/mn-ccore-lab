import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Calendar, ChevronLeft, ChevronRight, Users, CheckSquare, Diamond, Download } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import ToggleButton from '../../components/ToggleButton'
import { formatBrandName } from '../../components/BrandName'
import { useCalendarEvents } from '../../hooks/useApiData'
import { isProductionVisible } from '../../lib/isProductionVisible'
import { getPersonInfo } from '../../data/team'
import { formatLongDate, formatShortDate, localDateKey } from '../../lib/dateUtils'
import type { CalendarEvent } from '../../lib/api'
import { staggerContainer, staggerItem } from '../../lib/animations'
import { PATHS } from '../../constants/paths'

type ViewMode = 'month' | 'week' | 'day' | 'agenda'

const eventColors: Record<string, { color: string; bg: string }> = {
  meeting: { color: 'var(--teal)', bg: 'color-mix(in srgb, var(--teal) 12%, transparent)' },
  task: { color: 'var(--gold)', bg: 'var(--gold-emphasis)' },
  milestone: { color: 'var(--maroon)', bg: 'color-mix(in srgb, var(--maroon) 12%, transparent)' },
}

const eventIcons: Record<string, typeof Calendar> = {
  meeting: Users,
  task: CheckSquare,
  milestone: Diamond,
}

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  // P3-08: dense-week toggle. When on, MonthView collapses any all-empty
  // week (Sun-Sat row with zero events) to a single rule line.
  const [denseWeek, setDenseWeek] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('calendar-dense-week') === 'true'
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (denseWeek) window.localStorage.setItem('calendar-dense-week', 'true')
    else window.localStorage.removeItem('calendar-dense-week')
  }, [denseWeek])

  const { start, end } = useMemo(() => {
    const y = currentDate.getFullYear()
    const m = currentDate.getMonth()
    const first = new Date(y, m - 1, 1)
    const last = new Date(y, m + 2, 0)
    return {
      start: localDateKey(first),
      end: localDateKey(last),
    }
  }, [currentDate])

  const { data: rawEvents = [], isLoading } = useCalendarEvents({ start, end })
  const events = useMemo(
    () => rawEvents.filter((e) => isProductionVisible(e.title)),
    [rawEvents],
  )

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
  const weekLabel = `${formatShortDate(localDateKey(weekStart))} — ${formatShortDate(localDateKey(weekEnd))}, ${weekEnd.getFullYear()}`

  // Day label
  const dayLabel = formatLongDate(localDateKey(currentDate))

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

  // Keyboard navigation: arrow keys for prev/next, T for today
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft') { e.preventDefault(); goToPrev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); goToNext() }
      if (e.key === 't' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); goToToday() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [view, currentDate])

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
      <PageHeader
        icon={<Calendar size={20} />}
        title="Lab Calendar"
        subtitle={(() => {
          const todayStr = localDateKey()
          const todayCount = events.filter(e => e.date === todayStr).length
          return todayCount > 0
            ? `${events.length} events · ${todayCount} today`
            : `${events.length} events`
        })()}
        count={events.length}
        actions={
          <button
            onClick={exportICal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors hover:bg-black/5"
            style={{ borderColor: 'var(--border-subtle)', color: 'var(--slate)', cursor: 'pointer', background: 'none' }}
          >
            <Download size={14} />
            Export
          </button>
        }
      >
        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
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
            {view === 'month' && (
              <ToggleButton
                active={denseWeek}
                onClick={() => setDenseWeek((v) => !v)}
              >
                Dense
              </ToggleButton>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={goToPrev}
              aria-label="Previous month"
              className="rounded-md border transition-colors hover:bg-black/5 flex items-center justify-center"
              style={{ minHeight: 44, minWidth: 44, borderColor: 'var(--border-subtle)', cursor: 'pointer', background: 'none' }}
            >
              <ChevronLeft size={18} style={{ color: 'var(--ink)' }} />
            </button>
            <button
              onClick={goToToday}
              className="rounded-md text-sm font-medium min-w-[180px] text-center flex items-center justify-center"
              style={{ minHeight: 44, padding: '0 12px', color: 'var(--ink)', cursor: 'pointer', background: 'none', border: 'none' }}
            >
              {headerLabel}
            </button>
            <button
              onClick={goToNext}
              aria-label="Next month"
              className="rounded-md border transition-colors hover:bg-black/5 flex items-center justify-center"
              style={{ minHeight: 44, minWidth: 44, borderColor: 'var(--border-subtle)', cursor: 'pointer', background: 'none' }}
            >
              <ChevronRight size={18} style={{ color: 'var(--ink)' }} />
            </button>

            {currentDate.toDateString() !== new Date().toDateString() && (
              <button
                onClick={goToToday}
                className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors"
                style={{ color: 'var(--teal)', borderColor: 'var(--teal)', cursor: 'pointer', background: 'none' }}
              >
                Today
              </button>
            )}
          </div>
        </div>
      </PageHeader>

      {/* Content — CLS fix (C8): reserve calendar grid height before events arrive */}
      <div className="mt-5" style={{ minHeight: 600 }}>
        {isLoading ? (
          <div
            aria-hidden="true"
            style={{
              minHeight: 600,
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--surface-1)',
              opacity: 0.85,
            }}
          />
        ) : (
          <>
            {view === 'month' && <MonthView currentDate={currentDate} events={events} denseWeek={denseWeek} />}
            {view === 'week' && <WeekView weekStart={weekStart} events={events} />}
            {view === 'day' && <DayView date={currentDate} events={events} />}
            {view === 'agenda' && <AgendaView events={events} />}
          </>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        {Object.entries(eventColors).map(([type, config]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: config.color }} />
            <span className="text-[10px] capitalize" style={{ color: 'var(--slate)', opacity: 0.75 }}>
              {type === 'task' ? 'Task Due' : type}s
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Month View ───────────────────────────────────────────────

function MonthView({ currentDate, events, denseWeek = false }: { currentDate: Date; events: CalendarEvent[]; denseWeek?: boolean }) {
  const today = localDateKey()
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

  // P3-08: bucket cells into weeks of 7 so the dense-week mode can drop
  // any week that has zero events (incl. leading-offset filler).
  type Cell = { kind: 'fill' } | { kind: 'day'; dateStr: string }
  const weeks = useMemo<Cell[][]>(() => {
    const cells: Cell[] = [
      ...Array.from({ length: startOffset }, () => ({ kind: 'fill' as const })),
      ...days.map((dateStr) => ({ kind: 'day' as const, dateStr })),
    ]
    const out: Cell[][] = []
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7))
    // Pad final week to 7 cells
    if (out.length > 0 && out[out.length - 1].length < 7) {
      while (out[out.length - 1].length < 7) out[out.length - 1].push({ kind: 'fill' })
    }
    return out
  }, [days, startOffset])

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="grid grid-cols-7">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="px-2 py-2 text-center text-[10px] uppercase tracking-wider font-semibold border-b" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)', borderColor: 'var(--border-subtle)', backgroundColor: 'var(--cream)' }}>
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => {
        const weekHasEvents = week.some((c) => c.kind === 'day' && (eventsByDate.get(c.dateStr)?.length ?? 0) > 0)
        if (denseWeek && !weekHasEvents) {
          const firstDay = week.find((c) => c.kind === 'day') as Extract<Cell, { kind: 'day' }> | undefined
          const label = firstDay ? `Week of ${firstDay.dateStr}` : 'Empty week'
          return (
            <div
              key={`week-${wi}`}
              className="border-b px-3 py-1.5 text-[10px] uppercase tracking-wider"
              style={{ color: 'var(--slate)', opacity: 0.85, borderColor: 'var(--border-subtle)', background: 'var(--hover-subtle)' }}
            >
              {label} · no events
            </div>
          )
        }
        return (
          <div key={`week-${wi}`} className="grid grid-cols-7">
            {week.map((cell, ci) => {
              if (cell.kind === 'fill') {
                return (
                  <div key={`fill-${wi}-${ci}`} className="min-h-[80px] border-b border-r" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--hover-subtle)' }} />
                )
              }
              const dateStr = cell.dateStr
              return (
                <DayCellRender key={dateStr} dateStr={dateStr} today={today} dayEvents={eventsByDate.get(dateStr) || []} />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── Day cell (extracted for dense-week mode reuse) ───────────

function DayCellRender({ dateStr, today, dayEvents }: { dateStr: string; today: string; dayEvents: CalendarEvent[] }) {
  const dayNum = parseInt(dateStr.split('-')[2])
  const isToday = dateStr === today
  return (
    <div className="min-h-[80px] p-1.5 border-b border-r relative" style={{ borderColor: 'var(--border-subtle)', backgroundColor: isToday ? 'var(--teal-hover)' : 'var(--cream)', boxShadow: isToday ? 'inset 0 0 0 2px rgba(45,138,138,0.2)' : 'none' }}>
      <span className={`inline-flex items-center justify-center text-xs font-medium ${isToday ? 'rounded-full' : ''}`} style={{ width: isToday ? 24 : 'auto', height: isToday ? 24 : 'auto', color: isToday ? 'var(--ink-bright, #fff)' : 'var(--ink)', backgroundColor: isToday ? 'var(--teal-solid)' : 'transparent' }}>
        {dayNum}
      </span>
      <div className="flex flex-col gap-0.5 mt-0.5">
        {dayEvents.slice(0, 3).map((e) => {
          const config = eventColors[e.type] || eventColors.task
          const Wrapper = e.type === 'meeting' ? Link : 'div' as any
          const wrapperProps = e.type === 'meeting' ? { to: PATHS.meeting(e.id) } : {}
          return (
            <Wrapper key={e.id} {...wrapperProps} className="text-[10px] px-1 py-0.5 rounded truncate block" style={{ color: config.color, backgroundColor: config.bg, textDecoration: 'none', cursor: e.type === 'meeting' ? 'pointer' : 'default' }} title={formatBrandName(e.title)}>
              {(() => { const t = formatBrandName(e.title); return t.length > 20 ? t.slice(0, 20) + '...' : t })()}
            </Wrapper>
          )
        })}
        {dayEvents.length > 3 && (
          <span className="text-[10px] px-1" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>+{dayEvents.length - 3} more</span>
        )}
      </div>
    </div>
  )
}

// ── Week View ────────────────────────────────────────────────

function WeekView({ weekStart, events }: { weekStart: Date; events: CalendarEvent[] }) {
  const today = localDateKey()

  const days = useMemo(() => {
    const result: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      result.push(localDateKey(d))
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
          <div key={dateStr} className="rounded-lg border min-h-[300px]" style={{ borderColor: isToday ? 'var(--teal)' : 'var(--border-subtle)', backgroundColor: isToday ? 'var(--teal-hover)' : 'var(--cream)' }}>
            {/* Day header */}
            <div className="px-2 py-2 border-b text-center" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>{dayNames[i]}</div>
              <div className={`text-lg font-semibold mt-0.5 ${isToday ? 'rounded-full inline-flex items-center justify-center w-8 h-8' : ''}`} style={{ color: isToday ? 'var(--ink-bright, #fff)' : 'var(--ink)', backgroundColor: isToday ? 'var(--teal-solid)' : 'transparent' }}>
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
                    <span className="text-[10px] leading-tight" style={{ color: config.color }}>
                      {(() => { const t = formatBrandName(e.title); return t.length > 32 ? t.slice(0, 32) + '...' : t })()}
                    </span>
                  </div>
                )
              })}
              {dayEvents.length === 0 && (
                <div className="text-center py-4 text-[10px]" style={{ color: 'var(--slate)', opacity: 0.75 }}>—</div>
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
  const dateStr = localDateKey(date)
  const dayEvents = events.filter((e) => e.date === dateStr)
  const isToday = dateStr === localDateKey()

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-subtle)', backgroundColor: isToday ? 'var(--teal-hover)' : 'var(--cream)' }}>
        <h3 className="text-lg font-normal" style={{ color: isToday ? 'var(--teal)' : 'var(--ink)' }}>
          {isToday ? 'Today' : formatLongDate(dateStr)}
        </h3>
        <span className="text-xs" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>
          {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="p-4">
        {dayEvents.length > 0 ? (
          <motion.div className="flex flex-col gap-3" variants={staggerContainer} initial="hidden" animate="visible">
            {dayEvents.map((e) => {
              const config = eventColors[e.type] || eventColors.task
              const Icon = eventIcons[e.type] || Calendar
              const assignee = e.meta?.assignee as string | undefined
              const Wrapper = e.type === 'meeting' ? Link : 'div' as any
              const wrapperProps = e.type === 'meeting' ? { to: PATHS.meeting(e.id) } : {}

              return (
                <motion.div key={e.id} variants={staggerItem}>
                  <Wrapper {...wrapperProps} className="flex items-center gap-4 px-4 py-3 rounded-lg border transition-colors hover:shadow-sm" style={{ borderColor: 'var(--border-subtle)', textDecoration: 'none', cursor: e.type === 'meeting' ? 'pointer' : 'default' }}>
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: config.bg }}>
                      <Icon size={18} style={{ color: config.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{formatBrandName(e.title)}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] capitalize px-1.5 py-0.5 rounded-full" style={{ color: config.color, backgroundColor: config.bg }}>{e.type}</span>
                        {assignee && (
                          <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>{getPersonInfo(assignee).name}</span>
                        )}
                      </div>
                    </div>
                  </Wrapper>
                </motion.div>
              )
            })}
          </motion.div>
        ) : (
          <EmptyState
            icon={<Calendar size={40} />}
            title="A quiet day"
            subtitle="Meetings, task due dates, and milestones land here automatically as they're scheduled."
          />
        )}
      </div>
    </div>
  )
}

// ── Agenda View ──────────────────────────────────────────────

function AgendaView({ events }: { events: CalendarEvent[] }) {
  const today = localDateKey()

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
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: isToday ? 'var(--teal-solid)' : 'var(--slate)', opacity: isToday ? 1 : 0.85 }} />
              <span className="text-sm font-semibold" style={{ color: isToday ? 'var(--teal)' : 'var(--ink)' }}>
                {isToday ? 'Today' : formatLongDate(date)}
              </span>
            </div>
            <motion.div className="flex flex-col gap-1.5 pl-4 border-l-2" style={{ borderColor: isToday ? 'var(--teal)' : 'var(--border-subtle)' }} variants={staggerContainer} initial="hidden" animate="visible">
              {dayEvents.map((e) => {
                const config = eventColors[e.type] || eventColors.task
                const Icon = eventIcons[e.type] || Calendar
                const assignee = e.meta?.assignee as string | undefined
                const AgendaWrapper = e.type === 'meeting' ? Link : 'div' as any
                const agendaProps = e.type === 'meeting' ? { to: PATHS.meeting(e.id) } : {}
                return (
                  <motion.div key={e.id} variants={staggerItem}>
                    <AgendaWrapper {...agendaProps} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors" style={{ textDecoration: 'none' }}>
                      <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: config.bg }}>
                        <Icon size={12} style={{ color: config.color }} />
                      </div>
                      <span className="flex-1 text-sm" style={{ color: 'var(--ink)' }}>{formatBrandName(e.title)}</span>
                      {assignee && (
                        <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 'var(--ink-label)' }}>{getPersonInfo(assignee).name.split(' ')[0]}</span>
                      )}
                      <span className="text-[10px] capitalize px-1.5 py-0.5 rounded-full" style={{ color: config.color, backgroundColor: config.bg }}>{e.type}</span>
                    </AgendaWrapper>
                  </motion.div>
                )
              })}
            </motion.div>
          </div>
        )
      })}
      {grouped.length === 0 && (
        <EmptyState
          icon={<Calendar size={40} />}
          title="The week ahead is open"
          subtitle="Meetings, deadlines, and milestones stream in here as the team books them."
        />
      )}
    </div>
  )
}
