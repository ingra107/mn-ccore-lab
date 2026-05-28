// phase1b-b-visibility.test.ts — Phase 1b-B PB-project visibility sweep
//
// Verifies that PB-category project resources are gated for non-PI callers
// while non-PB projects remain fully accessible to all authed team members.
//
// Covered endpoints (Pattern A — single-resource assertProjectVisible):
//   1. GET /api/projects/:slug/comments         (projects.ts:handleGetComments)
//   2. GET /api/projects/:slug/updates          (projects.ts:handleGetProjectUpdates)
//   3. GET /api/projects/:slug/documents        (project-documents.ts:handleGetProjectDocuments)
//   4. GET /api/submissions?project_id=         (submissions.ts:handleGetSubmissions)
//   5. GET /api/conferences?project_id=         (conferences.ts:handleGetConferences)
//   6. POST /api/conferences/:id               (conferences.ts:handleUpdateConference)
//   7. GET /api/regulatory?project_id=          (regulatory.ts:handleGetRegulatoryItems)
//   8. GET /api/deadline-cascade?project_id=    (deadline-cascade.ts:handleGetCascade)
//   9. GET /api/tasks/:id/comments              (tasks.ts:handleGetTaskComments)
//  10. GET /api/tasks/:id/activity              (tasks.ts:handleGetTaskActivity)
//  11. GET /api/tasks/:id/detail                (tasks.ts:handleGetTaskDetail)
//  12. GET /api/tasks/:id/updates               (tasks.ts:handleGetTaskUpdates)
//
// Covered endpoints (Pattern B — cross-project feed with canSeePb flag):
//  13. GET /api/updates/recent                  (projects.ts:handleRecentUpdates)
//  14. GET /api/task-updates/recent             (tasks.ts:handleGetRecentTaskUpdates)
//  15. GET /api/revisions/active                (revisions.ts:handleGetActiveRevisions)
//
// Covered endpoints (Pattern C — projection only):
//  16. GET /api/team/:slug/cv-data              (team.ts:handleCVData) — no email/auto_created
//
// Per-endpoint assertions:
//   - Non-PI caller blocked (403/filtered-out) on a PB-category project resource
//   - Non-PI caller ALLOWED on a non-PB project resource
//   - PI caller allowed on PB project
//   - API-key caller allowed on PB project (treated as PI by isPiRequest)

import { describe, it, expect } from 'vitest'
import { handleGetComments, handleGetProjectUpdates, handleRecentUpdates } from './projects'
import { handleGetProjectDocuments } from './project-documents'
import { handleGetSubmissions } from './submissions'
import { handleGetConferences, handleUpdateConference } from './conferences'
import { handleGetRegulatoryItems } from './regulatory'
import { handleGetCascade } from './deadline-cascade'
import {
  handleGetTaskComments,
  handleGetTaskActivity,
  handleGetTaskDetail,
  handleGetTaskUpdates,
  handleGetRecentTaskUpdates,
} from './tasks'
import { handleGetActiveRevisions } from './revisions'
import { handleCVData } from './team'
import type { Env } from '../helpers'

// ── Test primitives ────────────────────────────────────────────────────────────

const PI_EMAIL = 'ingra107@umn.edu'
const NON_PI_EMAIL = 'nate@umn.edu'
const VALID_API_KEY = 'Bearer valid-test-api-key'

function piRequest(extra: RequestInit = {}): Request {
  return new Request('https://x/api/test', {
    method: 'GET',
    headers: {
      'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
      'X-Test-User': PI_EMAIL,
    },
    ...extra,
  })
}

function nonPiRequest(extra: RequestInit = {}): Request {
  return new Request('https://x/api/test', {
    method: 'GET',
    headers: {
      'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
      'X-Test-User': NON_PI_EMAIL,
    },
    ...extra,
  })
}

function apiKeyRequest(extra: RequestInit = {}): Request {
  return new Request('https://x/api/test', {
    method: 'GET',
    headers: { Authorization: VALID_API_KEY },
    ...extra,
  })
}

/**
 * Build a minimal Env stub whose DB.prepare('...').bind(...).first() returns:
 *  - A project row with the given category when the SQL mentions 'projects'
 *  - A task row with the given project_id when the SQL mentions 'tasks WHERE id'
 *  - A conference row with the given project_id when the SQL mentions 'conference_submissions'
 *  - A pi_emails lab_settings row for PI_EMAIL
 *  - Empty results for everything else
 */
