// pb-visibility-contract.test.ts — Phase 10.2 + Phase 1b-extended regression guardrail
//
// Parameterized contract test: for every project-linked route (READ or WRITE),
// every lifecycle resource CRUD, and every cross-project feed, assert the four-
// caller matrix:
//   1. Non-PI caller blocked on PB project (403 for Pattern A; PB-filtered body
//      for Pattern B; same for Pattern C/D write/lifecycle).
//   2. Non-PI caller allowed on non-PB project (2xx).
//   3. PI caller allowed on PB project (2xx).
//   4. API-key caller allowed on PB project (2xx).
//
// PURPOSE: if a future route is added that exposes PB-project content without
// the assertProjectVisible / canSeePb gate, adding it to one of the registries
// below makes the test fail-fast. This is the regression guardrail for the
// Phase 1 + Phase 1b-extended ACL sweep (hub-hardening-2026-05-27).
//
// Registries:
//   patternACases       — readers gated by assertProjectVisible (returns 403)
//   patternWriteCases   — writers (POST) gated by assertProjectVisible
//   patternBFeedCases   — cross-project feeds; non-PI gets 200 with PB-filtered body
//
// Adding a new gated route ⇒ add a row here. The "Phase 1b-extended write rows"
// section codifies the new sweep so subsequent reviews catch regressions.

import { describe, it, expect } from 'vitest'
import type Database from 'better-sqlite3'
import {
  handleGetComments,
  handleGetProjectUpdates,
  handleRecentUpdates,
  handleAddComment,
  handlePostProjectUpdate,
  handleUpdateProject,
  handleDeleteProject,
} from './projects'
import {
  handleGetProjectDocuments,
  handleCreateProjectDocument,
  handleDeleteProjectDocument,
} from './project-documents'
import {
  handleGetSubmissions,
  handleCreateSubmission,
  handleUpdateSubmission,
  handleDeleteSubmission,
} from './submissions'
import {
  handleGetConferences,
  handleCreateConference,
  handleUpdateConference,
  handleDeleteConference,
  handleGetUpcomingConferences,
} from './conferences'
import {
  handleGetRegulatoryItems,
  handleGetExpiringItems,
  handleCreateRegulatoryItem,
  handleUpdateRegulatoryItem,
} from './regulatory'
import {
  handleGetCascade,
  handleGetImpact,
  handleGetAllCascades,
} from './deadline-cascade'
import {
  handleGetTaskComments,
  handleGetTaskActivity,
  handleGetTaskDetail,
  handleGetRecentTaskUpdates,
  handleAddTaskComment,
  handlePostTaskUpdate,
  handleGetTasks,
  handleGetTask,
  handleUpdateTaskStatus,
  handleUpdateTask,
  handleDeleteTask,
  handleRestoreTask,
  handleAcknowledgeTask,
} from './tasks'
import {
  handleGetRevisions,
  handleCreateRevision,
  handleUpdateRevision,
  handleGetRevisionComments,
  handleCreateRevisionComment,
  handleUpdateRevisionComment,
} from './revisions'
import { handleGetMeeting } from './meetings'
import { handleCalendarEvents } from './calendar'
import type { Env } from '../helpers'
import { ctToday } from '../lib/ct-date'
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db'
import { viewerDb, personViewer } from '../lib/viewer-db'

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

