// OverdueBanner — P1-12. One coral "Overdue" group header with a live count,
// shared by all three My Tasks views. Answers "where do I focus" before the
// user reads a single row: overdue work is sorted to the top within each group
// (useTaskFilter) AND announced once here, with the coral accent (Rule 59).
//
// Computes its own count from the same canonical isOverdue() the hook uses, so
// the three views agree without threading a prop through MyTasks/index.tsx.

import { isOverdue } from '../../../lib/dateUtils'
import { ACCENT_CORAL, withAlpha, isTaskDone } from '../constants'
import type { TaskRow } from '../../../lib/api'

export function countOverdue(tasks: TaskRow[]): number {
  return tasks.filter((t) => !isTaskDone(t) && t.due_date && isOverdue(t.due_date, t.status)).length
}

export function OverdueBanner({ tasks }: { tasks: TaskRow[] }) {
  const n = countOverdue(tasks)
  if (n === 0) return null
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        margin: '0 0 10px',
        padding: '8px 12px',
        borderRadius: 8,
        background: withAlpha(ACCENT_CORAL, 8),
        borderLeft: `3px solid ${ACCENT_CORAL}`,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 13 }}>⚠</span>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: ACCENT_CORAL }}>
        Overdue
      </span>
      <span style={{ fontSize: 12, color: ACCENT_CORAL, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {n}
      </span>
      <span style={{ fontSize: 11.5, color: 'var(--task-ink-muted)', marginLeft: 2 }}>
        sorted to the top — oldest first
      </span>
    </div>
  )
}
