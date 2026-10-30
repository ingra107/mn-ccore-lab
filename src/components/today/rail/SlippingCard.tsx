// SlippingCard — "Slipping work" pick (2026-10-30 UI pairs desk). Nick picked
// "Both, combined": the Silence Map (what has gone quiet) over Backward
// Shadows (how far back each deadline reaches into free calendar time).
//
// Going quiet, from data the Hub holds:
//   - a meeting series he is in that has passed its own usual pace with
//     nothing booked (quietSeries: at least 3 past meetings, so there is a
//     pace to compare against);
//   - a task marked "waiting on" someone for a week or more (quietWaits).
// Stalled projects and overdue tasks are NOT repeated here: Needs attention,
// above this card, already shows them (design principle 2, once per view).
// "Fine" hides a row for two weeks on this browser; it does not yet learn a
// per-person pace (that needs a store the Hub does not have).
//
// Deadlines casting back: milestones, hard deadlines and deep/multi work due
// in the next 14 days, the soonest three. Free time is the 8:00-17:00 weekday
// window minus the calendar feed. Only a task with estimated_minutes gets a
// "latest workable start" (red when the free time cannot hold it, orange when
// it falls in the next three weekdays); today counts only from now;
// an unsized one shows its free hours and says it has no size.

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CollapseChevron } from '../SectionCollapseToggle'
import { collapseToggleProps } from '../collapseToggleProps'
import { meetingCardFields } from '../constants'
import { useNowMinutes } from '../useNowMinutes'
import { meetingSeriesKey } from '../../../../shared/meetingAudience'
import { Face, Who } from '../skin'
import { PATHS } from '../../../constants/paths'
import { taskShortLabel } from '../../../lib/displayNames'
import { civilDatePlusDays, todayKey } from '../../../lib/taskGrouping'
import {
  buildShadow, dayLoad, eventsOnDay, nextWeekdays, quietSeries, quietWaits, shadowCandidates,
  type CalEvent, type Shadow,
} from '../../../lib/todayPicks'
import type { MeetingRow, UserCalendarEvent } from '../../../hooks/useApiData'
import type { TaskRow } from '../../../lib/api'
import '../picks.css'

const FINE_KEY = 'hub-today-quiet-fine'
const FINE_DAYS = 14
const SHADOW_DAYS = 10

function readFine(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(FINE_KEY) ?? '{}') as Record<string, string> } catch { return {} }
}