function makeEnv(
  projectCategory: 'Peripheral Brain' | 'MNCCORE',
  opts: {
    taskProjectId?: string | null;
    confProjectId?: string | null;
  } = {},
  envOverrides: Partial<Env> = {},
): Env {
  const taskProjectId = opts.taskProjectId !== undefined ? opts.taskProjectId : 'test-proj'
  const confProjectId = opts.confProjectId !== undefined ? opts.confProjectId : 'test-proj'
  return {
    TEST_MODE_KEY: 'local-test-key-do-not-use-in-prod',
    PB_API_KEY: 'valid-test-api-key',
    DB: {
      prepare: (sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => {
            if (/pi_emails/.test(sql)) {
              return { value: JSON.stringify([PI_EMAIL]) }
            }
            if (/FROM projects/.test(sql)) {
              // Return project row for any lookup — category controls the gate
              return { id: 'proj-id', slug: 'test-proj', category: projectCategory }
            }
            if (/FROM tasks WHERE id/.test(sql) || /FROM tasks t WHERE t.id/.test(sql)) {
              return { id: 'task-id', project_id: taskProjectId, description: 'Test task desc' }
            }
            if (/FROM conference_submissions WHERE id/.test(sql)) {
              return { project_id: confProjectId }
            }
            return null
          },
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        }),
        first: async () => {
          if (/pi_emails/.test(sql)) {
            return { value: JSON.stringify([PI_EMAIL]) }
          }
          return null
        },
        all: async () => ({ results: [] }),
        run: async () => ({ success: true }),
      }),
      batch: async () => [],
    },
    ...envOverrides,
  } as unknown as Env
}

function pbEnv(): Env { return makeEnv('Peripheral Brain') }
function nonPbEnv(): Env { return makeEnv('MNCCORE') }

// ── 1. Project comments ────────────────────────────────────────────────────────

describe('handleGetComments — PB visibility gate', () => {
  it('blocks non-PI caller on a PB-category project', async () => {
    const res = await handleGetComments('pb-proj', nonPiRequest(), pbEnv())
    expect(res.status).toBe(403)
  })

  it('allows non-PI caller on a non-PB project', async () => {
    const res = await handleGetComments('mnccore-proj', nonPiRequest(), nonPbEnv())
    expect(res.status).toBe(200)
  })

  it('allows PI caller on a PB-category project', async () => {
    const res = await handleGetComments('pb-proj', piRequest(), pbEnv())
    expect(res.status).toBe(200)
  })

  it('allows API-key caller on a PB-category project', async () => {
    const res = await handleGetComments('pb-proj', apiKeyRequest(), pbEnv())
    expect(res.status).toBe(200)
  })
})

// ── 2. Project updates ────────────────────────────────────────────────────────

describe('handleGetProjectUpdates — PB visibility gate', () => {
  it('blocks non-PI caller on a PB-category project', async () => {
    const res = await handleGetProjectUpdates('pb-proj', nonPiRequest(), pbEnv())
    expect(res.status).toBe(403)
  })

  it('allows non-PI caller on a non-PB project', async () => {
    const res = await handleGetProjectUpdates('mnccore-proj', nonPiRequest(), nonPbEnv())
    expect(res.status).toBe(200)
  })

  it('allows PI caller on a PB-category project', async () => {
    const res = await handleGetProjectUpdates('pb-proj', piRequest(), pbEnv())
    expect(res.status).toBe(200)
  })

  it('allows API-key caller on a PB-category project', async () => {
    const res = await handleGetProjectUpdates('pb-proj', apiKeyRequest(), pbEnv())
    expect(res.status).toBe(200)
  })
})

// ── 3. Project documents ──────────────────────────────────────────────────────

describe('handleGetProjectDocuments — PB visibility gate', () => {
  it('blocks non-PI caller on a PB-category project', async () => {
    const res = await handleGetProjectDocuments('pb-proj', nonPiRequest(), pbEnv())
    expect(res.status).toBe(403)
  })

  it('allows non-PI caller on a non-PB project', async () => {
    const res = await handleGetProjectDocuments('mnccore-proj', nonPiRequest(), nonPbEnv())
    expect(res.status).toBe(200)
  })

  it('allows PI caller on a PB-category project', async () => {
    const res = await handleGetProjectDocuments('pb-proj', piRequest(), pbEnv())
    expect(res.status).toBe(200)
  })

  it('allows API-key caller on a PB-category project', async () => {
    const res = await handleGetProjectDocuments('pb-proj', apiKeyRequest(), pbEnv())
    expect(res.status).toBe(200)
  })
})

