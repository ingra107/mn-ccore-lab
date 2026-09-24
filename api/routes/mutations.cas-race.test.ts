// #8842 R1 — the mutation apply path: compare-and-swap + receipt in one batch.
//
// Runs the REAL mutations.ts code on a REAL SQLite engine (better-sqlite3)
// with the prod seq trigger (schema-v53), through a D1 adapter whose batch()
// is one transaction, as D1's is. The regex stub DBs in the other
// mutations.*.test.ts files cannot model either property.
//
// Before the fix (Hub 16e72a50):
//   - two concurrent writers from the same base_seq both came back 'accepted'
//     and the second silently overwrote the first;
//   - a D1 failure between the row write and the receipt reported 'error' for
//     a write that had landed, and the retry reported 'conflict' against it.

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { applyUpdate, applyDelete, hashTouched, handleMutations, CAS_CONTENTION_REASON_PREFIX } from './mutations';
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db';

// The schema is the migration chain itself (api/test-support/prod-schema-db.ts):
// processed_mutations.original_response_json is TEXT NOT NULL, the v53 seq
// triggers and the v98 completion-triad guard are all present. The first cut
// of this file hand-rolled a nullable receipt column and passed while every
// prod write would have rolled back.
type Hooks = { failSql?: RegExp; failTimes?: number; beforeBatch?: () => void };
const makeD1 = (d: InstanceType<typeof Database>, hooks: Hooks = {}) => d1Adapter(d, hooks);

const USER = { email: 'nick@example.com' } as any;
const FLAGS = { conflict_hash: true } as any;

let db: InstanceType<typeof Database>;
beforeEach(() => {
  db = prodSchemaDb();
  db.prepare("INSERT INTO tasks (id, title, assignee, seq) VALUES ('task_1', 'old', 'nick', 5)").run();
});

function upd(id: string, patch: Record<string, unknown>, baseHash: string | null, base_seq: number | null = 5) {
  return {
    mutation_id: id, origin_machine: 'home', table: 'tasks', record_id: 'task_1', op: 'update',
    base_seq, base_row_hash: baseHash, patch, depends_on: null,
    client_ts: '2026-09-23T12:00:00Z', issued_at: '2026-09-23T12:00:00Z',
  } as any;
}

const row = () => db.prepare("SELECT title, priority, seq, last_mutation_id, deleted_at, status FROM tasks WHERE id='task_1'").get() as any;
const receipt = (id: string) => db.prepare('SELECT outcome, original_response_json FROM processed_mutations WHERE mutation_id = ?').get(id) as any;