function piPost(body: unknown): Request {
  return new Request('https://x/api/test', {
    method: 'POST',
    headers: {
      'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
      'X-Test-User': PI_EMAIL,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function nonPiPost(body: unknown): Request {
  return new Request('https://x/api/test', {
    method: 'POST',
    headers: {
      'X-Test-Mode-Key': 'local-test-key-do-not-use-in-prod',
      'X-Test-User': NON_PI_EMAIL,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function apiKeyPost(body: unknown): Request {
  return new Request('https://x/api/test', {
    method: 'POST',
    headers: { Authorization: VALID_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── The world: one migration-chain database per call ───────────────────────────
//
// #8862: this file used to run on a regex stub that answered every `.first()`
// with a row whose category was keyed by WHICH env factory built it, returned
// one canned list from every `.all()`, and acknowledged every write with
// `changes: 1` (the task/project write path "landed" because the stub parroted
// back the last_mutation_id an UPDATE bound). It could not see a WHERE clause,
// a NOT NULL, a CHECK, a trigger or an FK, and Pattern B could only check the
// response SHAPE.
//
// Now every call gets a fresh clone of the migrated schema (prodSchemaDb())
// seeded with BOTH a 'Peripheral Brain' project and a team (MNCCORE) project,
// each with its own child rows. The PB/non-PB axis is which row a call points
// at, not which stub answered. Every PB-side row carries the marker PBSECRET
// in a text column a feed returns; every team-side row carries TEAMVISIBLE.

const PB_MARK = 'PBSECRET'
const TEAM_MARK = 'TEAMVISIBLE'

interface Ref {
  slug: string; id: string; task: string; conf: string; sub: string
  reg: string; rev: string; rcomm: string; doc: string; mark: string
}
const PB: Ref = {
  slug: 'pb-proj', id: 'proj_pb', task: 'task-pb', conf: 'conf-pb', sub: 'sub-pb',
  reg: 'reg-pb', rev: 'rev-pb', rcomm: 'rcomm-pb', doc: 'doc-pb', mark: PB_MARK,
}
const TEAM: Ref = {
  slug: 'mnccore-proj', id: 'proj_team', task: 'task-team', conf: 'conf-team', sub: 'sub-team',
  reg: 'reg-team', rev: 'rev-team', rcomm: 'rcomm-team', doc: 'doc-team', mark: TEAM_MARK,
}

interface World { db: InstanceType<typeof Database>; env: Env }

function seedSide(db: InstanceType<typeof Database>, r: Ref, category: string): void {
  const today = ctToday()
  insertRow(db, 'projects', {
    id: r.id, slug: r.slug, title: `${r.mark} project`, category, status: 'active', stage: 'writing',
  })
  // Stored FKs carry the typed proj_* PK, as prod does (CLAUDE.md "Sync Architecture").
  insertRow(db, 'tasks', {
    id: r.task, project_id: r.id, title: `${r.mark} task`, description: `${r.mark} task desc`,
    assignee: 'nate-mesfin', status: 'todo', priority: 'high', due_date: today, meeting_id: 'mtg-id',
  })
  insertRow(db, 'conference_submissions', {
    id: r.conf, project_id: r.id, conference: 'ATS', submission_type: 'abstract', title: `${r.mark} abstract`,
    abstract_due: ctToday(10), status: 'planning',
  })
  insertRow(db, 'submission_events', {
    id: r.sub, project_id: r.id, event_type: 'submitted', event_date: '2026-05-27', notes: `${r.mark} sub`,
  })
  insertRow(db, 'regulatory_items', {
    id: r.reg, project_id: r.id, item_type: 'irb', title: `${r.mark} IRB`,
    expiration_date: ctToday(10), status: 'active',
  })
  insertRow(db, 'manuscript_revisions', {
    id: r.rev, project_id: r.id, round: 1, status: 'in_progress', journal: `${r.mark} journal`,
  })
  insertRow(db, 'reviewer_comments', { id: r.rcomm, revision_id: r.rev, comment_text: `${r.mark} comment` })
  insertRow(db, 'project_documents', { id: r.doc, project_id: r.id, title: `${r.mark} doc`, url: 'https://x/doc' })
  insertRow(db, 'activity_entries', {
    id: `ae-proj-${r.slug}`, entity_type: 'project', entity_id: r.id, project_id: r.id, kind: 'update',
    actor_slug: 'nate-mesfin', body: `${r.mark} project update`,
  })
  insertRow(db, 'activity_entries', {
    id: `ae-task-${r.slug}`, entity_type: 'task', entity_id: r.task, project_id: r.id, kind: 'update',
    actor_slug: 'nate-mesfin', body: `${r.mark} task update`,
  })
}

function world(prep?: (db: InstanceType<typeof Database>) => void): World {
  const db = prodSchemaDb()
  // The chain seeds pi_emails with the real lab's PIs; this suite's PI is PI_EMAIL.
  db.prepare("UPDATE lab_settings SET value = ? WHERE key = 'pi_emails'").run(JSON.stringify([PI_EMAIL]))
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick', slug: 'nick-ingraham', email: PI_EMAIL })
  insertRow(db, 'team_members', { id: 'tm-nate', name: 'Nate', slug: 'nate-mesfin', email: NON_PI_EMAIL })
  insertRow(db, 'meetings', { id: 'mtg-id', date: ctToday(), title: 'Lab meeting' })
  seedSide(db, PB, 'Peripheral Brain')
  seedSide(db, TEAM, 'MNCCORE')
  prep?.(db)
  const env = {
    TEST_MODE_KEY: 'local-test-key-do-not-use-in-prod',
    PB_API_KEY: 'valid-test-api-key',
    DB: d1Adapter(db),
  } as unknown as Env
  return { db, env }
}

// ── Callers ────────────────────────────────────────────────────────────────────

interface Caller {
  get: () => Request
  post: (body: unknown) => Request
  user: { email: string; name: string }
  /** What index.ts passes as canSeePb for this caller. */
  canSeePb: boolean
}
const NON_PI: Caller = { get: nonPiRequest, post: nonPiPost, user: { email: NON_PI_EMAIL, name: 'Nate', slug: 'nate-mesfin' }, canSeePb: false }
const PI: Caller = { get: piRequest, post: piPost, user: { email: PI_EMAIL, name: 'Nick', slug: 'nick-ingraham' }, canSeePb: true }
const API_KEY: Caller = { get: apiKeyRequest, post: apiKeyPost, user: { email: 'service@api', name: 'S', slug: 'service' }, canSeePb: true }

type Call = (c: Caller, r: Ref, env: Env) => Promise<Response>
const q = (path: string, r: Ref) => new URL(`https://x/${path}`.replace('{ref}', r.slug))

// ── Pattern A: assertProjectVisible read routes ────────────────────────────────

interface PatternACase {
  label: string
  call: Call
}

const patternACases: PatternACase[] = [
  {
    label: 'GET /api/projects/:slug/comments (handleGetComments)',
    call: (c, r, env) => handleGetComments(r.slug, c.get(), env),
  },
  {
    label: 'GET /api/projects/:slug/updates (handleGetProjectUpdates)',
    call: (c, r, env) => handleGetProjectUpdates(r.slug, c.get(), env),
  },
  {
    label: 'GET /api/projects/:slug/documents (handleGetProjectDocuments)',
    call: (c, r, env) => handleGetProjectDocuments(r.slug, c.get(), env),
  },
  {
    label: 'GET /api/submissions?project_id= (handleGetSubmissions)',
    call: (c, r, env) => handleGetSubmissions(q('?project_id={ref}', r), c.get(), env),
  },
  {
    label: 'GET /api/conferences?project_id= (handleGetConferences)',
    call: (c, r, env) => handleGetConferences(q('?project_id={ref}', r), c.get(), env, c.canSeePb),
  },
  {
    // NOTE: handleUpdateConference was moved from Pattern A to Pattern W
    // (codex final-audit #2, 2026-05-28) because it uses withExistingRowProject,
    // which returns hiddenResource() 404 for hidden rows — not 403. The Pattern A
    // loop asserts 403 for all cases; this handler now belongs in Pattern W with
    // blockedStatus: 404 where the per-case expected status is respected.
    label: 'GET /api/regulatory?project_id= (handleGetRegulatoryItems)',
    call: (c, r, env) => handleGetRegulatoryItems(q('?project_id={ref}', r), c.get(), env, c.canSeePb),
  },
  {
    label: 'GET /api/deadline-cascade?project_id= (handleGetCascade)',
    call: (c, r, env) => handleGetCascade(q('?project_id={ref}', r), c.get(), env),
  },
  {
    label: 'GET /api/tasks/:id/comments (handleGetTaskComments)',
    call: (c, r, env) => handleGetTaskComments(r.task, c.get(), env),
  },
  {
    label: 'GET /api/tasks/:id/activity (handleGetTaskActivity)',
    call: (c, r, env) => handleGetTaskActivity(r.task, c.get(), env),
  },
  {
    label: 'GET /api/tasks/:id/detail (handleGetTaskDetail)',
    call: (c, r, env) => handleGetTaskDetail(r.task, c.get(), env),
  },
  // Phase 1b-extended additions: revisions reads + cross-graph reads
  {
    label: 'GET /api/revisions?project_id= (handleGetRevisions)',
    call: (c, r, env) => handleGetRevisions(q('?project_id={ref}', r), c.get(), env),
  },
  // NOTE: handleGetRevisionComments was removed from patternACases (P8 2026-05-28).
  // It previously returned 403 for non-PI on PB-category revision; after the P8
  // oracle fix it returns 404 (via hiddenResource()) for both "no such revision"
  // and "revision exists but caller can't see it" — the uniform envelope that
  // closes the 404/403 status-code oracle. It is now tested in the P8 section
  // below (describe 'P8 — handleGetRevisionComments oracle-closed').
  {
    label: 'GET /api/deadline-cascade/impact (handleGetImpact)',
    call: (c, r, env) => handleGetImpact(new URL(`https://x/?id=${r.task}&type=task&new_date=2026-06-01`), c.get(), env),
  },
  // Fix 2b: GET /api/tasks/:id is now gated by assertProjectVisible (was unguarded)
  {
    label: 'GET /api/tasks/:id (handleGetTask) — Fix 2b: single task PB gate',
    call: (c, r, env) => handleGetTask(r.task, env, c.get()),
  },
]

// ── Pattern A parameterized tests ──────────────────────────────────────────────
//
// A denied read must not carry the PB row's content in its error body either.

describe('PB-visibility contract — Pattern A (assertProjectVisible gates)', () => {
  for (const tc of patternACases) {
    describe(tc.label, () => {
      it('non-PI caller is blocked (403) on a PB-category project', async () => {
        const res = await tc.call(NON_PI, PB, world().env)
        expect(res.status, `Expected 403 for non-PI on PB project`).toBe(403)
        expect(await res.text()).not.toContain(PB_MARK)
      })

      it('non-PI caller is allowed (200) on a non-PB project', async () => {
        const res = await tc.call(NON_PI, TEAM, world().env)
        expect(res.status, `Expected 200 for non-PI on non-PB project`).toBe(200)
        expect(await res.text()).not.toContain(PB_MARK)
      })

      it('PI caller is allowed (200) on a PB-category project', async () => {
        const res = await tc.call(PI, PB, world().env)
        expect(res.status, `Expected 200 for PI on PB project`).toBe(200)
      })

      it('API-key caller is allowed (200) on a PB-category project', async () => {
        const res = await tc.call(API_KEY, PB, world().env)
        expect(res.status, `Expected 200 for API-key on PB project`).toBe(200)
      })
    })
  }
})

// ── Pattern W: write-side PB visibility gates (Phase 1b-extended) ──────────────
//
// Every POST handler that creates/updates/deletes a project-scoped subresource
// or lifecycle row. Non-PI must be refused on a PB parent AND the store must be
// untouched (no row in the tables the handler writes changes, no
// processed_mutations receipt); non-PI must succeed on a non-PB parent; PI /
// API-key always succeed on PB. "Succeed" means the write landed: the stored
// rows of the tables the handler writes differ afterwards. The old stub
// answered every write with `changes: 1`, so a 2xx there proved nothing landed.

interface PatternWriteCase {
  label: string
  // Each handler returns 201/200 on success. The test asserts:
  //   non-PI on PB     → blockedStatus (default 403; withExistingRowProject handlers use 404)
  //   non-PI on non-PB → 2xx
  //   PI on PB         → 2xx
  //   API-key on PB    → 2xx
  //
  // blockedStatus=404: handlers using withExistingRowProject return hiddenResource()
  // (uniform 404 envelope) for BOTH "row missing" and "row hidden" paths — the
  // existence oracle fix (codex final-audit #2, 2026-05-28). Handlers using
  // withProjectWrite / assertProjectVisible return 403 (visibility gate, no oracle).
  blockedStatus?: 403 | 404
  call: Call
  /** The tables this handler writes; their stored rows are the evidence. */
  touches: string[]
  /** Seed adjustment so the allowed write has something to change. */
  prep?: (db: InstanceType<typeof Database>) => void
  /** The handler lands through /api/mutations' applyMutation: an allowed call
   *  must leave exactly one processed_mutations receipt for the target row. */
  receipt?: 'tasks' | 'projects'
  /** The specific stored effect of an allowed call, read off the target row. */
  landed?: (db: InstanceType<typeof Database>, r: Ref) => void
}

const taskRow = (db: InstanceType<typeof Database>, r: Ref) =>
  db.prepare('SELECT * FROM tasks WHERE id = ?').get(r.task) as Record<string, unknown>
const projectRow = (db: InstanceType<typeof Database>, r: Ref) =>
  db.prepare('SELECT * FROM projects WHERE id = ?').get(r.id) as Record<string, unknown> | undefined

function snapshot(db: InstanceType<typeof Database>, tables: string[]): string {
  return JSON.stringify(tables.map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()))
}
const receiptCount = (db: InstanceType<typeof Database>) =>
  (db.prepare('SELECT COUNT(*) AS n FROM processed_mutations').get() as { n: number }).n

const patternWriteCases: PatternWriteCase[] = [
  // Project subresource writes
  {
    label: 'POST /api/projects/:slug/comments (handleAddComment)',
    touches: ['activity_entries'],
    call: (c, r, env) => handleAddComment(r.slug, c.post({ content: 'hi' }), c.user, env),
  },
  {
    label: 'POST /api/projects/:slug/updates (handlePostProjectUpdate)',
    touches: ['activity_entries'],
    call: (c, r, env) => handlePostProjectUpdate(r.slug, c.post({ content: 'hi' }), c.user, env),
  },
  {
    label: 'POST /api/projects/:slug/documents (handleCreateProjectDocument)',
    touches: ['project_documents'],
    call: (c, r, env) => handleCreateProjectDocument(r.slug, c.post({ title: 'T', url: 'https://x' }), c.user, env),
  },
  {
    label: 'POST /api/projects/:slug/documents/:docId/delete (handleDeleteProjectDocument)',
    touches: ['project_documents'],
    call: (c, r, env) => handleDeleteProjectDocument(r.doc, c.post({}), env),
  },
  // Task subresource writes
  {
    label: 'POST /api/tasks/:id/comments (handleAddTaskComment)',
    touches: ['activity_entries'],
    call: (c, r, env) => handleAddTaskComment(r.task, c.post({ content: 'hi' }), c.user, env),
  },
  {
    label: 'POST /api/tasks/:id/updates (handlePostTaskUpdate)',
    touches: ['activity_entries'],
    call: (c, r, env) => handlePostTaskUpdate(r.task, c.post({ content: 'hi' }), c.user, env),
  },
  // T1.1 (2026-05-28): the 4 mutation handlers that were previously unguarded
  // — non-PI could mutate a PB-task's status/fields/lifecycle even though the
  // GETs for the same task were 403-ed. handleUpdateTaskStatus, handleUpdateTask,
  // handleDeleteTask, handleAcknowledgeTask now call guardTaskProject (or its
  // inline equivalent) FIRST. The PI/API-key success path traverses
  // applyMutation on the real schema (seq trigger, completion-triad guard,
  // NOT NULL receipt), and the stored task row is what proves it landed.
  {
    label: 'POST /api/tasks/:id/status (handleUpdateTaskStatus) — T1.1 mutation gate',
    touches: ['tasks'],
    receipt: 'tasks',
    landed: (db, r) => expect(taskRow(db, r).status).toBe('in_progress'),
    call: (c, r, env) => handleUpdateTaskStatus(r.task, c.post({ status: 'in_progress' }), c.user, env),
  },
  {
    label: 'POST /api/tasks/:id (handleUpdateTask) — T1.1 mutation gate',
    touches: ['tasks'],
    receipt: 'tasks',
    landed: (db, r) => expect(taskRow(db, r).title).toBe('edited'),
    call: (c, r, env) => handleUpdateTask(r.task, c.post({ title: 'edited' }), c.user, env),
  },
  {
    label: 'POST /api/tasks/:id/delete (handleDeleteTask) — T1.1 mutation gate',
    touches: ['tasks'],
    receipt: 'tasks',
    landed: (db, r) => expect(taskRow(db, r).deleted_at).not.toBeNull(),
    call: (c, r, env) => handleDeleteTask(r.task, c.post({}), c.user, env),
  },
  {
    // handleRestoreTask (2026-07-21) — the undelete counterpart to
    // :id/delete. Like handleDeleteTask it CANNOT use guardTaskProject (whose
    // `deleted_at IS NULL` filter 404s the very rows it targets), so it inlines
    // the same probe + assertProjectVisible pair. Inlined gates are exactly the
    // ones that rot, which is why it earns a row here.
    label: 'POST /api/tasks/:id/restore (handleRestoreTask) — T1.1 mutation gate',
    touches: ['tasks'],
    // A restore needs a soft-deleted row to restore.
    prep: (db) => db.prepare("UPDATE tasks SET status = 'deleted', deleted_at = '2026-09-01 00:00:00'").run(),
    receipt: 'tasks',
    landed: (db, r) => expect(taskRow(db, r).deleted_at).toBeNull(),
    call: (c, r, env) => handleRestoreTask(r.task, c.post({}), c.user, env),
  },
  {
    label: 'POST /api/tasks/:id/acknowledge (handleAcknowledgeTask) — T1.1 mutation gate',
    touches: ['tasks'],
    receipt: 'tasks',
    landed: (db, r) => expect(taskRow(db, r).acknowledged_at).not.toBeNull(),
    call: (c, r, env) => handleAcknowledgeTask(r.task, c.post({}), c.user, env),
  },
  // Project direct writes (T3.1 — F04 security fix, 2026-05-28)
  // handleUpdateProject and handleDeleteProject previously had no PI gate.
  // They now call assertProjectVisible / canSeePbProjectRow on the existing row.
  {
    label: 'POST /api/projects/:slug (handleUpdateProject) — T3.1 PI gate',
    touches: ['projects'],
    // Seeded 'blocked' so the {status:'active'} patch is a real change.
    prep: (db) => db.prepare("UPDATE projects SET status = 'blocked'").run(),
    receipt: 'projects',
    landed: (db, r) => expect(projectRow(db, r)?.status).toBe('active'),
    call: (c, r, env) => handleUpdateProject(r.slug, c.post({ status: 'active' }), c.user, env),
  },
  {
    label: 'POST /api/projects/:slug/delete (handleDeleteProject) — T3.1 PI gate',
    touches: ['projects'],
    receipt: 'projects',
    // A soft delete: the row stays, stamped.
    landed: (db, r) => expect(projectRow(db, r)!.deleted_at).toEqual(expect.any(String)),
    call: (c, r, env) => handleDeleteProject(r.slug, c.user, env, c.post({})),
  },
  // Lifecycle CRUD — submissions
  {
    label: 'POST /api/submissions (handleCreateSubmission)',
    touches: ['submission_events'],
    call: (c, r, env) => handleCreateSubmission(c.post({ project_id: r.slug, event_type: 'submitted', event_date: '2026-05-27' }), c.user, env),
  },
  {
    // withExistingRowProject: both "row missing" and "row hidden" return hiddenResource() 404.
    label: 'POST /api/submissions/:id (handleUpdateSubmission)',
    blockedStatus: 404,
    touches: ['submission_events'],
    call: (c, r, env) => handleUpdateSubmission(r.sub, c.post({ notes: 'x' }), c.user, env),
  },
  {
    label: 'POST /api/submissions/:id/delete (handleDeleteSubmission)',
    touches: ['submission_events'],
    call: (c, r, env) => handleDeleteSubmission(r.sub, c.post({}), c.user, env),
  },
  // Lifecycle CRUD — conferences (create + delete + update)
  // handleUpdateConference moved from Pattern A (codex final-audit #2, 2026-05-28):
  // it uses withExistingRowProject → hidden rows return hiddenResource() 404, not 403.
  {
    label: 'POST /api/conferences/:id (handleUpdateConference)',
    blockedStatus: 404,
    touches: ['conference_submissions'],
    call: (c, r, env) => handleUpdateConference(r.conf, c.post({ notes: 'x' }), c.user, env),
  },
  {
    label: 'POST /api/conferences (handleCreateConference)',
    touches: ['conference_submissions'],
    call: (c, r, env) => handleCreateConference(c.post({ project_id: r.slug, conference: 'C', submission_type: 'abstract', title: 'T' }), c.user, env),
  },
  {
    label: 'POST /api/conferences/:id/delete (handleDeleteConference)',
    touches: ['conference_submissions'],
    call: (c, r, env) => handleDeleteConference(r.conf, c.post({}), c.user, env),
  },
  // Lifecycle CRUD — regulatory
  {
    label: 'POST /api/regulatory (handleCreateRegulatoryItem)',
    touches: ['regulatory_items'],
    call: (c, r, env) => handleCreateRegulatoryItem(c.post({ project_id: r.slug, item_type: 'irb', title: 'T' }), c.user, env),
  },
  {
    // withExistingRowProject: both "row missing" and "row hidden" return hiddenResource() 404.
    label: 'POST /api/regulatory/:id (handleUpdateRegulatoryItem)',
    blockedStatus: 404,
    touches: ['regulatory_items'],
    call: (c, r, env) => handleUpdateRegulatoryItem(r.reg, c.post({ notes: 'x' }), c.user, env),
  },
  // Lifecycle CRUD — revisions
  {
    label: 'POST /api/revisions (handleCreateRevision)',
    touches: ['manuscript_revisions'],
    call: (c, r, env) => handleCreateRevision(c.post({ project_id: r.slug }), c.user, env),
  },
  {
    // withExistingRowProject: both "row missing" and "row hidden" return hiddenResource() 404.
    label: 'POST /api/revisions/:id (handleUpdateRevision)',
    blockedStatus: 404,
    touches: ['manuscript_revisions'],
    call: (c, r, env) => handleUpdateRevision(r.rev, c.post({ notes: 'x' }), c.user, env),
  },
  {
    label: 'POST /api/revisions/:id/comments (handleCreateRevisionComment)',
    touches: ['reviewer_comments'],
    call: (c, r, env) => handleCreateRevisionComment(r.rev, c.post({ comment_text: 'x' }), c.user, env),
  },
  {
    label: 'POST /api/revisions/comments/:id (handleUpdateRevisionComment)',
    touches: ['reviewer_comments'],
    call: (c, r, env) => handleUpdateRevisionComment(r.rcomm, c.post({ response_text: 'x' }), c.user, env),
  },
]

/** The allowed-branch evidence: the store changed, the case's own effect is
 *  on the target row, and a mutation-pipeline write left its receipt. */
async function expectLanded(tc: PatternWriteCase, r: Ref, w: Awaited<ReturnType<typeof runWrite>>) {
  expect(w.after, 'an allowed write must land in the store').not.toBe(w.before)
  tc.landed?.(w.db, r)
  if (tc.receipt) {
    expect(w.receiptsAfter - w.receiptsBefore, 'one processed_mutations receipt per landed mutation').toBe(1)
    const rec = w.db.prepare(
      'SELECT outcome, original_response_json, table_name, record_id FROM processed_mutations',
    ).get() as { outcome: string; original_response_json: string; table_name: string; record_id: string }
    expect(rec.outcome).toMatch(/^(accepted|merged_clean)$/)
    expect(rec.table_name).toBe(tc.receipt)
    expect(rec.record_id).toBe(tc.receipt === 'tasks' ? r.task : r.id)
    expect(JSON.parse(rec.original_response_json)).toBeTruthy()
  }
}

async function runWrite(tc: PatternWriteCase, c: Caller, r: Ref) {
  const { db, env } = world(tc.prep)
  const before = snapshot(db, tc.touches)
  const receiptsBefore = receiptCount(db)
  const res = await tc.call(c, r, env)
  return { res, db, before, after: snapshot(db, tc.touches), receiptsBefore, receiptsAfter: receiptCount(db) }
}

describe('PB-visibility contract — Pattern W (write-side gates)', () => {
  for (const tc of patternWriteCases) {
    const expectedBlock = tc.blockedStatus ?? 403
    describe(tc.label, () => {
      // Denial branch: refused, and nothing it would have written exists.
      it(`non-PI caller is blocked (${expectedBlock}) on a PB-parent`, async () => {
        const w = await runWrite(tc, NON_PI, PB)
        expect(w.res.status, `Expected ${expectedBlock} for non-PI on PB parent`).toBe(expectedBlock)
        expect(await w.res.text()).not.toContain(PB_MARK)
        expect(w.after, 'a refused write must leave the store untouched').toBe(w.before)
        expect(w.receiptsAfter, 'a refused write must leave no processed_mutations receipt').toBe(w.receiptsBefore)
      })

      // Allowed branches: 2xx AND the write is in the stored rows.
      it('non-PI caller is allowed (2xx) on a non-PB parent', async () => {
        const w = await runWrite(tc, NON_PI, TEAM)
        expect(w.res.status >= 200 && w.res.status < 300, `Expected 2xx for non-PI on non-PB parent, got ${w.res.status}: ${await w.res.clone().text()}`).toBe(true)
        await expectLanded(tc, TEAM, w)
      })

      it('PI caller is allowed (2xx) on a PB parent', async () => {
        const w = await runWrite(tc, PI, PB)
        expect(w.res.status >= 200 && w.res.status < 300, `Expected 2xx for PI on PB parent, got ${w.res.status}: ${await w.res.clone().text()}`).toBe(true)
        await expectLanded(tc, PB, w)
      })

      it('API-key caller is allowed (2xx) on a PB parent', async () => {
        const w = await runWrite(tc, API_KEY, PB)
        expect(w.res.status >= 200 && w.res.status < 300, `Expected 2xx for API-key on PB parent, got ${w.res.status}: ${await w.res.clone().text()}`).toBe(true)
        await expectLanded(tc, PB, w)
      })
    })
  }
})

// ── Pattern B: canSeePb filter routes (body-content assertions) ────────────────
//
// Codex final review insisted on inspecting the result BODY, not the status.
// The old stub returned its canned rows verbatim from every .all(), so it could
// only check the response shape and "trust the integration test" for the
// filter itself. On the migration-chain database the handler's own SQL runs:
// both projects carry rows every feed reaches, and the non-PI body must carry
// the team rows (TEAMVISIBLE, so an empty feed cannot pass vacuously) and none
// of the PB rows (PBSECRET); the PI body carries both.

interface PatternBCase {
  label: string
  // Non-PI invocation; expected to see ZERO PB rows in body.
  callNonPi: (env: Env) => Promise<Response>
  // PI invocation; expected to see body returned (200), PB rows included.
  callPi: (env: Env) => Promise<Response>
  /** Extra seed rows this feed needs beyond the shared world. */
  prep?: (db: InstanceType<typeof Database>) => void
}

const patternBCases: PatternBCase[] = [
  {
    label: 'GET /api/updates/recent — filtered for non-PI',
    callNonPi: (env) => handleRecentUpdates(new URL('https://x/api/updates/recent'), env, false),
    callPi:    (env) => handleRecentUpdates(new URL('https://x/api/updates/recent'), env, true),
  },
  {
    label: 'GET /api/task-updates/recent — filtered for non-PI',
    callNonPi: (env) => handleGetRecentTaskUpdates(new URL('https://x/api/task-updates/recent'), env, false),
    callPi:    (env) => handleGetRecentTaskUpdates(new URL('https://x/api/task-updates/recent'), env, true),
  },
  // Fix 2a: GET /api/tasks (list) is now gated by canSeePb flag (was unguarded)
  {
    label: 'GET /api/tasks (list, handleGetTasks) — Fix 2a: PB-project tasks filtered for non-PI',
    callNonPi: (env) => handleGetTasks(new URL('https://x/api/tasks'), env, false),
    callPi:    (env) => handleGetTasks(new URL('https://x/api/tasks'), env, true),
  },
  {
    label: 'GET /api/conferences (cross-project) — filtered for non-PI',
    callNonPi: (env) => handleGetConferences(new URL('https://x/api/conferences'), nonPiRequest(), env, false),
    callPi:    (env) => handleGetConferences(new URL('https://x/api/conferences'), piRequest(), env, true),
  },
  {
    label: 'GET /api/conferences/upcoming — filtered for non-PI',
    callNonPi: (env) => handleGetUpcomingConferences(env, false),
    callPi:    (env) => handleGetUpcomingConferences(env, true),
  },
  {
    label: 'GET /api/regulatory (cross-project) — filtered for non-PI',
    callNonPi: (env) => handleGetRegulatoryItems(new URL('https://x/api/regulatory'), nonPiRequest(), env, false),
    callPi:    (env) => handleGetRegulatoryItems(new URL('https://x/api/regulatory'), piRequest(), env, true),
  },
  {
    label: 'GET /api/regulatory/expiring — filtered for non-PI',
    callNonPi: (env) => handleGetExpiringItems(new URL('https://x/api/regulatory/expiring'), env, false),
    callPi:    (env) => handleGetExpiringItems(new URL('https://x/api/regulatory/expiring'), env, true),
  },
  {
    label: 'GET /api/deadline-cascade/all — filtered for non-PI',
    callNonPi: (env) => handleGetAllCascades(env, false),
    callPi:    (env) => handleGetAllCascades(env, true),
  },
  // #8842 R6. The filter is also exercised in meetings.pb-visibility.test.ts.
  {
    label: 'GET /api/meetings/:id (action_items) — filtered for non-PI',
    callNonPi: (env) => handleGetMeeting('mtg-id', env, false),
    callPi:    (env) => handleGetMeeting('mtg-id', env, true),
  },
  {
    label: 'GET /api/calendar/events (task deadlines) — filtered for non-PI',
    callNonPi: (env) => handleCalendarEvents(new URL('https://x/api/calendar/events'), env, 'nate-mesfin', false),
    callPi:    (env) => handleCalendarEvents(new URL('https://x/api/calendar/events'), env, 'nate-mesfin', true),
  },
]

describe('PB-visibility contract — Pattern B (cross-project feed filters; body-content)', () => {
  for (const tc of patternBCases) {
    describe(tc.label, () => {
      it('non-PI caller gets 200 and body excludes Peripheral Brain rows', async () => {
        // #145 Lane B: the PB rule lives in the viewer-bound handle, not in the
        // handler. Nate is put on BOTH projects (an accidental add to the PB
        // one) and on the meeting, and reads through his own handle, as the
        // request middleware gives him: the PB rows must still not reach him.
        const w = world(tc.prep)
        // (the assignment trigger already put him on TEAM; PB it skips)
        for (const p of [PB.id, TEAM.id]) {
          w.db.prepare("INSERT OR IGNORE INTO project_members (project_id, member_slug, added_by) VALUES (?, 'nate-mesfin', 'test')").run(p)
        }
        w.db.prepare(`UPDATE meetings SET attendees = '["nate-mesfin"]' WHERE id = 'mtg-id'`).run()
        const env = { ...w.env, DB: viewerDb(w.env.DB, personViewer({ slug: 'nate-mesfin', email: NON_PI_EMAIL, pi: false })) } as Env
        const res = await tc.callNonPi(env)
        expect(res.status).toBe(200)
        const body = await res.text()
        expect(body, 'the feed must return the team rows (a vacuous empty body proves nothing)').toContain(TEAM_MARK)
        expect(body, 'a non-PI feed must carry no Peripheral Brain row').not.toContain(PB_MARK)
      })

      it('PI caller gets 200', async () => {
        const res = await tc.callPi(world(tc.prep).env)
        expect(res.status).toBe(200)
        const body = await res.text()
        expect(body, 'the PI feed carries the PB rows the non-PI feed drops').toContain(PB_MARK)
        expect(body).toContain(TEAM_MARK)
      })
    })
  }
})

// ── Registry size / drift guard ────────────────────────────────────────────────
//
// If a developer adds a new gated route, they must add a row here. This guard
// fails fast when the registry shrinks (someone deleted coverage) — it does
// not fail-fast on growth (adding new coverage is the encouraged path).
//
// Z1.4 (2026-05-28): the per-route four-caller matrix above is PARTIALLY
// auto-covered by route-contract.generated.test.ts (handler-shape + entity
// presence + auth-level validity, generated from ROUTE_REGISTRY). This file
// still owns the BEHAVIOR matrix (non-PI on PB, etc.) because each case
// names its handler call. The size-guard below still catches "someone
// deleted coverage" for the manually-enumerated cases.

describe('PB-visibility contract — registry drift guard', () => {
  it('Pattern A registry has at least the expected number of cases', () => {
    // 12 originals + 3 Phase 1b-extended + 1 Fix 2b (handleGetTask) = 16
    // -1: handleGetRevisionComments moved to P8 oracle section (P8 2026-05-28;
    //     now returns 404 not 403, so it can't use the shared 403-asserting loop)
    // -1: handleUpdateConference moved to Pattern W with blockedStatus:404 (codex #2,
    //     2026-05-28; uses withExistingRowProject so hidden row → 404 not 403)
    expect(patternACases.length).toBeGreaterThanOrEqual(13) // -1: GET /api/tasks/:id/updates deleted 2026-10-09
  })

  it('Pattern W (writes) registry has at least the expected number of cases', () => {
    // Phase 1b-extended: 2 project subresource + 2 doc CRUD + 2 task sub
    // + 3 submissions + 2 conferences (create+delete) + 3 regulatory
    // + 4 revisions = 18; T1.1 adds 4 task-mutation gates = 22;
    // +1 handleUpdateConference moved from Pattern A (codex #2, 2026-05-28) = 23;
    // +1 handleUpdateRevision (withExistingRowProject, blockedStatus:404) already in W = no change
    // Net: handleUpdateRevision, handleUpdateSubmission, handleUpdateRegulatoryItem,
    // handleUpdateConference all carry blockedStatus:404; count stays >= 22 (was 22, now 23)
    expect(patternWriteCases.length).toBeGreaterThanOrEqual(23)
  })

  it('Pattern B (feeds) registry has at least the expected number of cases', () => {
    // 3 originals + 5 new cross-project feeds + 1 Fix 2a (handleGetTasks list) = 9
    // + #8842 R6 meeting detail + calendar events = 11
    expect(patternBCases.length).toBeGreaterThanOrEqual(10) // -1: GET /api/revisions/active deleted 2026-10-09
  })
})

// ── T1.2: revision-comments existence oracle ──────────────────────────────────
//
// Pre-fix: handleGetRevisionComments returned 200/[] on unknown revisionId,
// while known PB revisions returned 403 — the asymmetry let an attacker probe
// revision IDs. Both PI and non-PI must now get 404 for unknown ids.

describe('T1.2 — handleGetRevisionComments existence oracle (unknown revision → 404 for all)', () => {
  // 'unknown-rev' is simply absent from the seeded world (an unknown /
  // typo-hunt revisionId); the old file built a stub that returned null.

  it('non-PI caller on unknown revisionId → 404 (was 200/[] pre-fix)', async () => {
    const res = await handleGetRevisionComments('unknown-rev', nonPiRequest(), world().env)
    expect(res.status).toBe(404)
  })

  it('PI caller on unknown revisionId → 404 (was 200/[] pre-fix)', async () => {
    const res = await handleGetRevisionComments('unknown-rev', piRequest(), world().env)
    expect(res.status).toBe(404)
  })

  it('API-key caller on unknown revisionId → 404', async () => {
    const res = await handleGetRevisionComments('unknown-rev', apiKeyRequest(), world().env)
    expect(res.status).toBe(404)
  })
})

// ── P8: handleGetRevisionComments oracle-closed ──────────────────────────────
//
// P8 (2026-05-28): the 404/403 differential in handleGetRevisionComments was
// the second half of the existence oracle. T1.2 (above) closed the
// "unknown revision → 200" half. P8 closes the "known revision, PB-hidden →
// 403" half by routing both cases through hiddenResource() (status 404).
//
// Both the "no such revision" case (T1.2, tested above) and the "revision
// exists but caller can't see its project" case (P8, tested here) must return
// 404 with an identical body so no oracle discrimination is possible.
//
// PI callers and API-key callers on PB-category revisions must still get 200.
// Non-PI callers on non-PB projects must still get 200.

describe('P8 — handleGetRevisionComments oracle-closed (hidden revision → 404 not 403)', () => {
  it('non-PI caller on PB-category revision → 404 (not 403)', async () => {
    const res = await handleGetRevisionComments(PB.rev, nonPiRequest(), world().env)
    expect(res.status).toBe(404)
    // The uniform envelope: byte-identical to the unknown-revision 404.
    const unknown = await handleGetRevisionComments('unknown-rev', nonPiRequest(), world().env)
    expect(await res.text()).toBe(await unknown.text())
  })

  it('non-PI caller on non-PB revision → 200', async () => {
    const res = await handleGetRevisionComments(TEAM.rev, nonPiRequest(), world().env)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain(TEAM_MARK)
  })

  it('PI caller on PB-category revision → 200 (PI can still read)', async () => {
    const res = await handleGetRevisionComments(PB.rev, piRequest(), world().env)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain(PB_MARK)
  })

  it('API-key caller on PB-category revision → 200 (API-key can still read)', async () => {
    const res = await handleGetRevisionComments(PB.rev, apiKeyRequest(), world().env)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain(PB_MARK)
  })
})

// ── Fix 1: soft-deleted project — PI pass-through, non-PI fail-closed ─────────
//
// Before Fix 1, canSeePbProject filtered with `deleted_at IS NULL`. A soft-deleted
// PB project returned proj=null → fail-closed for EVERYONE including PI. Fix 1
// drops the filter so deleted rows are readable (category doesn't change on
// soft-delete) and changes unknown-ref handling so PI/API-key pass through while
// non-PI remain fail-closed.
//
// The ref 'soft-deleted-pb-proj' resolves to no project row in the seeded world
// (the old code's view of a soft-deleted row). A second block soft-deletes the
// real PB project and pins that its category still gates non-PI.

describe('Fix 1 — canSeePbProject: soft-deleted/unknown project — PI pass-through, non-PI fail-closed', () => {
  it('PI caller on soft-deleted/unknown PB project → pass (true); route can return its own 404', async () => {
    // PI should not get a spurious 403 for soft-deleted projects (Fix 1 regression).
    const { canSeePbProject } = await import('../helpers')
    const result = await canSeePbProject(piRequest(), world().env, 'soft-deleted-pb-proj')
    expect(result).toBe(true)
  })

  it('API-key caller on soft-deleted/unknown PB project → pass (true)', async () => {
    const { canSeePbProject } = await import('../helpers')
    const result = await canSeePbProject(apiKeyRequest(), world().env, 'soft-deleted-pb-proj')
    expect(result).toBe(true)
  })

  it('non-PI caller on soft-deleted/unknown project → fail-closed (false)', async () => {
    // Non-PI must still be blocked on unknown refs — the ref could be a PB project.
    const { canSeePbProject } = await import('../helpers')
    const result = await canSeePbProject(nonPiRequest(), world().env, 'soft-deleted-pb-proj')
    expect(result).toBe(false)
  })

  it('a soft-deleted PB project still reads as PB: PI true, non-PI false', async () => {
    const { canSeePbProject } = await import('../helpers')
    const softDeleted = () => world((db) => db.prepare("UPDATE projects SET deleted_at = '2026-09-01 00:00:00' WHERE id = ?").run(PB.id)).env
    expect(await canSeePbProject(piRequest(), softDeleted(), PB.slug)).toBe(true)
    expect(await canSeePbProject(nonPiRequest(), softDeleted(), PB.slug)).toBe(false)
  })
})
