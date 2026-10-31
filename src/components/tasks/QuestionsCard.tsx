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
// #149 (2026-10-23, Nick: "you are telling me its a thing but without a way
// to go look again"): the "N snoozed" line is a toggle. Opened, it lists each
// snoozed row the same way the card does (answerable, re-snoozable) with its
// return day and a "Bring back now" that writes due_date = today. The 1-day
// snooze reads "For today", which is what it does.
//
// Week plan (source 'week_plan', PB decision 2026-10-30-planning-conversation.md):
// a waiting one is ONE row, "Plan your week", above the other questions, so
// Today still has one gold card. Tapping it opens the planning conversation in
// a side panel (PlanPanel). It has no snooze and no Answered line: answered,
// it leaves this card and shows as This week on Today.
//
// Renders null when tasks is empty (no card appears when nothing is waiting).
//
// Look (Today reskin, 2026-10-09): ONE warm gold attention card, title inside
// it, no box-in-box. Gold = "something wants you now", used rarely, so this
// reads as not part of the everyday page. Styles: .tk-attn in index.css; the
// .tk wrapper scopes them so the card looks the same on My Tasks.

import { useState, type ReactNode } from 'react'
import { Check, ChevronUp } from 'lucide-react'
import { useUpdateTask } from '../../hooks/useMutations'
import { useUndoToast } from '../UndoToast'
import { Button } from '../ui/Button'
import { nowInstant, parseDbUtc } from '../../lib/time'
import { civilDatePlusDays, parseQuestionAnswer, parseQuestionSpec, questionCardState, questionSnoozedUntil, snoozeChoiceDays, todayKey } from '../../lib/taskGrouping'
import type { TaskRow } from '../../lib/api'
import { isWeekPlan } from '../../lib/weekPlan'
import { PlanPanel } from '../today/PlanPanel'

interface QuestionsCardProps {
  tasks: TaskRow[]
  /** Wrap in the page band (.mt-band). My Tasks needs it; Today sits inside its
   *  own column and passes false so the card is not inset twice. */
  band?: boolean
  /** Questions snoozed past today (isQuestionSnoozed), for the one dim line
   *  that says how many are waiting to come back. Never rendered as rows. */
  snoozed?: TaskRow[]
  /** Today only: adds a header control that hides the whole card (the caller
   *  keeps the flag and shows an "N needs you" stat in its place). Absent =
   *  no control, as on My Tasks. */
  onCollapse?: () => void
  /** Today only (pick P1, the Decision desk): renders the waiting questions
   *  in place of the plain rows, INSIDE this card, so Today keeps one gold
   *  card and each question shows once. Absent = the plain rows, as on My Tasks. */
  renderWaiting?: (waiting: TaskRow[], hold: (ids: string[]) => void) => ReactNode
}

