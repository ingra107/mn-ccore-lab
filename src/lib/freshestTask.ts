// A task can sit in many cached lists, and a list no page is watching is not refetched
// when the task changes. Reading the first list that holds it could therefore show
// an old title, status or assignee beside a list showing the new one. Optimistic
// writes patch every list alike, so updated_at still tells the copies apart.

import type { QueryClient } from '@tanstack/react-query'
import type { TaskRow } from './api'
import { parseDbUtc } from './time'

const stamp = (t: TaskRow): number => {
  const ms = t.updated_at ? parseDbUtc(t.updated_at).getTime() : NaN
  return Number.isNaN(ms) ? -Infinity : ms
}

/** The newest cached copy of a task, or null. A tie keeps the first copy found. */
export function freshestCachedTask(qc: QueryClient, id: string): TaskRow | null {
  let best: TaskRow | null = null
  for (const [, data] of qc.getQueriesData<TaskRow[]>({ queryKey: ['tasks'] })) {
    const copy = Array.isArray(data) ? data.find((t) => t.id === id) : undefined
    if (copy && (!best || stamp(copy) > stamp(best))) best = copy
  }
  return best
}