describe('R1 lost update: compare-and-swap on the evaluated row', () => {
  it('two concurrent writers from the same base: one accepted, one conflict, the row holds the winner', async () => {
    const env = { DB: makeD1(db) } as any;
    const baseHash = await hashTouched({ title: 'old' }, ['title']);
    const [a, b] = await Promise.all([
      applyUpdate(env, upd('mut_home1', { title: 'HOME' }, baseHash), USER, FLAGS),
      applyUpdate(env, upd('mut_work1', { title: 'WORK' }, baseHash), USER, FLAGS),
    ]);
    expect([a.status, b.status].sort()).toEqual(['accepted', 'conflict']);
    const winner = a.status === 'accepted' ? a : b;
    const loser = a.status === 'accepted' ? b : a;
    expect(row().title).toBe(winner === a ? 'HOME' : 'WORK');
    expect(row().last_mutation_id).toBe(winner.mutation_id);
    // The loser learns the value that beat it.
    expect((loser.current_payload as any).title).toBe(row().title);
  });

  it('writers on DIFFERENT fields from one base both land (merged_clean on the retry)', async () => {
    const env = { DB: makeD1(db) } as any;
    const hTitle = await hashTouched({ title: 'old' }, ['title']);
    const hPrio = await hashTouched({ priority: 'medium' }, ['priority']);
    const [a, b] = await Promise.all([
      applyUpdate(env, upd('mut_a', { title: 'NEW' }, hTitle), USER, FLAGS),
      applyUpdate(env, upd('mut_b', { priority: 'high' }, hPrio), USER, FLAGS),
    ]);
    expect([a.status, b.status].sort()).toEqual(['accepted', 'merged_clean']);
    expect(row().title).toBe('NEW');
    expect(row().priority).toBe('high');
  });

  it('a row that moves between read and commit is re-decided, not overwritten', async () => {
    // A concurrent writer bumps the row just before our batch runs, on the
    // first attempt only. The retry re-reads, sees a touched field changed,
    // and returns conflict.
    let fired = false;
    const hooks: Hooks = {
      beforeBatch: () => {
        if (fired) return;
        fired = true;
        db.prepare("UPDATE tasks SET title = 'SNEAKY', last_mutation_id = 'mut_other' WHERE id = 'task_1'").run();
      },
    };
    const env = { DB: makeD1(db, hooks) } as any;
    const baseHash = await hashTouched({ title: 'old' }, ['title']);
    const r = await applyUpdate(env, upd('mut_x', { title: 'MINE' }, baseHash), USER, FLAGS);
    expect(r.status).toBe('conflict');
    expect(row().title).toBe('SNEAKY');
    expect(receipt('mut_x')).toBeUndefined(); // applyUpdate alone records no conflict receipt
  });

  it('three CAS misses in a row: transient cas_contention error, NO receipt, row untouched by us', async () => {
    let n = 0;
    const hooks: Hooks = {
      beforeBatch: () => {
        n += 1;
        db.prepare(`UPDATE tasks SET priority = 'p${n}' WHERE id = 'task_1'`).run();
      },
    };
    const env = { DB: makeD1(db, hooks), PB_API_KEY: 'k' } as any;
    // Hub-UI style write (base_seq null) so each retry re-decides to apply.
    const mut = { ...upd('mut_hot', { title: 'MINE' }, null, null), origin_machine: 'hub_ui:test' };
    const body = JSON.stringify({ mutations: [mut] });
    const res = await handleMutations(new Request('https://t/api/mutations', {
      method: 'POST', body, headers: { authorization: 'Bearer k', 'content-type': 'application/json' },
    }), USER, env);
    const out = (await res.json() as any).results[0];
    expect(out.status).toBe('error');
    expect(out.reason.startsWith(CAS_CONTENTION_REASON_PREFIX)).toBe(true);
    // PB pins this exact text as TRANSIENT in
    // Peripheral-Brain tests/db/test_hub_cas_contention_is_transient.py.
    expect(out.reason).toBe('cas_contention: row changed on each of 3 attempts; nothing written, retry');
    expect(n).toBe(3);
    expect(receipt('mut_hot')).toBeUndefined();
    expect(row().title).toBe('old');
  });
});

