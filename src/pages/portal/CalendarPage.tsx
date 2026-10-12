import { useState, useMemo, useEffect, type ElementType } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Calendar, ChevronLeft, ChevronRight, Users, Download } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import EmptyState from '../../components/EmptyState'
import { SegmentedToggle } from '../../components/ui/SegmentedToggle'
import { FilterLinks } from '../../components/ui/FilterLinks'
import { formatBrandName } from '../../components/BrandName'
import { useCalendarEvents } from '../../hooks/useApiData'
import { isProductionVisible } from '../../lib/isProductionVisible'
import { taskFullTitleHint, taskShortLabel } from '../../lib/displayNames'
import { formatLongDate, formatShortDate, localDateKey } from '../../lib/dateUtils'
import type { CalendarEvent } from '../../lib/api'
import { PATHS } from '../../constants/paths'
import { ICON_PROPS } from '../../lib/iconProps'
import { SleekTable, SleekRow, type SleekColumn } from '../../components/table/SleekRows'
import { TaskPriorityLabel, TaskStatusPill } from '../../components/tasks/taskSleekCells'
import { Face } from '../../components/today/skin'
import { NowMarker } from '../../components/moments/NowMarker'

type ViewMode = 'month' | 'week' | 'day' | 'agenda'

// Color jobs (Nick 2026-10-11): an event's TYPE is not a color job. Meeting
// and milestone chips are neutral (maroon read as overdue; teal is the accent,
// kept for today). A meeting reads brighter than a task due date and carries a
// hairline edge; a milestone keeps its gold diamond (`mark`), the one color
// here, matching Deadlines, Agenda and Today.
const eventColors: Record<string, { color: string; bg: string; mark?: string }> = {
  meeting: { color: 'var(--ink)', bg: 'var(--hover-subtle)' },
  task: { color: 'var(--slate)', bg: 'transparent' },
  milestone: { color: 'var(--ink)', bg: 'transparent', mark: 'var(--job-milestone)' },
}

/** The gold diamond before a milestone's title; nothing for other types. */
function EventMark({ e }: { e: CalendarEvent }) {
  const mark = eventColors[e.type]?.mark
  return mark ? <span aria-hidden="true" style={{ color: mark, marginRight: 3 }}>◆</span> : null
}


// Rows, chips and Agenda show the SHORT task title as Today does (eval item
// 34); the full title is the hover tip. Meetings and milestones carry no
// short_title, so they fall through to their title.
function eventLabel(e: CalendarEvent): string {
  return formatBrandName(taskShortLabel(e))
}
function eventFullTitleHint(e: CalendarEvent): string | undefined {
  const full = taskFullTitleHint(e)
  return full ? formatBrandName(full) : undefined
}

// S13: every calendar event type gets a sensible destination, not just
// meetings. Tasks open via the S1 deep-link consumer on My Tasks; milestones
// (deadlines) land on the Deadlines page.
function eventLinkTo(e: CalendarEvent): string | null {
  if (e.type === 'meeting') return PATHS.meeting(e.id)
  if (e.type === 'task') return `${PATHS.myTasks}?open=${e.id}`
  if (e.type === 'milestone') return PATHS.deadlines
  return null
}