export function QuestionsCard({ tasks: all, band = true, snoozed: allSnoozed = [], onCollapse, renderWaiting }: QuestionsCardProps) {
  // A request to join (source 'project_join', schema-v139) is answered on
  // JoinRequestsCard, where Nate decides too; its question row exists for
  // Nick's Telegram card alone, so it is not shown here a second time.
  const tasks = all.filter((t) => t.source !== 'project_join' && !isWeekPlan(t))
  const snoozed = allSnoozed.filter((t) => t.source !== 'project_join' && !isWeekPlan(t))
  // The newest waiting week plan; an older waiting one is superseded by it.
  const plan = all
    .filter((t) => isWeekPlan(t) && questionCardState(t) === 'waiting')
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0] ?? null
  const [planOpen, setPlanOpen] = useState(false)
  // Three states, each read off the row (questionCardState). Waiting rows are
  // his turn; answered rows stay on the card until the PB lane acts, so an
  // answer nothing picked up cannot drop off every surface; acted-on rows are
  // one dim line each, today only, so he sees the loop close.
  const waiting = tasks.filter((t) => questionCardState(t) === 'waiting')
  const answered = tasks
    .filter((t) => questionCardState(t) === 'answered')
    .sort((a, b) => answeredAt(a) - answeredAt(b))
  const acted = tasks.filter((t) => questionCardState(t) === 'acted')
  const [showSnoozed, setShowSnoozed] = useState(false)
  // Rows the desk (renderWaiting) is showing as folded outcomes this visit:
  // the card keeps the desk mounted for them and does not list them again.
  const [held, setHeld] = useState<string[]>([])
  const shownAnswered = renderWaiting ? answered.filter((t) => !held.includes(t.id)) : answered
  // Acted-on rows alone are not a reason to show the gold card: nothing on it
  // would want him.
  if (!plan && waiting.length === 0 && shownAnswered.length === 0 && held.length === 0) return null

  const card = (
    <div className="tk">
      <section className="tk-attn" aria-label="Needs you">
        <div className="tk-attn-h">
          <span className="tk-attn-dot" aria-hidden="true" />
          Needs you
          {waiting.length + (plan ? 1 : 0) > 0 && <span className="tk-cnt">{waiting.length + (plan ? 1 : 0)}</span>}
          {onCollapse && (
            <Button
              size="icon"
              type="button"
              className="tk-attn-fold"
              data-testid="q-collapse"
              aria-label="Hide the Needs you card"
              title="Hide on Today and My Tasks until you click N needs you"
              onClick={onCollapse}
            >
              <ChevronUp size={15} aria-hidden="true" />
            </Button>
          )}
        </div>
        {plan && (
          <div className="tk-qrow" data-testid="q-week-plan">
            <button
              type="button"
              className="tk-plan-row"
              onClick={(e) => { e.stopPropagation(); setPlanOpen(true) }}
              aria-haspopup="dialog"
            >
              <span style={{ fontWeight: 600, color: 'var(--sk-t1)' }}>Plan your week</span>
              <span style={{ fontSize: 12, color: 'var(--sk-t3)' }}>{planSubtitle(plan)}</span>
            </button>
            {planOpen && <PlanPanel task={plan} onClose={() => setPlanOpen(false)} />}
          </div>
        )}
        {renderWaiting
          ? (waiting.length > 0 || held.length > 0) && renderWaiting(waiting, setHeld)
          : waiting.map((task) => <QuestionRow key={task.id} task={task} />)}
        {shownAnswered.length > 0 && (
          <div className="tk-qrow" data-testid="q-answered">
            <div style={{ fontSize: 11.5, color: 'var(--sk-t3)', marginBottom: 4 }}>
              Answered, not acted on yet
            </div>
            {shownAnswered.map((task) => (
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
          <div className="tk-qrow">
            <button
              type="button"
              data-testid="q-snoozed"
              aria-expanded={showSnoozed}
              onClick={(e) => { e.stopPropagation(); setShowSnoozed((v) => !v) }}
              style={{ fontSize: 11.5, color: 'var(--sk-t3)', textDecoration: 'underline', textUnderlineOffset: 2, padding: '4px 0', touchAction: 'manipulation' }}
            >
              {snoozed.length} snoozed · next back {dayLabel(nextBack(snoozed))}
            </button>
            {showSnoozed && (
              <div data-testid="q-snoozed-list" style={{ marginTop: 4 }}>
                {[...snoozed]
                  .sort((a, b) => (questionSnoozedUntil(a) ?? '').localeCompare(questionSnoozedUntil(b) ?? ''))
                  .map((task) => (
                    <SnoozedRow key={task.id} task={task} />
                  ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
  return band ? <div className="mt-band" style={{ paddingTop: 12, paddingBottom: 0 }}>{card}</div> : card
}

/** "4 to choose from" off the offer's spec; the title when it does not parse. */
function planSubtitle(task: TaskRow): string {
  try {
    const n = (JSON.parse(task.question_spec_json ?? '{}') as { candidates?: unknown[] }).candidates?.length ?? 0
    return n > 0 ? `${n} to choose from · pick what to start on` : 'Pick what to start on'
  } catch {
    return 'Pick what to start on'
  }
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
  { days: 1, label: 'For today' },
  { days: 3, label: '3 days' },
  { days: 7, label: 'Next week' },
] as const

/** Snooze a question: ONE write, due_date only, undo restores the old one. */
function useSnooze(task: TaskRow) {
  const { mutate: mutateTask } = useUpdateTask()
  const { showUndo } = useUndoToast()
  return (days: number): string => {
    const previous = task.due_date ?? null
    const until = civilDatePlusDays(todayKey(), days)
    mutateTask({ id: task.id, fields: { due_date: until } })
    showUndo(
      `Snoozed until ${dayLabel(until)}`,
      () => mutateTask({ id: task.id, fields: { due_date: previous } }),
    )
    return until
  }
}

/** A snoozed row, opened from the "N snoozed" line: when it comes back, a way
 *  to bring it back now, and the row itself so it can be answered early. */
function SnoozedRow({ task }: { task: TaskRow }) {
  const { mutate: mutateTask } = useUpdateTask()
  const { showUndo } = useUndoToast()
  const until = questionSnoozedUntil(task)
  const bringBack = () => {
    const previous = task.due_date ?? null
    mutateTask({ id: task.id, fields: { due_date: todayKey() } })
    showUndo('Back on Needs you', () => mutateTask({ id: task.id, fields: { due_date: previous } }))
  }
  return (
    <div data-testid={`q-snoozed-${task.id}`} style={{ borderTop: '1px solid var(--sk-line)', paddingTop: 6, marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 8, fontSize: 11.5, color: 'var(--sk-t3)' }}>
        <span>Back {dayLabel(until ?? '')}</span>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          data-testid={`q-unsnooze-${task.id}`}
          onClick={(e) => { e.stopPropagation(); bringBack() }}
          style={{ color: 'var(--sk-t2)', textDecoration: 'underline', textUnderlineOffset: 2, touchAction: 'manipulation' }}
        >
          Bring back now
        </button>
      </div>
      {questionCardState(task) === 'waiting' ? <QuestionRow task={task} /> : <AnsweredRow task={task} />}
    </div>
  )
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

/** One waiting question with its full chooser. Exported for the Decision desk
 *  (today/DecisionDesk.tsx), which opens it in place for "Choose another". */
export function QuestionRow({ task, onAnswered }: {
  task: TaskRow
  /** The desk's hook: told what this row wrote, after it wrote it. */
  onAnswered?: (o: { kind: 'answered' | 'later'; label: string; previousDue: string | null }) => void
}) {
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
      const previousDue = task.due_date ?? null
      const until = snooze(snoozeDays)
      onAnswered?.({ kind: 'later', label: `Back ${dayLabel(until)}`, previousDue })
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
    const picked = spec.choices.find((c) => c.key === choice)
    onAnswered?.({ kind: 'answered', label: choice === 'other' ? (text.trim() || 'Other') : (picked?.label ?? choice), previousDue: null })
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
