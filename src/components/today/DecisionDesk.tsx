// DecisionDesk — "Needs-you asks" pick A (2026-10-30 UI pairs desk, Nick:
// "A: Decision desk", silence never acts). It is the questions section INSIDE
// the one Needs you card, never a card of its own: Nick ruled the same day
// that Today keeps ONE gold card (Context/Decisions/2026-10-30-planning-and-
// first-step-mockup-picks.md, "Gold cards"). QuestionsCard hands it the
// waiting rows through `renderWaiting` (Today only; My Tasks keeps the plain
// rows), so every question shows exactly once on the card.
//
// It flows like the working desks (Nick 2026-10-30: "can it be like the desks
// we make where i choose something and it opens the next"; reference
// .claude/skills/working-desk-artifact/assets/desk_flow.js): one question is
// open at a time, oldest first. Answering it (Use suggested, a choice, or the
// full chooser) or putting it off (Later) folds it to one line with the
// outcome and an Undo, and the next waiting question opens in place with focus
// on its first button. Any folded waiting line opens on click and closes the
// open one. After the last: "All caught up".
//
// Writes, each on a click only, the same two fields QuestionsCard writes:
//   - an answer: question_answer_json; Undo writes it back to null;
//   - Later: due_date = tomorrow, the card's own snooze; Undo restores it.
// No status write, so the Worker's question chokepoint sees exactly what it
// sees from QuestionsCard. Nothing happens on silence.
//
// What the mockup had that the data does not: an "evidence" field and a "what
// waiting costs" line. A question spec carries prompt, choices and rec only
// (QuestionSpec in lib/taskGrouping.ts). So the desk shows the row's own body
// and links as the context, and the waiting age in place of a cost line.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUpdateTask } from '../../hooks/useMutations'
import { QuestionRow } from '../tasks/QuestionsCard'
import { PATHS } from '../../constants/paths'
import { nowInstant, parseDbUtc } from '../../lib/time'
import { civilDatePlusDays, parseQuestionSpec, snoozeChoiceDays, todayKey } from '../../lib/taskGrouping'
import { taskBodyText } from '../../lib/todayPicks'
import type { TaskRow } from '../../lib/api'
import './picks.css'

type Spec = NonNullable<ReturnType<typeof parseQuestionSpec>>

/** "today", "yesterday", "3 days ago". */
function askedAgo(created: string | null | undefined, now: Date): string {
  const ms = parseDbUtc(created ?? '').getTime()
  if (isNaN(ms)) return ''
  const days = Math.floor((now.getTime() - ms) / 86400000)
  return days <= 0 ? 'asked today' : days === 1 ? 'asked yesterday' : `asked ${days} days ago`
}

/** Oldest first: the one waiting longest leads. */
function byAsked(a: TaskRow, b: TaskRow): number {
  return parseDbUtc(a.created_at).getTime() - parseDbUtc(b.created_at).getTime() || a.id.localeCompare(b.id)
}

/** What happened to a question on this desk, this visit. */
interface DeskOutcome { kind: 'answered' | 'later'; label: string; undo: () => void }

/** The waiting questions as a desk, inside the Needs you card. `waiting` is
 *  QuestionsCard's own waiting list (join requests already dropped). `onHold`
 *  tells the card which rows the desk is showing as folded outcomes, so the
 *  card does not list them a second time under "Answered". */
