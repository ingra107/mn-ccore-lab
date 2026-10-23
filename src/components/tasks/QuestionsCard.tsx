// QuestionsCard — "Needs you": kind='question' rows waiting on Nick's answer,
// plus the ones he answered that nothing has acted on yet (2026-10-22: before
// this, an answered-but-unconsumed row showed on no Hub surface at all; three
// sat open in prod D1 for 9-34 days, one of them a "Build it" approval).
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
// Snooze (2026-10-22): Tomorrow / 3 days / Next week on every row writes
// mutateTask({ id, fields: { due_date } }) and nothing else; the row leaves
// this card (isQuestionOnCard) and comes back on the morning of that date.
// A spec's declared "Not yet" choice (payload.snooze_days) is the same write:
// it is never sent as an answer (the Worker refuses one with
// question_choice_is_snooze). Undo restores the previous due_date.
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
import { nowInstant, parseDbUtc } from '../../lib/time'
import { civilDatePlusDays, parseQuestionAnswer, parseQuestionSpec, questionCardState, questionSnoozedUntil, snoozeChoiceDays, todayKey } from '../../lib/taskGrouping'
import type { TaskRow } from '../../lib/api'

interface QuestionsCardProps {
  tasks: TaskRow[]
  /** Wrap in the page band (.mt-band). My Tasks needs it; Today sits inside its
   *  own column and passes false so the card is not inset twice. */
  band?: boolean
  /** Questions snoozed past today (isQuestionSnoozed), for the one dim line
   *  that says how many are waiting to come back. Never rendered as rows. */
  snoozed?: TaskRow[]
}

export function QuestionsCard({ tasks: all, band = true, snoozed: allSnoozed = [] }: QuestionsCardProps) {
  // A request to join (source 'project_join', schema-v139) is answered on
  // JoinRequestsCard, where Nate decides too; its question row exists for
  // Nick's Telegram card alone, so it is not shown here a second time.
  const tasks = all.filter((t) => t.source !== 'project_join')
  const snoozed = allSnoozed.filter((t) => t.source !== 'project_join')
  // Three states, each read off the row (questionCardState). Waiting rows are
  // his turn; answered rows stay on the card until the PB lane acts, so an
  // answer nothing picked up cannot drop off every surface; acted-on rows are
  // one dim line each, today only, so he sees the loop close.
  const waiting = tasks.filter((t) => questionCardState(t) === 'waiting')
  const answered = tasks
    .filter((t) => questionCardState(t) === 'answered')
    .sort((a, b) => answeredAt(a) - answeredAt(b))
  const acted = tasks.filter((t) => questionCardState(t) === 'acted')
  // Acted-on rows alone are not a reason to show the gold card: nothing on it
  // would want him.
  if (waiting.length === 0 && answered.length === 0) return null

  const card = (
    <div className="tk">
      <section className="tk-attn" aria-label="Needs you">
        <div className="tk-attn-h">
          <span className="tk-attn-dot" aria-hidden="true" />
          Needs you
          {waiting.length > 0 && <span className="tk-cnt">{waiting.length}</span>}
        </div>
        {waiting.map((task) => (
          <QuestionRow key={task.id} task={task} />
        ))}
        {answered.length > 0 && (
          <div className="tk-qrow" data-testid="q-answered">
            <div style={{ fontSize: 11.5, color: 'var(--sk-t3)', marginBottom: 4 }}>
              Answered, not acted on yet
            </div>
            {answered.map((task) => (
              <AnsweredRow key={task.id} task={task} />
            ))}
          </div>
        )}
        {acted.length > 0 && (
          <div className="tk-qrow" data-testid="q-acted" style={{ fontSize: 11.5, color: 'var(--sk-t3)' }}>
            {acted.map((task) => (
              <div key={task.id} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Acted on today · {parseQuestionSpec(task)?.prompt ?? task.title}
              </div>
            ))}
          </div>
        )}
        {snoozed.length > 0 && (
          <div className="tk-qrow" data-testid="q-snoozed" style={{ fontSize: 11.5, color: 'var(--sk-t3)' }}>
            {snoozed.length} snoozed · next back {dayLabel(nextBack(snoozed))}
          </div>
        )}
      </section>
    </div>
  )
  return band ? <div className="mt-band" style={{ paddingTop: 12, paddingBottom: 0 }}>{card}</div> : card
}

/** The earliest date a snoozed row comes back. */
function nextBack(rows: TaskRow[]): string {
  const today = todayKey()
  return rows
    .map((t) => questionSnoozedUntil(t, today))
    .filter((d): d is string => d !== null)
    .sort()[0] ?? ''
}

