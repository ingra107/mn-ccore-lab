// GapStack — "Phone between meetings" pick A (2026-10-30 UI pairs desk).
// Nick: "A: Gap Stack". On a phone, at the top of Today: how many minutes are
// left before the next meeting, then only the tasks that fit them, then the
// meeting itself with its Join link. Nothing else on Today moves; the full
// page is still right below it (principle 16: a new structure is opt-in and
// loses nothing).
//
// Fit needs a size, and most tasks carry none: estimated_minutes is set on
// none of Nick's open tasks today and PB's effort tag on a handful. So a row
// "fits" only when it has a size that fits (minutes <= the gap, or tagged
// quick); the rest of the stack is the next tasks by rank, labelled
// "no estimate", never given an invented number.

import { useNowMinutes } from './useNowMinutes'
import { useMemo } from 'react'
import { CardCheck } from '../tasks/TaskCardRow'
import { taskShortLabel } from '../../lib/displayNames'
import { buildGapStack, nextTimedEvent } from '../../lib/todayPicks'
import { todayKey } from '../../lib/taskGrouping'
import type { TaskRow } from '../../lib/api'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TodayEvent } from './constants'
import { Face } from './skin'
import './picks.css'

export function GapStack({ events, tasks, state, projectsByPid, nowMin: nowProp, viewerSlug, dismissed = {} }: {
  events: TodayEvent[]
  tasks: TaskRow[]
  state: Pick<TodayStateApi, 'planned' | 'done' | 'markDone' | 'uncheck'>
  projectsByPid: Map<string, { name: string }>
  /** Minutes since local midnight. Absent = this card's own minute clock, so
   *  only this card re-renders each minute, never the whole page. */
  nowMin?: number
  viewerSlug: string
  dismissed?: Record<string, boolean>
}) {
  const ownClock = useNowMinutes()
  const nowMin = nowProp ?? ownClock
  const next = useMemo(() => nextTimedEvent(events, nowMin, dismissed), [events, nowMin, dismissed])
  const stack = useMemo(
    () => (next ? buildGapStack(tasks.filter((t) => t.kind !== 'milestone'), next.minutesUntil, todayKey(), (id) => !!state.planned[id]) : null),
    [next, tasks, state.planned],
  )
  if (!next || !stack) return null
  const ev = next.event
  const gap = next.minutesUntil
  // The rule fills with the part of this gap already used: from the end of
  // the meeting before it (when there is one today) to now.
  const prevEnd = events
    .filter((e) => !e.isAllDay && e.endMin != null && e.endMin <= nowMin && !dismissed[e.id])
    .reduce<number | null>((m, e) => (m == null || (e.endMin ?? 0) > m ? e.endMin ?? null : m), null)
  const used = prevEnd != null && (ev.startMin ?? 0) > prevEnd ? (nowMin - prevEnd) / ((ev.startMin ?? 0) - prevEnd) : null
  const gapLabel = gap < 60 ? `${gap} min` : `${Math.floor(gap / 60)} h ${gap % 60} min`

  return (
    <section className="pk-gap" aria-label="Before your next meeting" data-pick="gap-stack">
      <div className="pk-gap-h">
        <span>{gapLabel} until {ev.title}</span>
        <span className="tk-r">{ev.time}</span>
      </div>
      {used != null && <div className="pk-rule" aria-hidden="true"><i style={{ width: `${Math.round(Math.min(1, Math.max(0, used)) * 100)}%` }} /></div>}
      <div className="pk-card">
        <div className="pk-card-h">
          {stack.fitCount > 0 ? <>Fits in {gapLabel}</> : <>Next up</>}
          {/* The count is what FITS; unsized rows below it are "next", not fits. */}
          <span className="tk-cnt">{stack.fitCount > 0 ? stack.fitCount : stack.rows.length}</span>
        </div>
        {stack.rows.length === 0 && <div className="pk-s" style={{ padding: '4px 0 6px' }}>Nothing due. The gap is yours.</div>}
        {stack.rows.map(({ task, size, fits }) => {
          const done = !!state.done[task.id]
          const project = task.project_id ? projectsByPid.get(task.project_id) : undefined
          return (
            <div key={task.id} className="pk-row" data-testid={`gap-row-${task.id}`}>
              <CardCheck done={done} onToggle={() => (done ? state.uncheck(task.id) : state.markDone(task.id))} taskId={task.id} />
              <div className="pk-g">
                <div className="pk-t">{taskShortLabel(task)}</div>
                {project && <div className="pk-s">{project.name}</div>}
              </div>
              {task.assignee && task.assignee !== viewerSlug && <Face slug={task.assignee} />}
              <span className={`pk-min${fits ? ' pk-fit' : ''}`}>
                {size.kind === 'minutes' ? `${size.minutes} min` : size.kind === 'quick' ? 'quick' : 'no estimate'}
              </span>
            </div>
          )
        })}
      </div>
      {stack.moreCount > 0 && <div className="pk-s" style={{ margin: '0 4px 8px' }}>{stack.moreCount} more due. Full Today is below.</div>}
      <div className="pk-card">
        <div className="pk-row">
          <div className="pk-g">
            <div className="pk-t">{ev.title}</div>
            <div className="pk-s">{ev.time}{ev.end ? `–${ev.end}` : ''}{ev.loc ? ` · ${ev.loc}` : ''}</div>
          </div>
          {ev.meetingUrl && <a className="tk-btn tk-sm tk-pri" href={ev.meetingUrl} target="_blank" rel="noreferrer">Join</a>}
        </div>
      </div>
    </section>
  )
}
