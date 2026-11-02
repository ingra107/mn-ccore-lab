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
// Re-plan (2026-11-01, PB Scratch/plans/2026-11-01-replan-RECONCILED.md): asks
// PB for a new offer covering today through Sunday (a Sunday press plans next
// week). The new offer lands in Needs you; its state shows on the button
// (ReplanControl.tsx, shared with Planned today). Earlier plans' started or finished
// picks stay here, read-only, tagged "earlier plan" (plan.earlier).

import { useState, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useQueryClient } from '@tanstack/react-query'
import { PlannedTaskRow } from './PlannedTaskRow'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { CollapseChevron } from './SectionCollapseToggle'
import { collapseToggleProps } from './collapseToggleProps'
import type { TodayStateApi } from '../../hooks/useTodayState'
import type { TaskRow } from '../../lib/api'
import { isTaskDone } from '../../lib/taskGrouping'
import { pickTag, postWeekPlanAnswer, startFlipAnswer, type AcceptedWeekPlan } from '../../lib/weekPlan'
import { useReplanControl } from './ReplanControl'
import { pickDirection, weekPlanEnd, PACKET_DAILY_CAP } from '../../../shared/weekPlan'

/** What each packet tag means, said where it is shown (Nick, 2026-11-02: "it now says ready which i don't know what that means"). */
const TAG_HELP: Record<string, string> = {
  Ready: 'A first step is prepared: open the task to see it',
  Changed: 'The task changed since its first step was prepared: open the task to check it',
  'Check it': 'A first step is prepared but could not be verified: open the task to check it',
  Preparing: 'Started: the first step is being prepared. It shows here when ready',
  Saved: 'Saved, not started: press Start to have the first step prepared',
}
const OPENS_DRAWER = new Set(['Ready', 'Changed', 'Check it'])

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

  const replan = useReplanControl(allTasks)

  const byId = new Map(allTasks.map((t) => [t.id, t]))
  const pickIds = new Set([...plan.picks.map((p) => p.task_id), ...plan.earlier.map((e) => e.pick.task_id)])
  const extra = stripTasks.filter((t) => !pickIds.has(t.id))

  // A pick that is not planned today is a plain row; its title and its packet
  // tag open the same task drawer a Today row opens (the packet lives there).
  const canOpen = (task: TaskRow | undefined): task is TaskRow => !!task && !isTaskDone(task)
  const titleEl = (task: TaskRow | undefined, label: string) => canOpen(task) ? (
    <button type="button" className="tk-plan-link" data-testid="pick-open" aria-expanded={expandedId === task.id} onClick={() => onExpand(task.id)}>{label}</button>
  ) : <>{label}</>
  const drawerEl = (task: TaskRow | undefined) => canOpen(task) && expandedId === task.id ? (
    <TaskDetailDrawer task={task} project={task.project_id ? projectsByPid.get(task.project_id) ?? null : null} state={state} />
  ) : null
  const packetTag = (tag: { label: string; cls: string }, openId: string | null) => {
    const help = TAG_HELP[tag.label]
    if (openId && OPENS_DRAWER.has(tag.label)) {
      return <button type="button" className={`tk-tag tk-plan-link ${tag.cls}`} data-testid="pick-packet-tag" title={help} aria-label={`${tag.label}. ${help}`} onClick={(e) => { e.stopPropagation(); onExpand(openId) }}>{tag.label}</button>
    }
    return <span className={`tk-tag ${tag.cls}`} title={help} aria-label={help ? `${tag.label}. ${help}` : undefined}>{tag.label}</span>
  }

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
          <span className="tk-cnt">{plan.picks.length + plan.earlier.length}</span>
        </div>
        <span className="tk-hintx">{weekLabel(plan.spec.week_start)}</span>
        {replan.buttonEl}
      </div>

      {open && (
        <>
          {err && <p className="tk-plan-err" role="alert" style={{ margin: '0 2px 6px' }}>{err}</p>}
          {replan.noteEl}
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
                  title={`Prepare this first step now (counts toward today's ${PACKET_DAILY_CAP})`}
                  onClick={(e) => { e.stopPropagation(); void start(p.task_id) }}
                >
                  {starting === p.task_id ? 'Starting...' : 'Start'}
                </button>
              )
              const tagEl = tag && packetTag(tag, task && !isTaskDone(task) ? p.task_id : null)
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
                    {titleEl(task, task?.short_title || task?.title || cand?.title || p.task_id)}
                    {tagEl}
                  </span>
                  <span className="tk-plan-why">{direction}</span>
                  {startBtn && <span>{startBtn}</span>}
                  {drawerEl(task)}
                </div>
              )
            })}
            {plan.earlier.map(({ pick, spec }) => {
              // Read-only: started or done on an earlier plan of this week.
              // No Start button (nothing left to start) and its direction
              // reads from its own plan's spec.
              const task = byId.get(pick.task_id)
              const cand = spec.candidates.find((c) => c.task_id === pick.task_id)
              const tag = pickTag(task, pick.start)
              const tags = <>{tag && packetTag(tag, task && !isTaskDone(task) ? pick.task_id : null)}<span className="tk-tag tk-n" data-testid="earlier-tag">earlier plan</span></>
              if (task && state.planned[pick.task_id]) {
                // Planned today too: keep the finish and unplan controls.
                return (
                  <div key={`earlier:${pick.task_id}`} className="tk-week-row tk-week-planned tk-week-earlier" data-testid="this-week-earlier">
                    <PlannedTaskRow
                      task={task}
                      project={task.project_id ? projectsByPid.get(task.project_id) ?? null : null}
                      state={state}
                      onExpand={onExpand}
                      expandedId={expandedId}
                      projectsByPid={projectsByPid}
                      badges={<><span className="tk-tag" data-testid="pick-today">Today</span>{tags}</>}
                      note={pickDirection(pick, spec)}
                    />
                  </div>
                )
              }
              return (
                <div key={`earlier:${pick.task_id}`} className="tk-week-row tk-week-earlier" data-testid="this-week-earlier">
                  <span className="tk-plan-t">
                    {titleEl(task, task?.short_title || task?.title || cand?.title || pick.task_id)}
                    {tags}
                  </span>
                  <span className="tk-plan-why">{pickDirection(pick, spec)}</span>
                  {drawerEl(task)}
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
