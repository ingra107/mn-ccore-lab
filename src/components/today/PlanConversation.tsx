// PlanConversation -- the planning conversation (v1 contract: PB
// Context/Decisions/2026-10-30-planning-conversation.md; round 2:
// 2026-11-02-week-plan-round-2.md).
//
// Nick, 2026-11-02: "I can't provide any feedback ... I guess a part of me
// doesn't necessarily want to have to click on something to know that we're
// going to talk about it. So I almost wonder if all of these options about
// what to do drop down ... because actually if the next step is something
// really complicated, maybe I decide not to pursue that one this week."
//
// ONE page. Every candidate shows its recommended first step at once. A
// picked row opens in place (an unpicked one opens with "Options and note"):
// the offer's 2-4 options (recommended preselected), "Something else...", and
// one free-text box for a note. Then Prep or Save, on the same page.
//
// Prep vs Prep & start (2026-11-02, PB Context/Decisions/2026-11-02-prep-and-start.md).
// Nick: "i dont' know what i am interacting with and what is occurring when i click
// start because there isn't an interactive session". The footer button is the batch
// PREP: each picked task gets its first step prepared in the background (the
// packet_prepare lane; it shows Ready). Each card also carries Prep & start, one
// task at a time: an interactive Claude session on his laptop that re-reads the
// threads, does the prep with him and opens what he needs. It writes nothing here
// and does not use a daily slot; the session reads this offer from PB itself.
//
// The cap never blocks Prep (Nick: "i could do 10 a day soemtimes"): picks
// past what is left today are saved, not started; the first `left`, in the
// order shown, start. The Worker's 409 daily_cap stays the backstop.
//
// A note typed with an option rides the pick's `text` beside its option_key
// (the contract needs at least one of the two; both is an option plus a note). The Worker writes each text onto its task as a
// comment (api/lib/week-plan-start.ts weekPlanNotes).
//
// Container-agnostic: it takes the question row and an onDone, and renders no
// chrome of its own (PlanPanel is the side panel it sits in today).
//
// Nothing acts on close or silence. The draft is component-local state ON
// PURPOSE. The only write is the one answer, on a click of Prep or Save,
// through the question-answer route (POST /api/tasks/:id).

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import PrepStartAction from '../PrepStartAction'
import type { TaskRow } from '../../lib/api'
import { nowInstant } from '../../lib/time'
import { postWeekPlanAnswer, useDailyPacketCount } from '../../lib/weekPlan'
import {
  PACKET_DAILY_CAP, WEEK_PLAN_CHOICE_SAVE, WEEK_PLAN_CHOICE_START,
  parseWeekPlanSpec, weekPlanPicksError, type WeekPlanPick,
} from '../../../shared/weekPlan'

/** The "Something else..." choice's key in the draft; never sent. */
const OTHER = '__other__'

