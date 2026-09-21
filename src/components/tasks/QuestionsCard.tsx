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

import { useState } from 'react'
import { HelpCircle, Check } from 'lucide-react'
import { useUpdateTask } from '../../hooks/useMutations'
import { useUndoToast } from '../UndoToast'
import { nowInstant } from '../../lib/time'
import { parseQuestionSpec } from '../../lib/taskGrouping'
import type { TaskRow } from '../../lib/api'

interface QuestionsCardProps {
  tasks: TaskRow[]
}

export function QuestionsCard({ tasks }: QuestionsCardProps) {
  if (tasks.length === 0) return null

  return (
    <div className="mt-band" style={{ paddingTop: 12, paddingBottom: 0 }}>
      <div style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border-default)',
        borderLeft: '3px solid var(--task-accent-gold)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: 8,
        overflow: 'hidden',
      }}>
        {/* Card header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 16px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <HelpCircle
            size={13}
            strokeWidth={1.75}
            style={{ color: 'var(--task-accent-gold)', flexShrink: 0 }}
          />
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            color: 'var(--task-accent-gold)',
          }}>
            Needs you
          </span>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 700,
            background: 'var(--task-accent-gold)',
            color: '#fff',
            borderRadius: 'var(--radius-full)',
            minWidth: 18,
            height: 18,
            padding: '0 6px',
            lineHeight: 1,
          }}>
            {tasks.length}
          </span>
        </div>

        {tasks.map((task, i) => (
          <QuestionRow
            key={task.id}
            task={task}
            isLast={i === tasks.length - 1}
          />
        ))}
      </div>
    </div>
  )
}

function QuestionRow({ task, isLast }: { task: TaskRow; isLast: boolean }) {
  const { mutate: mutateTask } = useUpdateTask()
  const { showUndo } = useUndoToast()
  const [choice, setChoice] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [text, setText] = useState('')

  const spec = parseQuestionSpec(task)

  const rowStyle: React.CSSProperties = {
    padding: '10px 16px',
    borderBottom: isLast ? undefined : '1px solid var(--border-subtle)',
  }

  if (!spec) {
    // Malformed spec: never crash the page over one bad row — show a
    // minimal fallback with the task title so it's at least visible.
    return (
      <div style={rowStyle}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
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
    <div style={rowStyle}>
      <div style={{
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--task-ink)',
        marginBottom: 2,
      }}>
        {spec.prompt}
      </div>
      <div style={{
        fontSize: 11,
        color: 'var(--muted)',
        marginBottom: 10,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {task.title}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {spec.choices.map((c) => {
          const isRec = c.key === spec.rec
          const isSelected = choice === c.key
          return (
            <button
              key={c.key}
              type="button"
              data-testid={`q-choice-${c.key}`}
              onClick={(e) => {
                e.stopPropagation()
                setChoice(c.key)
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                background: isSelected ? 'var(--task-accent-gold)' : 'transparent',
                color: isSelected ? '#fff' : 'var(--task-ink)',
                border: `1px solid ${isRec ? 'var(--task-accent-gold)' : 'var(--border-default)'}`,
                borderRadius: 'var(--radius-md)',
                fontSize: 12,
                fontWeight: isSelected || isRec ? 600 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                touchAction: 'manipulation',
              }}
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
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: 11,
              cursor: 'pointer',
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
          onClick={(e) => {
            e.stopPropagation()
            submit()
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 14px',
            marginLeft: 'auto',
            background: canSubmit ? 'var(--task-accent-teal)' : 'var(--hover-subtle)',
            color: canSubmit ? '#fff' : 'var(--muted)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontSize: 12,
            fontWeight: 600,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            whiteSpace: 'nowrap',
            touchAction: 'manipulation',
          }}
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
          style={{
            marginTop: 8,
            width: '100%',
            resize: 'vertical',
            background: 'var(--task-panel-bg)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '6px 8px',
            fontSize: 12,
            color: 'var(--task-ink)',
          }}
        />
      )}
    </div>
  )
}
