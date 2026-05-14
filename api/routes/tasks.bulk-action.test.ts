/**
 * tasks.bulkAction.test.ts — B-CRIT-04 regression guard
 *
 * Verifies that handleBatchUpdateTasks routes every action through
 * applyMutation so seq, last_mutation_id, and processed_mutations
 * are advanced for each affected task. Before this fix (2026-05-09),
 * bulkAction used raw env.DB.prepare(UPDATE).run() — the mutation
 * cursor never moved, so PB pulled but tombstones/completions never
 * propagated.
 *
 * Test strategy: vi.mock applyMutation so we never need a live D1
 * binding, then assert it was called once per id with the right shape.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthUser, Env } from '../helpers'

// ── Mock applyMutation before importing tasks.ts ──────────────────────────────
// vi.mock factories are hoisted before variable declarations, so we CANNOT
// reference a `const mockApplyMutation = vi.fn()` variable here — it would be
// in the temporal dead zone. Instead, declare the mock inline and capture it
// via vi.mocked() after the dynamic import.
vi.mock('./mutations', () => ({
  applyMutation: vi.fn(),
  handleMutations: vi.fn(),
  applyInsert: vi.fn(),
  applyUpdate: vi.fn(),
  applyDelete: vi.fn(),
}))

// ── Import handler and captured mock ref after mock is in place ───────────────
import { handleBatchUpdateTasks } from './tasks'
import { applyMutation } from './mutations'

const mockApplyMutation = vi.mocked(applyMutation)

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEnv(overrides: Partial<Record<string, unknown>> = {}): Env {
  return {
    DB: {
      prepare: (sql: string) => ({
        bind: (..._args: unknown[]) => ({
          run: () => Promise.resolve({ meta: {} }),
          first: () => Promise.resolve({ slug: 'nick-ingraham' }), // team_members stub
          all: () => Promise.resolve({ results: [] }),
        }),
        run: () => Promise.resolve({ meta: {} }),
        first: () => Promise.resolve(null),
        all: () => Promise.resolve({ results: [] }),
      }),
    } as unknown as Env['DB'],
    ...overrides,
  } as unknown as Env
}

function makeUser(email = 'test@example.com'): AuthUser {
  return { email, name: 'Test User', isNick: false } as AuthUser
}

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('https://example.com/api/tasks/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function acceptedResult(id = 'mut_TEST') {
  return { mutation_id: id, status: 'accepted' as const, result_seq: 1 }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockApplyMutation.mockResolvedValue(acceptedResult())
})

describe('handleBatchUpdateTasks — applyMutation routing (B-CRIT-04)', () => {
  const ids = ['task_A', 'task_B', 'task_C', 'task_D', 'task_E']

  it('complete: calls applyMutation once per id with status=done patch', async () => {
    const req = makeRequest({ action: 'complete', ids })
    const res = await handleBatchUpdateTasks(req, makeUser(), makeEnv())

    expect(res.status).toBe(200)
    expect(mockApplyMutation).toHaveBeenCalledTimes(ids.length)

    for (const id of ids) {
      expect(mockApplyMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          table: 'tasks',
          record_id: id,
          op: 'update',
          patch: expect.objectContaining({ status: 'done', completed: 1 }),
          route: 'handleBatchUpdateTasks/complete',
        }),
      )
    }
  })

  it('uncomplete: calls applyMutation once per id with status=todo patch', async () => {
    const req = makeRequest({ action: 'uncomplete', ids })
    const res = await handleBatchUpdateTasks(req, makeUser(), makeEnv())

    expect(res.status).toBe(200)
    expect(mockApplyMutation).toHaveBeenCalledTimes(ids.length)

    for (const id of ids) {
      expect(mockApplyMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          table: 'tasks',
          record_id: id,
          op: 'update',
          patch: expect.objectContaining({ status: 'todo', completed: 0 }),
          route: 'handleBatchUpdateTasks/uncomplete',
        }),
      )
    }
  })

  it('status=in_progress: calls applyMutation with status patch (non-done branch)', async () => {
    const req = makeRequest({ action: 'status', ids, value: 'in_progress' })
    const res = await handleBatchUpdateTasks(req, makeUser(), makeEnv())

    expect(res.status).toBe(200)
    expect(mockApplyMutation).toHaveBeenCalledTimes(ids.length)
    expect(mockApplyMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        op: 'update',
        patch: expect.objectContaining({ status: 'in_progress', completed: 0 }),
        route: 'handleBatchUpdateTasks/status',
      }),
    )
  })

  it('status=done: calls applyMutation with completed=1 co-applied', async () => {
    const req = makeRequest({ action: 'status', ids: ['task_A'], value: 'done' })
    const res = await handleBatchUpdateTasks(req, makeUser('nick@example.com'), makeEnv())

    expect(res.status).toBe(200)
    expect(mockApplyMutation).toHaveBeenCalledTimes(1)
    expect(mockApplyMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        patch: expect.objectContaining({
          status: 'done',
          completed: 1,
          completed_by: 'nick@example.com',
        }),
      }),
    )
  })

  it('status: rejects invalid value before calling applyMutation', async () => {
    const req = makeRequest({ action: 'status', ids, value: 'invalid_status' })
    const res = await handleBatchUpdateTasks(req, makeUser(), makeEnv())

    expect(res.status).toBe(400)
    expect(mockApplyMutation).not.toHaveBeenCalled()
  })

  it('assign: calls applyMutation once per id with assignee patch', async () => {
    // team_members stub returns a row → validation passes
    const req = makeRequest({ action: 'assign', ids, value: 'nick-ingraham' })
    const res = await handleBatchUpdateTasks(req, makeUser(), makeEnv())

    expect(res.status).toBe(200)
    expect(mockApplyMutation).toHaveBeenCalledTimes(ids.length)
    expect(mockApplyMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        op: 'update',
        patch: { assignee: 'nick-ingraham' },
        route: 'handleBatchUpdateTasks/assign',
      }),
    )
  })

  it('assign: rejects unknown assignee before calling applyMutation', async () => {
    const envWithNoMember = makeEnv({
      DB: {
        prepare: () => ({
          bind: () => ({ first: () => Promise.resolve(null) }),
        }),
      },
    })
    const req = makeRequest({ action: 'assign', ids, value: 'ghost-user' })
    const res = await handleBatchUpdateTasks(req, makeUser(), envWithNoMember)

    expect(res.status).toBe(400)
    expect(mockApplyMutation).not.toHaveBeenCalled()
  })

  it('priority: calls applyMutation once per id with priority patch', async () => {
    const req = makeRequest({ action: 'priority', ids, value: 'urgent' })
    const res = await handleBatchUpdateTasks(req, makeUser(), makeEnv())

    expect(res.status).toBe(200)
    expect(mockApplyMutation).toHaveBeenCalledTimes(ids.length)
    expect(mockApplyMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        op: 'update',
        patch: { priority: 'urgent' },
        route: 'handleBatchUpdateTasks/priority',
      }),
    )
  })

  it('priority: rejects invalid value before calling applyMutation', async () => {
    const req = makeRequest({ action: 'priority', ids, value: 'critical' })
    const res = await handleBatchUpdateTasks(req, makeUser(), makeEnv())

    expect(res.status).toBe(400)
    expect(mockApplyMutation).not.toHaveBeenCalled()
  })

  it('delete: calls applyMutation with op=delete once per id', async () => {
    const req = makeRequest({ action: 'delete', ids })
    const res = await handleBatchUpdateTasks(req, makeUser(), makeEnv())

    expect(res.status).toBe(200)
    expect(mockApplyMutation).toHaveBeenCalledTimes(ids.length)

    for (const id of ids) {
      expect(mockApplyMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          table: 'tasks',
          record_id: id,
          op: 'delete',
          route: 'handleBatchUpdateTasks/delete',
        }),
      )
    }
  })

  it('returns count matching ids.length in response body', async () => {
    const req = makeRequest({ action: 'complete', ids })
    const res = await handleBatchUpdateTasks(req, makeUser(), makeEnv())
    const body = await res.json() as { data: { count: number } }

    expect(body.data.count).toBe(ids.length)
  })

  it('rejects missing ids', async () => {
    const req = makeRequest({ action: 'complete', ids: [] })
    const res = await handleBatchUpdateTasks(req, makeUser(), makeEnv())

    expect(res.status).toBe(400)
    expect(mockApplyMutation).not.toHaveBeenCalled()
  })
})
