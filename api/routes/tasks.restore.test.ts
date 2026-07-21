/**
 * tasks.restore.test.ts — handleRestoreTask contract guard (2026-07-21)
 *
 * The restore route exists so a delete can be UNDONE for real (quick-delete of
 * over-produced meeting action items). Its correctness is not "it returns 200";
 * it is the exact SHAPE of the mutation it emits, because that shape is what
 * makes brain.db and Hub D1 converge:
 *
 *   • It must patch a LIVE `status`. applyUpdate's tombstone resurrection guard
 *     (mutations.ts:836-853) rejects any patch on a soft-deleted row that does
 *     not address the deletion, and applyPatch's I7-INVERSE (mutations.ts:1376)
 *     is what actually clears `deleted_at` — keyed on status transitioning FROM
 *     'deleted' to a live value.
 *   • It must NOT send `deleted_at` explicitly. `deleted_at` is absent from
 *     TABLE_FIELDS.tasks (field-authority.generated.ts), so the mutation would
 *     be rejected as an unknown field — AND an explicit deleted_at suppresses
 *     the I7-INVERSE co-clear (`explicitDeletedAt` precedence, mutations.ts:1368).
 *     Either way the tombstone would survive and PB's pull would re-delete the
 *     row on the next sync.
 *   • It must keep the completion triad consistent (status='done' <=>
 *     completed=1 <=> completed_at set), or assertCompletionTriad rejects it.
 *
 * Strategy mirrors tasks.bulk-action.test.ts: mock applyMutation, assert the
 * envelope. No live D1 needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthUser, Env } from '../helpers'

vi.mock('./mutations', () => ({
  applyMutation: vi.fn(),
  handleMutations: vi.fn(),
  applyInsert: vi.fn(),
  applyUpdate: vi.fn(),
  applyDelete: vi.fn(),
}))

import { handleRestoreTask } from './tasks'
import { applyMutation } from './mutations'

const mockApplyMutation = vi.mocked(applyMutation)

// ── Helpers ───────────────────────────────────────────────────────────────────

interface TaskStub {
  id?: string
  title?: string | null
  description?: string | null
  deleted_at?: string | null
  project_id?: string | null
  completed_at?: string | null
  completed_by?: string | null
}

/** Env whose task probe returns `task` (null → 404 path). */
function makeEnv(task: TaskStub | null): Env {
  return {
    DB: {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: () => Promise.resolve(task),
          run: () => Promise.resolve({ meta: {} }),
          all: () => Promise.resolve({ results: [] }),
        }),
        first: () => Promise.resolve(null),
        run: () => Promise.resolve({ meta: {} }),
        all: () => Promise.resolve({ results: [] }),
      }),
    } as unknown as Env['DB'],
  } as unknown as Env
}

function makeUser(email = 'test@example.com'): AuthUser {
  return { email, name: 'Test User', isNick: false } as AuthUser
}

function makeRequest(body?: Record<string, unknown>): Request {
  return new Request('https://example.com/api/tasks/task_A/restore', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
}

const deletedTask: TaskStub = {
  id: 'task_A',
  title: 'Over-produced action item',
  description: 'desc',
  deleted_at: '2026-07-21 10:00:00',
  project_id: null,
  completed_at: null,
  completed_by: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApplyMutation.mockResolvedValue({ mutation_id: 'mut_TEST', status: 'accepted' as const, result_seq: 2 })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('handleRestoreTask — undelete mutation shape', () => {
  it('patches a live status so I7-INVERSE clears deleted_at', async () => {
    const res = await handleRestoreTask('task_A', makeRequest(), makeUser(), makeEnv(deletedTask))

    expect(res.status).toBe(200)
    expect(mockApplyMutation).toHaveBeenCalledTimes(1)
    expect(mockApplyMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        table: 'tasks',
        record_id: 'task_A',
        op: 'update',
        route: 'handleRestoreTask',
        patch: expect.objectContaining({ status: 'todo' }),
      }),
    )
  })

  it('NEVER sends deleted_at in the patch (unknown field + suppresses the co-clear)', async () => {
    await handleRestoreTask('task_A', makeRequest(), makeUser(), makeEnv(deletedTask))

    const patch = mockApplyMutation.mock.calls[0][1].patch as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(patch, 'deleted_at')).toBe(false)
  })

  it('restores to the caller-supplied pre-delete status', async () => {
    await handleRestoreTask('task_A', makeRequest({ status: 'in_progress' }), makeUser(), makeEnv(deletedTask))

    expect(mockApplyMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ patch: expect.objectContaining({ status: 'in_progress', completed: 0 }) }),
    )
  })

  it('defaults to todo when no status is supplied', async () => {
    await handleRestoreTask('task_A', makeRequest(), makeUser(), makeEnv(deletedTask))

    expect(mockApplyMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ patch: expect.objectContaining({ status: 'todo' }) }),
    )
  })

  it('clears the completion triad when restoring to a non-done status', async () => {
    const wasDone: TaskStub = { ...deletedTask, completed_at: '2026-07-20 09:00:00', completed_by: 'nick@umn.edu' }
    await handleRestoreTask('task_A', makeRequest({ status: 'todo' }), makeUser(), makeEnv(wasDone))

    expect(mockApplyMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        patch: expect.objectContaining({ status: 'todo', completed: 0, completed_at: null, completed_by: null }),
      }),
    )
  })

  it('preserves the original completion stamps when restoring to done', async () => {
    const wasDone: TaskStub = { ...deletedTask, completed_at: '2026-07-20 09:00:00', completed_by: 'nick@umn.edu' }
    await handleRestoreTask('task_A', makeRequest({ status: 'done' }), makeUser(), makeEnv(wasDone))

    expect(mockApplyMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        patch: expect.objectContaining({
          status: 'done',
          completed: 1,
          completed_at: '2026-07-20 09:00:00',
          completed_by: 'nick@umn.edu',
        }),
      }),
    )
  })

  it('rejects a junk restore status before touching the mutation ledger', async () => {
    const res = await handleRestoreTask('task_A', makeRequest({ status: 'deleted' }), makeUser(), makeEnv(deletedTask))

    expect(res.status).toBe(400)
    expect(mockApplyMutation).not.toHaveBeenCalled()
  })

  it('is idempotent on a live task — no mutation emitted', async () => {
    const live: TaskStub = { ...deletedTask, deleted_at: null }
    const res = await handleRestoreTask('task_A', makeRequest(), makeUser(), makeEnv(live))
    const body = await res.json() as { data: { idempotent?: boolean } }

    expect(res.status).toBe(200)
    expect(body.data.idempotent).toBe(true)
    expect(mockApplyMutation).not.toHaveBeenCalled()
  })

  it('404s an unknown task', async () => {
    const res = await handleRestoreTask('task_missing', makeRequest(), makeUser(), makeEnv(null))

    expect(res.status).toBe(404)
    expect(mockApplyMutation).not.toHaveBeenCalled()
  })

  it('surfaces a rejected mutation as 409 instead of reporting success', async () => {
    mockApplyMutation.mockResolvedValue({ mutation_id: 'mut_TEST', status: 'error' as const, reason: 'nope' })
    const res = await handleRestoreTask('task_A', makeRequest(), makeUser(), makeEnv(deletedTask))

    expect(res.status).toBe(409)
  })
})
