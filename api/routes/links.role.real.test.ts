// links.role.real.test.ts -- POST /api/links/:id/role on the prod-schema fixture
// (real applyUpdate + real D1 constraints, no mocks).
//
// idx_links_owner_role_url is UNIQUE on (owner_table, owner_id, role,
// canonical_url) over live rows, so a role change can collide with a sibling
// row carrying the same URL. The route must answer 409 with a message the page
// shows, never let the constraint reach app.onError as a 500.

import { describe, it, expect } from 'vitest';
import type { AuthUser, Env } from '../helpers';
import { handleSetLinkRole } from './links';
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db';

const USER: AuthUser = { email: 'x@umn.edu', slug: 'x', isPi: false };

function setup() {
  const db = prodSchemaDb();
  const cols = db.prepare('PRAGMA table_info(projects)').all() as Array<{ name: string; notnull: number; dflt_value: unknown; pk: number }>;
  const vals: Record<string, unknown> = { id: 'proj_A', slug: 'a', title: 'A', category: 'CLIF' };
  for (const c of cols) if (c.notnull && c.dflt_value == null && !c.pk && !(c.name in vals)) vals[c.name] = 'x';
  const keys = Object.keys(vals);
  db.prepare(`INSERT INTO projects (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => vals[k]));
  const add = (id: string, role: string, url: string) =>
    db.prepare("INSERT INTO links (id, owner_table, owner_id, role, type, canonical_url, short_title) VALUES (?, 'projects', 'proj_A', ?, 'web', ?, 't')").run(id, role, url);
  return { db, add, env: { DB: d1Adapter(db) } as unknown as Env };
}

const req = (role: string) =>
  new Request('https://h/api/links/x/role', { method: 'POST', body: JSON.stringify({ role }), headers: { 'content-type': 'application/json' } });

const roleOf = (db: ReturnType<typeof prodSchemaDb>, id: string) =>
  (db.prepare('SELECT role FROM links WHERE id = ?').get(id) as { role: string }).role;

describe('handleSetLinkRole on the prod schema', () => {
  it('archives and restores, stamping seq and last_mutation_id', async () => {
    const { db, add, env } = setup();
    add('link_1', 'key', 'https://x/1');
    const seq0 = (db.prepare("SELECT seq FROM links WHERE id='link_1'").get() as { seq: number }).seq;
    const a = await handleSetLinkRole('link_1', req('archive'), USER, env);
    expect(a.status).toBe(200);
    const row = db.prepare("SELECT role, seq, last_mutation_id FROM links WHERE id='link_1'").get() as { role: string; seq: number; last_mutation_id: string | null };
    expect(row.role).toBe('archive');
    expect(row.seq).toBeGreaterThan(seq0);
    expect(row.last_mutation_id).toMatch(/^mut_/);
    const r = await handleSetLinkRole('link_1', req('key'), USER, env);
    expect(r.status).toBe(200);
    expect(roleOf(db, 'link_1')).toBe('key');
  });

  it('restore collides with a re-added live key row of the same URL -> 409, row unchanged', async () => {
    const { db, add, env } = setup();
    add('link_1', 'archive', 'https://x/1');
    add('link_2', 'key', 'https://x/1');
    const res = await handleSetLinkRole('link_1', req('key'), USER, env);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; rejected: string };
    expect(body.rejected).toBe('error');
    expect(body.error).toMatch(/already has this URL/);
    expect(roleOf(db, 'link_1')).toBe('archive');
  });

  it('archiving a second copy of an already-archived URL -> 409, row unchanged', async () => {
    const { db, add, env } = setup();
    add('link_1', 'archive', 'https://x/1');
    add('link_2', 'key', 'https://x/1');
    const res = await handleSetLinkRole('link_2', req('archive'), USER, env);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/already in the archived group/);
    expect(roleOf(db, 'link_2')).toBe('key');
  });

  it('a tombstoned sibling does not block (the index covers live rows only)', async () => {
    const { db, add, env } = setup();
    add('link_1', 'archive', 'https://x/1');
    add('link_2', 'key', 'https://x/1');
    db.prepare("UPDATE links SET deleted_at = datetime('now') WHERE id = 'link_2'").run();
    const res = await handleSetLinkRole('link_1', req('key'), USER, env);
    expect(res.status).toBe(200);
    expect(roleOf(db, 'link_1')).toBe('key');
  });

  it('a concurrent writer that beats the pre-check still gets 409, not a 500', async () => {
    const { db, add, env } = setup();
    add('link_1', 'archive', 'https://x/1');
    add('link_2', 'key', 'https://x/1');
    // Blind the pre-check so the write itself meets the UNIQUE index -- the
    // shape of a sibling row landing between the check and the commit.
    const real = env.DB as unknown as { prepare: (sql: string) => { bind: (...v: unknown[]) => { first: () => Promise<unknown> } } };
    const racing = {
      ...real,
      prepare: (sql: string) => {
        const stmt = real.prepare(sql);
        if (!/AND id != \?/.test(sql)) return stmt;
        return { ...stmt, bind: () => ({ first: async () => null }) };
      },
    };
    const res = await handleSetLinkRole('link_1', req('key'), USER, { DB: racing } as unknown as Env);
    expect(res.status).toBe(409);
    expect(roleOf(db, 'link_1')).toBe('archive');
  });
});