describe('R1 receipt is atomic with the row write', () => {
  it('a receipt failure rolls the row back; the retry then lands as accepted', async () => {
    const hooks: Hooks = { failSql: /INSERT INTO processed_mutations/, failTimes: 1 };
    const env = { DB: makeD1(db, hooks), PB_API_KEY: 'k' } as any;
    const baseHash = await hashTouched({ title: 'old' }, ['title']);
    const body = JSON.stringify({ mutations: [upd('mut_home2', { title: 'HOME' }, baseHash)] });
    const mk = () => new Request('https://t/api/mutations', {
      method: 'POST', body, headers: { authorization: 'Bearer k', 'content-type': 'application/json' },
    });
    const r1 = (await (await handleMutations(mk(), USER, env)).json() as any).results[0];
    // Nothing landed with the failed batch, so it is a retryable infra error
    // (PB classifies `infra error:` as transient) and NO receipt is written:
    // a recorded error would replay forever for a write that never happened.
    expect(r1.status).toBe('error');
    expect(r1.reason).toBe('infra error: D1_ERROR: simulated D1 failure: SQLITE_ERROR');
    expect(row().title).toBe('old');
    expect(row().seq).toBe(5);
    expect(receipt('mut_home2')).toBeUndefined();
    const r2 = (await (await handleMutations(mk(), USER, env)).json() as any).results[0];
    expect(r2.status).toBe('accepted');
    expect(row().title).toBe('HOME');
  });

  it('an accepted write stores its full response for replay, byte-identical on retry', async () => {
    const env = { DB: makeD1(db), PB_API_KEY: 'k' } as any;
    const baseHash = await hashTouched({ title: 'old' }, ['title']);
    const body = JSON.stringify({ mutations: [upd('mut_r', { title: 'X' }, baseHash)] });
    const mk = () => new Request('https://t/api/mutations', {
      method: 'POST', body, headers: { authorization: 'Bearer k', 'content-type': 'application/json' },
    });
    const first = (await (await handleMutations(mk(), USER, env)).json() as any).results[0];
    expect(first.status).toBe('accepted');
    expect(first.canonical_payload.title).toBe('X');
    expect(receipt('mut_r').outcome).toBe('accepted');
    expect(JSON.parse(receipt('mut_r').original_response_json)).toEqual(first);
    const again = (await (await handleMutations(mk(), USER, env)).json() as any).results[0];
    expect(again).toEqual(first);
    expect(row().seq).toBe(6); // the replay wrote nothing
  });

  it('the same mutation id sent twice concurrently writes the row once and both callers agree', async () => {
    const env = { DB: makeD1(db) } as any;
    const baseHash = await hashTouched({ title: 'old' }, ['title']);
    const done = { title: 'ONCE', status: 'done', completed: 1, completed_at: '2026-09-23 12:00:00' };
    const baseDone = await hashTouched({ title: 'old', status: 'todo', completed: 0, completed_at: null }, Object.keys(done));
    const m = upd('mut_dup', done, baseDone);
    const [a, b] = await Promise.all([
      applyUpdate(env, { ...m }, USER, FLAGS),
      applyUpdate(env, { ...m }, USER, FLAGS),
    ]);
    expect(a.status).toBe('accepted');
    expect(b.status).toBe('accepted');
    expect(row().title).toBe('ONCE');
    expect(row().seq).toBe(6); // one write, one seq bump
    expect(db.prepare("SELECT COUNT(*) n FROM processed_mutations WHERE mutation_id='mut_dup'").get()).toEqual({ n: 1 });
    // The completion's lifecycle line is emitted once, by the winner only.
    expect(db.prepare("SELECT COUNT(*) n FROM activity_entries WHERE entity_type='task' AND entity_id='task_1'").get()).toEqual({ n: 1 });
  });

  it('M46: a stored dependency_failed receipt is upgraded by the landing write', async () => {
    db.prepare("INSERT INTO processed_mutations (mutation_id, origin_machine, processed_at, outcome, original_response_json, table_name, record_id) VALUES ('mut_dep', 'home', datetime('now'), 'dependency_failed', '{}', 'tasks', 'task_1')").run();
    const env = { DB: makeD1(db) } as any;
    const baseHash = await hashTouched({ title: 'old' }, ['title']);
    const r = await applyUpdate(env, upd('mut_dep', { title: 'LATE' }, baseHash), USER, FLAGS);
    expect(r.status).toBe('accepted');
    expect(receipt('mut_dep').outcome).toBe('accepted');
    expect(row().title).toBe('LATE');
  });
});

