// Slice D — project_dependencies re-key on durable project PKs
// ============================================================
// Proves the bug class is UNREPRESENTABLE by construction (ethos #15 Level 1):
// a slug rename can never strand an edge because edges hold proj_* PKs, not slugs.
//
// These tests run against a REAL SQLite engine (better-sqlite3) wrapped in a
// minimal D1-compatible adapter, with FK enforcement ON, using the ACTUAL
// migration DDL (scripts/migrations/slice-d-dep-rekey.sql) as the fixture. This
// faithfully exercises the FK / UNIQUE / CHECK / JOIN behavior the in-memory
// regex stub (mutations.composite-pk.test.ts) cannot.
//
// Headline test (write-first): rename-keeps-edge. Pre-Slice-D this returns an
// empty list (stranded); post-Slice-D the edge survives with the new slug.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import {
  handleCreateDependency,
  handleGetDependencies,
  handleGetProjectDependencies,
  handleDeleteDependency,
} from './dependencies';

// ── Minimal D1-compatible adapter over better-sqlite3 ─────────────────────────
// Implements the surface the handlers use: prepare().bind().first()/.all()/.run().
// run() returns { meta: { changes } } like D1. FK enforcement is ON.

function makeD1(db: InstanceType<typeof Database>) {
  function makeStmt(sql: string, boundVals: unknown[]) {
    return {
      bind: (...more: unknown[]) => makeStmt(sql, [...boundVals, ...more]),
      first: async <T = Record<string, unknown>>() => {
        const row = db.prepare(sql).get(...boundVals);
        return (row ?? null) as T | null;
      },
      all: async <T = Record<string, unknown>>() => {
        const results = db.prepare(sql).all(...boundVals) as T[];
        return { results, success: true, meta: {} };
      },
      run: async () => {
        const info = db.prepare(sql).run(...boundVals);
        return { success: true, meta: { changes: info.changes }, results: [] };
      },
    };
  }
  return { prepare: (sql: string) => makeStmt(sql, []) };
}

// projects table — the columns the resolver + JOIN read (id, slug, deleted_at).
const PROJECTS_DDL = `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    title TEXT,
    slug TEXT,
    category TEXT,
    deleted_at TEXT
  );
`;

const MIGRATION_SQL = readFileSync(
  join(__dirname, '..', '..', 'scripts', 'migrations', 'slice-d-dep-rekey.sql'),
  'utf-8',
);

const FAKE_USER = { email: 'nick@example.com', name: 'Nick' } as any;

// isPiRequest / resolveActor read no DB rows we haven't seeded? resolveActor with
// no override returns the caller slug derived from email — no team_members lookup.
// isPiRequest with no API key + no JWT returns false; that's fine (allowImpersonation
// false, and we never pass created_by override). So a bare Request works.
function req(body?: unknown): Request {
  return new Request('https://test/api/dependencies', {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'content-type': 'application/json' },
  });
}

let db: InstanceType<typeof Database>;
let env: any;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(PROJECTS_DDL);
  // activity_log — handleCreateDependency calls logActivity (helpers.ts:231).
  db.exec(`CREATE TABLE activity_log (id TEXT, type TEXT, description TEXT, actor TEXT, related_id TEXT, related_type TEXT);`);
  // Apply the ACTUAL migration DDL. The file toggles PRAGMA foreign_keys OFF/ON
  // and runs PRAGMA foreign_key_check; better-sqlite3 .exec handles the batch.
  db.exec(MIGRATION_SQL);
  // Re-assert FK enforcement for the test session (the migration ends with ON,
  // but be explicit).
  db.pragma('foreign_keys = ON');
  env = { DB: makeD1(db) };

  // Seed three live projects.
  const ins = db.prepare('INSERT INTO projects (id, title, slug, deleted_at) VALUES (?, ?, ?, NULL)');
  ins.run('proj_A', 'Project A', 'alpha');
  ins.run('proj_B', 'Project B', 'beta');
  ins.run('proj_C', 'Project C', 'gamma');
});

async function bodyOf(res: Response): Promise<any> {
  return JSON.parse(await res.text());
}

