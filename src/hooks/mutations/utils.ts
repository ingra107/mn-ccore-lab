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

export type QuerySnapshot<T> = {
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
