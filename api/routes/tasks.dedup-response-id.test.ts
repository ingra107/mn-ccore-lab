// #523 (2026-07-07): when applyMutation's I18 (title, project_id) dedup adopts
// an EXISTING row instead of inserting, the caller must reflect that EXISTING
// row's id in its response — not the locally-generated id that was never
// written. Before this fix, handleCreateTask silently returned {data: null}
// on a dedup hit (its own `SELECT ... WHERE id = ?` found nothing), and
// handleMobileTasksToHub mapped the PWA's temp id to a phantom Hub id.
//
// Mocks applyMutation directly (same pattern as
// api/lib/field-authority.contract.test.ts's captureCreatePayload) so this
// asserts the response-shape fix in isolation from the dedup SQL itself —
// SQL-level coverage (the pre-check key, normalization) lives in
// tasks.dedup.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthUser, Env } from '../helpers'
import { classifyTaskDedupSelect } from '../lib/task-dedup-sql'

const { applyMutationMock } = vi.hoisted(() => ({ applyMutationMock: vi.fn() }))
vi.mock('./mutations', () => ({ applyMutation: applyMutationMock }))

// Echoes back a row shaped like the queried id — enough to prove the caller
// queried WITH the id it claims to have resolved to, without needing to know
// handleCreateTask/handleMobileTasksToHub's internally-generated ULID ahead of time.
function echoRowDB() {
  function makeStmt(sql: string, binds: unknown[]): any {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...binds, ...more]),
      first: async () => {
        const upper = sql.toUpperCase()
        if (upper.includes('FROM TASKS') && upper.includes('WHERE T.ID')) {
          const id = binds[binds.length - 1] as string
          return { id, title: 'Stub Row', assignee: 'claude-ai', status: 'todo' }
        }
        // Mobile pre-check dedup SELECT — no match, forces the fallthrough
        // to applyMutation (which is mocked below). Keyed by shape, not by the
        // LOWER(TRIM(TITLE)) substring, which the central rule now also carries
        // (#530b); the classifier THROWS on an unrecognised task dedup SELECT.
        if (classifyTaskDedupSelect(sql) === 'mobile') return null
        return null
      },
      run: async () => ({ success: true, meta: { changes: 1 } }),
      all: async () => ({ results: [], success: true, meta: {} }),
    }
  }
  return { prepare: (sql: string) => makeStmt(sql, []), batch: async () => [] }
}

const user = { email: 'ingra107@umn.edu', name: 'Nick' } as AuthUser

beforeEach(() => {
  applyMutationMock.mockReset()
})

describe('handleCreateTask — response reflects the dedup-adopted row (#523)', () => {
  it('a dedup hit returns the EXISTING row, not {data: null}', async () => {
    // Simulate applyInsert's dedupAccepted: canonical_payload.id is the
    // WINNER's id, which differs from whatever id handleCreateTask generated
    // internally for this (never-inserted) attempt.
    applyMutationMock.mockResolvedValue({
      status: 'accepted',
      canonical_payload: { id: 'task_EXISTING_WINNER', title: 'Existing Task', assignee: 'claude-ai', status: 'todo' },
    })

    const { handleCreateTask } = await import('./tasks')
    const env = { DB: echoRowDB() } as unknown as Env
    const req = new Request('https://example.com/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignee: 'claude-ai', description: 'Follow up' }),
    })

    const res = await handleCreateTask(req, user, env)
    const body = await res.json() as { data: { id: string } | null }

    expect(res.status).toBe(201)
    expect(body.data).not.toBeNull()
    expect(body.data!.id).toBe('task_EXISTING_WINNER')
  })

  it('a normal (non-dedup) insert still returns the freshly-created row', async () => {
    // canonical_payload.id echoes the record_id applyMutation was called
    // with — the "no dedup, insert succeeded" shape.
    applyMutationMock.mockImplementation(async (_env: unknown, args: { record_id: string }) => ({
      status: 'accepted',
      canonical_payload: { id: args.record_id, title: 'New Task', assignee: 'claude-ai', status: 'todo' },
    }))

    const { handleCreateTask } = await import('./tasks')
    const env = { DB: echoRowDB() } as unknown as Env
    const req = new Request('https://example.com/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignee: 'claude-ai', description: 'Brand new task' }),
    })

    const res = await handleCreateTask(req, user, env)
    const body = await res.json() as { data: { id: string } }
    const [, mutArgs] = applyMutationMock.mock.calls[0]

    expect(res.status).toBe(201)
    expect(body.data.id).toBe(mutArgs.record_id)
  })
})

describe('handleMobileTasksToHub — id_map/counters reflect the dedup-adopted row (#523)', () => {
  it('a dedup hit (fallthrough past the pre-check) maps to the EXISTING id, counts as deduped', async () => {
    applyMutationMock.mockResolvedValue({
      status: 'accepted',
      canonical_payload: { id: 'task_EXISTING_WINNER' },
    })

    const { handleMobileTasksToHub } = await import('./tasks')
    const env = { DB: echoRowDB() } as unknown as Env
    const req = new Request('https://example.com/api/sync/mobile-tasks-to-hub', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: [{ id: 'mobile_abc', title: 'Follow up', assignee: 'nick-ingraham' }] }),
    })

    const res = await handleMobileTasksToHub(req, user, env)
    const body = await res.json() as { data: { id_map: Record<string, string>; created: number; deduped: number } }

    expect(body.data.deduped).toBe(1)
    expect(body.data.created).toBe(0)
    expect(body.data.id_map['mobile_abc']).toBe('task_EXISTING_WINNER')
  })

  it('a normal (non-dedup) insert still maps to the freshly-created id, counts as created', async () => {
    applyMutationMock.mockImplementation(async (_env: unknown, args: { record_id: string }) => ({
      status: 'accepted',
      canonical_payload: { id: args.record_id },
    }))

    const { handleMobileTasksToHub } = await import('./tasks')
    const env = { DB: echoRowDB() } as unknown as Env
    const req = new Request('https://example.com/api/sync/mobile-tasks-to-hub', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: [{ id: 'mobile_xyz', title: 'Brand new', assignee: 'nick-ingraham' }] }),
    })

    const res = await handleMobileTasksToHub(req, user, env)
    const body = await res.json() as { data: { id_map: Record<string, string>; created: number; deduped: number } }
    const [, mutArgs] = applyMutationMock.mock.calls[0]

    expect(body.data.created).toBe(1)
    expect(body.data.deduped).toBe(0)
    expect(body.data.id_map['mobile_xyz']).toBe(mutArgs.record_id)
  })
})
