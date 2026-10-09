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
// Colors: maroon = overdue only, gold = stalled, teal = the day's own numbers,
// no color for planned. The PillStrip scroll-to-section behavior is gone: the
// sections are right below, and the link now goes somewhere new.

import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import type { DailyCounts } from './constants'

type Rule = 'o' | 'g' | 'n' | 't'

interface Stat {
  key: string
  value: number
  label: string
  rule: Rule
  to: string
  /** Names the destination for screen readers and the hover title. */
  dest: string
}

export function StatLine({ counts }: { counts: DailyCounts }) {
  const stats: Stat[] = [
    { key: 'overdue', value: counts.overdue, label: 'overdue', rule: 'o', to: `${PATHS.myTasks}?filter=overdue`, dest: 'Tasks filtered to overdue' },
    { key: 'stalled', value: counts.stalled, label: 'stalled', rule: 'g', to: `${PATHS.projects}?filter=stalled`, dest: 'Projects filtered to stalled (no activity in 10+ days)' },
    { key: 'planned', value: counts.planned, label: 'planned', rule: 'n', to: `${PATHS.myTasks}?filter=planned`, dest: 'Tasks planned for today' },
    { key: 'meetings', value: counts.meetings, label: 'meetings', rule: 't', to: `${PATHS.meetings}?filter=today`, dest: "Today's meetings" },
    { key: 'done', value: counts.doneToday, label: 'done', rule: 't', to: `${PATHS.myTasks}?filter=done-today`, dest: 'Tasks done today' },
  ]
  const total = counts.doneToday + counts.planned
  const pct = total > 0 ? Math.round((counts.doneToday / total) * 100) : 0

  return (
    <div
      className="tk-stats"
      style={{ '--prog': `${pct}%` } as React.CSSProperties}
      data-b2-stats
      title={`Day progress: ${counts.doneToday} done of ${total} (done plus still planned)`}
    >
      {stats.map((s) => {
        const inner = (
          <>
            <span className={`tk-rl${s.value > 0 ? ` tk-${s.rule}` : ''}`} aria-hidden="true" />
            <span>
              <span className="tk-v" style={{ display: 'block' }}>{s.value}</span>
              <span className="tk-l">{s.label}{s.value > 0 && <span className="tk-ar" aria-hidden="true">&rarr;</span>}</span>
            </span>
          </>
        )
        return s.value === 0 ? (
          <div key={s.key} className="tk-st tk-zero" aria-label={`0 ${s.label}`}>{inner}</div>
        ) : (
          <Link key={s.key} to={s.to} className="tk-st" aria-label={`${s.value} ${s.label}: open ${s.dest}`} title={s.dest}>{inner}</Link>
        )
      })}
    </div>
  )
}
