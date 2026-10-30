// taskSteps.ts -- how Today reads steps (schema v152, 2026-10-30).
//
// A parent is any task with a live step (tasks.parent_id). Nothing about a
// parent is stored: the API counts step_total / step_done on every UI read.
// Steps themselves are ordinary task rows in the same list, so Today picks the
// "next" step from the rows it already holds.
//
// Nick's pick (bracket 2026-10-30, "B: next step only"): a parent is ONE card
// with the next open step under its title; its steps are not rows of their own
// while the parent is on the page.

import type { TaskRow } from './api'

const isOpen = (t: TaskRow) => t.completed !== 1 && t.status !== 'done' && t.status !== 'deleted'

/** Next-step order: earliest due date first (undated last), then oldest. */
export function compareSteps(a: TaskRow, b: TaskRow): number {
  const ad = a.due_date?.slice(0, 10) ?? ''
  const bd = b.due_date?.slice(0, 10) ?? ''
  if (ad !== bd) {
    if (!ad) return 1
    if (!bd) return -1
    return ad < bd ? -1 : 1
  }
  const ac = a.created_at ?? ''
  const bc = b.created_at ?? ''
  return ac < bc ? -1 : ac > bc ? 1 : 0
}

/** Open steps by parent id, each list in next-step order. */
export function openStepsByParent(tasks: TaskRow[]): Map<string, TaskRow[]> {
  const m = new Map<string, TaskRow[]>()
  for (const t of tasks) {
    if (!t.parent_id || !isOpen(t)) continue
    const list = m.get(t.parent_id)
    if (list) list.push(t)
    else m.set(t.parent_id, [t])
  }
  for (const list of m.values()) list.sort(compareSteps)
  return m
}

/** A parent: the API says it has at least one live step. */
export const isParent = (t: TaskRow): boolean => (t.step_total ?? 0) > 0

/**
 * Drop each step whose parent is in `list`, so it shows once, on the parent's
 * card. A step whose parent is not in the list (filtered out, another page,
 * another owner's) stays, so it never vanishes.
 */
export function hideStepsOfPresentParents(list: TaskRow[]): TaskRow[] {
  const ids = new Set(list.map((t) => t.id))
  return list.filter((t) => !t.parent_id || !ids.has(t.parent_id))
}

/**
 * Optimistic parent count: completing (or reopening) a step moves its parent's
 * step_done by one now, so "1 of 4" and the all-done prompt do not wait for the
 * refetch. Returns the same array when the task is not a step.
 */
export function bumpParentStepDone(tasks: TaskRow[], stepId: string, nowDone: boolean): TaskRow[] {
  const step = tasks.find((t) => t.id === stepId)
  if (!step?.parent_id) return tasks
  const was = step.completed === 1 || step.status === 'done'
  if (was === nowDone) return tasks
  const delta = nowDone ? 1 : -1
  return tasks.map((t) => t.id === step.parent_id
    ? { ...t, step_done: Math.max(0, Math.min(t.step_total ?? 0, (t.step_done ?? 0) + delta)) }
    : t)
}