/** Two weeks of the viewer's calendar feed (the cache holds 14 days ahead). */
function useCalendarAhead(today: string) {
  return useQuery({
    queryKey: ['user-calendar-events', 'ahead-14', today],
    queryFn: async (): Promise<UserCalendarEvent[]> => {
      const res = await fetch(`/api/integrations/calendar/events?start=${today}&end=${civilDatePlusDays(today, 14)}`)
      if (!res.ok) throw new Error(`calendar events fetch failed: ${res.status}`)
      return ((await res.json()) as { events: UserCalendarEvent[] }).events
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  })
}

const weeks = (d: number) => (d < 14 ? `${d} days` : `${Math.round(d / 7)} weeks`)
const dayHead = (civil: string) => {
  const [y, m, d] = civil.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'narrow' }) + d
}
const shortDay = (civil: string) => {
  const [y, m, d] = civil.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function SlippingCard({ meetings, tasks, viewerSlug, now = new Date(), nowMin: nowProp }: {
  meetings: MeetingRow[]
  tasks: TaskRow[]
  viewerSlug: string
  now?: Date
  /** Minutes since local midnight; absent = this card's own minute clock. */
  nowMin?: number
}) {
  const ownClock = useNowMinutes()
  const nowMin = nowProp ?? ownClock
  const [open, setOpen] = useState(true)
  const [fine, setFine] = useState<Record<string, string>>(readFine)
  const today = todayKey()
  const cal = useCalendarAhead(today)

  // Series the viewer is in: an attendee, or the row's owner.
  const mine = useMemo(
    () => meetings.filter((m) => m.owner_slug === viewerSlug || meetingCardFields(m).people?.includes(viewerSlug)),
    [meetings, viewerSlug],
  )
  // Counted the way quietSeries groups them, so "checked N" matches its rule.
  const seriesCount = useMemo(() => new Set(mine.map((m) => meetingSeriesKey(m.title)).filter(Boolean)).size, [mine])
  const isFine = (id: string) => !!fine[id] && fine[id] >= today
  const series = quietSeries(mine, today).filter((q) => !isFine(`s:${q.key}`))
  const waits = quietWaits(tasks, now).filter((w) => !isFine(`w:${w.task.id}`))
  const markFine = (id: string) => {
    const next = { ...fine, [id]: civilDatePlusDays(today, FINE_DAYS) }
    setFine(next)
    try { localStorage.setItem(FINE_KEY, JSON.stringify(next)) } catch { /* unavailable */ }
  }

  const events: CalEvent[] = cal.data ?? []
  const days = nextWeekdays(today, SHADOW_DAYS)
  const freeByDay = new Map<string, number>()
  for (let d = today; d <= civilDatePlusDays(today, 14); d = civilDatePlusDays(d, 1)) freeByDay.set(d, dayLoad(d, eventsOnDay(d, events), d === today ? nowMin : undefined).freeMin)
  const shadows: Shadow[] = shadowCandidates(tasks, today).map((c) => buildShadow(c, today, freeByDay))

  const quietRows = series.length + waits.length
  // What is drawn: at most 4 series and 5 quiet rows in all. The header counts
  // exactly these; anything cut is named on its own line.
  const shownSeries = series.slice(0, 4)
  const shownWaits = waits.slice(0, Math.max(0, 5 - shownSeries.length))
  const moreQuiet = quietRows - shownSeries.length - shownWaits.length
  const waitingCount = tasks.filter((t) => t.waiting_on?.trim()).length
  if (quietRows === 0 && shadows.length === 0) return null

  return (
    <section className="tk-panel" data-pick="slipping" style={{ marginTop: 14 }}>
      <div {...collapseToggleProps(open, () => setOpen((o) => !o), 'What is slipping')} className="tk-ph tk-clk">
        <div className="tk-ctog">
          <CollapseChevron open={open} />
          <h3>What is slipping</h3>
          <span className="tk-cnt">{shownSeries.length + shownWaits.length + shadows.length}</span>
        </div>
      </div>
      {open && (
        <>
          <div className="tk-rsub" style={{ marginTop: 0 }}>
            Going quiet <span style={{ opacity: 0.8 }}>· checked {seriesCount} meeting series, {waitingCount} waiting {waitingCount === 1 ? 'task' : 'tasks'}</span>
          </div>
          {quietRows === 0 && <div className="pk-s">Nothing has gone quiet.</div>}
          {shownSeries.map((q) => {
            const row = mine.find((m) => m.title === q.title)
            const people = (row ? meetingCardFields(row).people ?? [] : []).filter((s) => s !== viewerSlug)
            return (
              <div key={q.key} className="pk-row" data-testid={`quiet-series-${q.key}`}>
                {people[0] ? <Face slug={people[0]} /> : null}
                <div className="pk-g">
                  <div className="pk-t">{q.title}</div>
                  <div className="pk-s">usually every {weeks(q.usualGapDays)} · <span className="pk-quiet">last one {weeks(q.daysSince)} ago</span></div>
                </div>
                <button type="button" className="pk-fine" title="Hide for two weeks" onClick={() => markFine(`s:${q.key}`)}>Fine</button>
              </div>
            )
          })}
          {shownWaits.map((w) => (
            <div key={w.task.id} className="pk-row" data-testid={`quiet-wait-${w.task.id}`}>
              <div className="pk-g">
                <div className="pk-t">{taskShortLabel(w.task)}</div>
                <div className="pk-s" style={{ display: 'flex', gap: 4, alignItems: 'center', minWidth: 0 }}>
                  Waiting on <Who value={w.task.waiting_on ?? ''} /> · <span className="pk-quiet">{weeks(w.days)}</span>
                </div>
              </div>
              <button type="button" className="pk-fine" title="Hide for two weeks" onClick={() => markFine(`w:${w.task.id}`)}>Fine</button>
            </div>
          ))}
          {moreQuiet > 0 && <div className="pk-s" data-testid="quiet-more">{moreQuiet} more quiet, not shown.</div>}

          <div className="tk-rsub">Deadlines casting back <span style={{ opacity: 0.8 }}>· next 2 weeks</span></div>
          {shadows.length === 0 && <div className="pk-s">No milestones, hard deadlines or deep work due in the next 2 weeks.</div>}
          {shadows.length > 0 && (
            <div className="pk-cal" style={{ ['--pk-days' as string]: days.length }} aria-label="Free calendar time before each deadline">
              <div />
              {days.map((d) => <div key={d} className={`pk-dh${d === today ? ' pk-today' : ''}`}>{dayHead(d)}</div>)}
              <div className="pk-l">Meetings</div>
              {days.map((d) => {
                const { bookedMin } = dayLoad(d, eventsOnDay(d, events))
                return <div key={d} className="pk-c pk-busy" style={{ ['--pk-b' as string]: Math.min(1, bookedMin / 540) }} title={`${Math.round(bookedMin / 60 * 10) / 10} h booked`} />
              })}
              {shadows.map((s) => (
                <ShadowRow key={s.task.id} s={s} days={days} freeByDay={freeByDay} today={today} />
              ))}
            </div>
          )}
          {shadows.map((s) => (
            <div key={s.task.id} className="pk-row" data-testid={`shadow-${s.task.id}`}>
              <div className="pk-g">
                <div className="pk-t">
                  {s.task.project_id
                    ? <Link to={PATHS.project(s.task.project_id)} style={{ color: 'inherit', textDecoration: 'none' }}>{taskShortLabel(s.task)}</Link>
                    : taskShortLabel(s.task)}
                </div>
                <div className="pk-s">
                  {s.hard ? 'deadline' : 'due'} {shortDay(s.due)}{s.hardDate && <> · hard date {shortDay(s.hardDate)}</>} · {shadowLine(s)}
                </div>
              </div>
              {s.tone === 'late' && <span className="pk-tag pk-late">late start</span>}
              {s.tone === 'risk' && <span className="pk-tag pk-risk">at risk</span>}
              {s.tone === 'fine' && <span className="pk-tag">fine</span>}
            </div>
          ))}
          {cal.isError && <div className="pk-s">Calendar did not load, so free time is unknown.</div>}
        </>
      )}
    </section>
  )
}

function shadowLine(s: Shadow): string {
  const free = `${Math.round(s.freeBeforeMin / 60)} free hours before it`
  if (s.sizeMin == null) return `no size set · ${free}`
  const size = s.sizeMin >= 60 ? `${Math.round(s.sizeMin / 60 * 10) / 10} h` : `${s.sizeMin} min`
  if (s.tone === 'late') return `needs ${size}, only ${free}`
  return `needs ${size} · start by ${shortDay(s.latestStart!)}`
}

function ShadowRow({ s, days, freeByDay, today }: { s: Shadow; days: string[]; freeByDay: Map<string, number>; today: string }) {
  const tone = s.tone === 'late' ? ' pk-late' : s.tone === 'risk' ? ' pk-risk' : ''
  return (
    <>
      <div className="pk-l" title={taskShortLabel(s.task)}>{taskShortLabel(s.task)}</div>
      {days.map((d) => {
        if (d === s.hardDate) return <div key={d} className="pk-c pk-due pk-hard" title={`Hard date ${d}`} />
        if (d === s.due) return <div key={d} className={`pk-c pk-due${s.hard ? ' pk-hard' : ''}`} title={`${s.hard ? 'Deadline' : 'Due'} ${d}`} />
        if (d > s.due || d < today) return <div key={d} className="pk-c" />
        const free = freeByDay.get(d) ?? 0
        // The shadow falls only on free time: a fully booked day stays empty.
        return <div key={d} className={free >= 60 ? `pk-c pk-sh${tone}` : 'pk-c'} title={`${Math.round(free / 60 * 10) / 10} h free`} />
      })}
    </>
  )
}