/** "tomorrow", else a short local weekday and date ("Mon 10/26"). */
function dayLabel(civil: string): string {
  if (!civil) return 'soon'
  if (civil === civilDatePlusDays(todayKey(), 1)) return 'tomorrow'
  const [y, m, d] = civil.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' })
}

const SNOOZE_OPTIONS = [
  { days: 1, label: 'Tomorrow' },
  { days: 3, label: '3 days' },
  { days: 7, label: 'Next week' },
] as const

/** Snooze a question: ONE write, due_date only, undo restores the old one. */
function useSnooze(task: TaskRow) {
  const { mutate: mutateTask } = useUpdateTask()
  const { showUndo } = useUndoToast()
  return (days: number) => {
    const previous = task.due_date ?? null
    const until = civilDatePlusDays(todayKey(), days)
    mutateTask({ id: task.id, fields: { due_date: until } })
    showUndo(
      `Snoozed until ${dayLabel(until)}`,
      () => mutateTask({ id: task.id, fields: { due_date: previous } }),
    )
  }
}

function SnoozeLinks({ task }: { task: TaskRow }) {
  const snooze = useSnooze(task)
  return (
    <span data-testid={`q-snooze-${task.id}`} style={{ fontSize: 11.5, color: 'var(--sk-t3)', whiteSpace: 'nowrap' }}>
      Snooze:{' '}
      {SNOOZE_OPTIONS.map((o, i) => (
        <span key={o.days}>
          {i > 0 && ' · '}
          <button
            type="button"
            data-testid={`q-snooze-${o.days}`}
            onClick={(e) => {
              e.stopPropagation()
              snooze(o.days)
            }}
            style={{ color: 'var(--sk-t3)', textDecoration: 'underline', textUnderlineOffset: 2, padding: '4px 2px', touchAction: 'manipulation' }}
          >
            {o.label}
          </button>
        </span>
      ))}
    </span>
  )
}

/** When the answer landed, as epoch ms (Infinity when unreadable, so it sorts last). */
function answeredAt(t: TaskRow): number {
  const ms = parseDbUtc(parseQuestionAnswer(t)?.at).getTime()
  return isNaN(ms) ? Infinity : ms
}

/** Whole days since the answer landed; null when its time is unreadable. */
function answerAgeDays(t: TaskRow): number | null {
  const ms = answeredAt(t)
  return Number.isFinite(ms) ? Math.max(0, Math.floor((Date.now() - ms) / 86400000)) : null
}

/** An answer this old with nothing acted on is going stale: the lane that
 *  should read it has not run, or no lane reads this question's source. */
const STALE_ANSWER_DAYS = 2

function AnsweredRow({ task }: { task: TaskRow }) {
  const spec = parseQuestionSpec(task)
  const answer = parseQuestionAnswer(task)
  const label = answer
    ? (answer.choice === 'other' ? (answer.text ?? 'Other') : (spec?.choices.find((c) => c.key === answer.choice)?.label ?? answer.choice))
    : 'an unreadable answer'
  const days = answerAgeDays(task)
  const age = days == null ? '' : days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`
  const stale = days != null && days >= STALE_ANSWER_DAYS

  return (
    <div data-testid={`q-answered-${task.id}`} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ color: 'var(--sk-t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {spec?.prompt ?? task.title}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--sk-t3)' }}>
          You answered “{label}”
          {age && (
            <>
              {' · '}
              <span data-testid="q-answered-age" style={stale ? { color: 'var(--job-stale)', fontWeight: 500 } : undefined}>
                {age}
              </span>
            </>
          )}
        </div>
      </div>
      <SnoozeLinks task={task} />
    </div>
  )
}

function QuestionRow({ task }: { task: TaskRow }) {
  const { mutate: mutateTask } = useUpdateTask()
  const { showUndo } = useUndoToast()
  const snooze = useSnooze(task)
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
  // A declared "Not yet" choice is a snooze, not an answer.
  const snoozeDays = snoozeChoiceDays(spec.choices.find((c) => c.key === choice))

  const submit = () => {
    if (!canSubmit || choice == null) return
    if (snoozeDays != null) {
      snooze(snoozeDays)
      return
    }
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

        {!noteOpen && snoozeDays == null && (
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
          {snoozeDays != null ? `Snooze ${snoozeDays} day${snoozeDays === 1 ? '' : 's'}` : 'Submit'}
        </button>
      </div>
      <div style={{ marginTop: 4 }}>
        <SnoozeLinks task={task} />
      </div>

      {(noteOpen || needsText) && snoozeDays == null && (
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
