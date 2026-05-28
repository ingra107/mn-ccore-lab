/**
 * Optimistic mutation rollback tests (Fix 2).
 *
 * Tests the onMutate → onError snapshot/rollback pattern for:
 *   - useVoteIdea (useIdeaMutations.ts)
 *   - useUpdateDigestStatus (useOtherMutations.ts)
 *
 * These run in node mode (vitest.config.api.ts) using QueryClient directly,
 * without React hooks or DOM — tests the invariant that a server-reject
 * restores the pre-mutation cache state.
 */

import { QueryClient } from '@tanstack/react-query'
import { rollbackSnapshots } from '../../src/hooks/mutations/utils'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeIdea(id: string, votes: number) {
  return { id, votes, title: `Idea ${id}`, created_at: '2026-01-01T00:00:00Z' }
}

function makeDigestEntry(id: string, status: string) {
  return { id, status, title: `Paper ${id}` }
}

// Simulate the useVoteIdea onMutate → onError cycle directly
async function simulateVoteIdeaOptimistic(
  queryClient: QueryClient,
  targetId: string,
) {
  // --- onMutate (copied from useVoteIdea after Fix 2) ---
  await queryClient.cancelQueries({ queryKey: ['ideas'] })
  const queries = queryClient.getQueriesData<{ id: string; votes: number }[]>({ queryKey: ['ideas'] })
  const snapshots = queries.map(([key, data]) => ({ key, data }))
  for (const [key, data] of queries) {
    if (data) {
      queryClient.setQueryData(key, data.map((i) => i.id === targetId ? { ...i, votes: i.votes + 1 } : i))
    }
  }
  return { snapshots }
}

// Simulate the useUpdateDigestStatus onMutate → onError cycle directly
async function simulateDigestStatusOptimistic(
  queryClient: QueryClient,
  targetId: string,
  newStatus: string,
) {
  // --- onMutate (copied from useUpdateDigestStatus after Fix 2) ---
  await queryClient.cancelQueries({ queryKey: ['digest'] })
  const queries = queryClient.getQueriesData<unknown[]>({ queryKey: ['digest'] })
  const snapshots = queries.map(([key, data]) => ({ key, data }))
  queryClient.setQueriesData({ queryKey: ['digest'] }, (old: unknown) => {
    if (!Array.isArray(old)) return old
    return old.map((p: Record<string, unknown>) => p.id === targetId ? { ...p, status: newStatus } : p)
  })
  return { snapshots }
}

// ── useVoteIdea tests ─────────────────────────────────────────────────────────

describe('useVoteIdea — optimistic rollback on server error', () => {
  it('reverts vote increment when server rejects', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const ideas = [makeIdea('a', 3), makeIdea('b', 7)]
    queryClient.setQueryData(['ideas'], ideas)

    // Simulate onMutate: should optimistically bump votes for 'a'
    const context = await simulateVoteIdeaOptimistic(queryClient, 'a')

    const afterOptimistic = queryClient.getQueryData<typeof ideas>(['ideas'])!
    expect(afterOptimistic.find((i) => i.id === 'a')!.votes).toBe(4)
    expect(afterOptimistic.find((i) => i.id === 'b')!.votes).toBe(7)

    // Simulate onError: rollback must restore original state
    rollbackSnapshots(queryClient, context.snapshots)

    const afterRollback = queryClient.getQueryData<typeof ideas>(['ideas'])!
    expect(afterRollback.find((i) => i.id === 'a')!.votes).toBe(3)
    expect(afterRollback.find((i) => i.id === 'b')!.votes).toBe(7)
  })

  it('rolls back across multiple cache keys for ideas', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    // Two different query keys (e.g. paginated or filtered lists)
    queryClient.setQueryData(['ideas', 'all'], [makeIdea('x', 5), makeIdea('y', 2)])
    queryClient.setQueryData(['ideas', 'mine'], [makeIdea('x', 5)])

    const context = await simulateVoteIdeaOptimistic(queryClient, 'x')

    // Both caches optimistically updated
    const all = queryClient.getQueryData<ReturnType<typeof makeIdea>[]>(['ideas', 'all'])!
    const mine = queryClient.getQueryData<ReturnType<typeof makeIdea>[]>(['ideas', 'mine'])!
    expect(all.find((i) => i.id === 'x')!.votes).toBe(6)
    expect(mine.find((i) => i.id === 'x')!.votes).toBe(6)

    // Rollback restores both
    rollbackSnapshots(queryClient, context.snapshots)

    const allAfter = queryClient.getQueryData<ReturnType<typeof makeIdea>[]>(['ideas', 'all'])!
    const mineAfter = queryClient.getQueryData<ReturnType<typeof makeIdea>[]>(['ideas', 'mine'])!
    expect(allAfter.find((i) => i.id === 'x')!.votes).toBe(5)
    expect(mineAfter.find((i) => i.id === 'x')!.votes).toBe(5)
  })

  it('is a no-op rollback when cache was empty', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    // No data set — queries returns empty
    const context = await simulateVoteIdeaOptimistic(queryClient, 'z')
    // Should not throw
    rollbackSnapshots(queryClient, context.snapshots)
    expect(queryClient.getQueryData(['ideas'])).toBeUndefined()
  })
})

