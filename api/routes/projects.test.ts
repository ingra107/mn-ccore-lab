// projects.test.ts — unit tests for three-bucket two-views model
//
// Stage 4 #12-followup (2026-05-09): validates:
//   1. PROJECT_CATEGORY_VALUES allowlist rejects old values ('lab', 'clif', etc.)
//      and accepts new three-bucket values ('MNCCORE', 'CLIF', 'Peripheral Brain').
//   2. handleGetProjects Nick-only visibility gate: Nick sees 'Peripheral Brain'
//      rows; non-Nick callers have them filtered out.
//   3. handleGetProject single-record fetch, with the same gate.
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

const NICK_USER: AuthUser = { email: 'ingra107@umn.edu', name: 'Nick' };
const PERSONAL_EMAIL_NICK: AuthUser = { email: 'nicholas.ingraham@gmail.com', name: 'Nick Personal' };
const NON_NICK_USER: AuthUser = { email: 'collaborator@example.com', name: 'Collaborator' };
const ANON_USER: AuthUser = { email: 'anonymous', name: 'Team Member' };

// ── Sample project rows ──────────────────────────────────────────────────────

const SAMPLE_ROWS = [
  { id: 'proj_1', title: 'CLIF Consortium Study', category: 'CLIF' },
  { id: 'proj_2', title: 'Lab Research Project', category: 'MNCCORE' },
  { id: 'proj_3', title: 'Nick Personal Budget', category: 'Peripheral Brain' },
  { id: 'proj_4', title: 'Nick Admin Tasks', category: 'Peripheral Brain' },
];

async function list(params: Record<string, string>, user: AuthUser, apiKeyValid?: boolean) {
  const res = await handleGetProjects(makeUrl(params), env(), user, apiKeyValid);
  const body = await res.json() as { data: ProjectRow[]; count: number };
  return ours(body.data);
}

// ── Tests: handleGetProjects visibility gate ────────────────────────────────────

