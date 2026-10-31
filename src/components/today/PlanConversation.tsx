// PlanConversation -- the planning conversation (v1 contract: PB
// Context/Decisions/2026-10-30-planning-conversation.md; mockups A1 + A4,
// Nick's picks in 2026-10-30-planning-and-first-step-mockup-picks.md).
//
// Nick, 2026-10-29: "you're asking me questions about what things do you want
// to take the next step on and then I would click which ones and then you
// could offer me four different options for each one that I chose ... and
// then you could get started on those things".
//
// Three steps, one box each:
//   1. Pick: which of the offer's candidates to take a step on (multi-select).
//   2. Per pick: the offer's 2-4 options, the recommended one marked and
//      chosen to start, plus one "Something else..." box.
//   3. "Start these N" (only while N fits today's packet cap, which is shown)
//      or "Save without starting".
//
// Container-agnostic: it takes the question row and an onDone, and renders no
// chrome of its own (PlanPanel is the side panel it sits in today).
//
// Nothing acts on close or silence. The draft (picks, options, typed text)
// is component-local state ON PURPOSE: it is not saved anywhere, so closing
// the panel loses it and writes nothing. The only write is the one answer,
// on a click of Start or Save, through the question-answer route
// (POST /api/tasks/:id); the Worker stores it and, for Start, inserts the
// prepare requests in the same batch, or refuses the whole thing at the cap.

import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { TaskRow } from '../../lib/api'
import { nowInstant } from '../../lib/time'
import { postWeekPlanAnswer, useDailyPacketCount } from '../../lib/weekPlan'
import {
  PACKET_DAILY_CAP, WEEK_PLAN_CHOICE_SAVE, WEEK_PLAN_CHOICE_START,
  parseWeekPlanSpec, weekPlanPicksError, type WeekPlanPick,
} from '../../../shared/weekPlan'

/** The "Something else..." choice's key in the draft; never sent. */
const OTHER = '__other__'

type Step = 'pick' | 'options' | 'confirm'

