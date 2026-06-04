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

import { isOverdue, dueLabelText, localDateKey } from '../lib/dateUtils'

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
      {dueLabelText(due, overdue)}
    </span>
  )
}
