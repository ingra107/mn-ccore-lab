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
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The first cut's stub answered every `FROM projects` lookup with one canned
// row and every list with [], and the Pattern B cases only checked that the
// SQL text CONTAINED 'Peripheral Brain'. Here each test builds a real world --
// a PB project and a team project, each with a task, a conference, a
// regulatory item, an update and a revision -- and the Pattern B cases assert
// which rows a non-PI caller actually gets back.

import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
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

let db: InstanceType<typeof Database>

/**
 * One world per test: pi_emails names PI_EMAIL; 'pb-proj' is a Peripheral Brain
 * project and 'mnccore-proj' a team project, each carrying a task, a
 * conference, a regulatory item, a project update and an in-progress revision;
 * 'task_none' has no project.
 */
beforeEach(() => {
  db = prodSchemaDb()
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick', slug: 'nick-ingraham', email: PI_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate Mesfin', slug: 'nate-mesfin', email: NON_PI_EMAIL, role: 'PI', bio: 'Researcher', auto_created: 1 })
  for (const [id, slug, category] of [['proj_pb', 'pb-proj', 'Peripheral Brain'], ['proj_mn', 'mnccore-proj', 'MNCCORE']]) {
    insertRow(db, 'projects', { id, slug, title: `Project ${slug}`, category })
    insertRow(db, 'tasks', { id: `task_${slug}`, title: `Task ${slug}`, status: 'todo', priority: 'medium', assignee: 'nick-ingraham', project_id: id, description: 'Test task desc' })
    insertRow(db, 'conference_submissions', { id: `conf_${slug}`, project_id: id, conference: 'CHEST', submission_type: 'oral', title: `Abstract ${slug}` })
    insertRow(db, 'regulatory_items', { id: `reg_${slug}`, project_id: id, item_type: 'irb', title: `IRB ${slug}` })
    insertRow(db, 'activity_entries', { id: `upd_${slug}`, entity_type: 'project', entity_id: id, project_id: id, kind: 'update', actor_slug: 'nick-ingraham', body: `UPDATE ON ${slug}` })
    insertRow(db, 'manuscript_revisions', { id: `rev_${slug}`, project_id: id, status: 'in_progress' })
  }
  insertRow(db, 'tasks', { id: 'task_none', title: 'Unassigned', status: 'todo', priority: 'medium', assignee: 'nick-ingraham', project_id: null })
})

