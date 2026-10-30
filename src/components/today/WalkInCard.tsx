// WalkInCard — "Back into context" pick A (2026-10-30 UI pairs desk): a brief
// that shows up before the next meeting, only when that meeting has something
// from last time to walk in with. Nick: "A: Walk-in card".
//
// Sources, all already in the Hub (nothing generated here):
//   - the next timed meeting today: the same merged list the timeline draws;
//   - "Last time": the first line of the previous meeting OF THIS SERIES
//     (decisions first, then notes), from /api/meetings, which Today loads;
//   - the action items from that meeting, done and still open: GET
//     /api/meetings/:id/prep, the facilitator prep endpoint.
// The mockup's "since then" line (what changed in someone's files) and the
// after-meeting voice note have no source in the Hub, so they are not drawn.
// Faces only for others: the viewer's own action items carry no face.

import { useNowMinutes } from './useNowMinutes'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { PATHS } from '../../constants/paths'
import { formatShortDate } from '../../lib/dateUtils'
import { taskShortLabel } from '../../lib/displayNames'
import { todayKey } from '../../lib/taskGrouping'
import { firstLine, nextTimedEvent, previousInSeries } from '../../lib/todayPicks'
import type { MeetingRow } from '../../hooks/useApiData'
import type { TodayEvent } from './constants'
import { Face } from './skin'
import './picks.css'

/** How far ahead the card appears: the next meeting within this many minutes. */
export const WALK_IN_LEAD_MIN = 90

interface PrepItem { id: string; short_title?: string | null; title: string | null; assignee: string; completed: number; due_date: string | null }
interface PrepData {
  previousMeeting: { id: string; date: string; title: string } | null
  previousActionItems: PrepItem[]
}

function usePrep(meetingId: string | null) {
  return useQuery<PrepData>({
    queryKey: ['meeting-prep', meetingId],
    queryFn: async () => {
      const res = await fetch(`/api/meetings/${meetingId}/prep`)
      if (!res.ok) throw new Error(`prep ${res.status}`)
      const json = await res.json() as { data: PrepData }
      return json.data
    },
    enabled: !!meetingId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

/** The Hub meeting id a Today row stands for: a matched calendar row carries
 *  it as meetingId; a native row's own id is it. A bare calendar row has none. */
function hubMeetingId(e: TodayEvent): string | null {
  if (e.meetingId) return e.meetingId
  return e.id.startsWith('cal-') ? null : e.id
}

export function WalkInCard({ events, meetings, nowMin: nowProp, viewerSlug, dismissed = {} }: {
  events: TodayEvent[]
  meetings: MeetingRow[]
  /** Minutes since local midnight. Absent = this card's own minute clock, so
   *  only this card re-renders each minute, never the whole page. */
  nowMin?: number
  viewerSlug: string
  dismissed?: Record<string, boolean>
}) {
  const ownClock = useNowMinutes()
  const nowMin = nowProp ?? ownClock
  const next = useMemo(() => nextTimedEvent(events, nowMin, dismissed), [events, nowMin, dismissed])
  const soon = next && next.minutesUntil <= WALK_IN_LEAD_MIN ? next : null
  const meetingId = soon ? hubMeetingId(soon.event) : null
  const prep = usePrep(meetingId)
  const [hiddenFor, setHiddenFor] = useState<string | null>(null)

  if (!soon || !meetingId || hiddenFor === soon.event.id) return null
  const ev = soon.event
  const day = ev.dayKey ?? todayKey()
  // The previous meeting of the series: prep names it; the meetings list holds
  // its decisions and notes. Falls back to the list when prep has not loaded.
  const prevId = prep.data?.previousMeeting?.id
  const prevRow = (prevId ? meetings.find((m) => m.id === prevId) : null)
    ?? previousInSeries(meetings, ev.title, day)
  const last = prevRow ? firstLine(prevRow.decisions, prevRow.notes) : null
  const items = prep.data?.previousActionItems ?? []
  const open = items.filter((i) => !i.completed)
  const done = items.length - open.length
  // Only for a meeting with something to walk in with (the pick's rule).
  if (!last && items.length === 0) return null

  const people = (ev.people ?? []).filter((s) => s !== viewerSlug)
  const mins = soon.minutesUntil
  const when = mins <= 1 ? 'Starting now' : mins < 60 ? `In ${mins} min` : `In ${Math.floor(mins / 60)} h ${mins % 60} min`

  return (
    <section className="pk-walk" aria-label={`Walk-in brief: ${ev.title}`} data-pick="walk-in">
      <div className="pk-walk-h">
        {people.slice(0, 2).map((s) => <Face key={s} slug={s} />)}
        <span className="pk-t">{ev.title}</span>
        <span className="pk-when">{when} · {ev.time}</span>
      </div>
      {last && (
        <>
          <div className="pk-k">Last time{prevRow ? ` · ${formatShortDate(prevRow.date)}` : ''}</div>
          <div className="pk-v">{last}</div>
        </>
      )}
      {items.length > 0 && (
        <>
          <div className="pk-k">From last time · {done} of {items.length} done</div>
          <ul className="pk-items">
            {[...open, ...items.filter((i) => i.completed)].slice(0, 4).map((i) => (
              <li key={i.id} className={i.completed ? 'pk-done' : undefined}>
                <span className="pk-it">{taskShortLabel(i)}</span>
                {i.assignee && i.assignee !== viewerSlug && <Face slug={i.assignee} sm />}
              </li>
            ))}
          </ul>
          {items.length > 4 && <div className="pk-s">{items.length - 4} more on the prep page</div>}
        </>
      )}
      <div className="pk-btns">
        <Link to={PATHS.meetingPrep(meetingId)} className="tk-btn tk-sm tk-pri">Open prep</Link>
        {prevRow && <Link to={PATHS.meeting(prevRow.id)} className="tk-btn tk-sm">Last meeting</Link>}
        <button type="button" className="pk-link" onClick={() => setHiddenFor(ev.id)}>Dismiss</button>
      </div>
    </section>
  )
}
