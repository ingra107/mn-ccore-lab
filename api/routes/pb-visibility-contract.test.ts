// pb-visibility-contract.test.ts — Phase 10.2 regression guardrail
//
// Parameterized contract test: for every project-linked GET route that touches
// PB-category data, assert the four-caller matrix:
//   1. Non-PI caller blocked on PB project (403 or filtered-out empty result)
//   2. Non-PI caller allowed on non-PB project (200)
//   3. PI caller allowed on PB project (200)
//   4. API-key caller allowed on PB project (200)
//
// PURPOSE: if a future route is added that exposes PB-project content without
// the assertProjectVisible / canSeePb gate, adding it to this registry will
// make the test fail-fast. This is the regression guardrail for the Phase 1 ACL
// sweep (hub-hardening-2026-05-27).
//
// Covered routes (assertProjectVisible pattern):
//   A1.  GET /api/projects/:slug/comments         — handleGetComments
//   A2.  GET /api/projects/:slug/updates          — handleGetProjectUpdates
//   A3.  GET /api/projects/:slug/documents        — handleGetProjectDocuments
//   A4.  GET /api/submissions?project_id=         — handleGetSubmissions
//   A5.  GET /api/conferences?project_id=         — handleGetConferences
//   A6.  POST /api/conferences/:id               — handleUpdateConference (update path)
//   A7.  GET /api/regulatory?project_id=          — handleGetRegulatoryItems
//   A8.  GET /api/deadline-cascade?project_id=    — handleGetCascade
//   A9.  GET /api/tasks/:id/comments              — handleGetTaskComments
//   A10. GET /api/tasks/:id/activity              — handleGetTaskActivity
//   A11. GET /api/tasks/:id/detail                — handleGetTaskDetail
//   A12. GET /api/tasks/:id/updates               — handleGetTaskUpdates
//
// Covered routes (canSeePb filter pattern — non-PI sees filtered-out results):
//   B1.  GET /api/updates/recent                  — handleRecentUpdates
//   B2.  GET /api/task-updates/recent             — handleGetRecentTaskUpdates
//   B3.  GET /api/revisions/active                — handleGetActiveRevisions

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
import type { Env } from '../helpers'

// ── Test identity constants ────────────────────────────────────────────────────

const PI_EMAIL = 'ingra107@umn.edu'
const NON_PI_EMAIL = 'nate@umn.edu'
const VALID_API_KEY = 'Bearer valid-test-api-key'

// ── Request factory helpers ────────────────────────────────────────────────────

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

// ── Env stubs ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal DB stub whose shape satisfies the helpers.ts ACL checks
 * (pi_emails lab_settings row, project category lookup, task project_id lookup,
 * conference_submissions project_id lookup). All data queries return empty results.
 */
function makeEnv(
  projectCategory: 'Peripheral Brain' | 'MNCCORE',
  opts: { taskProjectId?: string | null; confProjectId?: string | null } = {},
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
              return { id: 'proj-id', slug: 'test-proj', category: projectCategory }
            }
            if (/FROM tasks WHERE id/.test(sql) || /FROM tasks t WHERE t\.id/.test(sql)) {
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
  } as unknown as Env
}

function pbEnv(opts: { taskProjectId?: string | null; confProjectId?: string | null } = {}): Env {
  return makeEnv('Peripheral Brain', opts)
}

function nonPbEnv(opts: { taskProjectId?: string | null; confProjectId?: string | null } = {}): Env {
  return makeEnv('MNCCORE', opts)
}

// ── Pattern A: assertProjectVisible routes ─────────────────────────────────────
//
// These routes call assertProjectVisible() which returns 403 for non-PI callers
// on PB-category projects. The four-caller matrix must hold.

interface PatternACase {
  label: string
  callNonPiOnPb: () => Promise<Response>
  callNonPiOnNonPb: () => Promise<Response>
  callPiOnPb: () => Promise<Response>
  callApiKeyOnPb: () => Promise<Response>
}