function makeEnv(): Env {
  return { TEST_MODE_KEY: 'local-test-key-do-not-use-in-prod', PB_API_KEY: 'valid-test-api-key', DB: d1Adapter(db) } as unknown as Env
}
// Both names kept so each case still says which world it means; the world holds both projects.
function pbEnv(): Env { return makeEnv() }
function nonPbEnv(): Env { return makeEnv() }
const TASK_PB = 'task_pb-proj'
const TASK_MN = 'task_mnccore-proj'

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
    const env = makeEnv()
    const req = new Request('https://x/api/conferences/conf1', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': NON_PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notes: 'updated notes' }),
    })
    const user = { email: NON_PI_EMAIL, name: 'Nate', slug: 'nate-mesfin' }
    const res = await handleUpdateConference('conf_pb-proj', req, user, env)
    expect(res.status).toBe(404)
    expect(db.prepare("SELECT notes FROM conference_submissions WHERE id = 'conf_pb-proj'").get()).toEqual({ notes: null })
  })

  it('allows non-PI caller updating a conference tied to a non-PB project', async () => {
    const env = makeEnv()
    const req = new Request('https://x/api/conferences/conf1', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': NON_PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notes: 'updated notes' }),
    })
    const user = { email: NON_PI_EMAIL, name: 'Nate', slug: 'nate-mesfin' }
    const res = await handleUpdateConference('conf_mnccore-proj', req, user, env)
    expect(res.status).toBe(200)
    expect(db.prepare("SELECT notes FROM conference_submissions WHERE id = 'conf_mnccore-proj'").get()).toEqual({ notes: 'updated notes' })
  })

  it('allows PI caller updating a conference tied to a PB project', async () => {
    const env = makeEnv()
    const req = new Request('https://x/api/conferences/conf1', {
      method: 'POST',
      headers: {
        'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
        'X-Test-User': PI_EMAIL,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notes: 'updated notes' }),
    })
    const user = { email: PI_EMAIL, name: 'Nick', slug: 'nick-ingraham' }
    const res = await handleUpdateConference('conf_pb-proj', req, user, env)
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
    const env = makeEnv()
    const res = await handleGetTaskComments(TASK_PB, nonPiRequest(), env)
    expect(res.status).toBe(403)
  })

  it('allows non-PI caller on a task in a non-PB project', async () => {
    const env = makeEnv()
    const res = await handleGetTaskComments(TASK_MN, nonPiRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows non-PI caller on a task with NO project_id (unassigned task)', async () => {
    const env = makeEnv()
    const res = await handleGetTaskComments('task_none', nonPiRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows PI caller on a task in a PB-category project', async () => {
    const env = makeEnv()
    const res = await handleGetTaskComments(TASK_PB, piRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows API-key caller on a task in a PB-category project', async () => {
    const env = makeEnv()
    const res = await handleGetTaskComments(TASK_PB, apiKeyRequest(), env)
    expect(res.status).toBe(200)
  })
})

// ── 10. Task activity ─────────────────────────────────────────────────────────

describe('handleGetTaskActivity — PB visibility gate (via task.project_id)', () => {
  it('blocks non-PI caller on a task in a PB-category project', async () => {
    const env = makeEnv()
    const res = await handleGetTaskActivity(TASK_PB, nonPiRequest(), env)
    expect(res.status).toBe(403)
  })

  it('allows non-PI caller on a task in a non-PB project', async () => {
    const env = makeEnv()
    const res = await handleGetTaskActivity(TASK_MN, nonPiRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows non-PI caller on a task with NO project_id (unassigned task)', async () => {
    const env = makeEnv()
    const res = await handleGetTaskActivity('task_none', nonPiRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows PI caller on a task in a PB-category project', async () => {
    const env = makeEnv()
    const res = await handleGetTaskActivity(TASK_PB, piRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows API-key caller on a task in a PB-category project', async () => {
    const env = makeEnv()
    const res = await handleGetTaskActivity(TASK_PB, apiKeyRequest(), env)
    expect(res.status).toBe(200)
  })
})

// ── 11. Task detail ───────────────────────────────────────────────────────────

describe('handleGetTaskDetail — PB visibility gate (via task.project_id)', () => {
  it('blocks non-PI caller on a task in a PB-category project', async () => {
    const env = makeEnv()
    const res = await handleGetTaskDetail(TASK_PB, nonPiRequest(), env)
    expect(res.status).toBe(403)
  })

  it('allows non-PI caller on a task in a non-PB project', async () => {
    const env = makeEnv()
    const res = await handleGetTaskDetail(TASK_MN, nonPiRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows non-PI caller on a task with NO project_id (unassigned task)', async () => {
    const env = makeEnv()
    const res = await handleGetTaskDetail('task_none', nonPiRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows PI caller on a task in a PB-category project', async () => {
    const env = makeEnv()
    const res = await handleGetTaskDetail(TASK_PB, piRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows API-key caller on a task in a PB-category project', async () => {
    const env = makeEnv()
    const res = await handleGetTaskDetail(TASK_PB, apiKeyRequest(), env)
    expect(res.status).toBe(200)
  })
})

// ── 12. Task updates ──────────────────────────────────────────────────────────

describe('handleGetTaskUpdates — PB visibility gate (via task.project_id)', () => {
  it('blocks non-PI caller on a task in a PB-category project', async () => {
    const env = makeEnv()
    const res = await handleGetTaskUpdates(TASK_PB, nonPiRequest(), env)
    expect(res.status).toBe(403)
  })

  it('allows non-PI caller on a task in a non-PB project', async () => {
    const env = makeEnv()
    const res = await handleGetTaskUpdates(TASK_MN, nonPiRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows non-PI caller on a task with NO project_id (unassigned task)', async () => {
    const env = makeEnv()
    const res = await handleGetTaskUpdates('task_none', nonPiRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows PI caller on a task in a PB-category project', async () => {
    const env = makeEnv()
    const res = await handleGetTaskUpdates(TASK_PB, piRequest(), env)
    expect(res.status).toBe(200)
  })

  it('allows API-key caller on a task in a PB-category project', async () => {
    const env = makeEnv()
    const res = await handleGetTaskUpdates(TASK_PB, apiKeyRequest(), env)
    expect(res.status).toBe(200)
  })
})

// ── 13. Recent project updates (Pattern B — canSeePb filter) ──────────────────

describe('handleRecentUpdates — canSeePb filter (Pattern B)', () => {
  const contents = async (canSeePb: boolean) => {
    const res = await handleRecentUpdates(new URL('https://x/api/updates/recent'), makeEnv(), canSeePb)
    expect(res.status).toBe(200) // filtered, never blocked
    return ((await res.json()) as { data: Array<{ content: string }> }).data.map((r) => r.content).sort()
  }

  it('canSeePb=false — the PB project update is filtered out, the team one stays', async () => {
    expect(await contents(false)).toEqual(['UPDATE ON mnccore-proj'])
  })

  it('canSeePb=true — both updates come back', async () => {
    expect(await contents(true)).toEqual(['UPDATE ON mnccore-proj', 'UPDATE ON pb-proj'])
  })

  it('the since= sync branch applies the same filter', async () => {
    const res = await handleRecentUpdates(new URL('https://x/api/updates/recent?since=2000-01-01'), makeEnv(), false)
    const rows = ((await res.json()) as { data: Array<{ content: string }> }).data
    expect(rows.map((r) => r.content)).toEqual(['UPDATE ON mnccore-proj'])
  })
})

// ── 14. Recent task updates (Pattern B — canSeePb filter) ─────────────────────

describe('handleGetRecentTaskUpdates — canSeePb filter (Pattern B)', () => {
  beforeEach(() => {
    for (const t of [TASK_PB, TASK_MN]) {
      insertRow(db, 'activity_entries', { id: `tu_${t}`, entity_type: 'task', entity_id: t, kind: 'update', actor_slug: 'nick-ingraham', body: `TASK UPDATE ON ${t}`, update_type: 'note' })
    }
  })
  const contents = async (canSeePb: boolean) => {
    const res = await handleGetRecentTaskUpdates(new URL('https://x/api/task-updates/recent'), makeEnv(), canSeePb)
    expect(res.status).toBe(200)
    return ((await res.json()) as { data: Array<{ content: string }> }).data.map((r) => r.content).sort()
  }

  it('canSeePb=false — the update on the PB task is filtered out', async () => {
    expect(await contents(false)).toEqual([`TASK UPDATE ON ${TASK_MN}`])
  })

  it('canSeePb=true — both come back', async () => {
    expect(await contents(true)).toEqual([`TASK UPDATE ON ${TASK_MN}`, `TASK UPDATE ON ${TASK_PB}`])
  })
})

// ── 15. Active revisions (Pattern B — canSeePb flag) ─────────────────────────

describe('handleGetActiveRevisions — canSeePb filter (Pattern B)', () => {
  const ids = async (canSeePb: boolean) => {
    const res = await handleGetActiveRevisions(makeEnv(), canSeePb)
    expect(res.status).toBe(200)
    return ((await res.json()) as { data: Array<{ id: string }> }).data.map((r) => r.id).sort()
  }

  it('canSeePb=false — the PB project revision is filtered out', async () => {
    expect(await ids(false)).toEqual(['rev_mnccore-proj'])
  })

  it('canSeePb=true — both revisions come back', async () => {
    expect(await ids(true)).toEqual(['rev_mnccore-proj', 'rev_pb-proj'])
  })
})

// ── 16. CV data — Pattern C (no email/auto_created in response) ───────────────

describe('handleCVData — no email/auto_created projection', () => {
  it('returns 200 with member data, and never the stored email or auto_created flag', async () => {
    // The seeded member HAS an email and auto_created=1, so a SELECT * would leak both.
    const res = await handleCVData('nate-mesfin', makeEnv())
    expect(res.status).toBe(200)
    const body = await res.json() as { data: { member: Record<string, unknown> } }
    expect(body.data.member).toMatchObject({ name: 'Nate Mesfin', slug: 'nate-mesfin' })
    expect(body.data.member).not.toHaveProperty('email')
    expect(body.data.member).not.toHaveProperty('auto_created')
    expect(JSON.stringify(body)).not.toContain(NON_PI_EMAIL)
  })

  it('returns 404 when slug not found', async () => {
    const res = await handleCVData('ghost-slug', makeEnv())
    expect(res.status).toBe(404)
  })
})
