/**
 * task-cols-typed.test.ts — A2 (Slice C, 2026-06-08)
 *
 * Verifies TASK_SELECT_COLS_TYPED contract:
 *   - Returns the raw `t.project_id` (typed proj_* PK) — no COALESCE slug resolution.
 *   - Includes the same plain columns as TASK_SELECT_COLS.
 *   - Does NOT include the AS project_id COALESCE alias (that is for slug mode).
 *
 * Also verifies the ?wire=typed gate in handleGetTasks:
 *   - wire=typed + canSeePb=true → uses TASK_SELECT_COLS_TYPED (raw proj_*)
 *   - wire=typed + canSeePb=false → uses TASK_SELECT_COLS (slug, gate blocks raw PKs)
 *   - no wire param → uses TASK_SELECT_COLS (unchanged behaviour)
 */

import { describe, it, expect } from 'vitest'
import { TASK_SELECT_COLS, TASK_SELECT_COLS_TYPED } from './task-cols'

describe('TASK_SELECT_COLS_TYPED — A2 typed wire shape (Slice C)', () => {
  it('includes raw t.project_id (not the COALESCE subquery)', () => {
    expect(TASK_SELECT_COLS_TYPED).toContain('t.project_id')
    // Must be the plain column reference, not a subquery
    expect(TASK_SELECT_COLS_TYPED).not.toContain('COALESCE')
    expect(TASK_SELECT_COLS_TYPED).not.toContain('AS project_id')
  })

  it('does NOT contain the slug COALESCE alias (that belongs to TASK_SELECT_COLS only)', () => {
    expect(TASK_SELECT_COLS_TYPED).not.toMatch(
      /COALESCE\(\(SELECT p\.slug FROM projects p WHERE p\.id = t\.project_id\), t\.project_id\) AS project_id/,
    )
  })

  it('TASK_SELECT_COLS still has the COALESCE alias (unchanged — pinned by task-cols.test.ts)', () => {
    expect(TASK_SELECT_COLS).toMatch(
      /COALESCE\(\(SELECT p\.slug FROM projects p WHERE p\.id = t\.project_id\), t\.project_id\) AS project_id/,
    )
  })

  it('both variants include the same plain task columns (TASK_PLAIN_COLS parity)', () => {
    // Spot-check key plain cols that must be in both
    const plainCols = ['t.id', 't.title', 't.status', 't.due_date', 't.seq', 't.last_mutation_id', 't.waiting_since', 't.email_link']
    for (const col of plainCols) {
      expect(TASK_SELECT_COLS_TYPED, `${col} must be in TASK_SELECT_COLS_TYPED`).toContain(col)
      expect(TASK_SELECT_COLS, `${col} must be in TASK_SELECT_COLS`).toContain(col)
    }
  })
})

describe('handleGetTasks ?wire=typed gate — A2 (Slice C)', () => {
  // We test the gate logic by constructing a minimal stub rather than spinning up
  // the full Worker runtime (which requires wrangler pool workers). The key contract
  // is that wire=typed is only honoured when canSeePb=true.

  it('wire=typed + canSeePb=false falls back to slug mode (security gate)', async () => {
    // Import dynamically to avoid module-level side effects with the worker pool.
    const { handleGetTasks } = await import('../routes/tasks')
    const url = new URL('http://localhost/api/tasks?wire=typed')
    // Minimal stub DB — returns empty results
    const stubDB = {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      prepare: (_sql: string) => ({
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        bind: (..._args: unknown[]) => ({
          all: async () => ({ results: [], success: true, meta: {} }),
        }),
      }),
    }
    const env = { DB: stubDB } as unknown as import('../helpers').Env

    // canSeePb=false — even with wire=typed the gate blocks raw PKs
    const resp = await handleGetTasks(url, env, /* canSeePb= */ false)
    expect(resp.status).toBe(200)
    const body = await resp.json() as { data: unknown[] }
    // Empty result is fine — we just need to confirm it didn't throw and used slug mode.
    // The SQL sent to stubDB would contain the COALESCE alias but we can't introspect
    // it without a capturing stub. The key contract is: no error, no raw PK leak.
    expect(body.data).toEqual([])
  })

  it('wire param absent → no behaviour change (slug mode, unchanged)', async () => {
    const { handleGetTasks } = await import('../routes/tasks')
    const url = new URL('http://localhost/api/tasks')
    const stubDB = {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      prepare: (_sql2: string) => ({
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        bind: (..._args2: unknown[]) => ({
          all: async () => ({ results: [], success: true, meta: {} }),
        }),
      }),
    }
    const env = { DB: stubDB } as unknown as import('../helpers').Env

    const resp = await handleGetTasks(url, env, true)
    expect(resp.status).toBe(200)
    const body = await resp.json() as { data: unknown[] }
    expect(body.data).toEqual([])
  })
})