// ── useUpdateDigestStatus tests ───────────────────────────────────────────────

describe('useUpdateDigestStatus — optimistic rollback on server error', () => {
  it('reverts status change when server rejects', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const entries = [makeDigestEntry('p1', 'unread'), makeDigestEntry('p2', 'read')]
    queryClient.setQueryData(['digest'], entries)

    // Simulate onMutate: optimistically update p1 to 'read'
    const context = await simulateDigestStatusOptimistic(queryClient, 'p1', 'read')

    const afterOptimistic = queryClient.getQueryData<typeof entries>(['digest'])!
    expect(afterOptimistic.find((p) => p.id === 'p1')!.status).toBe('read')

    // Simulate onError: rollback restores original 'unread'
    rollbackSnapshots(queryClient, context.snapshots)

    const afterRollback = queryClient.getQueryData<typeof entries>(['digest'])!
    expect(afterRollback.find((p) => p.id === 'p1')!.status).toBe('unread')
    expect(afterRollback.find((p) => p.id === 'p2')!.status).toBe('read')
  })

  it('rolls back across multiple digest cache keys', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    queryClient.setQueryData(['digest', 'week'], [makeDigestEntry('q1', 'unread')])
    queryClient.setQueryData(['digest', 'all'], [makeDigestEntry('q1', 'unread'), makeDigestEntry('q2', 'skipped')])

    const context = await simulateDigestStatusOptimistic(queryClient, 'q1', 'read')

    // Both caches updated optimistically
    const week = queryClient.getQueryData<ReturnType<typeof makeDigestEntry>[]>(['digest', 'week'])!
    const all = queryClient.getQueryData<ReturnType<typeof makeDigestEntry>[]>(['digest', 'all'])!
    expect(week.find((p) => p.id === 'q1')!.status).toBe('read')
    expect(all.find((p) => p.id === 'q1')!.status).toBe('read')

    rollbackSnapshots(queryClient, context.snapshots)

    const weekAfter = queryClient.getQueryData<ReturnType<typeof makeDigestEntry>[]>(['digest', 'week'])!
    const allAfter = queryClient.getQueryData<ReturnType<typeof makeDigestEntry>[]>(['digest', 'all'])!
    expect(weekAfter.find((p) => p.id === 'q1')!.status).toBe('unread')
    expect(allAfter.find((p) => p.id === 'q1')!.status).toBe('unread')
  })

  it('preserves non-targeted entries on rollback', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const entries = [makeDigestEntry('r1', 'unread'), makeDigestEntry('r2', 'read'), makeDigestEntry('r3', 'skipped')]
    queryClient.setQueryData(['digest'], entries)

    const context = await simulateDigestStatusOptimistic(queryClient, 'r1', 'read')

    rollbackSnapshots(queryClient, context.snapshots)

    const after = queryClient.getQueryData<typeof entries>(['digest'])!
    expect(after.find((p) => p.id === 'r1')!.status).toBe('unread')
    expect(after.find((p) => p.id === 'r2')!.status).toBe('read')
    expect(after.find((p) => p.id === 'r3')!.status).toBe('skipped')
  })
})

// ── rollbackSnapshots utility tests ──────────────────────────────────────────

describe('rollbackSnapshots utility', () => {
  it('is a no-op when snapshots is undefined', () => {
    const queryClient = new QueryClient()
    // Should not throw
    rollbackSnapshots(queryClient, undefined)
  })

  it('restores previous array data to the cache key', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['test'], [1, 2, 3])

    // Snapshot original data, then mutate
    const snapshots = [{ key: ['test'] as readonly unknown[], data: [1, 2, 3] as unknown[] }]
    queryClient.setQueryData(['test'], [1, 2, 3, 4])

    expect(queryClient.getQueryData(['test'])).toEqual([1, 2, 3, 4])

    rollbackSnapshots(queryClient, snapshots)

    expect(queryClient.getQueryData(['test'])).toEqual([1, 2, 3])
  })
})
