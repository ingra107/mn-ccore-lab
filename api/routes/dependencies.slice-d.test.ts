// Slice D — project_dependencies re-key on durable project PKs
// ============================================================
// Proves the bug class is UNREPRESENTABLE by construction (ethos #15 Level 1):
// a slug rename can never strand an edge because edges hold proj_* PKs, not slugs.
//
// #8875: runs on the migration-chain database (api/test-support/prod-schema-db.ts),
// FK enforcement ON. The first cut applied scripts/migrations/slice-d-dep-rekey.sql
// on top of a hand-written projects table; the table prod reads is the one
// schema-v80-retro-parity.sql builds, so that is the one these handler cases
// run against now (its FK / UNIQUE / CHECK / ON DELETE CASCADE included). The
// chain may seed its own edges, so every count here is scoped to this file's
// projects.
//
// Headline test (write-first): rename-keeps-edge. Pre-Slice-D this returns an
// empty list (stranded); post-Slice-D the edge survives with the new slug.

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
  handleCreateDependency,
  handleGetDependencies,
  handleGetProjectDependencies,
  handleDeleteDependency,
} from './dependencies';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';

const FAKE_USER = { email: 'nick@example.com', name: 'Nick' } as any;

// isPiRequest with no API key + no JWT returns false; that's fine (allowImpersonation
// false, and we never pass created_by override). So a bare Request works.
function req(body?: unknown): Request {
  return new Request('https://test/api/dependencies', {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'content-type': 'application/json' },
  });
}

const OURS = ['proj_A', 'proj_B', 'proj_C', 'proj_DUP'];
let db: InstanceType<typeof Database>;
let env: any;

beforeEach(() => {
  db = prodSchemaDb();
  env = { DB: d1Adapter(db) };
  // Seed three live projects.
  insertRow(db, 'projects', { id: 'proj_A', title: 'Project A', slug: 'alpha' });
  insertRow(db, 'projects', { id: 'proj_B', title: 'Project B', slug: 'beta' });
  insertRow(db, 'projects', { id: 'proj_C', title: 'Project C', slug: 'gamma' });
});

async function bodyOf(res: Response): Promise<any> {
  return JSON.parse(await res.text());
}
const ourEdges = () => (db.prepare(
  `SELECT COUNT(*) AS n FROM project_dependencies WHERE from_project_id IN (${OURS.map(() => '?').join(',')}) OR to_project_id IN (${OURS.map(() => '?').join(',')})`,
).get(...OURS, ...OURS) as { n: number }).n;
const OUR_SLUGS = new Set(['alpha', 'alpha-renamed', 'beta', 'gamma']);
const ourListed = (rows: any[]) => rows.filter((r) => OUR_SLUGS.has(r.from_slug) || OUR_SLUGS.has(r.to_slug));