describe('Slice D — project_dependencies re-key (Level 1: stranding unrepresentable)', () => {
  // ── HEADLINE (write-first) ──────────────────────────────────────────────────
  it('rename-keeps-edge: renaming a project slug does NOT strand its edges', async () => {
    // Create alpha -> beta.
    const createRes = await handleCreateDependency(
      req({ from_slug: 'alpha', to_slug: 'beta', relationship_type: 'feeds_into' }),
      FAKE_USER,
      env,
    );
    expect(createRes.status).toBe(201);

    // Sanity: edge is visible under the original slug.
    const before = await bodyOf(await handleGetProjectDependencies('alpha', env));
    expect(before.data).toHaveLength(1);
    expect(before.data[0].from_slug).toBe('alpha');
    expect(before.data[0].to_slug).toBe('beta');

    // Rename project A's slug — the exact mutation that used to strand edges.
    db.prepare('UPDATE projects SET slug = ? WHERE id = ?').run('alpha-renamed', 'proj_A');

    // The edge MUST still exist and now display the new slug — because storage
    // holds proj_A, untouched by the slug rename. Querying by the OLD slug is empty;
    // querying by the NEW slug returns the live edge.
    const byOld = await bodyOf(await handleGetProjectDependencies('alpha', env));
    expect(byOld.data).toHaveLength(0); // old slug no longer resolves to a project

    const byNew = await bodyOf(await handleGetProjectDependencies('alpha-renamed', env));
    expect(byNew.data).toHaveLength(1);
    expect(byNew.data[0].from_slug).toBe('alpha-renamed');
    expect(byNew.data[0].to_slug).toBe('beta');
  });

  // ── create-by-slug stored as id ─────────────────────────────────────────────
  it('create-by-slug-stored-as-id: inbound slugs are resolved to proj_* PKs in storage', async () => {
    const res = await handleCreateDependency(
      req({ from_slug: 'alpha', to_slug: 'beta' }),
      FAKE_USER,
      env,
    );
    expect(res.status).toBe(201);
    const created = (await bodyOf(res)).data;
    // Wire shape stays slug-keyed.
    expect(created.from_slug).toBe('alpha');
    expect(created.to_slug).toBe('beta');
    // Storage is PK-keyed.
    const stored = db.prepare('SELECT from_project_id, to_project_id FROM project_dependencies WHERE id = ?').get(created.id) as any;
    expect(stored.from_project_id).toBe('proj_A');
    expect(stored.to_project_id).toBe('proj_B');
    // Default reltype applied.
    expect(created.relationship_type).toBe('feeds_into');
  });

  // ── read-shows-slug ─────────────────────────────────────────────────────────
  it('read-shows-slug: GET resolves PK->slug for the wire (never leaks proj_*)', async () => {
    await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'gamma', relationship_type: 'blocks' }), FAKE_USER, env);
    const all = await bodyOf(await handleGetDependencies(env));
    expect(all.data).toHaveLength(1);
    expect(all.data[0].from_slug).toBe('alpha');
    expect(all.data[0].to_slug).toBe('gamma');
    expect(all.data[0].relationship_type).toBe('blocks');
    // No proj_ leakage on the wire.
    expect(JSON.stringify(all.data[0])).not.toContain('proj_');
  });

  // ── delete-by-id idempotent ─────────────────────────────────────────────────
  it('delete-by-id-idempotent: delete keys on the per-edge id, twice is idempotent', async () => {
    const created = (await bodyOf(await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'beta' }), FAKE_USER, env))).data;
    const first = await bodyOf(await handleDeleteDependency(created.id, req(), env));
    expect(first.data.deleted).toBe(true);
    expect(first.data.idempotent).toBe(false);
    // Gone from the list.
    const after = await bodyOf(await handleGetDependencies(env));
    expect(after.data).toHaveLength(0);
    // Second delete is idempotent (no row to remove).
    const second = await bodyOf(await handleDeleteDependency(created.id, req(), env));
    expect(second.data.idempotent).toBe(true);
  });

  // ── FK rejects edge to missing project ──────────────────────────────────────
  it('FK-rejects-edge-to-missing-project: storage cannot hold a dangling endpoint', async () => {
    // Via the handler: unknown slug -> clean 404, never an insert.
    const res = await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'does-not-exist' }), FAKE_USER, env);
    expect(res.status).toBe(404);
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_dependencies').get()).toMatchObject({ n: 0 });

    // At the DB level: a direct INSERT to a missing proj_ id is rejected by the FK.
    expect(() =>
      db.prepare('INSERT INTO project_dependencies (id, from_project_id, to_project_id, relationship_type) VALUES (?, ?, ?, ?)')
        .run('edge_x', 'proj_A', 'proj_MISSING', 'feeds_into'),
    ).toThrow(/FOREIGN KEY/i);
  });

  // ── R1: ambiguous slug is rejected, never silently picks one ─────────────────
  it('R1 ambiguous-slug-rejected: two live projects sharing a slug -> 409, no insert', async () => {
    // projects.slug is nullable + NOT db-unique — seed a collision.
    db.prepare('INSERT INTO projects (id, title, slug, deleted_at) VALUES (?, ?, ?, NULL)').run('proj_DUP', 'Dup', 'beta');
    const res = await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'beta' }), FAKE_USER, env);
    expect(res.status).toBe(409);
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_dependencies').get()).toMatchObject({ n: 0 });
  });

  // ── UNIQUE(from,to) ignores reltype (consolidated amendment #2) ──────────────
  it('UNIQUE-pair-ignores-reltype: a second edge for the same pair is "already exists" (409)', async () => {
    const ok = await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'beta', relationship_type: 'feeds_into' }), FAKE_USER, env);
    expect(ok.status).toBe(201);
    // Different reltype, same pair -> still a dup (UNIQUE is (from_id, to_id)).
    const dup = await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'beta', relationship_type: 'shares_data' }), FAKE_USER, env);
    expect(dup.status).toBe(409);
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_dependencies').get()).toMatchObject({ n: 1 });
  });

  // ── CHECK self-edge ─────────────────────────────────────────────────────────
  it('CHECK-self-edge: a project cannot depend on itself (DB invariant + handler guard)', async () => {
    const res = await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'alpha' }), FAKE_USER, env);
    expect(res.status).toBe(400);
    // DB-level guard too: direct self-edge insert violates the CHECK.
    expect(() =>
      db.prepare('INSERT INTO project_dependencies (id, from_project_id, to_project_id, relationship_type) VALUES (?, ?, ?, ?)')
        .run('edge_self', 'proj_A', 'proj_A', 'feeds_into'),
    ).toThrow(/CHECK/i);
  });

  // ── hard-delete cascade ─────────────────────────────────────────────────────
  it('hard-delete-cascade: hard-deleting a project removes its edges via FK CASCADE', async () => {
    await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'beta' }), FAKE_USER, env);
    await handleCreateDependency(req({ from_slug: 'beta', to_slug: 'gamma' }), FAKE_USER, env);
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_dependencies').get()).toMatchObject({ n: 2 });
    // Hard delete project B (NOT a soft delete) — both edges touching B must vanish.
    db.prepare('DELETE FROM projects WHERE id = ?').run('proj_B');
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_dependencies').get()).toMatchObject({ n: 0 });
  });

  // ── soft-delete handling ────────────────────────────────────────────────────
  it('soft-delete-handling: a soft-deleted endpoint keeps the edge row; read JOIN still resolves it', async () => {
    await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'beta' }), FAKE_USER, env);
    // Soft delete project B (row persists, deleted_at set) — FK CASCADE does NOT fire.
    db.prepare('UPDATE projects SET deleted_at = datetime(\'now\') WHERE id = ?').run('proj_B');
    // Edge row still present (manual cascade-clean in handleDeleteProject is the
    // soft-delete cleaner; not exercised here). The read JOIN still resolves the
    // slug because the projects row persists.
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_dependencies').get()).toMatchObject({ n: 1 });
    const list = await bodyOf(await handleGetDependencies(env));
    expect(list.data).toHaveLength(1);
    expect(list.data[0].to_slug).toBe('beta');
    // A NEW create pointing at the soft-deleted project is rejected (live-only resolver).
    const res = await handleCreateDependency(req({ from_slug: 'gamma', to_slug: 'beta' }), FAKE_USER, env);
    expect(res.status).toBe(404);
  });
});
