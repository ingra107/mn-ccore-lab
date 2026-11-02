// StepsList -- every step of a parent, in the task drawer ("See all N steps").
// Same order as the card's Next row (due date, undated last, then oldest; the
// API sorts it). Each row: box, title, due date. The box completes or reopens
// the step through the same Today state as every other box.
//
// A step is an ordinary task, so it is edited as one: the title opens the same
// full task panel every task uses. The unlink control releases the step
// (parent_id -> null through the normal task PATCH; it becomes a plain task and
// no work is deleted). "Add step" creates a new task under this parent.

import { useState } from 'react'
import { Unlink } from 'lucide-react'
import { dueLabelCompact, isOverdue } from '../../lib/dateUtils'
import { taskShortLabel } from '../../lib/displayNames'
import { ICON_PROPS } from '../../lib/iconProps'
import type { TaskDetailStep } from '../../hooks/useApiData'
import { useTasksByIds } from '../../hooks/useApiData'
import { useCreateTask, useUpdateTask } from '../../hooks/useMutations'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'
import TaskDetailPanel from '../tasks/LazyTaskDetailPanel'
import { Button } from '../ui/Button'

// The detail payload carries only a few columns of a step; the panel wants the
// whole row, so fetch it by id when the step is opened.
function StepPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useTasksByIds([id])
  const row = q.data?.find((t) => t.id === id) ?? null
  if (!row) return null
  return <TaskDetailPanel task={row} onClose={onClose} />
}

export function StepsList({ steps, state, parent }: { steps: TaskDetailStep[]; state: TodayStateApi; parent?: TaskRow }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const updateTask = useUpdateTask()
  const createTask = useCreateTask()
  if (steps.length === 0) return null

  const addStep = () => {
    const title = draft.trim()
    if (!title || !parent) return
    createTask.mutate({
      title,
      description: title,
      assignee: parent.assignee,
      parent_id: parent.id,
      ...(parent.project_id ? { project_id: parent.project_id } : {}),
      ...(parent.product_id ? { product_id: parent.product_id } : {}),
    }, { onSuccess: () => { setDraft(''); setAdding(false) } })
  }

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
              <button type="button" className="tk-sl-t tk-sl-open" onClick={() => setOpenId(s.id)} title="Open this step to edit it" aria-label={`Open step: ${title}`}>{title}</button>
              {!done && s.due_date && (
                <span className={`tk-next-d${late ? ' tk-late' : ''}`}>{late ? `${dueLabelCompact(s.due_date, true)} late` : dueLabelCompact(s.due_date, false)}</span>
              )}
              <Button size="icon"
                type="button"
                className="tk-sl-un"
                onClick={() => updateTask.mutate({ id: s.id, fields: { parent_id: null } })}
                disabled={updateTask.isPending}
                title="Remove from steps (it stays a task)"
                aria-label={`Remove step from this task: ${title}`}
              >
                <Unlink {...ICON_PROPS} size={12} />
              </Button>
            </li>
          )
        })}
      </ul>
      {parent && (adding ? (
        <input
          className="tk-sl-add"
          autoFocus
          value={draft}
          placeholder="New step, Enter to add"
          aria-label="New step title"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') addStep()
            else if (e.key === 'Escape') { setDraft(''); setAdding(false) }
          }}
          onBlur={() => { if (!draft.trim()) setAdding(false) }}
          disabled={createTask.isPending}
        />
      ) : (
        <button type="button" className="tk-sl-addbtn" onClick={() => setAdding(true)}>Add step…</button>
      ))}
      {openId && <StepPanel id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}
