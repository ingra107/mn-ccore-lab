// projects.test.ts — unit tests for three-bucket two-views model
//
// Stage 4 #12-followup (2026-05-09): validates:
//   1. PROJECT_CATEGORY_VALUES allowlist rejects old values ('lab', 'clif', etc.)
//      and accepts new three-bucket values ('MNCCORE', 'CLIF', 'Peripheral Brain').
//   2. handleGetProjects returns the projects the caller's handle admits:
//      membership, whatever the category (Nick, 2026-10-09: membership is the
//      only visibility rule; 'Peripheral Brain' is a label).
//   3. handleGetProject single-record fetch, through the same handle.
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts).
// The first cut's stub answered every SELECT by pattern-matching the SQL text
// (it applied the Peripheral Brain exclusion only when it saw the literal
// `category != 'Peripheral Brain'`), so the visibility gate was tested against
// the stub's reading of the query rather than the query. Here the engine runs
// the route's real SQL; the update cases read the stored category back and
// check that a refused value wrote nothing.
//
// Design doc: ~/Peripheral-Brain/Context/Decisions/2026-05-08-hub-category-three-bucket-design.md

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { handleGetProjects, handleGetProject, handleUpdateProject } from './projects';
import { _resetValidationFlagsCache } from '../helpers';
import type { AuthUser } from '../helpers';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';
import { viewerDb, personViewer, nobodyViewer } from '../lib/viewer-db';
import { slugClaimCheck } from '../lib/project-slug';

interface ProjectRow {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  deleted_at: string | null;
}

let db: InstanceType<typeof Database>;
beforeEach(() => {
  _resetValidationFlagsCache();
  db = prodSchemaDb();
});

let seeded: string[] = [];
function seed(rows: Array<Partial<ProjectRow> & { id: string; seq?: number; stage?: string; status?: string }>) {
  seeded = [];
  for (const r of rows) {
    const { seq: _seq, ...row } = r;
    insertRow(db, 'projects', { slug: r.slug ?? r.id.replace(/_/g, '-'), title: r.title ?? r.id, category: 'MNCCORE', ...row });
    seeded.push(r.id);
  }
}
const env = () => ({ DB: d1Adapter(db) }) as any;
/** Only the rows this file seeded; the migration chain may seed its own. */
const ours = (data: ProjectRow[]) => data.filter((r) => seeded.includes(r.id));

function makeUrl(params: Record<string, string> = {}) {
  const u = new URL('https://example.com/api/projects');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}

const NICK_USER: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick', slug: 'nick-ingraham' };

// Each caller reads through the handle the request middleware would give it.
type Who = 'nick' | 'collaborator' | 'nobody' | 'pbkey';
function envAs(who: Who) {
  const raw = d1Adapter(db);
  if (who === 'pbkey') return { DB: raw } as any;
  if (who === 'nobody') return { DB: viewerDb(raw, nobodyViewer()) } as any;
  const v = who === 'nick'
    ? personViewer({ slug: 'nick-ingraham', email: 'ingra107@umn.edu', pi: true })
    : personViewer({ slug: 'collaborator', email: 'collaborator@example.com', pi: false });
  return { DB: viewerDb(raw, v) } as any;
}
function members(projectId: string, ...slugs: string[]) {
  for (const s of slugs) {
    db.prepare("INSERT OR IGNORE INTO project_members (project_id, member_slug, added_by) VALUES (?, ?, 'test')").run(projectId, s);
  }
}
function people() {
  insertRow(db, 'team_members', { id: 'tm-nick', name: 'Nick', slug: 'nick-ingraham', email: 'ingra107@umn.edu' });
  insertRow(db, 'team_members', { id: 'tm-collab', name: 'Collaborator', slug: 'collaborator', email: 'collaborator@example.com' });
}

// ── Sample project rows ──────────────────────────────────────────────────────

const SAMPLE_ROWS = [
  { id: 'proj_1', title: 'CLIF Consortium Study', category: 'CLIF' },
  { id: 'proj_2', title: 'Lab Research Project', category: 'MNCCORE' },
  { id: 'proj_3', title: 'Nick Personal Budget', category: 'Peripheral Brain' },
  { id: 'proj_4', title: 'Nick Admin Tasks', category: 'Peripheral Brain' },
];

async function list(params: Record<string, string>, who: Who) {
  const res = await handleGetProjects(makeUrl(params), envAs(who));
  const body = await res.json() as { data: ProjectRow[]; count: number };
  return ours(body.data);
}
const ids = (rows: ProjectRow[]) => rows.map((r) => r.id).sort();

// ── Tests: handleGetProjects visibility (membership) ─────────────────────────