// ── 4. Submissions ────────────────────────────────────────────────────────────

describe('handleGetSubmissions — PB visibility gate', () => {
  it('blocks non-PI caller on a PB-category project', async () => {
    const url = new URL('https://x/api/submissions?project_id=pb-proj')
    const res = await handleGetSubmissions(url, nonPiRequest(), pbEnv())
    expect(res.status).toBe(403)
  })

  it('allows non-PI caller on a non-PB project', async () => {
    const url = new URL('https://x/api/submissions?project_id=mnccore-proj')
    const res = await handleGetSubmissions(url, nonPiRequest(), nonPbEnv())
    expect(res.status).toBe(200)
  })

  it('allows PI caller on a PB-category project', async () => {
    const url = new URL('https://x/api/submissions?project_id=pb-proj')
    const res = await handleGetSubmissions(url, piRequest(), pbEnv())
    expect(res.status).toBe(200)
  })

  it('allows API-key caller on a PB-category project', async () => {
    const url = new URL('https://x/api/submissions?project_id=pb-proj')
    const res = await handleGetSubmissions(url, apiKeyRequest(), pbEnv())
    expect(res.status).toBe(200)
  })

  it('returns 400 when project_id is missing (no gate involved)', async () => {
    const url = new URL('https://x/api/submissions')
    const res = await handleGetSubmissions(url, nonPiRequest(), pbEnv())
    expect(res.status).toBe(400)
  })
})

// ── 5. Conferences GET ────────────────────────────────────────────────────────

describe('handleGetConferences — PB visibility gate (when project_id provided)', () => {
  it('blocks non-PI caller on a PB-category project', async () => {
    const url = new URL('https://x/api/conferences?project_id=pb-proj')
    const res = await handleGetConferences(url, nonPiRequest(), pbEnv())
    expect(res.status).toBe(403)
  })

  it('allows non-PI caller on a non-PB project', async () => {
    const url = new URL('https://x/api/conferences?project_id=mnccore-proj')
    const res = await handleGetConferences(url, nonPiRequest(), nonPbEnv())
    expect(res.status).toBe(200)
  })

  it('allows non-PI caller with NO project_id (cross-project feed — no gate)', async () => {
    // No project_id = all conferences visible (no per-project gate)
    const url = new URL('https://x/api/conferences')
    const res = await handleGetConferences(url, nonPiRequest(), nonPbEnv())
    expect(res.status).toBe(200)
  })

  it('allows PI caller on a PB-category project', async () => {
    const url = new URL('https://x/api/conferences?project_id=pb-proj')
    const res = await handleGetConferences(url, piRequest(), pbEnv())
    expect(res.status).toBe(200)
  })

  it('allows API-key caller on a PB-category project', async () => {
    const url = new URL('https://x/api/conferences?project_id=pb-proj')
    const res = await handleGetConferences(url, apiKeyRequest(), pbEnv())
    expect(res.status).toBe(200)
  })
})

// ── 6. Conference update ──────────────────────────────────────────────────────

describe('handleUpdateConference — PB visibility gate (from conf.project_id)', () => {
  it('blocks non-PI caller updating a conference tied to a PB project (returns 404 via hiddenResource)', async () => {
    // withExistingRowProject returns hiddenResource() (404, uniform envelope) for
    // both "row missing" and "row exists but PB-hidden" — existence oracle fix
    // (codex final-audit #2, 2026-05-28). Previously returned 403.
    const env = makeEnv('Peripheral Brain', { confProjectId: 'pb-proj' })
    const req = new Request('https://x/api/conferences/conf1', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': NON_PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notes: 'updated notes' }),
    })
    const user = { email: NON_PI_EMAIL, name: 'Nate' }
    const res = await handleUpdateConference('conf1', req, user, env)
    expect(res.status).toBe(404)
  })

  it('allows non-PI caller updating a conference tied to a non-PB project', async () => {
    const env = makeEnv('MNCCORE', { confProjectId: 'mnccore-proj' })
    const req = new Request('https://x/api/conferences/conf1', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': NON_PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notes: 'updated notes' }),
    })
    const user = { email: NON_PI_EMAIL, name: 'Nate' }
    const res = await handleUpdateConference('conf1', req, user, env)
    expect(res.status).toBe(200)
  })

  it('allows PI caller updating a conference tied to a PB project', async () => {
    const env = makeEnv('Peripheral Brain', { confProjectId: 'pb-proj' })
    const req = new Request('https://x/api/conferences/conf1', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notes: 'updated notes' }),
    })
    const user = { email: PI_EMAIL, name: 'Nick' }
    const res = await handleUpdateConference('conf1', req, user, env)
    expect(res.status).toBe(200)
  })
})