export function DecisionDesk({ waiting, projectsByPid, onHold, now = new Date() }: {
  waiting: TaskRow[]
  projectsByPid: Map<string, { name: string; slug: string }>
  onHold?: (ids: string[]) => void
  now?: Date
}) {
  const { mutate: mutateTask } = useUpdateTask()
  const [outcomes, setOutcomes] = useState<Record<string, DeskOutcome>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  // A row answered here leaves `waiting` once the cache updates; keep the copy
  // it had so its folded line (and Undo) stays put.
  const [seen] = useState(() => new Map<string, TaskRow>())
  for (const t of waiting) seen.set(t.id, t)

  const rows = useMemo(() => {
    const ids = new Set([...waiting.map((t) => t.id), ...Object.keys(outcomes)])
    return [...ids]
      .map((id) => waiting.find((t) => t.id === id) ?? seen.get(id))
      .filter((t): t is TaskRow => !!t)
      .sort(byAsked)
  }, [waiting, outcomes, seen])
  const pending = rows.filter((t) => !outcomes[t.id])
  const open = pending.find((t) => t.id === openId) ?? pending[0] ?? null

  const heldKey = Object.keys(outcomes).sort().join(',')
  useEffect(() => { onHold?.(heldKey ? heldKey.split(',') : []) }, [heldKey, onHold])

  // Focus moves with the desk, only after a click here (never on page load).
  useEffect(() => {
    if (focusTick === 0) return
    const el = rootRef.current?.querySelector<HTMLElement>('[data-desk-open] button, [data-desk-done]')
    el?.focus({ preventScroll: true })
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [focusTick])

  const settle = (task: TaskRow, kind: DeskOutcome['kind'], label: string, undoWrite: () => void) => {
    const after = pending.filter((t) => t.id !== task.id)
    const next = after.find((t) => byAsked(t, task) > 0) ?? after[0] ?? null
    const undo = () => {
      undoWrite()
      setOutcomes((o) => {
        const rest = { ...o }
        delete rest[task.id]
        return rest
      })
      setOpenId(task.id)
      setFocusTick((n) => n + 1)
    }
    setOutcomes((o) => ({ ...o, [task.id]: { kind, label, undo } }))
    setOpenId(next?.id ?? null)
    setFocusTick((n) => n + 1)
  }
  const answer = (task: TaskRow, choice: { key: string; label: string }) => {
    mutateTask({ id: task.id, fields: { question_answer_json: { v: 1, choice: choice.key, via: 'hub', at: nowInstant() } } })
    settle(task, 'answered', choice.label, () => mutateTask({ id: task.id, fields: { question_answer_json: null } }))
  }
  const later = (task: TaskRow) => {
    const previous = task.due_date ?? null
    mutateTask({ id: task.id, fields: { due_date: civilDatePlusDays(todayKey(), 1) } })
    settle(task, 'later', 'Back tomorrow', () => mutateTask({ id: task.id, fields: { due_date: previous } }))
  }
  // The full chooser (QuestionRow) wrote the answer or the snooze itself.
  const chosen = (task: TaskRow, o: { kind: 'answered' | 'later'; label: string; previousDue: string | null }) => {
    settle(task, o.kind, o.label, o.kind === 'answered'
      ? () => mutateTask({ id: task.id, fields: { question_answer_json: null } })
      : () => mutateTask({ id: task.id, fields: { due_date: o.previousDue } }))
  }

  if (rows.length === 0) return null

  return (
    <div className="pk-desk tk-qrow" data-pick="decision-desk" ref={rootRef}>
      {rows.map((t, i) => {
        const spec = parseQuestionSpec(t)
        const done = outcomes[t.id]
        const sep = i > 0 ? ' pk-sep' : ''
        if (t.id === open?.id) {
          return (
            <div key={t.id} className={`pk-dq${sep}`} data-desk-open="">
              <OpenDecision
                task={t}
                spec={spec}
                project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                now={now}
                onAnswer={(c) => answer(t, c)}
                onLater={() => later(t)}
                onChosen={(o) => chosen(t, o)}
              />
            </div>
          )
        }
        if (done) {
          return (
            <div key={t.id} className={`pk-row${sep}`} data-testid={`desk-done-${t.id}`}>
              <div className="pk-g">
                <div className="pk-t" style={{ color: 'var(--sk-t2)' }}>{spec?.prompt ?? t.title}</div>
                <div className="pk-s">{done.kind === 'answered' ? <>You chose “{done.label}”</> : done.label}</div>
              </div>
              <button type="button" className="pk-link" data-testid={`desk-undo-${t.id}`} onClick={done.undo}>Undo</button>
            </div>
          )
        }
        return (
          <button
            key={t.id}
            type="button"
            className={`pk-row pk-rowbtn${sep}`}
            data-testid={`desk-row-${t.id}`}
            onClick={() => { setOpenId(t.id); setFocusTick((n) => n + 1) }}
          >
            <span className="pk-g">
              <span className="pk-t">{spec?.prompt ?? t.title}</span>
              <span className="pk-s">{askedAgo(t.created_at, now)}</span>
            </span>
            <span className="pk-s" aria-hidden="true">Open</span>
          </button>
        )
      })}
      {!open && (
        <div className="pk-done" data-desk-done="" tabIndex={-1} data-testid="desk-caught-up">All caught up</div>
      )}
      <div className="pk-foot">If you do not answer, nothing happens: each ask waits for you.</div>
    </div>
  )
}

function OpenDecision({ task, spec, project, now, onAnswer, onLater, onChosen }: {
  task: TaskRow
  spec: Spec | null
  project: { name: string; slug: string } | null
  now: Date
  onAnswer: (c: { key: string; label: string }) => void
  onLater: () => void
  onChosen: (o: { kind: 'answered' | 'later'; label: string; previousDue: string | null }) => void
}) {
  const [mode, setMode] = useState<'desk' | 'choose'>('desk')
  const [showContext, setShowContext] = useState(false)
  if (!spec) return <div className="pk-s">Malformed question: {task.title}</div>
  if (mode === 'choose') {
    return (
      <div data-testid={`desk-lead-${task.id}`}>
        <QuestionRow task={task} onAnswered={onChosen} />
        <button type="button" className="pk-link" onClick={() => setMode('desk')}>Back to the desk</button>
      </div>
    )
  }

  const rec = spec.choices.find((c) => c.key === spec.rec && snoozeChoiceDays(c) == null && c.key !== 'other')
  // Choices that answer in one click: not "Other" (it needs text; the chooser
  // has it) and not a declared "Not yet" snooze (Later covers it).
  const direct = spec.choices.filter((c) => c.key !== 'other' && snoozeChoiceDays(c) == null && c.key !== rec?.key)
  const body = taskBodyText(task)
  const links = [task.key_link_1, task.key_link_2, task.key_link_3]
    .map((url, i) => ({ url, desc: [task.key_link_1_desc, task.key_link_2_desc, task.key_link_3_desc][i] }))
    .filter((l): l is { url: string; desc: string | null } => typeof l.url === 'string' && l.url.length > 0)
  const hasContext = !!body || links.length > 0

  return (
    <div data-testid={`desk-lead-${task.id}`}>
      <div className="pk-t" style={{ fontSize: 14 }}>{spec.prompt}</div>
      <div className="pk-s" style={{ marginTop: 2 }}>
        {project && <><Link to={PATHS.project(project.slug)} style={{ color: 'inherit' }}>{project.name}</Link> · </>}
        {task.title !== spec.prompt && <>{task.title} · </>}
        {askedAgo(task.created_at, now)}
      </div>
      {rec && (
        <>
          <div className="pk-k">Suggested</div>
          <div className="pk-ins">{rec.label}</div>
        </>
      )}
      {showContext && hasContext && (
        <>
          <div className="pk-k">Context</div>
          {body && <div className="pk-v" style={{ whiteSpace: 'pre-wrap' }}>{body}</div>}
          {links.map((l) => (
            <div key={l.url} className="pk-v"><a href={l.url} target="_blank" rel="noreferrer" style={{ color: 'var(--job-accent)' }}>{l.desc || l.url}</a></div>
          ))}
        </>
      )}
      <div className="pk-btns">
        {rec && <button type="button" className="tk-btn tk-sm tk-pri" data-testid="desk-use-suggested" onClick={() => onAnswer(rec)}>Use suggested</button>}
        {direct.map((c) => (
          <button key={c.key} type="button" className="tk-btn tk-sm" data-testid={`desk-choice-${c.key}`} onClick={() => onAnswer(c)}>{c.label}</button>
        ))}
        <button type="button" className="tk-btn tk-sm" onClick={() => setMode('choose')}>Choose another</button>
        {hasContext && (
          <button type="button" className="tk-btn tk-sm" aria-expanded={showContext} onClick={() => setShowContext((v) => !v)}>
            {showContext ? 'Hide context' : 'See context'}
          </button>
        )}
        <button type="button" className="pk-link" data-testid="desk-later" onClick={onLater}>Later</button>
      </div>
    </div>
  )
}