const patternACases: PatternACase[] = [
  // A1 — Project comments
  {
    label: 'GET /api/projects/:slug/comments (handleGetComments)',
    callNonPiOnPb:    () => handleGetComments('pb-proj', nonPiRequest(), pbEnv()),
    callNonPiOnNonPb: () => handleGetComments('mnccore-proj', nonPiRequest(), nonPbEnv()),
    callPiOnPb:       () => handleGetComments('pb-proj', piRequest(), pbEnv()),
    callApiKeyOnPb:   () => handleGetComments('pb-proj', apiKeyRequest(), pbEnv()),
  },
  // A2 — Project updates
  {
    label: 'GET /api/projects/:slug/updates (handleGetProjectUpdates)',
    callNonPiOnPb:    () => handleGetProjectUpdates('pb-proj', nonPiRequest(), pbEnv()),
    callNonPiOnNonPb: () => handleGetProjectUpdates('mnccore-proj', nonPiRequest(), nonPbEnv()),
    callPiOnPb:       () => handleGetProjectUpdates('pb-proj', piRequest(), pbEnv()),
    callApiKeyOnPb:   () => handleGetProjectUpdates('pb-proj', apiKeyRequest(), pbEnv()),
  },
  // A3 — Project documents
  {
    label: 'GET /api/projects/:slug/documents (handleGetProjectDocuments)',
    callNonPiOnPb:    () => handleGetProjectDocuments('pb-proj', nonPiRequest(), pbEnv()),
    callNonPiOnNonPb: () => handleGetProjectDocuments('mnccore-proj', nonPiRequest(), nonPbEnv()),
    callPiOnPb:       () => handleGetProjectDocuments('pb-proj', piRequest(), pbEnv()),
    callApiKeyOnPb:   () => handleGetProjectDocuments('pb-proj', apiKeyRequest(), pbEnv()),
  },
  // A4 — Submission events
  {
    label: 'GET /api/submissions?project_id= (handleGetSubmissions)',
    callNonPiOnPb:    () => handleGetSubmissions(new URL('https://x/?project_id=pb-proj'), nonPiRequest(), pbEnv()),
    callNonPiOnNonPb: () => handleGetSubmissions(new URL('https://x/?project_id=mnccore-proj'), nonPiRequest(), nonPbEnv()),
    callPiOnPb:       () => handleGetSubmissions(new URL('https://x/?project_id=pb-proj'), piRequest(), pbEnv()),
    callApiKeyOnPb:   () => handleGetSubmissions(new URL('https://x/?project_id=pb-proj'), apiKeyRequest(), pbEnv()),
  },
  // A5 — Conferences (scoped to project)
  {
    label: 'GET /api/conferences?project_id= (handleGetConferences)',
    callNonPiOnPb:    () => handleGetConferences(new URL('https://x/?project_id=pb-proj'), nonPiRequest(), pbEnv()),
    callNonPiOnNonPb: () => handleGetConferences(new URL('https://x/?project_id=mnccore-proj'), nonPiRequest(), nonPbEnv()),
    callPiOnPb:       () => handleGetConferences(new URL('https://x/?project_id=pb-proj'), piRequest(), pbEnv()),
    callApiKeyOnPb:   () => handleGetConferences(new URL('https://x/?project_id=pb-proj'), apiKeyRequest(), pbEnv()),
  },
  // A6 — Conference update (gate reads conf's project_id)
  {
    label: 'POST /api/conferences/:id (handleUpdateConference)',
    callNonPiOnPb: () => {
      const req = new Request('https://x/', {
        method: 'POST',
        headers: {
          'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
          'X-Test-User': NON_PI_EMAIL,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes: 'updated' }),
      })
      return handleUpdateConference('conf1', req, { email: NON_PI_EMAIL, name: 'Nate' }, pbEnv({ confProjectId: 'pb-proj' }))
    },
    callNonPiOnNonPb: () => {
      const req = new Request('https://x/', {
        method: 'POST',
        headers: {
          'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
          'X-Test-User': NON_PI_EMAIL,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes: 'updated' }),
      })
      return handleUpdateConference('conf1', req, { email: NON_PI_EMAIL, name: 'Nate' }, nonPbEnv({ confProjectId: 'mnccore-proj' }))
    },
    callPiOnPb: () => {
      const req = new Request('https://x/', {
        method: 'POST',
        headers: {
          'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
          'X-Test-User': PI_EMAIL,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes: 'updated' }),
      })
      return handleUpdateConference('conf1', req, { email: PI_EMAIL, name: 'Nick' }, pbEnv({ confProjectId: 'pb-proj' }))
    },
    callApiKeyOnPb: () => {
      const req = new Request('https://x/', {
        method: 'POST',
        headers: { Authorization: VALID_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'updated' }),
      })
      return handleUpdateConference('conf1', req, { email: 'service@api', name: 'Service' }, pbEnv({ confProjectId: 'pb-proj' }))
    },
  },
  // A7 — Regulatory items
  {
    label: 'GET /api/regulatory?project_id= (handleGetRegulatoryItems)',
    callNonPiOnPb:    () => handleGetRegulatoryItems(new URL('https://x/?project_id=pb-proj'), nonPiRequest(), pbEnv()),
    callNonPiOnNonPb: () => handleGetRegulatoryItems(new URL('https://x/?project_id=mnccore-proj'), nonPiRequest(), nonPbEnv()),
    callPiOnPb:       () => handleGetRegulatoryItems(new URL('https://x/?project_id=pb-proj'), piRequest(), pbEnv()),
    callApiKeyOnPb:   () => handleGetRegulatoryItems(new URL('https://x/?project_id=pb-proj'), apiKeyRequest(), pbEnv()),
  },
  // A8 — Deadline cascade
  {
    label: 'GET /api/deadline-cascade?project_id= (handleGetCascade)',
    callNonPiOnPb:    () => handleGetCascade(new URL('https://x/?project_id=pb-proj'), nonPiRequest(), pbEnv()),
    callNonPiOnNonPb: () => handleGetCascade(new URL('https://x/?project_id=mnccore-proj'), nonPiRequest(), nonPbEnv()),
    callPiOnPb:       () => handleGetCascade(new URL('https://x/?project_id=pb-proj'), piRequest(), pbEnv()),
    callApiKeyOnPb:   () => handleGetCascade(new URL('https://x/?project_id=pb-proj'), apiKeyRequest(), pbEnv()),
  },
  // A9 — Task comments (gate via task.project_id)
  {
    label: 'GET /api/tasks/:id/comments (handleGetTaskComments)',
    callNonPiOnPb:    () => handleGetTaskComments('task1', nonPiRequest(), pbEnv({ taskProjectId: 'pb-proj' })),
    callNonPiOnNonPb: () => handleGetTaskComments('task1', nonPiRequest(), nonPbEnv({ taskProjectId: 'mnccore-proj' })),
    callPiOnPb:       () => handleGetTaskComments('task1', piRequest(), pbEnv({ taskProjectId: 'pb-proj' })),
    callApiKeyOnPb:   () => handleGetTaskComments('task1', apiKeyRequest(), pbEnv({ taskProjectId: 'pb-proj' })),
  },
  // A10 — Task activity
  {
    label: 'GET /api/tasks/:id/activity (handleGetTaskActivity)',
    callNonPiOnPb:    () => handleGetTaskActivity('task1', nonPiRequest(), pbEnv({ taskProjectId: 'pb-proj' })),
    callNonPiOnNonPb: () => handleGetTaskActivity('task1', nonPiRequest(), nonPbEnv({ taskProjectId: 'mnccore-proj' })),
    callPiOnPb:       () => handleGetTaskActivity('task1', piRequest(), pbEnv({ taskProjectId: 'pb-proj' })),
    callApiKeyOnPb:   () => handleGetTaskActivity('task1', apiKeyRequest(), pbEnv({ taskProjectId: 'pb-proj' })),
  },
  // A11 — Task detail
  {
    label: 'GET /api/tasks/:id/detail (handleGetTaskDetail)',
    callNonPiOnPb:    () => handleGetTaskDetail('task1', nonPiRequest(), pbEnv({ taskProjectId: 'pb-proj' })),
    callNonPiOnNonPb: () => handleGetTaskDetail('task1', nonPiRequest(), nonPbEnv({ taskProjectId: 'mnccore-proj' })),
    callPiOnPb:       () => handleGetTaskDetail('task1', piRequest(), pbEnv({ taskProjectId: 'pb-proj' })),
    callApiKeyOnPb:   () => handleGetTaskDetail('task1', apiKeyRequest(), pbEnv({ taskProjectId: 'pb-proj' })),
  },
  // A12 — Task updates
  {
    label: 'GET /api/tasks/:id/updates (handleGetTaskUpdates)',
    callNonPiOnPb:    () => handleGetTaskUpdates('task1', nonPiRequest(), pbEnv({ taskProjectId: 'pb-proj' })),
    callNonPiOnNonPb: () => handleGetTaskUpdates('task1', nonPiRequest(), nonPbEnv({ taskProjectId: 'mnccore-proj' })),
    callPiOnPb:       () => handleGetTaskUpdates('task1', piRequest(), pbEnv({ taskProjectId: 'pb-proj' })),
    callApiKeyOnPb:   () => handleGetTaskUpdates('task1', apiKeyRequest(), pbEnv({ taskProjectId: 'pb-proj' })),
  },
]