describe('handleGetProjects — membership is the only rule', () => {
  beforeEach(() => {
    seed(SAMPLE_ROWS);
    people();
    // Nick is on everything; the collaborator on one team project and one
    // Peripheral Brain project.
    for (const r of SAMPLE_ROWS) members(r.id, 'nick-ingraham');
    members('proj_1', 'collaborator');
    members('proj_3', 'collaborator');
  });

  it('Nick, a member of all four, sees all four, Peripheral Brain included', async () => {
    expect(ids(await list({}, 'nick'))).toEqual(['proj_1', 'proj_2', 'proj_3', 'proj_4']);
  });

  it('a member sees exactly the projects they are on, whatever the category', async () => {
    expect(ids(await list({}, 'collaborator'))).toEqual(['proj_1', 'proj_3']);
  });

  it('a non-member cannot see a project, in cursor mode too', async () => {
    const rows = await list({ seq_after: '0', limit: '100' }, 'collaborator');
    expect(ids(rows)).toEqual(['proj_1', 'proj_3']);
  });

  it('include_deleted=1 shows a non-member no tombstone of a project they were never on', async () => {
    insertRow(db, 'projects', { id: 'proj_5', slug: 'proj-5', title: 'Deleted project', category: 'MNCCORE', deleted_at: '2026-05-01T00:00:00Z' });
    seeded.push('proj_5');
    members('proj_5', 'nick-ingraham');
    const rows = await list({ include_deleted: '1', seq_after: '0', limit: '100' }, 'collaborator');
    expect(ids(rows)).not.toContain('proj_5');
    expect(ids(await list({ include_deleted: '1', seq_after: '0', limit: '100' }, 'nick'))).toContain('proj_5');
  });

  // 2026-05-09 v2 fix: PB cross-machine sync uses PB_API_KEY and must see every
  // project, or home's PB sync never pulls Nick's projects (silent data loss).
  it('the PB key (unscoped handle) sees every project', async () => {
    expect(ids(await list({ seq_after: '0', limit: '100' }, 'pbkey'))).toEqual(['proj_1', 'proj_2', 'proj_3', 'proj_4']);
  });

  it('nobody (the public count) sees the projects outside the Peripheral Brain bucket', async () => {
    expect(ids(await list({}, 'nobody'))).toEqual(['proj_1', 'proj_2']);
  });
});

// ── Tests: PROJECT_CATEGORY_VALUES enum guard ────────────────────────────────
// Tested via handleUpdateProject, the path that runs PROJECT_ENUM_GUARDS.

describe('PROJECT_CATEGORY_VALUES — three-bucket allowlist enforcement', () => {
  const categoryOf = () => (db.prepare("SELECT category FROM projects WHERE id = 'proj_abc'").get() as { category: string }).category;

  async function update(fromCategory: string, toCategory: string) {
    seed([{ id: 'proj_abc', slug: 'test-proj', title: 'Test', category: fromCategory }]);
    const req = new Request('https://example.com/api/projects/proj_abc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: toCategory }),
    });
    const e = env();
    return handleUpdateProject('proj_abc', req, NICK_USER, e, slugClaimCheck(e.DB));
  }

  it.each([
    ['old value "lab"', 'MNCCORE', 'lab'],
    ['old value "clif" (lowercase)', 'CLIF', 'clif'],
    ['old value "nate"', 'MNCCORE', 'nate'],
    ['old value "mentee"', 'MNCCORE', 'mentee'],
    ['an arbitrary bogus category value', 'MNCCORE', 'bogus_value'],
  ])('rejects %s and leaves the stored category alone', async (_label, from, to) => {
    const res = await update(from, to);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/Invalid category/);
    expect(body.error).toMatch(/MNCCORE/);
    expect(categoryOf()).toBe(from);
  });

  it.each([
    ['MNCCORE', 'CLIF'],
    ['CLIF', 'MNCCORE'],
    ['Peripheral Brain', 'MNCCORE'],
  ])('accepts "%s" and stores it', async (to, from) => {
    const res = await update(from, to);
    expect(res.status).toBe(200);
    expect(categoryOf()).toBe(to);
  });
});

// ── Tests: handleGetProject — GET /api/projects/:id ──────────────────────────
// codex Q4 (2026-05-12): single-record fetch added to unblock 9 stuck PB
// recovery-pull entries that needed a deterministic project probe path.

describe('handleGetProject — GET /api/projects/:id', () => {
  it('returns 200 with the project row for an existing non-deleted project (by id)', async () => {
    seed([{ id: 'proj_001', slug: 'my-project', title: 'My Project', category: 'MNCCORE' }]);
    const res = await handleGetProject('proj_001', env());
    expect(res.status).toBe(200);
    const body = await res.json() as { data: ProjectRow };
    expect(body.data.id).toBe('proj_001');
    expect(body.data.title).toBe('My Project');
  });

  it('returns 200 with the project row when fetched by slug', async () => {
    seed([{ id: 'proj_002', slug: 'slug-lookup', title: 'Slug Project', category: 'CLIF' }]);
    const res = await handleGetProject('slug-lookup', env());
    expect(res.status).toBe(200);
    const body = await res.json() as { data: ProjectRow };
    expect(body.data.slug).toBe('slug-lookup');
    expect(body.data.id).toBe('proj_002');
  });

  it('returns 404 when the project does not exist', async () => {
    const res = await handleGetProject('proj_nonexistent', env());
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Project not found');
  });

  it('returns 404 for a soft-deleted project (deleted_at IS NOT NULL)', async () => {
    seed([{ id: 'proj_003', slug: 'deleted-proj', title: 'Deleted Project', deleted_at: '2026-05-01T00:00:00Z' }]);
    const res = await handleGetProject('proj_003', env());
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Project not found');
  });

  it('a non-member receives 404 for a project they are not on', async () => {
    seed([{ id: 'proj_004', slug: 'pb-proj', title: 'PB Admin', category: 'Peripheral Brain' }]);
    people();
    members('proj_004', 'nick-ingraham');
    const res = await handleGetProject('proj_004', envAs('collaborator'));
    expect(res.status).toBe(404);
  });

  it('a member can fetch a Peripheral Brain project (category is a label)', async () => {
    seed([{ id: 'proj_005', slug: 'pb-proj-member', title: 'Shared PB', category: 'Peripheral Brain' }]);
    people();
    members('proj_005', 'collaborator');
    const res = await handleGetProject('proj_005', envAs('collaborator'));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: ProjectRow };
    expect(body.data.category).toBe('Peripheral Brain');
  });

  it('the PB key fetches any project', async () => {
    seed([{ id: 'proj_006', slug: 'pb-api-key', title: 'PB via API Key', category: 'Peripheral Brain' }]);
    const res = await handleGetProject('proj_006', envAs('pbkey'));
    expect(res.status).toBe(200);
  });
});