// ── 7. Regulatory items ───────────────────────────────────────────────────────

describe('handleGetRegulatoryItems — PB visibility gate (when project_id provided)', () => {
  it('blocks non-PI caller on a PB-category project', async () => {
    const url = new URL('https://x/api/regulatory?project_id=pb-proj')
    const res = await handleGetRegulatoryItems(url, nonPiRequest(), pbEnv())
    expect(res.status).toBe(403)
  })

  it('allows non-PI caller on a non-PB project', async () => {
    const url = new URL('https://x/api/regulatory?project_id=mnccore-proj')
    const res = await handleGetRegulatoryItems(url, nonPiRequest(), nonPbEnv())
    expect(res.status).toBe(200)
  })

  it('allows non-PI caller with NO project_id (cross-project list — no gate)', async () => {
    const url = new URL('https://x/api/regulatory')
    const res = await handleGetRegulatoryItems(url, nonPiRequest(), nonPbEnv())
    expect(res.status).toBe(200)
  })

  it('allows PI caller on a PB-category project', async () => {
    const url = new URL('https://x/api/regulatory?project_id=pb-proj')
    const res = await handleGetRegulatoryItems(url, piRequest(), pbEnv())
    expect(res.status).toBe(200)
  })

  it('allows API-key caller on a PB-category project', async () => {
    const url = new URL('https://x/api/regulatory?project_id=pb-proj')
    const res = await handleGetRegulatoryItems(url, apiKeyRequest(), pbEnv())
    expect(res.status).toBe(200)
  })
})

// ── 8. Deadline cascade ───────────────────────────────────────────────────────

describe('handleGetCascade — PB visibility gate', () => {
  it('blocks non-PI caller on a PB-category project', async () => {
    const url = new URL('https://x/api/deadline-cascade?project_id=pb-proj')
    const res = await handleGetCascade(url, nonPiRequest(), pbEnv())
    expect(res.status).toBe(403)
  })

  it('allows non-PI caller on a non-PB project', async () => {
    const url = new URL('https://x/api/deadline-cascade?project_id=mnccore-proj')
    const res = await handleGetCascade(url, nonPiRequest(), nonPbEnv())
    expect(res.status).toBe(200)
  })

  it('allows PI caller on a PB-category project', async () => {
    const url = new URL('https://x/api/deadline-cascade?project_id=pb-proj')
    const res = await handleGetCascade(url, piRequest(), pbEnv())
    expect(res.status).toBe(200)
  })

  it('allows API-key caller on a PB-category project', async () => {
    const url = new URL('https://x/api/deadline-cascade?project_id=pb-proj')
    const res = await handleGetCascade(url, apiKeyRequest(), pbEnv())
    expect(res.status).toBe(200)
  })

  it('returns 400 when project_id is missing (no gate)', async () => {
    const url = new URL('https://x/api/deadline-cascade')
    const res = await handleGetCascade(url, nonPiRequest(), pbEnv())
    expect(res.status).toBe(400)
  })
})

// ── 9. Task comments ──────────────────────────────────────────────────────────

