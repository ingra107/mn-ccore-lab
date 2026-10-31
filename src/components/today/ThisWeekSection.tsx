// ThisWeekSection -- the week plan on Today (Nick's pick: "This week replaces
// Planned today", PB Context/Decisions/2026-10-30-planning-and-first-step-
// mockup-picks.md). Shown in BOTH timeline and agenda modes, in Planned
// today's place, whenever an answered week plan covers today (from the
// Sunday evening before its week starts, lib/weekPlan.ts currentWeekPlan).
//
// What it lists:
//   - each pick, with the direction he chose and its packet state (Ready /
//     Changed / Check it from packet_state; Preparing when he started it and
//     no packet exists yet; Saved when he did not start it; Done).
//     A pick that is also planned for today renders as the PlannedTaskRow it
//     would have been on Planned today (check to finish, x to unplan), with
//     the tag and the direction on it, so planning it loses no control.
//     A pick not planned today is a plain row.
//   - a Saved pick carries a Start button: the one follow-up write a stored
//     plan takes (the stored answer with that pick flipped to start:true,
//     under the same daily cap as Start in the panel).
//   - then every task planned for today with no time (the old strip) that is
//     not a pick, as the same PlannedTaskRow it was, so nothing planned
//     disappears.
// The week plan never writes planned_for (contract): the Today marks come
// from the plan_* columns via useTodayState, nothing else.
//
// It keeps the `slot:strip` droppable PlannedTodaySection registered, so a
// drag onto it still plans a task for today.
//
// Re-plan: there is no on-demand trigger yet (the offer job runs Sunday 16:00
// on home), so the button is shown disabled and says so. Wire it to the
// trigger when PB exposes one.

import { useState, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import { PlannedTaskRow } from './PlannedTaskRow'
import { CollapseChevron } from './SectionCollapseToggle'
import { collapseToggleProps } from './collapseToggleProps'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'
import { isTaskDone } from '../../lib/taskGrouping'
import { pickTag, postWeekPlanAnswer, startFlipAnswer, type AcceptedWeekPlan } from '../../lib/weekPlan'
import { pickDirection, weekPlanEnd } from '../../../shared/weekPlan'

interface ThisWeekSectionProps {
  plan: AcceptedWeekPlan
  /** Every task row the page has, so a pick shows even when the due window
   *  hides it from the task pool. */
  allTasks: TaskRow[]
  stripTasks: TaskRow[]
  state: TodayStateApi
  projectsByPid: Map<string, { name: string; slug: string; category?: string | null; primary_folder?: string | null }>
}

function weekLabel(start: string): string {
  const fmt = (c: string) => {
    const [y, m, d] = c.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return `${fmt(start)} to ${fmt(weekPlanEnd(start))}`
}

export function ThisWeekSection({ plan, allTasks, stripTasks, state, projectsByPid }: ThisWeekSectionProps) {
  const qc = useQueryClient()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const onExpand = useCallback((id: string) => { setExpandedId((p) => (p === id ? null : id)) }, [])
  const [open, setOpen] = useState(true)
  const [starting, setStarting] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const { isOver, setNodeRef } = useDroppable({ id: 'slot:strip' })

  const byId = new Map(allTasks.map((t) => [t.id, t]))
  const pickIds = new Set(plan.picks.map((p) => p.task_id))
  const extra = stripTasks.filter((t) => !pickIds.has(t.id))

  const start = async (taskId: string) => {
    const answer = startFlipAnswer(plan.task, taskId)
    if (!answer) return
    setStarting(taskId)
    setErr(null)
    const r = await postWeekPlanAnswer(plan.task.id, answer)
    setStarting(null)
    qc.invalidateQueries({ queryKey: ['packets', 'daily-count'] })
    if (r.ok) { qc.invalidateQueries({ queryKey: ['tasks'] }); return }
    if (r.code === 'daily_cap' && 'used' in r) setErr(`Today's ${r.cap} prepared first steps are already used or queued. Try tomorrow.`)
    else setErr(`Not started: ${r.error}`)
  }

  return (
    <section
      ref={setNodeRef}
      data-testid="this-week"
      className={`tk-panel tk-blk tk-planned${isOver ? ' tk-over' : ''}`}
    >
      <div {...collapseToggleProps(open, () => setOpen((o) => !o), 'This week')} className="tk-ph tk-clk">
        <div className="tk-ctog">
          <CollapseChevron open={open} />
          <h3>This week</h3>
          <span className="tk-cnt">{plan.picks.length}</span>
        </div>
        <span className="tk-hintx">{weekLabel(plan.spec.week_start)}</span>
        <button
          type="button"
          className="tk-btn tk-sm tk-off"
          disabled
          title="Re-plan is not wired yet. A new plan is offered every Sunday evening."
          onClick={(e) => e.stopPropagation()}
          style={{ marginLeft: 'auto' }}
        >
          Re-plan
        </button>
      </div>

      {open && (
        <>
          {err && <p className="tk-plan-err" role="alert" style={{ margin: '0 2px 6px' }}>{err}</p>}
          <div className="tk-week-list">
            {plan.picks.map((p) => {
              const task = byId.get(p.task_id)
              const cand = plan.spec.candidates.find((c) => c.task_id === p.task_id)
              const tag = pickTag(task, p.start)
              const direction = pickDirection(p, plan.spec)
              const startBtn = !p.start && !(task && isTaskDone(task)) && (
                <button
                  type="button"
                  className="tk-btn tk-sm"
                  data-testid="pick-start"
                  disabled={starting !== null}
                  title="Prepare this first step now (counts toward today's 3)"
                  onClick={(e) => { e.stopPropagation(); void start(p.task_id) }}
                >
                  {starting === p.task_id ? 'Starting...' : 'Start'}
                </button>
              )
              const tagEl = tag && <span className={`tk-tag ${tag.cls}`}>{tag.label}</span>
              if (task && state.planned[p.task_id]) {
                return (
                  <div key={p.task_id} className="tk-week-row tk-week-planned" data-testid="this-week-pick">
                    <PlannedTaskRow
                      task={task}
                      project={task.project_id ? projectsByPid.get(task.project_id) ?? null : null}
                      state={state}
                      onExpand={onExpand}
                      expandedId={expandedId}
                      projectsByPid={projectsByPid}
                      badges={<><span className="tk-tag" data-testid="pick-today">Today</span>{tagEl}</>}
                      note={<>{direction}{startBtn && <> {startBtn}</>}</>}
                    />
                  </div>
                )
              }
              return (
                <div key={p.task_id} className="tk-week-row" data-testid="this-week-pick">
                  <span className="tk-plan-t">
                    {task?.short_title || task?.title || cand?.title || p.task_id}
                    {tagEl}
                  </span>
                  <span className="tk-plan-why">{direction}</span>
                  {startBtn && <span>{startBtn}</span>}
                </div>
              )
            })}
          </div>
          {extra.length > 0 && (
            <div className="tk-stack" data-testid="this-week-planned">
              <div className="tk-plan-why" style={{ padding: '6px 2px 2px' }}>Also planned today</div>
              {extra.map((t) => (
                <PlannedTaskRow
                  key={t.id}
                  task={t}
                  project={t.project_id ? projectsByPid.get(t.project_id) ?? null : null}
                  state={state}
                  onExpand={onExpand}
                  expandedId={expandedId}
                  projectsByPid={projectsByPid}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
