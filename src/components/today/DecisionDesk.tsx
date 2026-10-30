// DecisionDesk — "Needs-you asks" pick A (2026-10-30 UI pairs desk): the
// questions waiting on Nick, laid out as a desk. The one he has waited on
// longest gets room (what it asks, the context the question carries, the
// suggested answer, how long it has waited); the rest are one line each and
// open in place. Nick: "A: Decision desk" -- silence never acts.
//
// Additive (Nick 2026-10-30: "start by adding things and then slowly take away
// duplicative things once i like the new"): it reads the SAME question rows as
// QuestionsCard, which still renders above it, and writes the same two
// fields, nothing else:
//   - an answer: question_answer_json (Use suggested, or any choice through
//     the existing QuestionRow chooser), undo writes it back to null;
//   - Later: due_date = tomorrow, the card's own snooze, undo restores it.
// No status write, so the Worker's question chokepoint sees exactly what it
// sees from QuestionsCard.
//
// What the mockup had that the data does not: an "evidence" field and a "what
// waiting costs" line. A question spec carries prompt, choices and rec only
// (QuestionSpec in lib/taskGrouping.ts). So the desk shows the row's own body
// and links as the context, and the waiting age in place of a cost line.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUpdateTask } from '../../hooks/useMutations'
import { useUndoToast } from '../UndoToast'
import { QuestionRow } from '../tasks/QuestionsCard'
import { PATHS } from '../../constants/paths'
import { nowInstant, parseDbUtc } from '../../lib/time'
import { civilDatePlusDays, parseQuestionSpec, questionCardState, snoozeChoiceDays, todayKey } from '../../lib/taskGrouping'
import { taskBodyText } from '../../lib/todayPicks'
import type { TaskRow } from '../../lib/api'
import './picks.css'

/** "today", "yesterday", "3 days ago". */
function askedAgo(created: string | null | undefined, now: Date): string {
  const ms = parseDbUtc(created ?? '').getTime()
  if (isNaN(ms)) return ''
  const days = Math.floor((now.getTime() - ms) / 86400000)
  return days <= 0 ? 'asked today' : days === 1 ? 'asked yesterday' : `asked ${days} days ago`
}

/** Oldest first: the one waiting longest leads. */
function byAsked(a: TaskRow, b: TaskRow): number {
  return parseDbUtc(a.created_at).getTime() - parseDbUtc(b.created_at).getTime()
}

export function DecisionDesk({ tasks, projectsByPid, now = new Date() }: {
  tasks: TaskRow[]
  projectsByPid: Map<string, { name: string; slug: string }>
  now?: Date
}) {
  // Same exclusions as QuestionsCard: a join request is answered on its own card.
  const waiting = useMemo(
    () => tasks.filter((t) => t.source !== 'project_join' && questionCardState(t) === 'waiting').sort(byAsked),
    [tasks],
  )
  const acted = tasks.filter((t) => t.source !== 'project_join' && questionCardState(t) === 'acted').length
  const [leadId, setLeadId] = useState<string | null>(null)
  if (waiting.length === 0) return null
  const lead = waiting.find((t) => t.id === leadId) ?? waiting[0]
  const rest = waiting.filter((t) => t.id !== lead.id)

  return (
    <section className="tk-attn" aria-label="Decision desk" data-pick="decision-desk">
      <div className="tk-attn-h pk-desk-h">
        <span className="tk-attn-dot" aria-hidden="true" />
        Decision desk
        <span className="tk-cnt">{waiting.length} {waiting.length === 1 ? 'decision' : 'decisions'}</span>
        <span className="tk-r">oldest first</span>
      </div>
      <div className="pk-desk">
        <LeadDecision key={lead.id} task={lead} project={lead.project_id ? projectsByPid.get(lead.project_id) ?? null : null} now={now} />
        {rest.length > 0 && <div className="pk-hr" />}
        {rest.map((t) => {
          const spec = parseQuestionSpec(t)
          return (
            <div key={t.id} className="pk-row" data-testid={`desk-row-${t.id}`}>
              <div className="pk-g">
                <div className="pk-t">{spec?.prompt ?? t.title}</div>
                <div className="pk-s">{askedAgo(t.created_at, now)}</div>
              </div>
              <button type="button" className="tk-btn tk-sm" onClick={() => setLeadId(t.id)}>Open</button>
            </div>
          )
        })}
      </div>
      <div className="pk-foot">
        {acted > 0 && <>Acted on today: {acted}. </>}
        If you do not answer, nothing happens: each ask waits for you.
      </div>
    </section>
  )
}

function LeadDecision({ task, project, now }: { task: TaskRow; project: { name: string; slug: string } | null; now: Date }) {
  const { mutate: mutateTask } = useUpdateTask()
  const { showUndo } = useUndoToast()
  const [mode, setMode] = useState<'desk' | 'choose'>('desk')
  const [showContext, setShowContext] = useState(false)
  const spec = parseQuestionSpec(task)
  if (!spec) return <div className="pk-s">Malformed question: {task.title}</div>
  if (mode === 'choose') {
    return (
      <div>
        <QuestionRow task={task} />
        <button type="button" className="pk-link" onClick={() => setMode('desk')}>Back to the desk</button>
      </div>
    )
  }

  const rec = spec.choices.find((c) => c.key === spec.rec && snoozeChoiceDays(c) == null && c.key !== 'other')
  const body = taskBodyText(task)
  const links = [task.key_link_1, task.key_link_2, task.key_link_3]
    .map((url, i) => ({ url, desc: [task.key_link_1_desc, task.key_link_2_desc, task.key_link_3_desc][i] }))
    .filter((l): l is { url: string; desc: string | null } => typeof l.url === 'string' && l.url.length > 0)
  const hasContext = !!body || links.length > 0

  const useSuggested = () => {
    if (!rec) return
    mutateTask({ id: task.id, fields: { question_answer_json: { v: 1, choice: rec.key, via: 'hub', at: nowInstant() } } })
    showUndo('Answered', () => mutateTask({ id: task.id, fields: { question_answer_json: null } }))
  }
  const later = () => {
    const previous = task.due_date ?? null
    mutateTask({ id: task.id, fields: { due_date: civilDatePlusDays(todayKey(), 1) } })
    showUndo('Back tomorrow', () => mutateTask({ id: task.id, fields: { due_date: previous } }))
  }

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
      <div className="pk-k">Choices</div>
      <div className="pk-v">{spec.choices.filter((c) => c.key !== 'other').map((c) => c.label).join(' · ')}</div>
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
        {rec && <button type="button" className="tk-btn tk-sm tk-pri" data-testid="desk-use-suggested" onClick={useSuggested}>Use suggested</button>}
        <button type="button" className="tk-btn tk-sm" onClick={() => setMode('choose')}>Choose another</button>
        {hasContext && (
          <button type="button" className="tk-btn tk-sm" aria-expanded={showContext} onClick={() => setShowContext((v) => !v)}>
            {showContext ? 'Hide context' : 'See context'}
          </button>
        )}
        <button type="button" className="pk-link" data-testid="desk-later" onClick={later}>Later</button>
      </div>
    </div>
  )
}
