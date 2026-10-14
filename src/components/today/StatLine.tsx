// StatLine — the day at a glance, replacing the five PillStrip pills.
//
// Five numbers in the display face, each with a 2px colored rule and a small
// muted label: overdue, stalled, planned, meetings, done. No pill, no box. A
// non-zero number is a REAL link to the list it counts (overdue -> Tasks
// filtered overdue, stalled -> Projects ?filter=stalled, planned -> Tasks
// planned today, meetings -> Meetings today, done -> Tasks done today). A zero
// is dim and not a link, because something that looks clickable and does
// nothing is worse than something quiet (Nick, 2026-10-09).
//
// The divider under the line fills teal with done / (done + still planned),
// the day's progress, with no extra element (.tk-stats::after reads --prog).
//
// Colors: maroon = overdue only, orange = stalled (going stale, the color
// Manuscripts uses for stalled days; color jobs, Nick 2026-10-11), teal = the
// day's own numbers, no color for planned.
//
// "done this week" (2026-10-09) came over from the retired My Hub header. It
// is plainly NOT a link: My Tasks has no "done this week" view, and a stat
// that looks clickable and goes nowhere is the thing Nick asked us not to
// build. No rule color either: it is not the day's number. The PillStrip scroll-to-section behavior is gone: the
// sections are right below, and the link now goes somewhere new.
//
// A number whose data has not arrived is NOT zero. While its query is pending a
// stat shows a dim dash (same width as a digit, no rule color, not a link, read
// aloud as "loading"), so the line never says "0 overdue" for the half second
// before the tasks land (the false-empty class, 2026-10-14).
//
// The completion moment (color-back pick 5, 2026-10-11): when the Hub accepts a
// completion, "done this week" counts up and its rule lights teal for a beat,
// then rests gray (useConfirmedCount). The caller leaves still-pending
// completions out of the number, so it can only move on an accepted write.

import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import type { DailyCounts } from './constants'
import { useConfirmedCount } from '../../lib/completionMoment'

type Rule = 'o' | 'u' | 'n' | 't'

interface Stat {
  key: string
  value: number
  label: string
  rule: Rule
  /** Absent = a plain number, never a link. */
  to?: string
  /** Names the destination for screen readers and the hover title. */
  dest?: string
  /** Lights the rule for a beat (the completion moment). */
  beat?: boolean
}

export type StatKey = 'overdue' | 'stalled' | 'planned' | 'meetings' | 'done' | 'done-week'

export function StatLine({ counts, doneThisWeek, pending, failed }: {
  counts: DailyCounts
  doneThisWeek?: number
  /** Stats whose source query has not answered yet; each renders a dash, not a number. */
  pending?: Partial<Record<StatKey, boolean>>
  /** Stats whose source query errored: a dash that says unavailable, never a false 0. */
  failed?: Partial<Record<StatKey, boolean>>
}) {
  const stats: Stat[] = [
    { key: 'overdue', value: counts.overdue, label: 'overdue', rule: 'o', to: `${PATHS.myTasks}?filter=overdue`, dest: 'Tasks filtered to overdue' },
    { key: 'stalled', value: counts.stalled, label: 'stalled', rule: 'u', to: `${PATHS.projects}?filter=stalled`, dest: 'Projects filtered to stalled (no movement in the stale window)' },
    { key: 'planned', value: counts.planned, label: 'planned', rule: 'n', to: `${PATHS.myTasks}?filter=planned`, dest: 'Tasks planned for today' },
    { key: 'meetings', value: counts.meetings, label: counts.meetings === 1 ? 'meeting' : 'meetings', rule: 't', to: `${PATHS.meetings}?filter=today`, dest: "Today's meeting records" },
    { key: 'done', value: counts.doneToday, label: 'done', rule: 't', to: `${PATHS.myTasks}?filter=done-today`, dest: 'Tasks done today' },
  ]
  const week = useConfirmedCount(doneThisWeek ?? 0)
  if (doneThisWeek !== undefined) {
    stats.push({ key: 'done-week', value: week.display, label: 'done this week', rule: 'n', beat: week.beat })
  }
  const total = counts.doneToday + counts.planned
  // Progress is a ratio of two task counts: unknown while either is not in.
  const dayUnknown = !!(pending?.done || pending?.planned || failed?.done || failed?.planned)
  const pct = !dayUnknown && total > 0 ? Math.round((counts.doneToday / total) * 100) : 0

  return (
    <div
      className="tk-stats"
      style={{ '--prog': `${pct}%` } as React.CSSProperties}
      data-b2-stats
      title={dayUnknown ? 'Day progress: not loaded' : `Day progress: ${counts.doneToday} done of ${total} (done plus still planned)`}
    >
      {stats.map((raw) => {
        const isFailed = !!failed?.[raw.key as StatKey]
        const loading = !!pending?.[raw.key as StatKey] || isFailed
        const state = isFailed ? 'unavailable' : 'loading'
        // A pending stat reads as a quiet zero in every way except its text.
        const s = loading ? { ...raw, value: 0, beat: false } : raw
        const inner = (
          <>
            <span className={`tk-rl${s.value > 0 ? ` tk-${s.rule}` : ''}${s.beat ? ' cm-beat' : ''}`} aria-hidden="true" />
            <span>
              <span className="tk-v" style={{ display: 'block' }}>{loading ? '–' : s.value}</span>
              <span className="tk-l">{s.label}{s.value > 0 && s.to && <span className="tk-ar" aria-hidden="true">&rarr;</span>}</span>
            </span>
          </>
        )
        const busy = loading && !isFailed ? { 'aria-busy': true as const } : {}
        if (!s.to) {
          return <div key={s.key} className={`tk-st${s.value === 0 ? ' tk-zero' : ''}`} aria-label={loading ? `${s.label}: ${state}` : `${s.value} ${s.label}`} data-stat={s.key} {...busy}>{inner}</div>
        }
        return s.value === 0 ? (
          <div key={s.key} className="tk-st tk-zero" aria-label={loading ? `${s.label}: ${state}` : `0 ${s.label}`} {...busy}>{inner}</div>
        ) : (
          <Link key={s.key} to={s.to} className="tk-st" aria-label={`${s.value} ${s.label}: open ${s.dest}`} title={s.dest}>{inner}</Link>
        )
      })}
    </div>
  )
}