describe('Slice D — project_dependencies re-key (Level 1: stranding unrepresentable)', () => {
  // ── HEADLINE (write-first) ──────────────────────────────────────────────────
  it('rename-keeps-edge: renaming a project slug does NOT strand its edges', async () => {
    const createRes = await handleCreateDependency(
      req({ from_slug: 'alpha', to_slug: 'beta', relationship_type: 'feeds_into' }),
      FAKE_USER,
      env,
    );
    expect(createRes.status).toBe(201);

    const before = await bodyOf(await handleGetProjectDependencies('alpha', env));
    expect(before.data).toHaveLength(1);
    expect(before.data[0].from_slug).toBe('alpha');
    expect(before.data[0].to_slug).toBe('beta');

    // Rename project A's slug — the exact mutation that used to strand edges.
    db.prepare('UPDATE projects SET slug = ? WHERE id = ?').run('alpha-renamed', 'proj_A');

    const byOld = await bodyOf(await handleGetProjectDependencies('alpha', env));
    expect(byOld.data).toHaveLength(0); // old slug no longer resolves to a project

    const byNew = await bodyOf(await handleGetProjectDependencies('alpha-renamed', env));
    expect(byNew.data).toHaveLength(1);
    expect(byNew.data[0].from_slug).toBe('alpha-renamed');
    expect(byNew.data[0].to_slug).toBe('beta');
  });

  // ── create-by-slug stored as id ─────────────────────────────────────────────
  it('create-by-slug-stored-as-id: inbound slugs are resolved to proj_* PKs in storage', async () => {
    const res = await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'beta' }), FAKE_USER, env);
    expect(res.status).toBe(201);
    const created = (await bodyOf(res)).data;
    // Wire shape stays slug-keyed.
    expect(created.from_slug).toBe('alpha');
    expect(created.to_slug).toBe('beta');
    // Storage is PK-keyed.
    const stored = db.prepare('SELECT from_project_id, to_project_id, relationship_type FROM project_dependencies WHERE id = ?').get(created.id) as any;
    expect(stored).toEqual({ from_project_id: 'proj_A', to_project_id: 'proj_B', relationship_type: 'feeds_into' });
    // Default reltype applied.
    expect(created.relationship_type).toBe('feeds_into');
  });

  // ── read-shows-slug ─────────────────────────────────────────────────────────
  it('read-shows-slug: GET resolves PK->slug for the wire (never leaks proj_*)', async () => {
    await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'gamma', relationship_type: 'blocks' }), FAKE_USER, env);
    const all = ourListed((await bodyOf(await handleGetDependencies(env))).data);
    expect(all).toHaveLength(1);
    expect(all[0].from_slug).toBe('alpha');
    expect(all[0].to_slug).toBe('gamma');
    expect(all[0].relationship_type).toBe('blocks');
    // No proj_ leakage on the wire.
    expect(JSON.stringify(all[0])).not.toContain('proj_');
  });

  // ── delete-by-id idempotent ─────────────────────────────────────────────────
  it('delete-by-id-idempotent: delete keys on the per-edge id, twice is idempotent', async () => {
    const created = (await bodyOf(await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'beta' }), FAKE_USER, env))).data;
    const first = await bodyOf(await handleDeleteDependency(created.id, req(), env));
    expect(first.data.deleted).toBe(true);
    expect(first.data.idempotent).toBe(false);
    expect(ourEdges()).toBe(0);
    const after = ourListed((await bodyOf(await handleGetDependencies(env))).data);
    expect(after).toHaveLength(0);
    // Second delete is idempotent (no row to remove).
    const second = await bodyOf(await handleDeleteDependency(created.id, req(), env));
    expect(second.data.idempotent).toBe(true);
  });

  // ── FK rejects edge to missing project ──────────────────────────────────────
  it('FK-rejects-edge-to-missing-project: storage cannot hold a dangling endpoint', async () => {
    // Via the handler: unknown slug -> clean 404, never an insert.
    const res = await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'does-not-exist' }), FAKE_USER, env);
    expect(res.status).toBe(404);
    expect(ourEdges()).toBe(0);

    // At the DB level: a direct INSERT to a missing proj_ id is rejected by the FK.
    expect(() =>
      db.prepare('INSERT INTO project_dependencies (id, from_project_id, to_project_id, relationship_type) VALUES (?, ?, ?, ?)')
        .run('edge_x', 'proj_A', 'proj_MISSING', 'feeds_into'),
    ).toThrow(/FOREIGN KEY/i);
  });

  // ── R1: an ambiguous slug cannot exist ───────────────────────────────────────
  it('R1 ambiguous-slug: two LIVE projects sharing a slug is unrepresentable (schema-v70)', async () => {
    // The first cut seeded this collision on a hand-written projects table and
    // asserted the handler's 409. On the migrated schema the partial UNIQUE
    // index idx_projects_slug_active refuses the second live row, so the
    // resolver's `ambiguous` arm cannot be reached; the schema is the guard.
    expect(() => insertRow(db, 'projects', { id: 'proj_DUP', title: 'Dup', slug: 'beta' }))
      .toThrow(/UNIQUE constraint failed: projects\.slug/);
    // A soft-deleted project may still hold the slug, and does not make it ambiguous.
    insertRow(db, 'projects', { id: 'proj_DUP', title: 'Dup', slug: 'beta', deleted_at: '2026-01-01T00:00:00Z' });
    const res = await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'beta' }), FAKE_USER, env);
    expect(res.status).toBe(201);
    expect(db.prepare("SELECT to_project_id FROM project_dependencies WHERE from_project_id = 'proj_A'").get()).toEqual({ to_project_id: 'proj_B' });
  });

  // ── UNIQUE(from,to) ignores reltype (consolidated amendment #2) ──────────────
  it('UNIQUE-pair-ignores-reltype: a second edge for the same pair is "already exists" (409)', async () => {
    const ok = await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'beta', relationship_type: 'feeds_into' }), FAKE_USER, env);
    expect(ok.status).toBe(201);
    // Different reltype, same pair -> still a dup (UNIQUE is (from_id, to_id)).
    const dup = await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'beta', relationship_type: 'shares_data' }), FAKE_USER, env);
    expect(dup.status).toBe(409);
    expect(ourEdges()).toBe(1);
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
    expect(ourEdges()).toBe(2);
    // Hard delete project B (NOT a soft delete) — both edges touching B must vanish.
    db.prepare('DELETE FROM projects WHERE id = ?').run('proj_B');
    expect(ourEdges()).toBe(0);
  });

  // ── soft-delete handling ────────────────────────────────────────────────────
  it('soft-delete-handling: a soft-deleted endpoint keeps the edge row; read JOIN still resolves it', async () => {
    await handleCreateDependency(req({ from_slug: 'alpha', to_slug: 'beta' }), FAKE_USER, env);
    // Soft delete project B (row persists, deleted_at set) — FK CASCADE does NOT fire.
    db.prepare('UPDATE projects SET deleted_at = datetime(\'now\') WHERE id = ?').run('proj_B');
    // Edge row still present (manual cascade-clean in handleDeleteProject is the
    // soft-delete cleaner; not exercised here). The read JOIN still resolves the
    // slug because the projects row persists.
    expect(ourEdges()).toBe(1);
    const list = ourListed((await bodyOf(await handleGetDependencies(env))).data);
    expect(list).toHaveLength(1);
    expect(list[0].to_slug).toBe('beta');
    // A NEW create pointing at the soft-deleted project is rejected (live-only resolver).
    const res = await handleCreateDependency(req({ from_slug: 'gamma', to_slug: 'beta' }), FAKE_USER, env);
    expect(res.status).toBe(404);
  });
});
