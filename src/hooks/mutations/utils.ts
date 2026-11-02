import type { QueryClient } from '@tanstack/react-query'

// ── Task status constants ──────────────────────────────────
export const TASK_STATUS = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  BLOCKED: 'blocked',
} as const

// ── Snapshot + optimistic update helper ────────────────────
// Eliminates ~10 lines of boilerplate per mutation

type QuerySnapshot<T> = {
  key: readonly unknown[]
  data: T | undefined
}

/**
 * Cancel in-flight queries, snapshot current data, apply an updater function,
 * and return the snapshots for rollback on error.
 */
export function optimisticListUpdate<T>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  updater: (items: T[]) => T[],
): { snapshots: QuerySnapshot<T[]>[] } {
  const queries = queryClient.getQueriesData<T[]>({ queryKey })
  const snapshots: QuerySnapshot<T[]>[] = []

  for (const [key, data] of queries) {
    snapshots.push({ key, data })
    if (data) {
      queryClient.setQueryData(key, updater(data))
    }
  }

  return { snapshots }
}

/** One field of one cached row that an optimistic update changed. */
export interface FieldChange { key: readonly unknown[]; id: string; field: string; before: unknown; after: unknown }
export interface RowUpdateContext<T> { changes: FieldChange[]; whole: QuerySnapshot<T[]>[] }

/**
 * optimisticListUpdate for an updater that only edits rows in place, recording
 * WHICH fields of which rows it changed, so a failure can put back exactly
 * those (rollbackRowChanges). A whole-list snapshot restored on a late
 * failure also reverted every later save on the same row (refuter 3, S1:
 * a title failure undid a description save that had succeeded). A cache the
 * updater reshapes (rows added, removed or reordered) keeps the old
 * whole-list snapshot.
 */
export function optimisticRowUpdate<T extends { id: string }>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  updater: (items: T[]) => T[],
): RowUpdateContext<T> {
  const changes: FieldChange[] = []
  const whole: QuerySnapshot<T[]>[] = []
  const ids = (rows: T[]) => rows.map((r) => r.id).join('\u0000')
  for (const [key, data] of queryClient.getQueriesData<T[]>({ queryKey })) {
    if (!data) continue
    const next = updater(data)
    queryClient.setQueryData(key, next)
    if (ids(next) !== ids(data)) { whole.push({ key, data }); continue }
    next.forEach((row, i) => {
      const old = data[i] as unknown as Record<string, unknown>
      const now = row as unknown as Record<string, unknown>
      if (now === old) return
      for (const field of new Set([...Object.keys(old), ...Object.keys(now)])) {
        if (old[field] !== now[field]) changes.push({ key, id: row.id, field, before: old[field], after: now[field] })
      }
    })
  }
  return { changes, whole }
}

/**
 * Undo an optimisticRowUpdate: each recorded field goes back to its value
 * from before, but only where the cache still holds the value this update
 * wrote. A field a later save (or a refetch) has moved on is left alone, as is
 * every field this update never touched.
 *
 * Known limit, accepted (refuter 3, S2): the test is by value, so an A-B-A on
 * one field (X held, then Y ok, then X ok, then the first X fails) finds X
 * still there and puts back the original although the server holds X. It is
 * rare and display-only; the refetch every task mutation runs on settle
 * corrects it. Telling the writes apart would need write identity per field.
 * The same value test narrows one more case (refuter 4, accepted): two sibling
 * steps completed at once both bump the parent's step_done; when one fails,
 * the count it wrote has been moved on by the other, so it is left alone and
 * step_done stays off by one until that refetch. The whole-list restore this
 * replaced was wrong there too.
 */
export function rollbackRowChanges<T extends { id: string }>(
  queryClient: QueryClient,
  context: RowUpdateContext<T> | undefined,
) {
  if (!context) return
  for (const { key, data } of context.whole) queryClient.setQueryData(key, data)
  const byKey = new Map<string, { key: readonly unknown[]; changes: FieldChange[] }>()
  for (const c of context.changes) {
    const k = JSON.stringify(c.key)
    if (!byKey.has(k)) byKey.set(k, { key: c.key, changes: [] })
    byKey.get(k)!.changes.push(c)
  }
  for (const { key, changes } of byKey.values()) {
    queryClient.setQueryData<T[]>(key, (rows) => rows?.map((row) => {
      let out: Record<string, unknown> | null = null
      for (const c of changes) {
        if (c.id !== row.id) continue
        const cur = (out ?? row) as unknown as Record<string, unknown>
        if (cur[c.field] !== c.after) continue
        out = out ?? { ...(row as unknown as Record<string, unknown>) }
        out[c.field] = c.before
      }
      return out ? (out as unknown as T) : row
    }))
  }
}

/**
 * Restore all snapshots on error.
 */
export function rollbackSnapshots<T>(
  queryClient: QueryClient,
  snapshots: QuerySnapshot<T[]>[] | undefined,
) {
  if (!snapshots) return
  for (const { key, data } of snapshots) {
    queryClient.setQueryData(key, data)
  }
}