export default function CalendarPage() {
  const [view, setView] = useState<ViewMode>(() =>
    // Phone: a 7-column month grid leaves ~48px cells, so start on the agenda list.
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches ? 'agenda' : 'month',
  )
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

  // Meetings and grant milestones are lab-wide; task deadlines are the
  // viewer's own, scoped by the Worker (api/routes/calendar.ts), so a task
  // row needs no assignee label here.
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

  // Count only what the current view shows (the fetch window spans 3 months).
  const monthPrefix = localDateKey(currentDate).slice(0, 7)
  const visibleEvents = events.filter((e) => {
    if (view === 'week') return e.date >= localDateKey(weekStart) && e.date <= localDateKey(weekEnd)
    if (view === 'day') return e.date === localDateKey(currentDate)
    // Same filter as AgendaView: from today forward across the fetch window.
    if (view === 'agenda') return e.date >= localDateKey()
    return e.date.startsWith(monthPrefix)
  })
  const visibleCount = visibleEvents.length
  const isCurrentMonth = monthPrefix === localDateKey().slice(0, 7)
  const monthPhrase = isCurrentMonth ? 'this month' : `in ${currentDate.toLocaleDateString('en-US', { month: 'long' })}`
  const visibleLabel = `event${visibleCount === 1 ? '' : 's'} ${view === 'week' ? 'this week' : view === 'day' ? 'this day' : view === 'agenda' ? 'upcoming' : monthPhrase}`

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
  const openDay = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number)
    setCurrentDate(new Date(y, m - 1, d))
    setView('day')
  }

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
    // P1-1 (Nick 2026-06-10): Calendar shares the universal anchored band + left
    // edge — wrap in .content-container so its primary column's left edge matches
    // the data pages and every other operating surface.
    <div className="content-container">
      <PageHeader
        title="Lab Calendar"
        subtitle={(() => {
          const todayStr = localDateKey()
          const todayCount = events.filter(e => e.date === todayStr).length
          return todayCount > 0
            ? `${visibleCount} ${visibleLabel} · ${todayCount} today`
            : `${visibleCount} ${visibleLabel}`
        })()}
        actions={
          <button onClick={exportICal} className="tk-btn">
            <Download {...ICON_PROPS} size={14} />
            Export
          </button>
        }
      >
        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <SegmentedToggle
              ariaLabel="Calendar view"
              options={(['month', 'week', 'day', 'agenda'] as ViewMode[]).map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))}
              value={view}
              onChange={setView}
            />
            {view === 'month' && (
              <FilterLinks
                ariaLabel="Month density"
                options={[{ value: 'dense', label: 'Dense' }]}
                value={denseWeek ? ['dense'] : []}
                onChange={() => setDenseWeek((v) => !v)}
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={goToPrev}
              aria-label="Previous month"
              className="tk-btn"
            >
              <ChevronLeft {...ICON_PROPS} size={16} />
            </button>
            <button
              onClick={goToToday}
              className="text-sm font-medium min-w-[180px] text-center flex items-center justify-center"
              style={{ minHeight: 44, padding: '0 12px', color: 'var(--ink)', cursor: 'pointer', background: 'none', border: 'none' }}
            >
              {headerLabel}
            </button>
            <button
              onClick={goToNext}
              aria-label="Next month"
              className="tk-btn"
            >
              <ChevronRight {...ICON_PROPS} size={16} />
            </button>

            {currentDate.toDateString() !== new Date().toDateString() && (
              <button
                onClick={goToToday}
                className="tk-btn"
                style={{ color: 'var(--job-accent)' }}
              >
                Today
              </button>
            )}
          </div>
        </div>
      </PageHeader>

      {/* Content — CLS fix (C8): reserve calendar grid height before events arrive */}
      <div className="mt-5">
        {isLoading ? (
          <div
            aria-hidden="true"
            className="sk-mat"
            style={{ minHeight: 600, borderRadius: 'var(--radius-xl)', opacity: 0.85 }}
          />
        ) : (
          <>
            {view === 'month' && <MonthView currentDate={currentDate} events={events} denseWeek={denseWeek} onOpenDay={openDay} />}
            {view === 'week' && <WeekView weekStart={weekStart} events={events} />}
            {view === 'day' && <DayView date={currentDate} events={events} />}
            {view === 'agenda' && <AgendaView events={events} />}
          </>
        )}
      </div>

      {/* Legend. Agenda rows carry no type color, so its key names the glyphs instead. */}
      <div className="flex items-center gap-4 mt-4 pt-3">
        {view === 'agenda' ? (
          <>
            <span className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--slate)', opacity: 0.75 }}><Users {...ICON_PROPS} size={11} aria-hidden="true" />Meetings</span>
            <span className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--slate)', opacity: 0.75 }}><span aria-hidden="true" style={{ color: 'var(--job-milestone)' }}>◆</span>Milestones</span>
            <span className="text-[10px]" style={{ color: 'var(--slate)', opacity: 0.75 }}>Plain rows are your task due dates</span>
          </>
        ) : Object.entries(eventColors).map(([type, config]) => (
          <div key={type} className="flex items-center gap-1.5">
            {config.mark
              ? <span aria-hidden="true" className="text-[10px]" style={{ color: config.mark }}>◆</span>
              : <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: type === 'meeting' ? 'var(--sk-t3)' : 'transparent', boxShadow: type === 'meeting' ? undefined : 'inset 0 0 0 1px var(--sk-t3)' }} />}
            <span className="text-[10px] first-letter:uppercase" style={{ color: 'var(--slate)', opacity: 0.75 }}>
              {type === 'task' ? 'Task due dates' : `${type}s`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Month View ───────────────────────────────────────────────

export function MonthView({ currentDate, events, denseWeek = false, onOpenDay }: { currentDate: Date; events: CalendarEvent[]; denseWeek?: boolean; onOpenDay: (dateStr: string) => void }) {
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
    <div className="sk-mat rounded-xl overflow-hidden">
      <div className="grid grid-cols-7">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="px-2 py-2 text-center text-[12px] font-medium border-b" style={{ color: 'var(--sk-t3)', borderColor: 'var(--sk-line)' }}>
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
              className="border-b px-3 py-1.5 text-[11px]"
              style={{ color: 'var(--sk-t3)', borderColor: 'var(--sk-line)', background: 'var(--hover-subtle)' }}
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
                  <div key={`fill-${wi}-${ci}`} className="min-h-[56px] md:min-h-[80px] border-b border-r" style={{ borderColor: 'var(--sk-line)', backgroundColor: 'var(--hover-subtle)' }} />
                )
              }
              const dateStr = cell.dateStr
              return (
                <DayCellRender key={dateStr} dateStr={dateStr} today={today} dayEvents={eventsByDate.get(dateStr) || []} onOpenDay={onOpenDay} />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── Day cell (extracted for dense-week mode reuse) ───────────

function DayCellRender({ dateStr, today, dayEvents, onOpenDay }: { dateStr: string; today: string; dayEvents: CalendarEvent[]; onOpenDay: (dateStr: string) => void }) {
  const dayNum = parseInt(dateStr.split('-')[2])
  const isToday = dateStr === today
  return (
    // Today: ONE now marker, the teal date disc with its halo (color-back
    // pick 4). The edge line over the cell was a second marker beside the
    // disc (prod check 2026-10-11). A date grid marks today with the disc;
    // the lists and timelines (Day, Agenda, Today) draw the NowMarker line.
    <div className="min-h-[56px] md:min-h-[80px] p-1.5 border-b border-r relative" data-today={isToday ? 'true' : undefined} style={{ borderColor: 'var(--sk-line)' }}>
      <button type="button" onClick={() => onOpenDay(dateStr)} aria-label={`Open ${formatLongDate(dateStr)}`} className={`inline-flex items-center justify-center text-xs font-medium ${isToday ? 'rounded-full now-halo' : ''}`} style={{ width: isToday ? 24 : 'auto', height: isToday ? 24 : 'auto', color: isToday ? 'var(--sk-card)' : 'var(--ink)', backgroundColor: isToday ? 'var(--job-accent)' : 'transparent', cursor: 'pointer', border: 'none', padding: 0 }}>
        {dayNum}
      </button>
      {isToday && <span className="cal-today-lbl">Today</span>}
      <div className="flex flex-col gap-0.5 mt-0.5">
        {dayEvents.slice(0, 3).map((e) => {
          const config = eventColors[e.type] || eventColors.task
          const to = eventLinkTo(e)
          const Wrapper: ElementType = to ? Link : 'div'
          const wrapperProps = to ? { to } : {}
          return (
            <Wrapper key={e.id} {...wrapperProps} className="text-[11px] px-1 py-0.5 rounded truncate block" style={{ color: config.color, backgroundColor: config.bg, textDecoration: 'none', cursor: to ? 'pointer' : 'default' }} title={formatBrandName(e.title)}>
              <EventMark e={e} />{eventLabel(e)}
            </Wrapper>
          )
        })}
        {dayEvents.length > 3 && (
          <button type="button" onClick={() => onOpenDay(dateStr)} className="text-[11px] px-1 text-left hover:underline" style={{ color: 'var(--sk-t3)', background: 'none', border: 'none', cursor: 'pointer' }}>+{dayEvents.length - 3} more</button>
        )}
      </div>
    </div>
  )
}

// ── Week View ────────────────────────────────────────────────

export function WeekView({ weekStart, events }: { weekStart: Date; events: CalendarEvent[] }) {
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
    <div className="sk-mat rounded-xl overflow-hidden grid grid-cols-7">
      {days.map((dateStr, i) => {
        const isToday = dateStr === today
        const dayNum = parseInt(dateStr.split('-')[2])
        const dayEvents = eventsByDate.get(dateStr) || []

        return (
          <div key={dateStr} className="md:min-h-[300px] relative border-r last:border-r-0 min-w-0" style={{ borderColor: 'var(--sk-line)' }}>
            {/* Today: the date disc below is the one now marker (pick 4), as in Month. */}
            <div className="px-2 py-2 text-center">
              <div className="text-[12px]" style={{ color: 'var(--sk-t3)' }}>{dayNames[i]}</div>
              <div className={`text-lg font-semibold mt-0.5 ${isToday ? 'rounded-full inline-flex items-center justify-center w-8 h-8 now-halo' : ''}`} style={{ color: isToday ? 'var(--sk-card)' : 'var(--ink)', backgroundColor: isToday ? 'var(--job-accent)' : 'transparent' }}>
                {dayNum}
              </div>
              {isToday && <div className="cal-today-lbl" style={{ marginLeft: 0, marginTop: 2 }}>Today</div>}
            </div>

            <div className="p-1.5 flex flex-col gap-0.5">
              {dayEvents.map((e) => {
                const config = eventColors[e.type] || eventColors.task
                const to = eventLinkTo(e)
                const Wrapper: ElementType = to ? Link : 'div'
                const wrapperProps = to ? { to } : {}
                return (
                  <Wrapper key={e.id} {...wrapperProps} className="text-[11px] leading-tight px-1 py-1 rounded block min-w-0 break-words"  style={{ color: config.color, backgroundColor: config.bg, textDecoration: 'none', cursor: to ? 'pointer' : 'default' }} title={formatBrandName(e.title)}>
                    <EventMark e={e} />{(() => { const t = eventLabel(e); return t.length > 32 ? t.slice(0, 32) + '...' : t })()}
                  </Wrapper>
                )
              })}
              {dayEvents.length === 0 && (
                <div className="text-center py-4 text-[11px]" style={{ color: 'var(--sk-t3)' }}>—</div>
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
  const navigate = useNavigate()

  return (
    <div>
      <div className={`sr-grp-h sr-grp-static${isToday ? ' sr-grp-now' : ''}`}>
        <h3>{isToday ? 'Today' : formatLongDate(dateStr)}</h3>
        {dayEvents.length > 0 && <span className="sr-n">{dayEvents.length}</span>}
      </div>
      {/* The shared now marker under "Today". */}
      {isToday && <NowMarker showLabel={false} style={{ margin: '2px 10px 10px' }} />}
      {dayEvents.length > 0 ? (
        <SleekTable columns={dayEvents.some(hasGlyph) ? agendaColumnsWithKind : agendaColumnsNoKind} header={false} className="sr-panel">
          {dayEvents.map((e) => {
            const to = eventLinkTo(e)
            return (
              <SleekRow
                key={`${e.type}:${e.id}`}
                row={e}
                data={{ 'event-id': e.id, 'event-type': e.type }}
                urgent={e.type === 'task' && e.category === 'urgent'}
                className={to ? undefined : 'sr-static'}
                onClick={to ? () => navigate(to) : undefined}
              />
            )
          })}
        </SleekTable>
      ) : (
        <EmptyState
          icon={<Calendar size={40} />}
          title="A quiet day"
          subtitle="Meetings, task due dates, and milestones land here automatically as they're scheduled."
        />
      )}
    </div>
  )
}

// ── Agenda View ──────────────────────────────────────────────
// Eval item 87: the agenda is the shared sleek row (components/table/
// SleekRows), grouped by day the way Lanes groups by lane: a quiet heading,
// then one soft panel of one-line rows. No type pill on every row. The kind
// reads from one quiet glyph in a fixed lead slot (people for a meeting, the
// gold diamond for a milestone, nothing for a task, as on Today); a task keeps
// Today's Urgent tag, its non-default status and its owner face.

const KIND_WORD: Record<string, string> = { meeting: 'Meeting', task: 'Task', milestone: 'Milestone' }

function KindGlyph({ e }: { e: CalendarEvent }) {
  const word = KIND_WORD[e.type] ?? e.type
  if (e.type === 'meeting') return <span className="sr-kind" title={word}><Users {...ICON_PROPS} size={13} aria-hidden="true" /><span className="sr-only">{word}</span></span>
  if (e.type === 'milestone') return <span className="sr-dia" title={word}><span aria-hidden="true">◆</span><span className="sr-only">{word}</span></span>
  return <span className="sr-only">{word}</span>
}

function agendaContext(e: CalendarEvent) {
  if (e.type === 'milestone') {
    const grant = typeof e.meta?.grant_title === 'string' ? e.meta.grant_title : null
    return grant ? <span className="sr-m">{grant}</span> : null
  }
  if (e.type === 'task') {
    const status = typeof e.meta?.status === 'string' ? e.meta.status : 'todo'
    // To Do is the default: saying it on every row is the noise item 89 names.
    return status !== 'todo' && status !== 'done' ? <TaskStatusPill status={status} /> : null
  }
  return null
}

// A task has no glyph, so a day of tasks only would leave an empty lead track
// and every title ~26px in (prod check 2026-10-10). The kind column exists
// only on a day that has a meeting or a milestone; the kind word for screen
// readers rides in the title cell when the column is gone.
const hasGlyph = (e: CalendarEvent) => e.type === 'meeting' || e.type === 'milestone'

const kindColumn: SleekColumn<CalendarEvent> = { key: 'kind', width: '18px', phone: 'lead', render: (e) => <KindGlyph e={e} /> }

const agendaRestColumns = (withKind: boolean): SleekColumn<CalendarEvent>[] => [
  {
    key: 'title', width: 'minmax(0,1fr)', phone: 'title', interactive: true,
    render: (e) => {
      const to = eventLinkTo(e)
      const label = eventLabel(e)
      return (
        <div className="sr-tt">
          {!withKind && <span className="sr-only">{KIND_WORD[e.type] ?? e.type}</span>}
          {to ? <Link to={to} className="sr-x sr-open sr-lk" title={eventFullTitleHint(e)}>{label}</Link> : <span className="sr-x" title={eventFullTitleHint(e)}>{label}</span>}
          {e.type === 'task' && e.category === 'urgent' && <TaskPriorityLabel priority="urgent" />}
        </div>
      )
    },
  },
  { key: 'context', width: '200px', phone: 'line', render: agendaContext },
  {
    key: 'owner', width: '26px', phone: 'trail',
    render: (e) => (e.type === 'task' && typeof e.meta?.assignee === 'string' && e.meta.assignee ? <Face slug={e.meta.assignee} /> : null),
  },
]
const agendaColumnsWithKind = [kindColumn, ...agendaRestColumns(true)]
const agendaColumnsNoKind = agendaRestColumns(false)

export function AgendaView({ events }: { events: CalendarEvent[] }) {
  const today = localDateKey()
  const navigate = useNavigate()

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
    <div className="cal-agenda">
      {/* Agenda lists only days with events (all today or later). With nothing
          today the now marker still opens the list, labelled, so the phone
          default view always shows where now is. */}
      {grouped.length > 0 && grouped[0][0] !== today && (
        <NowMarker style={{ margin: '2px 10px 10px' }} />
      )}
      {grouped.map(([date, dayEvents]) => {
        const isToday = date === today
        return (
          <section key={date} aria-label={isToday ? 'Today' : formatLongDate(date)}>
            {isToday && <NowMarker showLabel={false} style={{ margin: '2px 10px 10px' }} />}
            <div className={`sr-grp-h sr-grp-static${isToday ? ' sr-grp-now' : ''}`}>
              <h3>{isToday ? 'Today' : formatLongDate(date)}</h3>
              <span className="sr-n">{dayEvents.length}</span>
            </div>
            <SleekTable columns={dayEvents.some(hasGlyph) ? agendaColumnsWithKind : agendaColumnsNoKind} header={false} className="sr-panel">
              {dayEvents.map((e) => {
                const to = eventLinkTo(e)
                return (
                  <SleekRow
                    key={`${e.type}:${e.id}`}
                    row={e}
                    data={{ 'event-id': e.id, 'event-type': e.type }}
                    urgent={e.type === 'task' && e.category === 'urgent'}
                    className={to ? undefined : 'sr-static'}
                    onClick={to ? () => navigate(to) : undefined}
                  />
                )
              })}
            </SleekTable>
          </section>
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