describe('handleGetTaskComments — PB visibility gate (via task.project_id)', () => {
  it('blocks non-PI caller on a task in a PB-category project', async () => {
    const env = makeEnv('Peripheral Brain', { taskProjectId: 'pb-proj' })
    const res = await handleGetTaskComments('task1', nonPiRequest(), env)
    expect(res.status).toBe(403)
  })

  it('allows non-PI caller on a task in a non-PB project', async () => {
    const env = makeEnv('MNCCORE', { taskProjectId: 'mnccore-proj' })
    const res = await handleGetTaskComments('task1', nonPiRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows non-PI caller on a task with NO project_id (unassigned task)', async () => {
    const env = makeEnv('MNCCORE', { taskProjectId: null })
    const res = await handleGetTaskComments('task1', nonPiRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows PI caller on a task in a PB-category project', async () => {
    const env = makeEnv('Peripheral Brain', { taskProjectId: 'pb-proj' })
    const res = await handleGetTaskComments('task1', piRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows API-key caller on a task in a PB-category project', async () => {
    const env = makeEnv('Peripheral Brain', { taskProjectId: 'pb-proj' })
    const res = await handleGetTaskComments('task1', apiKeyRequest(), env)
    expect(res.status).toBe(200)
  })
})

// ── 10. Task activity ─────────────────────────────────────────────────────────

describe('handleGetTaskActivity — PB visibility gate (via task.project_id)', () => {
  it('blocks non-PI caller on a task in a PB-category project', async () => {
    const env = makeEnv('Peripheral Brain', { taskProjectId: 'pb-proj' })
    const res = await handleGetTaskActivity('task1', nonPiRequest(), env)
    expect(res.status).toBe(403)
  })

  it('allows non-PI caller on a task in a non-PB project', async () => {
    const env = makeEnv('MNCCORE', { taskProjectId: 'mnccore-proj' })
    const res = await handleGetTaskActivity('task1', nonPiRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows non-PI caller on a task with NO project_id (unassigned task)', async () => {
    const env = makeEnv('MNCCORE', { taskProjectId: null })
    const res = await handleGetTaskActivity('task1', nonPiRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows PI caller on a task in a PB-category project', async () => {
    const env = makeEnv('Peripheral Brain', { taskProjectId: 'pb-proj' })
    const res = await handleGetTaskActivity('task1', piRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows API-key caller on a task in a PB-category project', async () => {
    const env = makeEnv('Peripheral Brain', { taskProjectId: 'pb-proj' })
    const res = await handleGetTaskActivity('task1', apiKeyRequest(), env)
    expect(res.status).toBe(200)
  })
})

// ── 11. Task detail ───────────────────────────────────────────────────────────

describe('handleGetTaskDetail — PB visibility gate (via task.project_id)', () => {
  it('blocks non-PI caller on a task in a PB-category project', async () => {
    const env = makeEnv('Peripheral Brain', { taskProjectId: 'pb-proj' })
    const res = await handleGetTaskDetail('task1', nonPiRequest(), env)
    expect(res.status).toBe(403)
  })

  it('allows non-PI caller on a task in a non-PB project', async () => {
    const env = makeEnv('MNCCORE', { taskProjectId: 'mnccore-proj' })
    const res = await handleGetTaskDetail('task1', nonPiRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows non-PI caller on a task with NO project_id (unassigned task)', async () => {
    const env = makeEnv('MNCCORE', { taskProjectId: null })
    const res = await handleGetTaskDetail('task1', nonPiRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows PI caller on a task in a PB-category project', async () => {
    const env = makeEnv('Peripheral Brain', { taskProjectId: 'pb-proj' })
    const res = await handleGetTaskDetail('task1', piRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows API-key caller on a task in a PB-category project', async () => {
    const env = makeEnv('Peripheral Brain', { taskProjectId: 'pb-proj' })
    const res = await handleGetTaskDetail('task1', apiKeyRequest(), env)
    expect(res.status).toBe(200)
  })
})

// ── 12. Task updates ──────────────────────────────────────────────────────────

describe('handleGetTaskUpdates — PB visibility gate (via task.project_id)', () => {
  it('blocks non-PI caller on a task in a PB-category project', async () => {
    const env = makeEnv('Peripheral Brain', { taskProjectId: 'pb-proj' })
    const res = await handleGetTaskUpdates('task1', nonPiRequest(), env)
    expect(res.status).toBe(403)
  })

  it('allows non-PI caller on a task in a non-PB project', async () => {
    const env = makeEnv('MNCCORE', { taskProjectId: 'mnccore-proj' })
    const res = await handleGetTaskUpdates('task1', nonPiRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows non-PI caller on a task with NO project_id (unassigned task)', async () => {
    const env = makeEnv('MNCCORE', { taskProjectId: null })
    const res = await handleGetTaskUpdates('task1', nonPiRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows PI caller on a task in a PB-category project', async () => {
    const env = makeEnv('Peripheral Brain', { taskProjectId: 'pb-proj' })
    const res = await handleGetTaskUpdates('task1', piRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows API-key caller on a task in a PB-category project', async () => {
    const env = makeEnv('Peripheral Brain', { taskProjectId: 'pb-proj' })
    const res = await handleGetTaskUpdates('task1', apiKeyRequest(), env)
    expect(res.status).toBe(200)
  })
})

// ── 13. Recent project updates (Pattern B — canSeePb filter) ──────────────────

describe('handleRecentUpdates — canSeePb filter (Pattern B)', () => {
  // For Pattern B we test the canSeePb parameter directly since the SQL
  // filter operates in D1 (which we stub). The key invariant: canSeePb=false
  // should inject a WHERE clause that includes the PB exclusion predicate.
  // We verify by inspecting the SQL string captured during DB.prepare.

  it('canSeePb=false — SQL includes PB exclusion clause', async () => {
    let capturedSql = ''
    const env = {
      TEST_MODE_KEY: 'local-test-key-do-not-use-in-prod',
      PB_API_KEY: 'valid-test-api-key',
      DB: {
        prepare: (sql: string) => {
          capturedSql = sql
          return {
            bind: (..._args: unknown[]) => ({
              all: async () => ({ results: [] }),
              first: async () => null,
              run: async () => ({ success: true }),
            }),
            all: async () => ({ results: [] }),
            first: async () => null,
          }
        },
        batch: async () => [],
      },
    } as unknown as Env
    const url = new URL('https://x/api/updates/recent')
    await handleRecentUpdates(url, env, false)
    expect(capturedSql).toContain("Peripheral Brain")
  })

  it('canSeePb=true — SQL does NOT include PB exclusion clause', async () => {
    let capturedSql = ''
    const env = {
      TEST_MODE_KEY: 'local-test-key-do-not-use-in-prod',
      PB_API_KEY: 'valid-test-api-key',
      DB: {
        prepare: (sql: string) => {
          capturedSql = sql
          return {
            bind: (..._args: unknown[]) => ({
              all: async () => ({ results: [] }),
              first: async () => null,
              run: async () => ({ success: true }),
            }),
            all: async () => ({ results: [] }),
            first: async () => null,
          }
        },
        batch: async () => [],
      },
    } as unknown as Env
    const url = new URL('https://x/api/updates/recent')
    await handleRecentUpdates(url, env, true)
    expect(capturedSql).not.toContain("Peripheral Brain")
  })

  it('returns 200 for non-PI (canSeePb=false) — feed is filtered not blocked', async () => {
    const url = new URL('https://x/api/updates/recent')
    const res = await handleRecentUpdates(url, makeEnv('MNCCORE'), false)
    expect(res.status).toBe(200)
  })
})

// ── 14. Recent task updates (Pattern B — canSeePb filter) ─────────────────────

describe('handleGetRecentTaskUpdates — canSeePb filter (Pattern B)', () => {
  it('canSeePb=false — SQL includes PB exclusion clause', async () => {
    let capturedSql = ''
    const env = {
      TEST_MODE_KEY: 'local-test-key-do-not-use-in-prod',
      DB: {
        prepare: (sql: string) => {
          capturedSql = sql
          return {
            bind: (..._args: unknown[]) => ({
              all: async () => ({ results: [] }),
              first: async () => null,
              run: async () => ({ success: true }),
            }),
            all: async () => ({ results: [] }),
            first: async () => null,
          }
        },
        batch: async () => [],
      },
    } as unknown as Env
    const url = new URL('https://x/api/task-updates/recent')
    await handleGetRecentTaskUpdates(url, env, false)
    expect(capturedSql).toContain("Peripheral Brain")
  })

  it('canSeePb=true — SQL does NOT include PB exclusion clause', async () => {
    let capturedSql = ''
    const env = {
      TEST_MODE_KEY: 'local-test-key-do-not-use-in-prod',
      DB: {
        prepare: (sql: string) => {
          capturedSql = sql
          return {
            bind: (..._args: unknown[]) => ({
              all: async () => ({ results: [] }),
              first: async () => null,
              run: async () => ({ success: true }),
            }),
            all: async () => ({ results: [] }),
            first: async () => null,
          }
        },
        batch: async () => [],
      },
    } as unknown as Env
    const url = new URL('https://x/api/task-updates/recent')
    await handleGetRecentTaskUpdates(url, env, true)
    expect(capturedSql).not.toContain("Peripheral Brain")
  })

  it('returns 200 for non-PI (canSeePb=false) — feed is filtered not blocked', async () => {
    const url = new URL('https://x/api/task-updates/recent')
    const res = await handleGetRecentTaskUpdates(url, makeEnv('MNCCORE'), false)
    expect(res.status).toBe(200)
  })
})

// ── 15. Active revisions (Pattern B — canSeePb flag) ─────────────────────────

describe('handleGetActiveRevisions — canSeePb filter (Pattern B)', () => {
  it('canSeePb=false — SQL includes PB exclusion clause', async () => {
    let capturedSql = ''
    const env = {
      DB: {
        prepare: (sql: string) => {
          capturedSql = sql
          return {
            bind: (..._args: unknown[]) => ({
              all: async () => ({ results: [] }),
              first: async () => null,
            }),
            all: async () => ({ results: [] }),
            first: async () => null,
          }
        },
        batch: async () => [],
      },
    } as unknown as Env
    await handleGetActiveRevisions(env, false)
    expect(capturedSql).toContain("Peripheral Brain")
  })

  it('canSeePb=true — SQL does NOT include PB exclusion clause', async () => {
    let capturedSql = ''
    const env = {
      DB: {
        prepare: (sql: string) => {
          capturedSql = sql
          return {
            bind: (..._args: unknown[]) => ({
              all: async () => ({ results: [] }),
              first: async () => null,
            }),
            all: async () => ({ results: [] }),
            first: async () => null,
          }
        },
        batch: async () => [],
      },
    } as unknown as Env
    await handleGetActiveRevisions(env, true)
    expect(capturedSql).not.toContain("Peripheral Brain")
  })

  it('returns 200 for non-PI (canSeePb=false) — feed is filtered not blocked', async () => {
    const res = await handleGetActiveRevisions(makeEnv('MNCCORE'), false)
    expect(res.status).toBe(200)
  })
})

// ── 16. CV data — Pattern C (no email/auto_created in response) ───────────────

describe('handleCVData — no email/auto_created projection', () => {
  it('does not include email in the member SELECT query', async () => {
    // handleCVData runs 4 queries in parallel (member, pubs, grants, mentees).
    // Capture ALL SQLs and check the team_members WHERE slug= one specifically.
    const capturedSqls: string[] = []
    const env = {
      DB: {
        prepare: (sql: string) => {
          capturedSqls.push(sql)
          return {
            bind: (..._args: unknown[]) => ({
              first: async () => ({
                id: 'tm1', name: 'Nate Mesfin', slug: 'nate-mesfin',
                role: 'PI', bio: 'Researcher', photo_url: null,
              }),
              all: async () => ({ results: [] }),
            }),
            first: async () => ({
              id: 'tm1', name: 'Nate Mesfin', slug: 'nate-mesfin',
            }),
            all: async () => ({ results: [] }),
          }
        },
        batch: async () => [],
      },
    } as unknown as Env
    await handleCVData('nate-mesfin', env)
    // The query that selects the member by slug should use the public projection
    const memberSql = capturedSqls.find(s => /FROM team_members WHERE slug/.test(s))
    expect(memberSql).toBeDefined()
    // Should NOT be a SELECT * (which would leak email + auto_created)
    expect(memberSql).not.toMatch(/SELECT \* FROM team_members/)
    // auto_created specifically must not appear in the member SELECT
    expect(memberSql).not.toContain('auto_created')
  })

  it('returns 200 with member data when slug is found', async () => {
    const env = {
      DB: {
        prepare: (_sql: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => ({
              id: 'tm1', name: 'Nate Mesfin', slug: 'nate-mesfin',
              role: 'PI', bio: 'Test bio', photo_url: null,
              citation_count: 0, h_index: 0,
            }),
            all: async () => ({ results: [] }),
          }),
          first: async () => ({
            id: 'tm1', name: 'Nate Mesfin', slug: 'nate-mesfin',
          }),
          all: async () => ({ results: [] }),
        }),
        batch: async () => [],
      },
    } as unknown as Env
    const res = await handleCVData('nate-mesfin', env)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { member: Record<string, unknown> } }
    expect(body.data.member).not.toHaveProperty('email')
    expect(body.data.member).not.toHaveProperty('auto_created')
  })

  it('returns 404 when slug not found', async () => {
    const env = {
      DB: {
        prepare: (_sql: string) => ({
          bind: (..._args: unknown[]) => ({
            first: async () => null, // not found
            all: async () => ({ results: [] }),
          }),
          first: async () => null,
          all: async () => ({ results: [] }),
        }),
        batch: async () => [],
      },
    } as unknown as Env
    const res = await handleCVData('ghost-slug', env)
    expect(res.status).toBe(404)
  })
})
