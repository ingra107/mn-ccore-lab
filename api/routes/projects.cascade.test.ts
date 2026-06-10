/**
 * projects.cascade.test.ts — B-CRIT-05 + B7 (SEC-T0-7) regression guard
 *
 * Verifies that handleDeleteProject's cascade-clean block calls env.DB.batch()
 * with ALL child-table statements as a single atomic unit, not separate run()
 * calls.
 *
 * Pre-fix (projects.ts:609-611): 3 separate prepare().run() calls — a failure
 * on statement 2 or 3 left orphaned rows in comments/project_updates pointing
 * at a deleted project.
 *
 * Post-fix: env.DB.batch([...]) — D1 executes all statements in a single
 * implicit transaction; any error rolls back the whole batch.
 *
 * B7 (SEC-T0-7, 2026-05-22) expanded the cascade from 3 child statements to 9:
 *   comments, project_updates, project_documents, milestones,
 *   conference_submissions, submission_events, regulatory_items,
 *   project_dependencies, and the tasks.project_id NULL-out. The structural
 *   guard below now asserts 9.
 *
 * ── Atomicity test limitation ────────────────────────────────────────────────
 * True rollback semantics (all 3 statements undo on mid-batch failure) are a
 * D1 runtime guarantee and cannot be exercised in a unit stub. Reason: the
 * stub's batch() is a plain async function — it doesn't run real SQL, so
 * there's nothing to rollback. The structural property we CAN test is:
 *   (a) batch() is called once with exactly 3 PreparedStatement objects, AND
 *   (b) when batch() throws, the error is swallowed (catch block fires) and
 *       the function continues to the idempotency check rather than propagating
 *       the error.
 * These two properties confirm the fix is in place. The D1 runtime guarantees
 * the rest.
 *
 * See also: agent_knowledge topic 'd1-batch-atomicity-unit-test-limitation'
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AuthUser, Env } from '../helpers'

// ── Mock applyMutation — hoisted before imports ───────────────────────────────
vi.mock('./mutations', () => ({
  applyMutation: vi.fn(),
  handleMutations: vi.fn(),
  applyInsert: vi.fn(),
  applyUpdate: vi.fn(),
  applyDelete: vi.fn(),
}))

import { handleDeleteProject } from './projects'
import { applyMutation } from './mutations'

const mockApplyMutation = vi.mocked(applyMutation)

// ── Stub helpers ──────────────────────────────────────────────────────────────

/** A minimal PreparedStatement stub that records bind() args and exposes run(). */
function makeStmt() {
  return {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ meta: {} }),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
  }
}

interface MakeEnvOpts {
  /** Override the value first() returns for the project SELECT */
  projectFirstResult?: { id: string; title: string; slug: string } | null
  /** Override the value first() returns for the deleted_at idempotency check */
  deletedAtResult?: { deleted_at: string | null } | null
  /** If true, env.DB.batch() rejects with an error */
  batchThrows?: boolean
  /** Capture the batch call so tests can inspect it */
  onBatch?: (stmts: unknown[]) => void
}

function makeEnv(opts: MakeEnvOpts = {}): Env {
  const {
    projectFirstResult = { id: 'proj_TEST', title: 'Test Project', slug: 'test-project' },
    deletedAtResult = { deleted_at: null },
    batchThrows = false,
    onBatch,
  } = opts

  let firstCallCount = 0

  const env = {
    DB: {
      prepare: (_sql: string) => {
        const s = makeStmt()
        // Route first() calls in order:
        //   call 1 = SELECT id,title,slug (project lookup)
        //   call 2 = SELECT deleted_at (idempotency check)
        s.first.mockImplementation(async () => {
          firstCallCount++
          if (firstCallCount === 1) return projectFirstResult
          if (firstCallCount === 2) return deletedAtResult
          return null
        })
        return s
      },
      batch: vi.fn().mockImplementation(async (stmts: unknown[]) => {
        onBatch?.(stmts)
        if (batchThrows) throw new Error('D1 batch simulated failure')
        return stmts.map(() => ({ success: true, meta: {}, results: [] }))
      }),
    } as unknown as Env['DB'],
    ACTIVITY_LOG: undefined,
  } as unknown as Env

  return env
}

