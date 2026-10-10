import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { TaskRow } from '../../lib/api'
import { useExpiringRegulatory } from '../../hooks/useApiData'
import { PATHS } from '../../constants/paths'
import { isTaskDone } from '../../lib/taskGrouping'
import { countDoneToday, countOverdue, isWorkTask } from '../../lib/taskStats'

// Lab Overview's status line, in Today's StatLine anatomy: a number in the
// display face, a muted label, a thin colored rule. No pill, no box. The
// classes (.tk-stats / .tk-st / .tk-rl / .tk-v / .tk-l) live under `.tk` in
// index.css, so the root carries `tk`.
//
// Scope: `tasks` is the WHOLE lab's task list (Dashboard asks for every
// member's), while My Tasks lists only the viewer's. So the labels say "lab"
// and the link titles say where they land. Overdue and done-today come from
// lib/taskStats, the same rules Today uses. "due this week" has no My Tasks
// view, so it is a plain number, never a link.

interface StatusLineProps {
  tasks: TaskRow[]
  loading?: boolean
}

type Rule = 'o' | 'g' | 'n' | 't'

interface Stat {
  key: string
  value: number
  label: string
  rule: Rule
  /** Absent = a plain number, never a link. */
  to?: string
  dest?: string
}

// The line sits in the page header row beside the live dot, not as a page
// section, so drop .tk-stats' section margin, divider and progress rule.
const ROW_STYLE = {
  margin: 0,
  paddingBottom: 0,
  borderBottom: 'none',
  minWidth: 0,
  '--prog': '0%',
} as React.CSSProperties

export default function StatusLine({ tasks, loading }: StatusLineProps) {
  const { data: regulatory = [] } = useExpiringRegulatory(60)

  const stats = useMemo<Stat[]>(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7)

    const thisWeek = tasks.filter((t) => {
      if (isTaskDone(t) || !isWorkTask(t) || !t.due_date) return false
      const d = new Date(t.due_date + 'T12:00:00')
      return d >= tomorrow && d < weekEnd
    }).length
    const irb = regulatory.length

    return [
      { key: 'overdue', value: countOverdue(tasks), label: 'overdue · lab', rule: 'o', to: `${PATHS.myTasks}?filter=overdue`, dest: 'My Tasks filtered to overdue (the number counts the whole lab)' },
      { key: 'week', value: thisWeek, label: 'due this week · lab', rule: 'n' },
      { key: 'irb', value: irb, label: irb === 1 ? 'IRB renewal' : 'IRB renewals', rule: 'g', to: PATHS.deadlines, dest: 'Deadlines' },
      { key: 'done', value: countDoneToday(tasks), label: 'done today · lab', rule: 't', to: `${PATHS.myTasks}?filter=done-today`, dest: 'My Tasks done today (the number counts the whole lab)' },
    ]
  }, [tasks, regulatory])

  if (loading) {
    return (
      <div data-testid="dashboard-status-line" className="tk" aria-hidden>
        <div className="tk-stats dash-stats" style={ROW_STYLE}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: 30, width: 72, borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', animation: 'pulse 1.6s ease-in-out infinite' }} />
        ))}
        </div>
      </div>
    )
  }

  return (
    <div data-testid="dashboard-status-line" className="tk">
      <div className="tk-stats dash-stats" style={ROW_STYLE}>
      {stats.map((s) => {
        const inner = (
          <>
            <span className={`tk-rl${s.value > 0 ? ` tk-${s.rule}` : ''}`} aria-hidden="true" />
            <span>
              <span className="tk-v" style={{ display: 'block' }}>{s.value}</span>
              <span className="tk-l">{s.label}{s.value > 0 && s.to && <span className="tk-ar" aria-hidden="true">&rarr;</span>}</span>
            </span>
          </>
        )
        if (!s.to || s.value === 0) {
          return <div key={s.key} className={`tk-st${s.value === 0 ? ' tk-zero' : ''}`} aria-label={`${s.value} ${s.label}`}>{inner}</div>
        }
        return (
          <Link key={s.key} to={s.to} className="tk-st" aria-label={`${s.value} ${s.label}: open ${s.dest}`} title={s.dest}>{inner}</Link>
        )
      })}
      </div>
    </div>
  )
}
