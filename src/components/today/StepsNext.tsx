// StepsNext -- the steps block under a parent's title on Today (Nick's pick,
// 2026-10-30, "B: next step only"). One card for the outcome: a teal "Next:"
// row holding the first open step with its own tick box, a dots line with
// "n of N", and "See all N steps" (opens the parent's drawer). When every step
// is done, a gold prompt completes the parent. Teal = progress, gold = wants
// you now, the rest grey (rules-ui-design).
//
// Counts come from the API (step_total / step_done); the next step is picked
// from the open steps Today already holds (lib/taskSteps).

import { isOverdue, dueLabelCompact } from '../../lib/dateUtils'
import { taskShortLabel } from '../../lib/displayNames'
import type { TaskRow } from '../../lib/api'
import type { TodayStateApi } from '../../hooks/useTodayState'

export function StepsNext({ parent, openSteps, state, onSeeAll }: {
  parent: TaskRow
  openSteps: TaskRow[]
  state: TodayStateApi
  onSeeAll: () => void
}) {
  const total = parent.step_total ?? 0
  const done = Math.min(total, parent.step_done ?? 0)
  if (total === 0) return null
  const parentTitle = taskShortLabel(parent)

  if (done >= total) {
    return (
      <div className="tk-ask" data-testid="steps-all-done" onClick={(e) => e.stopPropagation()}>
        <div className="tk-ask-t">All {total} {total === 1 ? 'step' : 'steps'} done -- complete {parentTitle}</div>
        <button
          type="button"
          className="tk-ask-go"
          onClick={(e) => { e.stopPropagation(); state.markDone(parent.id) }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          Complete {parentTitle}
        </button>
      </div>
    )
  }

  const next = openSteps.find((s) => !state.done[s.id]) ?? null
  const nextTitle = next ? taskShortLabel(next) : ''
  const due = next?.due_date ?? null
  const late = !!due && isOverdue(due, next?.status)

  return (
    <div className="tk-steps" data-testid="steps-next">
      {next && (
        <div className="tk-next">
          <button
            type="button"
            className="done-box tip tk-ck tk-nxck"
            onClick={(e) => { e.stopPropagation(); state.markDone(next.id) }}
            onMouseDown={(e) => e.stopPropagation()}
            data-tip="Mark step done"
            aria-label={`Mark step done: ${nextTitle}`}
          />
          <span className="tk-next-t">Next: <b>{nextTitle}</b></span>
          {due && <span className={`tk-next-d${late ? ' tk-late' : ''}`}>{late ? `${dueLabelCompact(due, true)} late` : dueLabelCompact(due, false)}</span>}
        </div>
      )}
      <div className="tk-steps-m">
        <span className="tk-dots" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => <i key={i} className={i < done ? 'f' : ''} />)}
        </span>
        <span>{done} of {total}</span>
        <button
          type="button"
          className="tk-more"
          onClick={(e) => { e.stopPropagation(); onSeeAll() }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          See all {total} steps
        </button>
      </div>
    </div>
  )
}