function makeUser(): AuthUser {
  return { email: 'ingra107@umn.edu', name: 'Nick' } as AuthUser
}

// Minimal request stub for handlers that accept a request param.
function makeRequest(): Request {
  return new Request('https://x/api/test', {
    method: 'POST',
    headers: { 'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod', 'X-Test-User': 'ingra107@umn.edu' },
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockApplyMutation.mockResolvedValue({
    mutation_id: 'mut_TEST',
    status: 'accepted' as const,
    result_seq: 1,
  })
})

describe('handleDeleteProject — cascade-clean uses DB.batch() (B-CRIT-05)', () => {
  it('calls DB.batch() exactly once with 10 statements (structural guard)', async () => {
    const capturedStmts: unknown[] = []
    const env = makeEnv({
      onBatch: (stmts) => capturedStmts.push(...stmts),
    })

    const response = await handleDeleteProject('proj_TEST', makeUser(), env, makeRequest())
    const body = await response.json() as Record<string, unknown>

    // batch() called exactly once
    expect((env.DB.batch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)

    // batch() received exactly 10 statements: B7 expanded cascade (9) + the
    // Design C (v77) activity_entries project-row clear (+1).
    const [batchArg] = (env.DB.batch as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown[]]
    expect(batchArg).toHaveLength(10)

    // Deleted successfully
    expect(response.status).toBe(200)
    expect((body.data as { deleted: string }).deleted).toBe('proj_TEST')
  })

  it('does NOT call DB.batch() when project is not found (returns 404)', async () => {
    const env = makeEnv({ projectFirstResult: null })

    const response = await handleDeleteProject('proj_MISSING', makeUser(), env, makeRequest())

    expect(response.status).toBe(404)
    expect((env.DB.batch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0)
  })

  it('FAILS LOUD on batch() error — aborts the delete with 500, does NOT proceed (R3, Slice D 2026-06-09)', async () => {
    // R3 re-judgment (2026-06-09): the prior contract SWALLOWED a batch() failure
    // and continued the soft-delete, on the theory that "losing cascade rows is
    // recoverable." That theory is false: batch() is ATOMIC, so a single broken
    // statement (e.g. the pre-Slice-D from_slug/to_slug reference to a renamed
    // column) rolls back the WHOLE cascade — silently orphaning comments, docs,
    // milestones, and tasks while the project is stamped deleted. A half-deleted
    // project with dangling children is worse than a blocked delete. The handler
    // now returns 500 and does NOT call applyMutation on cascade failure.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const env = makeEnv({ batchThrows: true })

    const response = await handleDeleteProject('proj_TEST', makeUser(), env, makeRequest())

    // console.error still logs the cascade failure (observability retained).
    expect(consoleSpy).toHaveBeenCalledWith(
      'project cascade-clean failed:',
      expect.any(Error),
    )

    // applyMutation MUST NOT be called — the soft-delete is aborted.
    expect(mockApplyMutation).not.toHaveBeenCalled()

    // Response is a 500 error, not a successful delete.
    expect(response.status).toBe(500)

    consoleSpy.mockRestore()
  })

  it('returns idempotent:true when project already has deleted_at set (skips applyMutation)', async () => {
    const env = makeEnv({
      deletedAtResult: { deleted_at: '2026-05-09T10:00:00Z' },
    })

    const response = await handleDeleteProject('proj_TEST', makeUser(), env, makeRequest())
    const body = await response.json() as { data: { idempotent: boolean } }

    expect(response.status).toBe(200)
    expect(body.data.idempotent).toBe(true)
    // applyMutation NOT called — idempotency short-circuit fired
    expect(mockApplyMutation).not.toHaveBeenCalled()
  })
})