describe('R1 delete: cascade commits with the soft-delete or not at all', () => {
  function delMut(id: string) {
    return {
      mutation_id: id, origin_machine: 'home', table: 'tasks', record_id: 'task_1', op: 'delete',
      base_seq: null, base_row_hash: null, depends_on: null,
      client_ts: '2026-09-23T12:00:00Z', issued_at: '2026-09-23T12:00:00Z',
    } as any;
  }

  beforeEach(() => {
    db.prepare("INSERT INTO activity_entries (id, entity_type, entity_id, kind, actor_slug, body) VALUES ('a1', 'task', 'task_1', 'comment', 'nick', 'hi')").run();
    db.prepare("INSERT INTO notifications (id, recipient_slug, type, source_type, source_id, title) VALUES ('n1', 'nick', 'assignment', 'task', 'task_1', 'n')").run();
    db.prepare("INSERT INTO task_subtasks (id, task_id, title) VALUES ('s1', 'task_1', 'sub')").run();
  });

  it('a landed delete removes the children and writes its receipt in the same commit', async () => {
    const env = { DB: makeD1(db) } as any;
    const r = await applyDelete(env, delMut('mut_del'), USER);
    expect(r.status).toBe('accepted');
    expect(row().deleted_at).not.toBeNull();
    expect(row().status).toBe('deleted');
    expect(db.prepare("SELECT COUNT(*) n FROM activity_entries WHERE entity_id='task_1' AND entity_type='task'").get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) n FROM notifications').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) n FROM task_subtasks').get()).toEqual({ n: 0 });
    expect(receipt('mut_del').outcome).toBe('accepted');
  });

  it('a failed soft-delete batch leaves the children in place (they used to be deleted first)', async () => {
    const hooks: Hooks = { failSql: /INSERT INTO processed_mutations/, failTimes: 1 };
    const env = { DB: makeD1(db, hooks) } as any;
    await expect(applyDelete(env, delMut('mut_del2'), USER)).rejects.toThrow('simulated D1 failure');
    expect(row().deleted_at).toBeNull();
    expect(db.prepare('SELECT COUNT(*) n FROM notifications').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) n FROM task_subtasks').get()).toEqual({ n: 1 });
  });
});

describe('R1 project delete: every child table is cleared in the same commit', () => {
  // Required columns come from the migrated schema; each child row is keyed
  // to proj_x (deleted) or proj_keep (must survive).
  const CHILD_SEED: Record<string, string> = {
    project_documents: "(id, project_id, title, url) VALUES ('c1', 'proj_x', 't', 'u'), ('c2', 'proj_keep', 't', 'u')",
    milestones: "(id, project_id, title) VALUES ('c1', 'proj_x', 't'), ('c2', 'proj_keep', 't')",
    conference_submissions: "(id, project_id, conference, submission_type, title) VALUES ('c1', 'proj_x', 'c', 'abstract', 't'), ('c2', 'proj_keep', 'c', 'abstract', 't')",
    submission_events: "(id, project_id, event_type, event_date) VALUES ('c1', 'proj_x', 'submitted', '2026-01-01'), ('c2', 'proj_keep', 'submitted', '2026-01-01')",
    regulatory_items: "(id, project_id, item_type, title) VALUES ('c1', 'proj_x', 'irb', 't'), ('c2', 'proj_keep', 'irb', 't')",
    manuscript_revisions: "(id, project_id) VALUES ('c1', 'proj_x'), ('c2', 'proj_keep')",
  };

  beforeEach(() => {
    db.prepare("INSERT INTO projects (id, slug, title, status, seq) VALUES ('proj_x', 'proj-x', 'X', 'active', 3)").run();
    db.prepare("INSERT INTO projects (id, slug, title, status, seq) VALUES ('proj_keep', 'keep', 'Keep', 'active', 4)").run();
    db.prepare("INSERT INTO projects (id, slug, title, status, seq) VALUES ('proj_other', 'other', 'Other', 'active', 6)").run();
    for (const [t, seed] of Object.entries(CHILD_SEED)) db.prepare(`INSERT INTO ${t} ${seed}`).run();
    db.prepare("INSERT INTO project_dependencies (id, from_project_id, to_project_id) VALUES ('d1', 'proj_x', 'proj_keep'), ('d2', 'proj_keep', 'proj_other')").run();
    db.prepare("INSERT INTO activity_entries (id, entity_type, entity_id, kind, actor_slug, body) VALUES ('pa', 'project', 'proj_x', 'update', 'nick', 'x')").run();
    db.prepare("UPDATE tasks SET project_id = 'proj_x' WHERE id = 'task_1'").run();
  });

  it('soft-deletes the project, clears its children and dependency edges only, and orphans its tasks', async () => {
    const env = { DB: makeD1(db) } as any;
    const r = await applyDelete(env, {
      mutation_id: 'mut_pdel', origin_machine: 'home', table: 'projects', record_id: 'proj_x', op: 'delete',
      base_seq: null, base_row_hash: null, depends_on: null,
      client_ts: '2026-09-23T12:00:00Z', issued_at: '2026-09-23T12:00:00Z',
    } as any, USER);
    expect(r.status).toBe('accepted');
    const p = db.prepare("SELECT status, deleted_at, last_mutation_id FROM projects WHERE id='proj_x'").get() as any;
    expect(p.status).toBe('deleted');
    expect(p.deleted_at).not.toBeNull();
    expect(p.last_mutation_id).toBe('mut_pdel');
    for (const t of Object.keys(CHILD_SEED)) {
      expect(db.prepare(`SELECT project_id FROM ${t} ORDER BY id`).all(), t).toEqual([{ project_id: 'proj_keep' }]);
    }
    // Slice D keyed edges by project id; the old statement named from_slug
    // and threw "no such column", taking the whole cascade with it.
    expect(db.prepare('SELECT id FROM project_dependencies').all()).toEqual([{ id: 'd2' }]);
    expect((db.prepare("SELECT project_id FROM tasks WHERE id='task_1'").get() as any).project_id).toBeNull();
    expect(db.prepare("SELECT COUNT(*) n FROM activity_entries WHERE entity_type='project'").get()).toEqual({ n: 0 });
    expect(receipt('mut_pdel').outcome).toBe('accepted');
  });
});

