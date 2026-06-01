// DueLabel — the single, canonical due-date label for the standard-palette
// surfaces (dashboard cards, analytics, deadlines, pb-sector, hover cards…).
// One place owns the WORD, the FORMAT, and the COLOR of "3d overdue / Today /
// in 3d / Mar 25" so they're identical app-wide (handoff §3). Numbers are
// tabular-nums so the label doesn't jitter as it updates.
//
// Color: coral/maroon overdue · gold today · muted otherwise — using the
// theme-aware standard tokens (correct in light + dark). The dark task pages
// (Today / My Tasks) render due dates through the shared TaskRow's own
// --task-* DueChip; this component is its standard-palette sibling.
//
// Overdue detection delegates to dateUtils.isOverdue() — never re-implement the
// `new Date(due + 'T23:59:59') < new Date()` comparison inline.

import { isOverdue, formatShortDate, localDateKey } from '../lib/dateUtils'

function labelFor(due: string, overdue: boolean): string {
  const dueDay = due.slice(0, 10)
  const today = localDateKey()
  if (overdue) {
    const start = new Date(dueDay + 'T12:00:00')
    const t0 = new Date(); t0.setHours(12, 0, 0, 0)
    const days = Math.round((t0.getTime() - start.getTime()) / 86400000)
    return days <= 1 ? 'Yesterday' : `${days}d overdue`
  }
  if (dueDay === today) return 'Today'
  const target = new Date(dueDay + 'T12:00:00')
  if (isNaN(target.getTime())) return dueDay
  const t0 = new Date(); t0.setHours(12, 0, 0, 0)
  const days = Math.round((target.getTime() - t0.getTime()) / 86400000)
  if (days === 1) return 'Tomorrow'
  if (days > 0 && days <= 7) return `in ${days}d`
  return formatShortDate(due)
}

export default function DueLabel({
  due,
  status,
  className,
  style,
}: {
  due: string | null | undefined
  status?: string
  className?: string
  style?: React.CSSProperties
}) {
  if (!due) return null
  const overdue = isOverdue(due, status)
  const dueDay = due.slice(0, 10)
  const isToday = !overdue && dueDay === localDateKey()
  const color = overdue ? 'var(--maroon)' : isToday ? 'var(--gold)' : 'var(--muted)'
  return (
    <span
      className={className}
      style={{ color, fontVariantNumeric: 'tabular-nums', fontWeight: overdue ? 600 : 400, whiteSpace: 'nowrap', ...style }}
    >
      {labelFor(due, overdue)}
    </span>
  )
}