export function PlanConversation({ task, onDone }: { task: TaskRow; onDone: () => void }) {
  const qc = useQueryClient()
  const spec = useMemo(() => parseWeekPlanSpec(task.question_spec_json), [task.question_spec_json])
  const count = useDailyPacketCount()
  // Draft state: local only, see the header.
  const [step, setStep] = useState<Step>('pick')
  const [picked, setPicked] = useState<string[]>([])
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [text, setText] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!spec) {
    return <p className="tk-plan-note">This plan could not be read. It will be asked again.</p>
  }

  const chosen = spec.candidates.filter((c) => picked.includes(c.task_id))
  const choiceOf = (taskId: string): string => {
    if (choice[taskId]) return choice[taskId]
    const c = spec.candidates.find((x) => x.task_id === taskId)
    return c?.options.find((o) => o.recommended)?.key ?? ''
  }
  const buildPicks = (start: boolean): WeekPlanPick[] => chosen.map((c) => {
    const key = choiceOf(c.task_id)
    return key === OTHER
      ? { task_id: c.task_id, option_key: null, text: (text[c.task_id] ?? '').trim(), start }
      : { task_id: c.task_id, option_key: key, text: null, start }
  })
  const optionsReady = chosen.every((c) => choiceOf(c.task_id) !== OTHER || (text[c.task_id] ?? '').trim() !== '')

  const used = count.data?.used ?? null
  const cap = count.data?.cap ?? PACKET_DAILY_CAP
  const left = used === null ? null : Math.max(0, cap - used)
  const canStart = left !== null && chosen.length > 0 && chosen.length <= left

  const submit = async (start: boolean) => {
    const picks = buildPicks(start)
    const why = weekPlanPicksError(picks, spec)
    if (why) { setErr(why); return }
    setBusy(true)
    setErr(null)
    const r = await postWeekPlanAnswer(task.id, {
      v: 1, choice: start ? WEEK_PLAN_CHOICE_START : WEEK_PLAN_CHOICE_SAVE, via: 'hub', at: nowInstant(), picks,
    })
    setBusy(false)
    qc.invalidateQueries({ queryKey: ['packets', 'daily-count'] })
    if (r.ok) {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      onDone()
      return
    }
    if (r.code === 'daily_cap' && 'used' in r) {
      setErr(`Today's ${r.cap} are already used or queued (${r.used}). Save without starting, or start fewer.`)
      return
    }
    setErr(`Not saved: ${r.error}`)
  }

  return (
    <div className="tk-plan" data-testid="plan-conversation">
      <p className="tk-plan-prompt">{spec.prompt}</p>

      {step === 'pick' && (
        <section aria-label="Pick what to take a step on" className="tk-plan-step">
          {spec.candidates.map((c) => {
            const on = picked.includes(c.task_id)
            return (
              <label key={c.task_id} className={`tk-plan-opt${on ? ' tk-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setPicked((p) => (on ? p.filter((x) => x !== c.task_id) : [...p, c.task_id]))}
                />
                <span>
                  <span className="tk-plan-t">{c.title}</span>
                  {c.why && <span className="tk-plan-why">{c.why}</span>}
                </span>
              </label>
            )
          })}
          <div className="tk-plan-acts">
            <button type="button" className="tk-btn tk-sm tk-pri" disabled={picked.length === 0} onClick={() => setStep('options')}>
              Next{picked.length > 0 ? ` (${picked.length})` : ''}
            </button>
          </div>
        </section>
      )}

      {step === 'options' && (
        <section aria-label="Choose the first step for each" className="tk-plan-step">
          {chosen.map((c) => {
            const sel = choiceOf(c.task_id)
            return (
              <fieldset key={c.task_id} className="tk-plan-set">
                <legend className="tk-plan-t">{c.title}</legend>
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
                {sel === OTHER && (
                  <textarea
                    className="tk-plan-text"
                    aria-label={`Your own first step for ${c.title}`}
                    placeholder="Say what the first step should be"
                    value={text[c.task_id] ?? ''}
                    onChange={(e) => setText((m) => ({ ...m, [c.task_id]: e.target.value }))}
                    rows={2}
                  />
                )}
              </fieldset>
            )
          })}
          <div className="tk-plan-acts">
            <button type="button" className="tk-btn tk-sm" onClick={() => setStep('pick')}>Back</button>
            <button type="button" className="tk-btn tk-sm tk-pri" disabled={!optionsReady} onClick={() => setStep('confirm')}>Next</button>
          </div>
        </section>
      )}

      {step === 'confirm' && (
        <section aria-label="Start or save" className="tk-plan-step">
          <ul className="tk-plan-list">
            {buildPicks(true).map((p) => {
              const c = spec.candidates.find((x) => x.task_id === p.task_id)!
              const label = p.text ?? c.options.find((o) => o.key === p.option_key)?.label ?? ''
              return (
                <li key={p.task_id}>
                  <span className="tk-plan-t">{c.title}</span>
                  <span className="tk-plan-why">{label}</span>
                </li>
              )
            })}
          </ul>
          <p className="tk-plan-note" data-testid="plan-cap">
            {left === null
              ? (count.isError ? "Couldn't read today's count, so Start is off. You can still save." : "Checking today's count...")
              : `${cap} prepared first steps a day: ${left} left today.`}
            {left !== null && chosen.length > left && ' Go back and pick fewer to start them, or save.'}
          </p>
          {err && <p className="tk-plan-err" role="alert">{err}</p>}
          <div className="tk-plan-acts">
            <button type="button" className="tk-btn tk-sm" onClick={() => setStep('options')} disabled={busy}>Back</button>
            <button type="button" className="tk-btn tk-sm" onClick={() => submit(false)} disabled={busy}>Save without starting</button>
            <button type="button" className="tk-btn tk-sm tk-pri" onClick={() => submit(true)} disabled={busy || !canStart}>
              Start {chosen.length === 1 ? 'this one' : `these ${chosen.length}`}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