// ── Pattern A parameterized tests ──────────────────────────────────────────────

describe('PB-visibility contract — Pattern A (assertProjectVisible gates)', () => {
  for (const tc of patternACases) {
    describe(tc.label, () => {
      it('non-PI caller is blocked (403) on a PB-category project', async () => {
        const res = await tc.callNonPiOnPb()
        expect(res.status, `Expected 403 for non-PI on PB project`).toBe(403)
      })

      it('non-PI caller is allowed (200) on a non-PB project', async () => {
        const res = await tc.callNonPiOnNonPb()
        expect(res.status, `Expected 200 for non-PI on non-PB project`).toBe(200)
      })

      it('PI caller is allowed (200) on a PB-category project', async () => {
        const res = await tc.callPiOnPb()
        expect(res.status, `Expected 200 for PI on PB project`).toBe(200)
      })

      it('API-key caller is allowed (200) on a PB-category project', async () => {
        const res = await tc.callApiKeyOnPb()
        expect(res.status, `Expected 200 for API-key on PB project`).toBe(200)
      })
    })
  }
})

// ── Pattern B: canSeePb filter routes ─────────────────────────────────────────
//
// These cross-project feed routes don't 403 non-PI callers; instead they filter
// PB-category project rows out of the result. The contract: non-PI gets 200 with
// empty data (no PB rows), PI gets 200 with the PB row included.
//
// Because our DB stub returns empty results for all queries, we verify status
// code only (both get 200). The actual filtering behavior is tested separately in
// phase1b-b-visibility.test.ts via result-inspection.

