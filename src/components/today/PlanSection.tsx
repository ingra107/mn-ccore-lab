// PlanSection -- the plan on Today, as one section of real task cards (#169 round
// 2, docs/superpowers/specs/2026-11-04-plan-section-design.md). Nick: "should it
// essentially look similar to the task below like a true task card and it just
// gets elevated up". It replaces This week and Planned today, in both view modes.
//
// lib/planSection decides what is here and in what order: planned for today,
// then the other picks, then Done, with no fold. Each card is Today's TaskRow
// over the shared row (Rule 68), so body click, the check and the grip mean what
// they mean below (Rule 58). The plan adds, through props on that row: the Today
// tag and its x, the first step, the packet tag, Prep and Prep & start.
//
// Prep is the one follow-up write a stored plan takes: the stored answer with
// that pick flipped to start:true, under the shared daily cap. It shows on any
// pick not started, a kept one too: its flip is a real start. Prep & start is an
// interactive Claude session for that task (PB
// Context/Decisions/2026-11-02-prep-and-start.md); on a Ready pick it reads Open
// session. A plan never writes planned_for: the Today tag reads the plan columns
// through useTodayState.
//
// The section is the `slot:strip` droppable, so a drag onto it plans a task for
// today (TodayDndContext routes the drop). The Plan button renders for the PI
// only (usePlanControl); a member gets the same section with their planned tasks.

import { useState, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import { TaskRow } from './TaskRow'
import PrepStartAction from '../PrepStartAction'
import { CollapseChevron } from './SectionCollapseToggle'
import { collapseToggleProps } from './collapseToggleProps'
import { usePrepStartAllowed } from '../../hooks/usePrepStartAllowed'
import { usePlanControl } from '../../hooks/usePlanControl'
import { buildPrepStartUri } from '../../lib/urlClassify'
import { isTaskDone } from '../../lib/taskGrouping'
import { pickTag, postWeekPlanAnswer, startFlipAnswer, weekRangeLabel, type AcceptedWeekPlan } from '../../lib/weekPlan'
import type { PlanSectionModel } from '../../lib/planSection'
import { pickDirection, pickOwner, PACKET_DAILY_CAP } from '../../../shared/weekPlan'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow as TaskRowData } from '../../lib/api'

/** What each packet tag means, said where it is shown (Nick, 2026-11-02: "it now says ready which i don't know what that means"). */
const TAG_HELP: Record<string, string> = {
  Ready: 'A first step is prepared: open the task to see it',
  Changed: 'The task changed since its first step was prepared: open the task to check it',
  'Check it': 'A first step is prepared but could not be verified: open the task to check it',
  Preparing: 'The first step is being prepared in the background. It shows here when ready',
  Yours: 'This step is yours: Claude has nothing to prepare for it',
  'With Claude': 'Claude can take this step: press Prep to have it prepared in the background, or Prep & start to do it with Claude now',
  Saved: 'Saved, not prepped: press Prep to have the first step prepared in the background, or Prep & start to do it with Claude now',
}
const OPENS_DRAWER = new Set(['Ready', 'Changed', 'Check it'])

interface PlanSectionProps {
  plan: AcceptedWeekPlan | null
  /** The week a press of the button would plan already has a plan: it reads Replan,
   *  else Plan week. Differs from `plan` on a Sunday, when the plan on show is the
   *  ending week's and a press plans the next (lib/weekPlan.ts sessionWeekPlanned). */
  weekPlanned?: boolean
  model: PlanSectionModel
  state: TodayStateApi
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null; primary_folder?: string | null }>
  stepsByParent?: Map<string, TaskRowData[]>
  viewerSlug: string
  /** The task read has not answered: no empty line, which would claim nothing is planned. */
  loading?: boolean
  /** The gold Plan your week row is on screen with its own button: this section does
   *  not offer a second one. */
  planRowAbove?: boolean
  /** The read of others' tasks has not answered: a pick can sit with someone else, so the count would be short. */
  countPending?: boolean
}

