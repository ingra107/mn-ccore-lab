/**
 * phase4-correctness.test.ts — Phase 4 correctness-bug regression guard
 *
 * Covers:
 *   Fix 1: Hermes @mention in project comments passes project.id (UUID) not slug
 *   Fix 1b: Hermes @mention in task comments creates ai_request + placeholder
 *   Fix 2: Upsert-on-miss (handleUpdateProject) runs PROJECT_ENUM_GUARDS → 400 on bad stage/status/category
 *   Fix 3: handleDeleteProject idempotency check BEFORE cascade (retry doesn't re-NULL tasks)
 *   Fix 3b: handleDeleteTask idempotency check BEFORE cascade
 *   Fix 4: handleUpdateProject non-accepted mutation returns HTTP 409 (not 200)
 *   Fix 5: regulatory VALID_STATUSES includes action_needed + expiring_soon
 *   Fix 6: project-ref resolver in submissions, conferences, regulatory, revisions, deadline-cascade
 *   Fix 7: /api/mutations applyInsert resolves tasks.project_id slug → canonical
 *
 * #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts)
 * with the REAL applyMutation. The first cut mocked the whole mutations module
 * and answered each SELECT from a regex over its SQL, so every "stored X"
 * claim was a claim about bind positions, and Fix 7 could not reach the real
 * applyInsert at all (it tested the resolver helper instead). Here each case
 * reads the stored rows, every refusal is checked to have written nothing, and
 * Fix 7 drives applyInsert.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { AuthUser, Env } from '../helpers';
import { _resetValidationFlagsCache } from '../helpers';
import { applyInsert } from './mutations';
import { handleUpdateProject, handleAddComment, handleDeleteProject } from './projects';
import { handleAddTaskComment, handleDeleteTask } from './tasks';
import { handleCreateRegulatoryItem, handleUpdateRegulatoryItem } from './regulatory';
import { handleCreateSubmission } from './submissions';
import { handleCreateConference } from './conferences';
import { handleCreateRevision } from './revisions';
import { handleGetCascade } from './deadline-cascade';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';

// ── Shared helpers ─────────────────────────────────────────────────────────────

const NICK: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' };

// Phase 1b-extended: write-path handlers run assertProjectVisible / isPiRequest,
// both of which need a real auth signal on the Request. Use the same TEST_MODE_KEY
// pattern as pb-visibility-contract.test.ts — caller is PI by default so these
// correctness tests aren't blocked by the ACL gates.
const TEST_MODE_KEY = 'local-test-key-do-not-use-in-prod';

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Mode-Key': TEST_MODE_KEY,
      'X-Test-User': NICK.email,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function makeUrl(params: Record<string, string> = {}): URL {
  const u = new URL('https://example.com/api/test');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}

const PROJ_ID = 'proj_01hwtestphase4000000000001';
const PROJ_SLUG = 'my-project';

let db: InstanceType<typeof Database>;
let env: Env;
beforeEach(() => {
  _resetValidationFlagsCache();
  db = prodSchemaDb();
  env = { DB: d1Adapter(db), TEST_MODE_KEY, PB_API_KEY: 'valid-test-api-key' } as unknown as Env;
  insertRow(db, 'team_members', { id: 'member_001', name: 'Nick Ingraham', slug: 'nick-ingraham', email: NICK.email });
  insertRow(db, 'projects', { id: PROJ_ID, slug: PROJ_SLUG, title: 'My Project', category: 'MNCCORE' });
});

const rows = (sql: string, ...v: unknown[]) => db.prepare(sql).all(...v) as Record<string, unknown>[];
const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

// ── Fix 1: Hermes project-comment passes project.id not URL slug ─────────────

describe('Fix 1 — handleAddComment: @hermes uses project.id (UUID), not URL slug', () => {
  it('inserts ai_request and placeholder comment bound to project.id (UUID)', async () => {
    // Pass URL slug (not UUID) as projectId — the fix resolves to project.id
    const res = await handleAddComment(PROJ_SLUG, makeRequest({ content: '@hermes what is the status of this project?' }), NICK, env);
    expect(res.status).toBe(201);

    const ai = rows('SELECT source_type, project_slug FROM ai_requests');
    expect(ai).toHaveLength(1);
    // ai_requests.project_slug holds project.id, NOT the URL param 'my-project'.
    expect(ai[0].project_slug).toBe(PROJ_ID);

    // P2-A retarget: the placeholder is an activity_entries row (not a legacy
    // comments row), on project.id.
    const placeholders = rows("SELECT entity_type, entity_id, actor_slug FROM activity_entries WHERE body LIKE '%Thinking about%'");
    expect(placeholders).toEqual([{ entity_type: 'project', entity_id: PROJ_ID, actor_slug: 'claude-ai' }]);
    // The triggering comment itself also landed on project.id.
    expect(rows("SELECT entity_id FROM activity_entries WHERE body LIKE '@hermes what is%'")).toEqual([{ entity_id: PROJ_ID }]);
  });

  it('does not create ai_request when no @hermes mention', async () => {
    const res = await handleAddComment(PROJ_SLUG, makeRequest({ content: 'Great work everyone!' }), NICK, env);
    expect(res.status).toBe(201); // the write itself succeeds via postActivityEntry
    expect(count('ai_requests')).toBe(0);
    expect(rows("SELECT entity_id FROM activity_entries WHERE body = 'Great work everyone!'")).toEqual([{ entity_id: PROJ_ID }]);
  });
});

// ── Fix 1b: Hermes in task comments creates ai_request + placeholder ──────────

describe('Fix 1b — handleAddTaskComment: @hermes creates ai_request + placeholder', () => {
  beforeEach(() => {
    insertRow(db, 'tasks', { id: 'task-001', title: 'Task one', status: 'todo', priority: 'medium', assignee: 'nick-ingraham', project_id: PROJ_ID });
  });

  it('creates ai_request with source_type=task_comment and placeholder comment', async () => {
    const res = await handleAddTaskComment(
      'task-001',
      makeRequest({ content: '@hermes can you summarize the task context?' }, { 'X-Auth-Email': 'ingra107@umn.edu' }),
      NICK, env,
    );
    expect(res.status).toBe(201);

    // source_type 'task_comment' is preserved through postActivityEntry's
    // Hermes dispatch so the listener routes the answer back.
    expect(rows('SELECT source_type FROM ai_requests')).toEqual([{ source_type: 'task_comment' }]);

    // Design C (v77): the placeholder is an activity_entries row
    // (kind='comment', actor_slug='claude-ai') with body 'Thinking about...'.
    const placeholders = rows("SELECT entity_type, entity_id, kind, actor_slug FROM activity_entries WHERE body LIKE '%Thinking about%'");
    expect(placeholders).toEqual([{ entity_type: 'task', entity_id: 'task-001', kind: 'comment', actor_slug: 'claude-ai' }]);
  });

  it('does not create ai_request when content has no @hermes mention', async () => {
    const res = await handleAddTaskComment('task-001', makeRequest({ content: 'Just a regular comment, no AI mention.' }), NICK, env);
    expect(res.status).toBe(201);
    expect(count('ai_requests')).toBe(0);
    expect(rows("SELECT 1 FROM activity_entries WHERE body LIKE '%Thinking about%'")).toEqual([]);
  });
});

// ── Fix 2: Upsert-on-miss enum guards ─────────────────────────────────────────

describe('Fix 2 — handleUpdateProject upsert-on-miss enum guards', () => {
  const projectCount = () => count('projects');

  it.each([
    ['stage', { status: 'active', stage: 'not_a_real_stage', category: 'MNCCORE' }, /Invalid stage/i],
    ['status', { status: 'flying', stage: 'idea', category: 'MNCCORE' }, /Invalid status/i],
    ['category', { status: 'active', stage: 'idea', category: 'lab' }, /Invalid category/i],
  ])('returns 400 for invalid %s on upsert-on-miss branch, and creates nothing', async (_f, fields, msg) => {
    const before = projectCount();
    const res = await handleUpdateProject('new-project-id', makeRequest({ title: 'New Project', ...fields }), NICK, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(msg);
    expect(projectCount()).toBe(before);
  });

  it('accepts canonical values and inserts the project on upsert-on-miss branch', async () => {
    const res = await handleUpdateProject('new-project-id', makeRequest({ title: 'New Project', status: 'active', stage: 'idea', category: 'MNCCORE' }), NICK, env);
    expect(res.status).toBe(200);
    const stored = rows("SELECT id, status, stage, category FROM projects WHERE slug = 'new-project-id'");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ status: 'active', stage: 'idea', category: 'MNCCORE' });
    expect(rows('SELECT outcome FROM processed_mutations WHERE record_id = ?', stored[0].id)).toEqual([{ outcome: 'accepted' }]);
  });
});

// ── Fix 3: handleDeleteProject — idempotency BEFORE cascade ──────────────────

describe('Fix 3 — handleDeleteProject: idempotency check runs BEFORE cascade', () => {
  it('does NOT run the cascade when project is already soft-deleted (idempotent retry)', async () => {
    db.prepare("UPDATE projects SET deleted_at = '2026-05-01T00:00:00Z' WHERE id = ?").run(PROJ_ID);
    // A task re-associated after the first delete: a cascade on retry would NULL it.
    insertRow(db, 'tasks', { id: 'task_reassoc', title: 'Reassociated', status: 'todo', priority: 'medium', assignee: 'nick-ingraham', project_id: PROJ_ID });
    let batches = 0;
    env = { ...env, DB: d1Adapter(db, { beforeBatch: () => { batches++; } }) } as Env;

    const res = await handleDeleteProject(PROJ_ID, NICK, env, makeRequest({}));
    const body = await res.json() as { data: { idempotent: boolean } };
    expect(res.status).toBe(200);
    expect(body.data.idempotent).toBe(true);
    expect(batches).toBe(0);
    expect(rows("SELECT project_id FROM tasks WHERE id = 'task_reassoc'")).toEqual([{ project_id: PROJ_ID }]);
  });
});

// ── Fix 3b: handleDeleteTask — idempotency BEFORE cascade ────────────────────

describe('Fix 3b — handleDeleteTask: idempotency check runs BEFORE cascade', () => {
  it('does NOT delete child rows when task already has deleted_at', async () => {
    insertRow(db, 'tasks', { id: 'task_Z', title: 'Done task', status: 'deleted', priority: 'medium', assignee: 'nick-ingraham', deleted_at: '2026-05-01T00:00:00Z' });
    insertRow(db, 'activity_entries', { id: 'ae_z1', entity_type: 'task', entity_id: 'task_Z', kind: 'comment', actor_slug: 'nick-ingraham', body: 'history' });
    const before = count('activity_entries');

    const req = new Request('https://x/api/tasks/task_Z/delete', {
      method: 'POST',
      headers: { 'X-Test-Mode-Key': TEST_MODE_KEY, 'X-Test-User': NICK.email },
    });
    const res = await handleDeleteTask('task_Z', req, NICK, env);
    const body = await res.json() as { data: { idempotent: boolean } };
    expect(res.status).toBe(200);
    expect(body.data.idempotent).toBe(true);
    // Child cascade DELETEs must not run: the task's history is still there.
    expect(rows("SELECT id FROM activity_entries WHERE entity_id = 'task_Z'")).toContainEqual({ id: 'ae_z1' });
    expect(count('activity_entries')).toBeGreaterThanOrEqual(before);
  });
});

// ── Fix 4: handleUpdateProject non-accepted mutation returns 409 ─────────────

describe('Fix 4 — handleUpdateProject: a refused mutation → HTTP 409', () => {
  it('returns 409 with the current row when the update does not land, and the row is unchanged', async () => {
    // Hub-UI writes are exempt from the conflict-hash refusal (mutations.ts
    // applyUpdate), so on the real path the non-accepted outcome this route
    // can see is a failed write. Fail the projects UPDATE in the engine.
    env = { ...env, DB: d1Adapter(db, { failSql: /^\s*UPDATE projects SET/i, failTimes: 100 }) } as Env;
    const res = await handleUpdateProject(PROJ_ID, makeRequest({ title: 'Updated Title', status: 'active', stage: 'idea', category: 'MNCCORE' }), NICK, env);
    expect(res.status).toBe(409);
    const body = await res.json() as { rejected: string; data: { id: string; title: string } };
    expect(body.rejected).not.toBe('accepted');
    expect(body.data).toMatchObject({ id: PROJ_ID, title: 'My Project' });
    expect(rows('SELECT title FROM projects WHERE id = ?', PROJ_ID)).toEqual([{ title: 'My Project' }]);
  });

  it('returns 200 on successful update and stores it (no regression)', async () => {
    const res = await handleUpdateProject(PROJ_ID, makeRequest({ title: 'Updated Title', status: 'active', stage: 'idea', category: 'MNCCORE' }), NICK, env);
    expect(res.status).toBe(200);
    expect(rows('SELECT title FROM projects WHERE id = ?', PROJ_ID)).toEqual([{ title: 'Updated Title' }]);
  });
});

// ── Fix 5: regulatory VALID_STATUSES enum alignment ──────────────────────────

describe('Fix 5 — regulatory: action_needed and expiring_soon accepted as valid status', () => {
  it.each([
    ['action_needed', 'irb', 'IRB Protocol v3'],
    ['expiring_soon', 'dua', 'DUA with hospital'],
  ])('accepts %s as a valid status on create, stored on the canonical project', async (status, itemType, title) => {
    const res = await handleCreateRegulatoryItem(makeRequest({ project_id: PROJ_SLUG, item_type: itemType, title, status }), NICK, env);
    expect(res.status).toBe(201);
    expect(rows('SELECT project_id, status, item_type FROM regulatory_items')).toEqual([{ project_id: PROJ_ID, status, item_type: itemType }]);
  });

  it('still rejects truly invalid status, and writes nothing', async () => {
    const res = await handleCreateRegulatoryItem(makeRequest({ project_id: PROJ_SLUG, item_type: 'irb', title: 'IRB Protocol', status: 'flying_blind' }), NICK, env);
    expect(res.status).toBe(400);
    expect(count('regulatory_items')).toBe(0);
  });

  it('accepts action_needed on update', async () => {
    insertRow(db, 'regulatory_items', { id: 'reg_1', project_id: PROJ_ID, item_type: 'irb', title: 'IRB Protocol', status: 'pending' });
    const res = await handleUpdateRegulatoryItem('reg_1', makeRequest({ status: 'action_needed' }), NICK, env);
    expect(res.status).toBe(200);
    expect(rows("SELECT status FROM regulatory_items WHERE id = 'reg_1'")).toEqual([{ status: 'action_needed' }]);
  });
});

// ── Fix 6: project-ref resolver in submissions, conferences, regulatory, revisions ──

describe('Fix 6 — project-ref resolver: slug resolves to canonical before INSERT', () => {
  it('submissions: stores canonical project_id (resolved), not raw slug', async () => {
    const res = await handleCreateSubmission(makeRequest({ project_id: PROJ_SLUG, event_type: 'submitted', event_date: '2026-06-01' }), NICK, env);
    expect(res.status).toBe(201);
    // P2: projectRefToCanonical returns proj.id (typed PK), not slug.
    expect(rows('SELECT project_id FROM submission_events')).toEqual([{ project_id: PROJ_ID }]);
  });

  it('submissions: returns 400 when project_id slug is unknown, and writes nothing', async () => {
    const res = await handleCreateSubmission(makeRequest({ project_id: 'nonexistent-project', event_type: 'submitted', event_date: '2026-06-01' }), NICK, env);
    expect(res.status).toBe(400);
    expect(count('submission_events')).toBe(0);
  });

  it('conferences: stores resolved project_id, not raw slug', async () => {
    const res = await handleCreateConference(makeRequest({
      project_id: PROJ_SLUG, conference: 'CHEST 2026', submission_type: 'oral', title: 'CLIF Data Presentation',
    }), NICK, env);
    expect(res.status).toBe(201);
    expect(rows('SELECT project_id FROM conference_submissions')).toEqual([{ project_id: PROJ_ID }]);
  });

  it('regulatory: returns 400 on unknown project, and writes nothing', async () => {
    const res = await handleCreateRegulatoryItem(makeRequest({ project_id: 'ghost-project', item_type: 'irb', title: 'IRB' }), NICK, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Unknown project/i);
    expect(count('regulatory_items')).toBe(0);
  });

  it('revisions: uses projectRefToCanonical and returns 400 on unknown project', async () => {
    const before = count('manuscript_revisions');
    const res = await handleCreateRevision(makeRequest({ project_id: 'missing-project' }), NICK, env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Unknown project/i);
    expect(count('manuscript_revisions')).toBe(before);
  });

  it('deadline-cascade: returns 400 when project_id resolves to unknown', async () => {
    const res = await handleGetCascade(makeUrl({ project_id: 'ghost-project' }), makeRequest({}), env);
    expect(res.status).toBe(400);
  });
});

// ── Fix 7: applyInsert resolves tasks.project_id ──────────────────────────────

describe('Fix 7 — applyInsert: tasks.project_id slug resolved to canonical', () => {
  function taskInsert(recordId: string, projectRef: string) {
    return {
      mutation_id: `mut_fix7_${recordId}`, origin_machine: 'home', table: 'tasks', op: 'insert', record_id: recordId,
      payload: { title: `Fix7 ${recordId}`, assignee: 'nick-ingraham', status: 'todo', priority: 'medium', project_id: projectRef },
      depends_on: null, client_ts: '2026-06-01T00:00:00Z', issued_at: '2026-06-01T00:00:00Z',
    } as any;
  }

  it('resolves a slug-form project_id to canonical before INSERT', async () => {
    const r = await applyInsert(env, taskInsert('task_fix7_slug', PROJ_SLUG), NICK, {} as any);
    expect(r.status).toBe('accepted');
    expect(rows("SELECT project_id FROM tasks WHERE id = 'task_fix7_slug'")).toEqual([{ project_id: PROJ_ID }]);
  });

  it('keeps an id-form project_id as the same canonical id', async () => {
    const r = await applyInsert(env, taskInsert('task_fix7_id', PROJ_ID), NICK, {} as any);
    expect(r.status).toBe('accepted');
    expect(rows("SELECT project_id FROM tasks WHERE id = 'task_fix7_id'")).toEqual([{ project_id: PROJ_ID }]);
  });
});