describe('handleGetProjects — Nick-only Peripheral Brain gate', () => {
  beforeEach(() => seed(SAMPLE_ROWS));

  it('Nick (UMN email) sees all categories including Peripheral Brain', async () => {
    const rows = await list({}, NICK_USER);
    expect(rows.map((r) => r.category)).toContain('Peripheral Brain');
    expect(rows).toHaveLength(4);
  });

  it('Nick (personal gmail) also sees Peripheral Brain rows', async () => {
    const rows = await list({}, PERSONAL_EMAIL_NICK);
    expect(rows.map((r) => r.category)).toContain('Peripheral Brain');
  });

  it('non-Nick user does NOT see Peripheral Brain rows', async () => {
    const rows = await list({}, NON_NICK_USER);
    expect(rows.map((r) => r.category)).not.toContain('Peripheral Brain');
    expect(rows.map((r) => r.id).sort()).toEqual(['proj_1', 'proj_2']); // Only CLIF + MNCCORE rows
  });

  it('anonymous user (no auth) does NOT see Peripheral Brain rows', async () => {
    const rows = await list({}, ANON_USER);
    expect(rows.map((r) => r.category)).not.toContain('Peripheral Brain');
  });

  it('gate applies in cursor mode (seq_after) — non-Nick cannot page past Peripheral Brain', async () => {
    const rows = await list({ seq_after: '0', limit: '100' }, NON_NICK_USER);
    expect(rows.map((r) => r.category)).not.toContain('Peripheral Brain');
    expect(rows.map((r) => r.id).sort()).toEqual(['proj_1', 'proj_2']);
  });

  it('gate applies in cursor mode — Nick CAN page and see Peripheral Brain', async () => {
    const rows = await list({ seq_after: '0', limit: '100' }, NICK_USER);
    expect(rows.map((r) => r.category)).toContain('Peripheral Brain');
  });

  it('gate applies with include_deleted=1 — non-Nick cannot see Peripheral Brain tombstones', async () => {
    insertRow(db, 'projects', { id: 'proj_5', slug: 'proj-5', title: 'Deleted PB project', category: 'Peripheral Brain', deleted_at: '2026-05-01T00:00:00Z' });
    seeded.push('proj_5');
    const rows = await list({ include_deleted: '1', seq_after: '0', limit: '100' }, NON_NICK_USER);
    expect(rows.map((r) => r.category)).not.toContain('Peripheral Brain');
    // Control: Nick does see the tombstone through the same query.
    const nick = await list({ include_deleted: '1', seq_after: '0', limit: '100' }, NICK_USER);
    expect(nick.map((r) => r.id)).toContain('proj_5');
  });

  // 2026-05-09 v2 fix: PB cross-machine sync uses PB_API_KEY (apiKeyValid=true)
  // and is anonymous from JWT perspective. Without this bypass, home's PB sync
  // can never pull Nick's 'Peripheral Brain' projects -> silent data loss class.
  // Caught by home 2026-05-09T01:40Z when proj_01KR561PW3G2P2TKDG6H66X73K never
  // propagated cross-machine.
  it('apiKeyValid=true bypasses gate (anon user can see Peripheral Brain via PB_API_KEY)', async () => {
    const rows = await list({ seq_after: '0', limit: '100' }, ANON_USER, true);
    expect(rows.map((r) => r.category)).toContain('Peripheral Brain');
  });

  it('apiKeyValid=undefined preserves anon-blocked behavior (gate still fires)', async () => {
    const rows = await list({ seq_after: '0', limit: '100' }, ANON_USER);
    expect(rows.map((r) => r.category)).not.toContain('Peripheral Brain');
  });

  it('apiKeyValid=false (invalid Bearer) preserves gate', async () => {
    const rows = await list({ seq_after: '0', limit: '100' }, ANON_USER, false);
    expect(rows.map((r) => r.category)).not.toContain('Peripheral Brain');
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
    return handleUpdateProject('proj_abc', req, NICK_USER, env());
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
    const res = await handleGetProject('proj_001', env(), NICK_USER);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: ProjectRow };
    expect(body.data.id).toBe('proj_001');
    expect(body.data.title).toBe('My Project');
  });

  it('returns 200 with the project row when fetched by slug', async () => {
    seed([{ id: 'proj_002', slug: 'slug-lookup', title: 'Slug Project', category: 'CLIF' }]);
    const res = await handleGetProject('slug-lookup', env(), NICK_USER);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: ProjectRow };
    expect(body.data.slug).toBe('slug-lookup');
    expect(body.data.id).toBe('proj_002');
  });

  it('returns 404 when the project does not exist', async () => {
    const res = await handleGetProject('proj_nonexistent', env(), NICK_USER);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Project not found');
  });

  it('returns 404 for a soft-deleted project (deleted_at IS NOT NULL)', async () => {
    seed([{ id: 'proj_003', slug: 'deleted-proj', title: 'Deleted Project', deleted_at: '2026-05-01T00:00:00Z' }]);
    const res = await handleGetProject('proj_003', env(), NICK_USER);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('Project not found');
  });

  it('non-Nick user receives 404 for a Peripheral Brain project', async () => {
    seed([{ id: 'proj_004', slug: 'pb-proj', title: 'PB Admin', category: 'Peripheral Brain' }]);
    const res = await handleGetProject('proj_004', env(), NON_NICK_USER);
    expect(res.status).toBe(404);
  });

  it('Nick user can fetch a Peripheral Brain project', async () => {
    seed([{ id: 'proj_005', slug: 'pb-proj-nick', title: 'Nick PB', category: 'Peripheral Brain' }]);
    const res = await handleGetProject('proj_005', env(), NICK_USER);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: ProjectRow };
    expect(body.data.category).toBe('Peripheral Brain');
  });

  it('apiKeyValid=true bypasses Nick gate for Peripheral Brain projects', async () => {
    seed([{ id: 'proj_006', slug: 'pb-api-key', title: 'PB via API Key', category: 'Peripheral Brain' }]);
    const res = await handleGetProject('proj_006', env(), ANON_USER, true);
    expect(res.status).toBe(200);
  });
});