export function PlanSection({ plan, weekPlanned = !!plan, model, state, projectsByPid, stepsByParent, viewerSlug, planRowAbove = false, loading = false, countPending = false }: PlanSectionProps) {
  const qc = useQueryClient()
  // Per-surface expand state: a task on the timeline too does not open here.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const onExpand = useCallback((id: string) => { setExpandedId((p) => (p === id ? null : id)) }, [])
  // Session-only collapse: starts open on every load, like the sections below.
  const [open, setOpen] = useState(true)
  const [starting, setStarting] = useState<string | null>(null)
  // A kept pick's flip is a real start, but its stored answer reads the same as a
  // carried one (AcceptedWeekPlan.kept). So only the press that made it can say so,
  // and after a reload that pick shows no tag until its packet does.
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set())
  const [err, setErr] = useState<string | null>(null)
  const { isOver, setNodeRef } = useDroppable({ id: 'slot:strip' })
  const planCtl = usePlanControl({ weekPlanned })
  const prepStartAllowed = usePrepStartAllowed()

  const start = async (taskId: string) => {
    if (!plan) return
    const answer = startFlipAnswer(plan.task, taskId)
    if (!answer) return
    setStarting(taskId)
    setErr(null)
    const r = await postWeekPlanAnswer(plan.task.id, answer)
    setStarting(null)
    if (r.ok) { setFlipped((s) => new Set(s).add(taskId)); qc.invalidateQueries({ queryKey: ['tasks'] }); return }
    if (r.code === 'daily_cap' && 'used' in r) setErr(`Today's ${r.cap} prepared first steps are already used or queued. Try tomorrow.`)
    else setErr(`Not prepped: ${r.error}`)
  }

  const picks = new Map((plan?.picks ?? []).map((p) => [p.task_id, p]))
  const packetTagEl = (label: string, cls: string, id: string) => {
    const help = TAG_HELP[label]
    if (OPENS_DRAWER.has(label)) {
      return <button type="button" className={`tk-tag tk-plan-link ${cls}`} data-testid="pick-packet-tag" title={help} aria-label={`${label}. ${help}`} onClick={(e) => { e.stopPropagation(); onExpand(id) }}>{label}</button>
    }
    return <span className={`tk-tag ${cls}`} title={help} aria-label={help ? `${label}. ${help}` : undefined}>{label}</span>
  }

  // One construction of a card, so the three lists cannot drift apart.
  const card = (t: TaskRowData, where: 'today' | 'pick' | 'done') => {
    const pick = picks.get(t.id)
    const done = isTaskDone(t) || t.completed === 1
    // A done card shows no step or Prep (the card hides that line); no tag either.
    const owner = pick && plan ? pickOwner(pick, plan.spec) : null
    const tag = pick && where !== 'done' ? pickTag(t, pick.start, !!plan?.kept.includes(t.id) && !flipped.has(t.id), owner) : null
    // Nick's own step has nothing for Claude to prepare: no Prep, no Prep & start.
    const prepBtn = pick && !pick.start && owner !== 'nick' ? (
      <button
        type="button"
        className="tk-btn tk-sm"
        data-testid="pick-start"
        disabled={starting !== null}
        title={`Prepare this first step in the background now (counts toward today's ${PACKET_DAILY_CAP})`}
        onClick={(e) => { e.stopPropagation(); void start(t.id) }}
      >
        {starting === t.id ? 'Prepping...' : 'Prep'}
      </button>
    ) : null
    const sessionBtn = pick && owner !== 'nick' && prepStartAllowed && buildPrepStartUri(t.id) !== null ? (
      <PrepStartAction taskId={t.id} ready={!!tag && OPENS_DRAWER.has(tag.label)} variant="primary" />
    ) : null
    return (
      <div key={t.id} data-testid="plan-card">
        <TaskRow
          task={t}
          project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
          state={state}
          expandedId={expandedId}
          onExpand={onExpand}
          projectsByPid={projectsByPid}
          done={done}
          // Someone else's task is not yours to plan.
          noDrag={!!t.assignee && !!viewerSlug && t.assignee !== viewerSlug}
          openSteps={stepsByParent?.get(t.id)}
          // The label is a claim: the x takes a pick off today, and only the next
          // Plan takes it off the plan.
          planToday={where === 'today' ? { clearLabel: pick ? 'Remove from today' : 'Remove from plan' } : undefined}
          packetTag={pick ? (tag ? packetTagEl(tag.label, tag.cls, t.id) : null) : undefined}
          firstStep={pick && plan ? pickDirection(pick, plan.spec) : undefined}
          firstStepActions={prepBtn || sessionBtn ? <>{prepBtn}{sessionBtn}</> : undefined}
        />
      </div>
    )
  }

  const total = model.today.length + model.picks.length + model.done.length
  const emptyLine = plan
    ? 'Nothing planned this week.'
    : planCtl.buttonEl && !planRowAbove
      ? 'Nothing planned yet. Plan the week, or drag a task here to plan it for today.'
      : 'Nothing planned. Drag a task here to plan it for today.'

  return (
    <section
      ref={setNodeRef}
      data-testid="plan-section"
      className={`tk-panel tk-blk tk-planned${isOver ? ' tk-over' : ''}`}
    >
      <div {...collapseToggleProps(open, () => setOpen((o) => !o), 'Plan')} className="tk-ph tk-clk">
        <div className="tk-ctog">
          <CollapseChevron open={open} />
          <h3>Plan</h3>
          {(loading || countPending) && <span className="tk-cnt">—</span>}
          {!loading && !countPending && total > 0 && <span className="tk-cnt">{model.done.length} of {total} done</span>}
        </div>
        {plan && <span className="tk-hintx">{weekRangeLabel(plan.spec.week_start)}</span>}
        {/* Not while the task read is out: the word would claim the week has no plan. */}
        {!loading && !planRowAbove && planCtl.buttonEl}
      </div>

      {open && (
        <>
          {err && <p className="tk-plan-err" role="alert" style={{ margin: '0 2px 6px' }}>{err}</p>}
          {!planRowAbove && planCtl.noteEl}
          {total === 0 && !loading && (
            // One quiet line, no box: the section's drop outline is the drop cue.
            <div data-testid="plan-empty" style={{ fontSize: 12, color: 'var(--sk-t3)', padding: '0 2px 2px' }}>{emptyLine}</div>
          )}
          {model.today.length + model.picks.length > 0 && (
            <div className="tk-stack">
              {model.today.map((t) => card(t, 'today'))}
              {model.picks.map((t) => card(t, 'pick'))}
            </div>
          )}
          {model.done.length > 0 && (
            <div className="tk-plan-done" data-testid="plan-done">
              <div className="tk-plan-donehd">Done</div>
              <div className="tk-stack">{model.done.map((t) => card(t, 'done'))}</div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
