// QuestionsCard — "Needs you": kind='question' rows waiting on Nick's answer.
//
// A question is a task a PB producer minted because a process is stuck on
// his answer (design: PB Scratch/plans/sequential-petting-sky.md). Mounted
// ABOVE PendingMeetingsCard on Today + My Tasks — same shape, same
// double-render guard (isQuestionWaiting excludes these from the regular
// task groups).
//
// Mutation path: mutateTask({ id, fields: { question_answer_json: {...} } })
// — NEVER a status field. Answered is not done (the consumer that acts on
// the answer closes the row); writing status here would let the Hub close a
// question with no answer, which the Worker chokepoint refuses anyway.
// Undo path: writes question_answer_json back to null.
//
// Renders null when tasks is empty (no card appears when nothing is waiting).
//
// Look (Today reskin, 2026-10-09): ONE warm gold attention card, title inside
// it, no box-in-box. Gold = "something wants you now", used rarely, so this
// reads as not part of the everyday page. Styles: .tk-attn in index.css; the
// .tk wrapper scopes them so the card looks the same on My Tasks.

import { useState } from 'react'
import { Check } from 'lucide-react'
import { useUpdateTask } from '../../hooks/useMutations'
import { useUndoToast } from '../UndoToast'
import { nowInstant } from '../../lib/time'
import { parseQuestionSpec } from '../../lib/taskGrouping'
import type { TaskRow } from '../../lib/api'

interface QuestionsCardProps {
  tasks: TaskRow[]
  /** Wrap in the page band (.mt-band). My Tasks needs it; Today sits inside its
   *  own column and passes false so the card is not inset twice. */
  band?: boolean
}

export function QuestionsCard({ tasks, band = true }: QuestionsCardProps) {
  if (tasks.length === 0) return null

  const card = (
    <div className="tk">
      <section className="tk-attn" aria-label="Needs you">
        <div className="tk-attn-h">
          <span className="tk-attn-dot" aria-hidden="true" />
          Needs you
          <span className="tk-cnt">{tasks.length}</span>
        </div>
        {tasks.map((task) => (
          <QuestionRow key={task.id} task={task} />
        ))}
      </section>
    </div>
  )
  return band ? <div className="mt-band" style={{ paddingTop: 12, paddingBottom: 0 }}>{card}</div> : card
}

function QuestionRow({ task }: { task: TaskRow }) {
  const { mutate: mutateTask } = useUpdateTask()
  const { showUndo } = useUndoToast()
  const [choice, setChoice] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [text, setText] = useState('')

  const spec = parseQuestionSpec(task)

  if (!spec) {
    // Malformed spec: never crash the page over one bad row — show a
    // minimal fallback with the task title so it's at least visible.
    return (
      <div className="tk-qrow">
        <div style={{ color: 'var(--sk-t3)' }}>
          Malformed question — {task.title}
        </div>
      </div>
    )
  }

  const needsText = choice === 'other'
  const canSubmit = choice != null && (!needsText || text.trim().length > 0)

  const submit = () => {
    if (!canSubmit || choice == null) return
    const answer = {
      v: 1,
      choice,
      text: text.trim() || undefined,
      via: 'hub' as const,
      at: nowInstant(),
    }
    mutateTask({ id: task.id, fields: { question_answer_json: answer } })
    showUndo(
      'Answered',
      () => mutateTask({ id: task.id, fields: { question_answer_json: null } }),
    )
  }

  return (
    <div className="tk-qrow">
      <div style={{ fontWeight: 500, color: 'var(--sk-t1)' }}>{spec.prompt}</div>
      {task.title !== spec.prompt && (
        <div style={{ fontSize: 11.5, color: 'var(--sk-t3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.title}
        </div>
      )}

      <div className="tk-ops">
        {spec.choices.map((c) => {
          const isRec = c.key === spec.rec
          const isSelected = choice === c.key
          return (
            <button
              key={c.key}
              type="button"
              data-testid={`q-choice-${c.key}`}
              className={`tk-btn tk-sm${isSelected ? ' tk-sel' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setChoice(c.key)
              }}
              style={{ fontWeight: isSelected || isRec ? 600 : 500, touchAction: 'manipulation' }}
            >
              {isSelected && <Check size={12} strokeWidth={2.5} />}
              {c.label}
              {isRec && !isSelected && (
                <span style={{ fontSize: 10, opacity: 0.7 }}>· rec</span>
              )}
            </button>
          )
        })}

        {!noteOpen && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setNoteOpen(true)
            }}
            style={{
              color: 'var(--sk-t3)',
              fontSize: 11.5,
              padding: '6px 4px',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            Add a note
          </button>
        )}

        <button
          type="button"
          data-testid="q-submit"
          disabled={!canSubmit}
          className={`tk-btn tk-sm${canSubmit ? ' tk-pri' : ' tk-off'}`}
          onClick={(e) => {
            e.stopPropagation()
            submit()
          }}
          style={{ marginLeft: 'auto', touchAction: 'manipulation' }}
        >
          Submit
        </button>
      </div>

      {(noteOpen || needsText) && (
        <textarea
          data-testid="q-note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={needsText ? 'Your answer (required)' : 'Add a note (optional)'}
          rows={2}
          className="tk-wfi"
          style={{ marginTop: 8, resize: 'vertical', color: 'var(--sk-t1)' }}
        />
      )}
    </div>
  )
}