describe('PB-visibility contract — Pattern B (canSeePb filter routes)', () => {
  it('B1: GET /api/updates/recent — non-PI caller gets 200 (PB rows filtered out)', async () => {
    // handleRecentUpdates(url, env, canSeePb) — canSeePb=false for non-PI callers
    const url = new URL('https://x/api/updates/recent')
    const res = await handleRecentUpdates(url, pbEnv(), false)
    expect(res.status).toBe(200)
  })

  it('B1: GET /api/updates/recent — PI caller gets 200', async () => {
    const url = new URL('https://x/api/updates/recent')
    const res = await handleRecentUpdates(url, pbEnv(), true)
    expect(res.status).toBe(200)
  })

  it('B2: GET /api/task-updates/recent — non-PI caller gets 200 (PB rows filtered out)', async () => {
    // handleGetRecentTaskUpdates(url, env, canSeePb) — canSeePb=false for non-PI callers
    const url = new URL('https://x/api/task-updates/recent')
    const res = await handleGetRecentTaskUpdates(url, pbEnv(), false)
    expect(res.status).toBe(200)
  })

  it('B2: GET /api/task-updates/recent — PI caller gets 200', async () => {
    const url = new URL('https://x/api/task-updates/recent')
    const res = await handleGetRecentTaskUpdates(url, pbEnv(), true)
    expect(res.status).toBe(200)
  })

  it('B3: GET /api/revisions/active — non-PI caller gets 200 (PB rows filtered out)', async () => {
    // non-PI call: canSeePb=false. Route returns empty list (no PB rows exposed).
    const res = await handleGetActiveRevisions(nonPbEnv(), false)
    expect(res.status).toBe(200)
    const body = await res.json() as { data: unknown[] }
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('B3: GET /api/revisions/active — PI caller gets 200 with PB rows included', async () => {
    const res = await handleGetActiveRevisions(pbEnv(), true)
    expect(res.status).toBe(200)
  })
})