describe('R1 a constraint failure inside the commit is a recorded, permanent apply error', () => {
  const post = (env: any, m: any) => handleMutations(new Request('https://t/api/mutations', {
    method: 'POST', body: JSON.stringify({ mutations: [m] }),
    headers: { authorization: 'Bearer k', 'content-type': 'application/json' },
  }), USER, env).then(async (r) => (await r.json() as any).results[0]);

  it('the prod completion-triad RAISE(ABORT) comes back as `apply error:` with a receipt, row untouched', async () => {
    const env = { DB: makeD1(db), PB_API_KEY: 'k' } as any;
    const baseHash = await hashTouched({ status: 'todo' }, ['status']);
    const out = await post(env, upd('mut_triad', { status: 'done' }, baseHash));
    expect(out.status).toBe('error');
    expect(out.reason).toMatch(/^apply error: .*completion triad guard/);
    expect(out.reason).toMatch(/SQLITE_CONSTRAINT/);
    expect(receipt('mut_triad').outcome).toBe('error');
    expect(row().status).toBe('todo');
    // A retry replays the recorded verdict; nothing is re-attempted.
    expect(await post(env, upd('mut_triad', { status: 'done' }, baseHash))).toEqual(out);
  });
});

describe('R1 receipt placeholder (processed_mutations.original_response_json is NOT NULL)', () => {
  it('if the response fill fails, the placeholder receipt still replays as {mutation_id, status}', async () => {
    const hooks: Hooks = { failSql: /^UPDATE processed_mutations SET original_response_json/, failTimes: 1 };
    const env = { DB: makeD1(db, hooks), PB_API_KEY: 'k' } as any;
    const body = JSON.stringify({ mutations: [upd('mut_ph', { title: 'P' }, await hashTouched({ title: 'old' }, ['title']))] });
    const mk = () => new Request('https://t/api/mutations', {
      method: 'POST', body, headers: { authorization: 'Bearer k', 'content-type': 'application/json' },
    });
    const first = (await (await handleMutations(mk(), USER, env)).json() as any).results[0];
    expect(first.status).toBe('accepted');
    expect(receipt('mut_ph').original_response_json).toBe('{"mutation_id":"mut_ph","status":"accepted"}');
    const again = (await (await handleMutations(mk(), USER, env)).json() as any).results[0];
    expect(again).toEqual({ mutation_id: 'mut_ph', status: 'accepted' });
    expect(row().title).toBe('P');
  });
});
