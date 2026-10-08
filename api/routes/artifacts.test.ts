/**
 * artifacts.test.ts — Hermes Artifacts v1 route behavior.
 *
 * Covers:
 *   - create: validation (title/body_md required, body_md size cap), id mint, version=1, actor
 *   - create + key_link: task_id set + empty slots → slot 1 gets abs URL + desc
 *   - create + key_link: task_id set + slots 1&2 full → writes slot 3
 *   - create + key_link: task_id set + all 3 full → no link write, artifact created
 *   - create + key_link: URL already present in a slot → idempotent, no dup write
 *   - create + key_link: no task_id → no task UPDATE issued at all
 *   - get: 404 when missing; returns artifact + versions
 *   - revise: archives current body, bumps version, idempotent archive (INSERT OR IGNORE)
 *   - revise: 404 when missing; body_md required
 *   - revise: ownership gate — creator or PI allowed, other member 403
 *   - comments: routes through postActivityEntry(entityType='artifact')
 *   - delete: PI-gated (403 for non-PI), cascades activity_entries + versions
 *
 * #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
 * The first cut answered every SELECT from canned rows and asserted on bind
 * arrays of a stub batch that could not roll back, so "stored X" meant "X was
 * somewhere in a bind list". Here each case reads the stored artifact, task
 * slot or version row back. The schema-v101 canary artifact the chain seeds is
 * left in place (list assertions count only this file's rows).
 *
 * postActivityEntry (the comment seam, covered by its own suite) and the
 * resolveActor / isPiRequest auth seams stay mocked; the database is real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { Env, AuthUser } from '../helpers';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';

// Stub postActivityEntry + the visibility gate (the comment route delegates to it).
vi.mock('../lib/activity-entry', () => ({
  postActivityEntry: vi.fn().mockResolvedValue({
    ok: true,
    row: { id: 'ae-1', entity_id: 'art_abc', actor_slug: 'nick-ingraham', body: 'hi', created_at: '2026-06-11 00:00:00' },
  }),
  activityVisibilityGate: vi.fn().mockResolvedValue({ clause: '1=1', binds: [] }),
}));

// resolveActor + isPiRequest are the auth seams this suite controls.
vi.mock('../helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../helpers')>();
  return {
    ...actual,
    resolveActor: vi.fn(async (_env: unknown, user: AuthUser, override: string | null | undefined) => {
      if (override === 'claude-ai') return { slug: 'claude-ai' };
      if (override) return { slug: override };
      return { slug: user.email === 'claude-ai' ? 'claude-ai' : 'nick-ingraham' };
    }),
    isPiRequest: vi.fn(async () => false),
  };
});

import { postActivityEntry } from '../lib/activity-entry';
import { isPiRequest } from '../helpers';
import * as helpers from '../helpers';
import {
  handleGetArtifacts,
  handleGetArtifact,
  handleCreateArtifact,
  handleReviseArtifact,
  handleDeleteArtifact,
  handleAddArtifactComment,
} from './artifacts';

const mockPostActivity = vi.mocked(postActivityEntry);
const mockIsPi = vi.mocked(isPiRequest);

let db: InstanceType<typeof Database>;
let env: Env;

function req(body: unknown): Request {
  return new Request('https://example.com/api/artifacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function hubReq(body: unknown): Request {
  return new Request('https://mn-ccore-lab.pages.dev/api/artifacts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

const USER: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' };
const HERMES: AuthUser = { email: 'claude-ai', name: 'Hermes', slug: 'claude-ai' };

function seedArtifact(row: Record<string, unknown>) {
  insertRow(db, 'artifacts', { title: 'T', body_md: 'old', version: 1, created_by: 'nick-ingraham', ...row });
}
function seedTask(id: string, slots: Record<string, string | null> = {}) {
  insertRow(db, 'tasks', { id, title: `Task ${id}`, status: 'todo', priority: 'medium', assignee: 'nick-ingraham', ...slots });
}
const artifact = (id: string) => db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
const slotsOf = (taskId: string) =>
  db.prepare('SELECT key_link_1, key_link_1_desc, key_link_2, key_link_3, key_link_3_desc FROM tasks WHERE id = ?').get(taskId) as Record<string, string | null>;
const count = (sql: string, ...v: unknown[]) => (db.prepare(sql).get(...v) as { n: number }).n;
async function createdId(res: Response): Promise<{ id: string; payload: Record<string, unknown> }> {
  const payload = await res.json() as { data: { id: string } } & Record<string, unknown>;
  return { id: payload.data.id, payload };
}

describe('artifacts routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPi.mockResolvedValue(false);
    db = prodSchemaDb();
    env = { DB: d1Adapter(db) } as unknown as Env;
  });

  // ── create ──────────────────────────────────────────────────────────────────

  it.each([
    ['title missing', { body_md: 'x' }],
    ['body_md missing', { title: 'Lit review' }],
    ['invalid content_type', { title: 'T', body_md: 'B', content_type: 'pdf' }],
    ['invalid visibility', { title: 'T', body_md: 'B', visibility: 'world' }],
  ])('create: 400 when %s, and nothing is stored', async (_label, body) => {
    const before = count('SELECT COUNT(*) AS n FROM artifacts');
    const res = await handleCreateArtifact(req(body), USER, env);
    expect(res.status).toBe(400);
    expect(count('SELECT COUNT(*) AS n FROM artifacts')).toBe(before);
  });

  it('create: 400 when body_md exceeds the size cap', async () => {
    const oversized = 'x'.repeat(2_000_001);
    const res = await handleCreateArtifact(req({ title: 'Too big', body_md: oversized }), USER, env);
    expect(res.status).toBe(400);
    const payload = await res.json() as { error?: string };
    expect(payload.error).toMatch(/exceeds maximum size/);
  });

  it('create: exactly at the size cap is accepted and stored whole', async () => {
    const atCap = 'x'.repeat(2_000_000);
    const res = await handleCreateArtifact(req({ title: 'At cap', body_md: atCap }), USER, env);
    expect(res.status).toBe(201);
    const { id } = await createdId(res);
    expect((artifact(id)!.body_md as string).length).toBe(2_000_000);
  });

  it('create: inserts with version 1 and art_ id, returns 201', async () => {
    insertRow(db, 'projects', { id: 'proj_1', slug: 'proj-1', title: 'P1', category: 'MNCCORE' });
    // A task_id that names no task: the artifact is still created, and says so.
    const res = await handleCreateArtifact(
      req({ title: 'Lit review', body_md: '# Hello', created_by: 'claude-ai', task_id: 'task_1', project_id: 'proj_1' }),
      HERMES,
      env,
    );
    expect(res.status).toBe(201);
    const { id, payload } = await createdId(res);
    expect(id.startsWith('art_')).toBe(true);
    expect(artifact(id)).toMatchObject({ version: 1, task_id: 'task_1', project_id: 'proj_1', created_by: 'claude-ai', title: 'Lit review' });
    expect(payload.linkSkipped).toBe('task_not_found');
  });

  // ── create: schema-v94 content_type/visibility ───────────────────────────────

  it('create: omitting content_type/visibility defaults to markdown/team', async () => {
    const res = await handleCreateArtifact(req({ title: 'T', body_md: 'B' }), USER, env);
    expect(res.status).toBe(201);
    const { id } = await createdId(res);
    expect(artifact(id)).toMatchObject({ content_type: 'markdown', visibility: 'team' });
  });

  it('create: accepts content_type=html + visibility=public, stores both', async () => {
    const res = await handleCreateArtifact(
      req({ title: 'Shared', body_md: '<html></html>', content_type: 'html', visibility: 'public' }),
      USER,
      env,
    );
    expect(res.status).toBe(201);
    const { id } = await createdId(res);
    expect(artifact(id)).toMatchObject({ content_type: 'html', visibility: 'public' });
  });

  // ── create/revise: #915 html doctype normalization at ingest ─────────────────

  it('create: content_type=html stores a doctype-less FRAGMENT as a complete document (#915)', async () => {
    const fragment = '<title>Aims Funnel</title><h1>Funnel</h1>'; // the Claude-Artifact export shape
    const res = await handleCreateArtifact(req({ title: 'Aims', body_md: fragment, content_type: 'html' }), USER, env);
    expect(res.status).toBe(201);
    const { id } = await createdId(res);
    // The raw fragment is never stored.
    expect(artifact(id)!.body_md).toBe('<!DOCTYPE html>\n' + fragment);
  });

  it('create: content_type=html passes a complete document through byte-identical (#915)', async () => {
    const full = '<!DOCTYPE html><html lang="en"><body>x</body></html>';
    const res = await handleCreateArtifact(req({ title: 'Full', body_md: full, content_type: 'html' }), USER, env);
    expect(res.status).toBe(201);
    const { id } = await createdId(res);
    expect(artifact(id)!.body_md).toBe(full);
  });

  it('create: content_type=markdown is NEVER doctype-normalized (#915)', async () => {
    const md = '# A markdown body with an <html> mention';
    const res = await handleCreateArtifact(req({ title: 'MD', body_md: md }), USER, env);
    expect(res.status).toBe(201);
    const { id } = await createdId(res);
    expect(artifact(id)!.body_md).toBe(md);
  });

  it('revise: an html artifact revision gets the same ingest normalization (#915)', async () => {
    seedArtifact({ id: 'art_1', body_md: '<!DOCTYPE html>\n<h1>v1</h1>', created_by: 'claude-ai', content_type: 'html' });
    const res = await handleReviseArtifact('art_1', req({ body_md: '<h1>v2 fragment</h1>' }), HERMES, env);
    expect(res.status).toBe(200);
    expect(artifact('art_1')!.body_md).toBe('<!DOCTYPE html>\n<h1>v2 fragment</h1>');
  });

  // ── create + key_link auto-backfill ──────────────────────────────────────────

  it('create + key_link: task_id set + all slots empty → slot 1 gets absolute URL + Hermes desc', async () => {
    seedTask('task_aaa');
    const res = await handleCreateArtifact(
      hubReq({ title: 'Lit review', body_md: '# Hi', created_by: 'claude-ai', task_id: 'task_aaa' }),
      HERMES,
      env,
    );
    expect(res.status).toBe(201);
    const { id } = await createdId(res);
    const slots = slotsOf('task_aaa');
    // URL is absolute and names the new artifact.
    expect(slots.key_link_1).toBe(`https://mn-ccore-lab.pages.dev/portal/artifacts/${id}`);
    // Description starts with 'Hermes: ' and contains the title.
    expect(slots.key_link_1_desc).toMatch(/^Hermes: /);
    expect(slots.key_link_1_desc).toContain('Lit review');
    expect(slots.key_link_2).toBeNull();
  });

  it('create + key_link: slots 1 & 2 full → writes slot 3', async () => {
    seedTask('task_bbb', { key_link_1: 'https://docs.google.com/doc1', key_link_2: 'https://docs.google.com/doc2' });
    const res = await handleCreateArtifact(
      hubReq({ title: 'Methods', body_md: '# Methods', created_by: 'claude-ai', task_id: 'task_bbb' }),
      HERMES,
      env,
    );
    const { id } = await createdId(res);
    expect(slotsOf('task_bbb')).toMatchObject({
      key_link_1: 'https://docs.google.com/doc1',
      key_link_2: 'https://docs.google.com/doc2',
      key_link_3: `https://mn-ccore-lab.pages.dev/portal/artifacts/${id}`,
    });
  });

  it('create + key_link: all 3 slots full → no key_link write, artifact still created (201)', async () => {
    const full = { key_link_1: 'https://example.com/1', key_link_2: 'https://example.com/2', key_link_3: 'https://example.com/3' };
    seedTask('task_ccc', full);
    const res = await handleCreateArtifact(
      hubReq({ title: 'Results', body_md: '# Results', created_by: 'claude-ai', task_id: 'task_ccc' }),
      HERMES,
      env,
    );
    expect(res.status).toBe(201);
    const { id, payload } = await createdId(res);
    expect(slotsOf('task_ccc')).toMatchObject(full);
    expect(artifact(id)).toBeDefined();
    expect(payload.linkSkipped).toBe('slots_full');
  });

  it('create + key_link: URL already in a slot → idempotent, no duplicate write', async () => {
    // Pin the ID so we can pre-populate the matching URL in the task row.
    const fixedHex = 'deadbeef000000000000000000000001';
    const spy = vi.spyOn(helpers, 'generateId').mockReturnValue(fixedHex);
    const expectedUrl = `https://mn-ccore-lab.pages.dev/portal/artifacts/art_${fixedHex}`;
    seedTask('task_ddd', { key_link_1: expectedUrl });

    const res = await handleCreateArtifact(
      hubReq({ title: 'Discussion', body_md: '# Disc', created_by: 'claude-ai', task_id: 'task_ddd' }),
      HERMES,
      env,
    );
    spy.mockRestore();

    expect(res.status).toBe(201);
    const { id, payload } = await createdId(res);
    expect(id).toBe(`art_${fixedHex}`);
    expect(slotsOf('task_ddd')).toMatchObject({ key_link_1: expectedUrl, key_link_2: null, key_link_3: null });
    expect(payload.linkSkipped).toBe('already_linked');
  });

  it('create + key_link: no task_id → no task SELECT or UPDATE issued', async () => {
    seedTask('task_untouched');
    const taskSql: string[] = [];
    env = { DB: d1Adapter(db, { onExec: (sql) => { if (/\btasks\b/.test(sql)) taskSql.push(sql); } }) } as unknown as Env;

    const res = await handleCreateArtifact(
      hubReq({ title: 'Standalone', body_md: '# Stand', created_by: 'claude-ai' }),
      HERMES,
      env,
    );
    expect(res.status).toBe(201);
    expect(taskSql).toEqual([]);
    expect(slotsOf('task_untouched').key_link_1).toBeNull();
  });

  // ── get ─────────────────────────────────────────────────────────────────────

  it('get: 404 when artifact missing', async () => {
    const res = await handleGetArtifact('art_missing', env);
    expect(res.status).toBe(404);
  });

  it('get: returns artifact + versions array', async () => {
    seedArtifact({ id: 'art_1', title: 'T', body_md: 'B', version: 3 });
    insertRow(db, 'artifact_versions', { artifact_id: 'art_1', version: 2, body_md: 'v2' });
    insertRow(db, 'artifact_versions', { artifact_id: 'art_1', version: 1, body_md: 'v1' });
    const res = await handleGetArtifact('art_1', env);
    expect(res.status).toBe(200);
    const payload = await res.json() as { data: { version: number; versions: Array<{ version: number }> } };
    expect(payload.data.version).toBe(3);
    expect(payload.data.versions.map((v) => v.version).sort()).toEqual([1, 2]);
  });

  it('list: returns rows + count', async () => {
    const before = count('SELECT COUNT(*) AS n FROM artifacts');
    seedArtifact({ id: 'art_list_1' });
    seedArtifact({ id: 'art_list_2' });
    const res = await handleGetArtifacts(new URL('https://x/api/artifacts'), env);
    const payload = await res.json() as { data: Array<{ id: string }>; count: number };
    expect(payload.count).toBe(before + 2);
    expect(payload.data.map((r) => r.id)).toEqual(expect.arrayContaining(['art_list_1', 'art_list_2']));
  });

  // ── revise ────────────────────────────────────────────────────────────────────

  it('revise: 404 when artifact missing', async () => {
    const res = await handleReviseArtifact('art_x', req({ body_md: 'new' }), USER, env);
    expect(res.status).toBe(404);
  });

  it('revise: 400 when body_md missing, and the artifact is unchanged', async () => {
    seedArtifact({ id: 'art_1' });
    const res = await handleReviseArtifact('art_1', req({ revision_note: 'x' }), USER, env);
    expect(res.status).toBe(400);
    expect(artifact('art_1')).toMatchObject({ body_md: 'old', version: 1 });
  });

  it('revise: archives current body at current version, bumps to version+1', async () => {
    // created_by='claude-ai' matches the mocked resolveActor's resolution for
    // the HERMES caller — this exercises the creator-matches-actor branch.
    seedArtifact({ id: 'art_1', version: 2, body_md: 'old body', title: 'Old title', created_by: 'claude-ai' });

    const res = await handleReviseArtifact('art_1', req({ body_md: 'new body', revision_note: 'addressed 3 comments' }), HERMES, env);
    expect(res.status).toBe(200);

    // Archive row at the CURRENT version (2) with the old body.
    expect(db.prepare("SELECT version, body_md, revision_note FROM artifact_versions WHERE artifact_id = 'art_1'").all())
      .toEqual([{ version: 2, body_md: 'old body', revision_note: 'addressed 3 comments' }]);
    // The artifact moves to version 3 with the new body.
    expect(artifact('art_1')).toMatchObject({ version: 3, body_md: 'new body' });
  });

  // ── revise: ownership gate ───────────────────────────────────────────────────

  it('revise: creator (actor.slug === created_by) is allowed even when not PI', async () => {
    mockIsPi.mockResolvedValue(false);
    seedArtifact({ id: 'art_1', created_by: 'nick-ingraham' });
    // Mocked resolveActor resolves USER (non-claude-ai email) to 'nick-ingraham'.
    const res = await handleReviseArtifact('art_1', req({ body_md: 'new' }), USER, env);
    expect(res.status).toBe(200);
    expect(artifact('art_1')!.body_md).toBe('new');
  });

  it('revise: PI is allowed to revise an artifact they did not create', async () => {
    mockIsPi.mockResolvedValue(true);
    seedArtifact({ id: 'art_1', created_by: 'someone-else' });
    const res = await handleReviseArtifact('art_1', req({ body_md: 'new' }), USER, env);
    expect(res.status).toBe(200);
    expect(artifact('art_1')!.body_md).toBe('new');
  });

  it('revise: 403 for a non-creator, non-PI team member, and nothing changes', async () => {
    mockIsPi.mockResolvedValue(false);
    seedArtifact({ id: 'art_1', created_by: 'someone-else' });
    const res = await handleReviseArtifact('art_1', req({ body_md: 'new' }), USER, env);
    expect(res.status).toBe(403);
    const payload = await res.json() as { error?: string };
    expect(payload.error).toMatch(/creator or a PI/);
    expect(artifact('art_1')).toMatchObject({ body_md: 'old', version: 1 });
    expect(count("SELECT COUNT(*) AS n FROM artifact_versions WHERE artifact_id = 'art_1'")).toBe(0);
  });

  // ── comments ──────────────────────────────────────────────────────────────────

  it('comment: 404 when artifact missing', async () => {
    const res = await handleAddArtifactComment('art_x', req({ content: 'hi' }), USER, env);
    expect(res.status).toBe(404);
  });

  it('comment: 400 when content empty', async () => {
    seedArtifact({ id: 'art_1' });
    const res = await handleAddArtifactComment('art_1', req({ content: '  ' }), USER, env);
    expect(res.status).toBe(400);
  });

  it('comment: routes through postActivityEntry with entityType=artifact', async () => {
    seedArtifact({ id: 'art_1' });
    const res = await handleAddArtifactComment('art_1', req({ content: '@hermes please revise' }), USER, env);
    expect(res.status).toBe(201);
    expect(mockPostActivity).toHaveBeenCalledOnce();
    const call = mockPostActivity.mock.calls[0][0];
    expect(call.entityType).toBe('artifact');
    expect(call.entityId).toBe('art_1');
    expect(call.kind).toBe('comment');
    expect(call.body).toBe('@hermes please revise');
  });

  it('comment: author-only visibility passes through when requested', async () => {
    seedArtifact({ id: 'art_1' });
    await handleAddArtifactComment('art_1', req({ content: '@me private note', visibility: 'author' }), USER, env);
    expect(mockPostActivity.mock.calls[0][0].visibility).toBe('author');
  });

  // ── delete ────────────────────────────────────────────────────────────────────

  it('delete: 403 for non-PI caller, and the artifact stays', async () => {
    mockIsPi.mockResolvedValue(false);
    seedArtifact({ id: 'art_1' });
    const res = await handleDeleteArtifact('art_1', req({}), env);
    expect(res.status).toBe(403);
    expect(artifact('art_1')).toBeDefined();
  });

  it('delete: PI cascades activity_entries + versions + artifact', async () => {
    mockIsPi.mockResolvedValue(true);
    seedArtifact({ id: 'art_1', version: 2 });
    insertRow(db, 'artifact_versions', { artifact_id: 'art_1', version: 1, body_md: 'v1' });
    insertRow(db, 'activity_entries', { id: 'ae_art1', entity_type: 'artifact', entity_id: 'art_1', kind: 'comment', actor_slug: 'nick-ingraham', body: 'note' });
    seedArtifact({ id: 'art_keep' });

    const res = await handleDeleteArtifact('art_1', req({}), env);
    expect(res.status).toBe(200);
    expect(artifact('art_1')).toBeUndefined();
    expect(count("SELECT COUNT(*) AS n FROM artifact_versions WHERE artifact_id = 'art_1'")).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM activity_entries WHERE entity_type = 'artifact' AND entity_id = 'art_1'")).toBe(0);
    expect(artifact('art_keep')).toBeDefined();
  });

  it('delete: idempotent when artifact already gone (PI)', async () => {
    mockIsPi.mockResolvedValue(true);
    const res = await handleDeleteArtifact('art_gone', req({}), env);
    expect(res.status).toBe(200);
    const payload = await res.json() as { data: { idempotent: boolean } };
    expect(payload.data.idempotent).toBe(true);
  });
});
