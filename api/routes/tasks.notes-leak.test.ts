// Phase 2 — notes privacy leak guard (read-side)
//
// SEC-P2-01: handleToggleTask must NOT return `notes` in the response row
//            when toggling a task (as opposed to an action_item).
//
// TDD: write these tests first, run → FAIL, then fix the handler.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthUser, Env } from '../helpers'

// ── Mock applyMutation before importing tasks.ts ──────────────────────────────
vi.mock('./mutations', () => ({
  applyMutation: vi.fn(),
  handleMutations: vi.fn(),
  applyInsert: vi.fn(),
  applyUpdate: vi.fn(),
  applyDelete: vi.fn(),
}))

import { handleToggleTask } from './tasks'
import { applyMutation } from './mutations'

const mockApplyMutation = vi.mocked(applyMutation)

beforeEach(() => {
  vi.clearAllMocks()
  mockApplyMutation.mockResolvedValue({ mutation_id: 'mut_test_001', status: 'accepted', result_seq: 2 })
})

// ── Stub helpers ──────────────────────────────────────────────────────────────

function makeUser(): AuthUser {
  return { email: 'nate@umn.edu', name: 'Nate Mesfin', isNick: false } as AuthUser
}

/**
 * Builds a minimal Env stub that:
 * - Returns null for action_items (so the handler falls back to tasks)
 * - Returns a task row WITH `notes` for the tasks SELECT
 * - Returns a task row WITH `notes` for the final SELECT (the leak site)
 *
 * The final `SELECT` the handler issues determines what goes in the response.
 * We return the row including `notes` so that IF the handler uses SELECT *
 * the test will catch it.
 */
function makeEnv(taskRow: Record<string, unknown>): Env {
  let callCount = 0
  return {
    DB: {
      prepare: (sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            const upper = sql.trim().toUpperCase()
            // action_items lookup → null (forces tasks path)
            if (upper.includes('ACTION_ITEMS')) return null
            // Both the initial "read current state" SELECT and the final
            // "read back the updated row" SELECT should return the task row.
            callCount++
            return { ...taskRow }
          },
          run: async () => ({ meta: { changes: 1 } }),
          all: async () => ({ results: [] }),
        }),
        first: async () => null,
        run: async () => ({ meta: {} }),
        all: async () => ({ results: [] }),
      }),
    },
  } as unknown as Env
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('handleToggleTask — SEC-P2-01 notes not in response', () => {
  const taskId = 'task_01hwtest_toggle_notes_0001'
  const taskRow = {
    id: taskId,
    title: 'Confidential task',
    description: 'Team-visible description',
    assignee: 'nate-mesfin',
    assigned_by: 'ingra107@umn.edu',
    status: 'todo',
    completed: 0,
    priority: 'medium',
    notes: 'PRIVATE brain.db note — must not reach team',
    deleted_at: null,
    seq: 5,
    last_mutation_id: null,
    updated_at: '2026-05-27T00:00:00Z',
  }

  it('toggle response does not contain notes field', async () => {
    const env = makeEnv(taskRow)
    const user = makeUser()
    const res = await handleToggleTask(taskId, user, env)
    const body = await res.json() as { data: Record<string, unknown> }

    expect(res.status).toBe(200)
    expect(body.data).not.toHaveProperty('notes')
  })

  it('toggle response still contains non-private fields', async () => {
    const env = makeEnv(taskRow)
    const user = makeUser()
    const res = await handleToggleTask(taskId, user, env)
    const body = await res.json() as { data: Record<string, unknown> }

    expect(body.data).toHaveProperty('id', taskId)
    expect(body.data).toHaveProperty('description', 'Team-visible description')
    expect(body.data).toHaveProperty('assignee', 'nate-mesfin')
  })

  it('toggle response for action_item (not a task) is unaffected', async () => {
    // action_items never had a notes column — this test guards no regression
    const actionItemRow = {
      id: taskId,
      description: 'Meeting action item',
      completed: 0,
      assignee: 'nate-mesfin',
    }

    const envWithActionItem: Env = {
      DB: {
        prepare: (sql: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => {
              const upper = sql.trim().toUpperCase()
              if (upper.includes('ACTION_ITEMS')) return { ...actionItemRow }
              return null
            },
            run: async () => ({ meta: { changes: 1 } }),
            all: async () => ({ results: [] }),
          }),
          first: async () => null,
          run: async () => ({ meta: {} }),
          all: async () => ({ results: [] }),
        }),
      },
    } as unknown as Env

    const res = await handleToggleTask(taskId, makeUser(), envWithActionItem)
    const body = await res.json() as { data: Record<string, unknown> }

    expect(res.status).toBe(200)
    expect(body.data).toHaveProperty('description', 'Meeting action item')
    // action_items have no notes column — just confirm no crash
    expect(body.data).not.toHaveProperty('notes')
  })
})
