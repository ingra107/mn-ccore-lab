// StepsList -- every step of a parent, in the task drawer ("See all N steps").
// Same order as the card's Next row (due date, undated last, then oldest; the
// API sorts it). Each row: box, title, due date. The box completes or reopens
// the step through the same Today state as every other box.

import { dueLabelCompact, isOverdue } from '../../lib/dateUtils'
import { taskShortLabel } from '../../lib/displayNames'
import type { TaskDetailStep } from '../../hooks/useApiData'
import type { TodayStateApi } from '../../hooks/useTodayState'
import { Button } from '../ui/Button'

export function StepsList({ steps, state }: { steps: TaskDetailStep[]; state: TodayStateApi }) {
  if (steps.length === 0) return null
  return (
    <div className="tk-sl" data-testid="steps-list" onClick={(e) => e.stopPropagation()}>
      <div className="tk-lbl">Steps</div>
      <ul className="tk-sl-ul">
        {steps.map((s) => {
          const done = s.status === 'done' || !!state.done[s.id]
          const title = taskShortLabel(s) || 'Untitled step'
          const late = !done && !!s.due_date && isOverdue(s.due_date, s.status)
          return (
            <li key={s.id} data-step-id={s.id} className={done ? 'tk-sl-d' : undefined}>
              <Button size="icon"
                type="button"
                className={`done-box tip tk-ck tk-nxck${done ? ' tk-on' : ''}`}
                onClick={(e) => { e.stopPropagation(); if (done) state.uncheck(s.id); else state.markDone(s.id) }}
                onMouseDown={(e) => e.stopPropagation()}
                aria-pressed={done}
                aria-label={done ? `Mark step not done: ${title}` : `Mark step done: ${title}`}
              >
                {done && (
                  <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </Button>
              <span className="tk-sl-t">{title}</span>
              {!done && s.due_date && (
                <span className={`tk-next-d${late ? ' tk-late' : ''}`}>{late ? `${dueLabelCompact(s.due_date, true)} late` : dueLabelCompact(s.due_date, false)}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
