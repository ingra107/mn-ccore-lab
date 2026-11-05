// Display dedup for task lists: one copy, for useTasks and the My Items card.
//
// Critical Rule 8 ("Dedup action items") came from meetings copying an open item
// forward as a new row titled "[Carried forward] ...". That consolidation stays,
// and it is the ONLY one: the prefix is the provenance. Two rows that merely share
// a title and an assignee are two tasks, on two projects or in two weeks.
//
// Why not by id alone: a list can hold a carried copy and its origin as two ids.

const CARRIED_FORWARD = /^\[Carried forward(?:\s+\d+d)?\]\s*/i

interface DedupableTask {
  id: string
  title?: string | null
  description?: string | null
  assignee?: string | null
  project_id?: string | null
  kind?: string | null
  recurrence_parent_id?: string | null
  created_at?: string | null
}

const textOf = (t: DedupableTask) => t.title || t.description || ''
const isCarried = (t: DedupableTask) => CARRIED_FORWARD.test(textOf(t))
const newer = (a: DedupableTask, b: DedupableTask) => (a.created_at ?? '') > (b.created_at ?? '')

/** A carried copy and its origin agree on all of this; rows that differ are different work. */
function lineageKey(t: DedupableTask): string {
  const text = textOf(t).replace(CARRIED_FORWARD, '').trim().toLowerCase()
  return JSON.stringify([text, t.assignee ?? '', t.project_id ?? '', t.kind ?? 'task', t.recurrence_parent_id ?? ''])
}

/**
 * Keep every task, except that a carried-forward lineage shows once: its newest
 * carried copy stands for the older copies and for the origin it was copied from
 * (the newest uncarried row created before it). Order is preserved.
 */
export function dedupTasks<T extends DedupableTask>(tasks: readonly T[]): T[] {
  const byId = new Map<string, T>()
  for (const t of tasks) if (!byId.has(t.id)) byId.set(t.id, t)
  const rows = [...byId.values()]

  const newestCarried = new Map<string, T>()
  for (const t of rows) {
    if (!isCarried(t)) continue
    const key = lineageKey(t)
    const held = newestCarried.get(key)
    if (!held || newer(t, held)) newestCarried.set(key, t)
  }
  if (newestCarried.size === 0) return rows

  const dropped = new Set<string>()
  const origin = new Map<string, T>()
  for (const t of rows) {
    const carried = newestCarried.get(lineageKey(t))
    if (!carried || t.id === carried.id) continue
    if (isCarried(t)) {
      dropped.add(t.id)
    } else if (newer(carried, t)) {
      const key = lineageKey(t)
      const held = origin.get(key)
      if (!held || newer(t, held)) origin.set(key, t)
    }
  }
  for (const t of origin.values()) dropped.add(t.id)
  return rows.filter((t) => !dropped.has(t.id))
}