export function PlanConversation({ task, onDone }: { task: TaskRow; onDone: () => void }) {
  const qc = useQueryClient()
  const spec = useMemo(() => parseWeekPlanSpec(task.question_spec_json), [task.question_spec_json])
  const count = useDailyPacketCount()
  // Draft state: local only, see the header.
  const [picked, setPicked] = useState<string[]>([])
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [text, setText] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!spec) {
    return <p className="tk-plan-note">This plan could not be read. It will be asked again.</p>
  }

  // Displayed order = the spec's order, which is also the start order.
  const chosen = spec.candidates.filter((c) => picked.includes(c.task_id))
  const choiceOf = (taskId: string): string => {
    if (choice[taskId]) return choice[taskId]
    const c = spec.candidates.find((x) => x.task_id === taskId)
    return c?.options.find((o) => o.recommended)?.key ?? ''
  }
  const noteOf = (taskId: string): string => (text[taskId] ?? '').trim()
  /** `startUpTo`: how many of the chosen, in order, start; the rest are saved. */
  const buildPicks = (startUpTo: number): WeekPlanPick[] => chosen.map((c, i) => {
    const key = choiceOf(c.task_id)
    const start = i < startUpTo
    const note = noteOf(c.task_id)
    if (key === OTHER) return { task_id: c.task_id, option_key: null, text: note, start }
    return { task_id: c.task_id, option_key: key, text: note || null, start }
  })
  const ready = chosen.length > 0 && chosen.every((c) => choiceOf(c.task_id) !== OTHER || noteOf(c.task_id) !== '')

  const used = count.data?.used ?? null
  const cap = count.data?.cap ?? PACKET_DAILY_CAP
  const left = used === null ? null : Math.max(0, cap - used)
  // Unknown count: ask for all; the Worker's cap check is the backstop and
  // the retry below falls back to what it says is left.
  const startN = left === null ? chosen.length : Math.min(chosen.length, left)
  const overflow = chosen.length - startN

  const submit = async (startUpTo: number, retried = false): Promise<void> => {
    const picks = buildPicks(startUpTo)
    const why = weekPlanPicksError(picks, spec)
    if (why) { setErr(why); return }
    setBusy(true)
    setErr(null)
    const r = await postWeekPlanAnswer(task.id, {
      v: 1, choice: startUpTo > 0 ? WEEK_PLAN_CHOICE_START : WEEK_PLAN_CHOICE_SAVE, via: 'hub', at: nowInstant(), picks,
    })
    setBusy(false)
    qc.invalidateQueries({ queryKey: ['packets', 'daily-count'] })
    if (r.ok) {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      onDone()
      return
    }
    if (r.code === 'daily_cap' && 'used' in r) {
      // Today's slots were used since the count was read: start what still
      // fits and save the rest, once. Never a dead end.
      if (!retried) {
        await submit(Math.min(startUpTo, Math.max(0, r.cap - r.used)), true)
        return
      }
      setErr(`Today's ${r.cap} are already used or queued (${r.used}). Press Save to keep these for later.`)
      return
    }
    if (r.error.includes('week_plan_superseded')) {
      // A Re-plan offered a newer plan while this one was open: the Worker
      // refuses a first answer to an older offer (api/lib/week-plan-start.ts).
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setErr('A newer plan was offered. Answer that one in Needs you.')
      return
    }
    if (r.error.includes('question_expired')) {
      // The week this plan was for is over (task-question.ts
      // questionAnswerFrozenError, the same weekPlanExpired).
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setErr('This plan was for a week that is over. Press Re-plan or wait for Sunday\'s.')
      return
    }
    if (r.code === 'not_found') {
      // The offer was deleted while open (PB retires an older offer).
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setErr('This plan was replaced. Answer the current one in Needs you.')
      return
    }
    setErr(`Not saved: ${r.error}`)
  }

  return (
    <div className="tk-plan" data-testid="plan-conversation">
      <p className="tk-plan-prompt">{spec.prompt}</p>

      <section aria-label="Pick what to take a step on" className="tk-plan-step">
        {spec.candidates.map((c) => {
          const on = picked.includes(c.task_id)
          const isOpen = open[c.task_id] ?? on
          const rec = c.options.find((o) => o.recommended)
          const sel = choiceOf(c.task_id)
          return (
            <div key={c.task_id} className={`tk-plan-card${on ? ' tk-on' : ''}`} data-testid="plan-card">
              <label className={`tk-plan-opt${on ? ' tk-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setPicked((p) => (on ? p.filter((x) => x !== c.task_id) : [...p, c.task_id]))}
                />
                <span>
                  <span className="tk-plan-t">{c.title}</span>
                  {c.why && <span className="tk-plan-why">{c.why}</span>}
                  {rec && <span className="tk-plan-why" data-testid="plan-rec">Next step: {rec.label}</span>}
                </span>
              </label>
              <span className="tk-week-acts">
                <button
                  type="button"
                  className="tk-btn tk-sm"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((m) => ({ ...m, [c.task_id]: !isOpen }))}
                >
                  {isOpen ? 'Hide options' : 'Options and note'}
                </button>
                <PrepStartAction taskId={c.task_id} />
              </span>
              {isOpen && (
                <fieldset className="tk-plan-set">
                  <legend className="tk-plan-why">First step for {c.title}</legend>
                  {c.options.map((o) => (
                    <label key={o.key} className={`tk-plan-opt${sel === o.key ? ' tk-on' : ''}`}>
                      <input
                        type="radio"
                        name={`plan-${c.task_id}`}
                        checked={sel === o.key}
                        onChange={() => setChoice((m) => ({ ...m, [c.task_id]: o.key }))}
                      />
                      <span>
                        <span className="tk-plan-t">
                          {o.label}
                          {o.recommended && <span className="tk-tag tk-ac">Recommended</span>}
                        </span>
                        <span className="tk-plan-why">{o.direction}</span>
                      </span>
                    </label>
                  ))}
                  <label className={`tk-plan-opt${sel === OTHER ? ' tk-on' : ''}`}>
                    <input
                      type="radio"
                      name={`plan-${c.task_id}`}
                      checked={sel === OTHER}
                      onChange={() => setChoice((m) => ({ ...m, [c.task_id]: OTHER }))}
                    />
                    <span className="tk-plan-t">Something else...</span>
                  </label>
                  <textarea
                    className="tk-plan-text"
                    aria-label={`${sel === OTHER ? 'Your own first step' : 'Your note'} for ${c.title}`}
                    placeholder={sel === OTHER ? 'Say what the first step should be' : 'Talk it through: a note for this task (optional)'}
                    value={text[c.task_id] ?? ''}
                    onChange={(e) => setText((m) => ({ ...m, [c.task_id]: e.target.value }))}
                    rows={2}
                  />
                </fieldset>
              )}
            </div>
          )
        })}

        <p className="tk-plan-note" data-testid="plan-cap">
          {left === null
            ? (count.isError ? "Couldn't read today's count; Prep will try and the Worker decides." : "Checking today's count...")
            : `${cap} prepared first steps a day: ${left} left today.`}
          {chosen.length > 0 && overflow > 0 && left !== null && (
            startN === 0
              ? " Today's are used, so these will be saved for later."
              : ` Prep begins the first ${startN} in the list; the other ${overflow} are saved for later.`
          )}
        </p>
        {err && <p className="tk-plan-err" role="alert">{err}</p>}
        <div className="tk-plan-acts">
          <button type="button" className="tk-btn tk-sm" onClick={() => submit(0)} disabled={busy || !ready}>
            Save without prepping
          </button>
          <button type="button" className="tk-btn tk-sm tk-pri" onClick={() => submit(startN)} disabled={busy || !ready}>
            {chosen.length === 0 ? 'Prep' : startN === 0 ? 'Save for later' : `Prep ${startN === 1 ? 'this one' : `these ${startN}`}`}
          </button>
        </div>
      </section>
    </div>
  )
}
