// schema-v156 (2026-11-03): the task name identity carries the KIND.
//
// A check-in's title used to start "Check in: " (schema-v152), which kept it
// out of every task's name identity by accident. v156 stopped storing the
// prefix (the label is rendered from kind), so without a kind in the key a
// check-in "X" in a project holding an open task "X" would be ADOPTED by that
// task: the caller gets the task's id, no check-in exists, nothing reports it.
//
// Real migrated schema (prodSchemaDb: bootstrap + every api/schema-v*.sql), the
// real applyInsert, and the digest Make-task oracle.

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { applyInsert } from './mutations';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';
import { taskTitleTakenCheck } from '../lib/task-dedup-sql';

const NICK = { email: 'nick@example.com', slug: 'nick-ingraham' } as any;
const FLAGS = { dedup: true } as any;

let db: InstanceType<typeof Database>;
let n = 0;
beforeEach(() => {
  db = prodSchemaDb();
  n = 0;
  insertRow(db, 'projects', { id: 'proj_P1', slug: 'p1', title: 'P1' });
});

function ins(payload: Record<string, unknown>) {
  n += 1;
  return {
    mutation_id: `mut_K${n}`, origin_machine: 'home', table: 'tasks',
    record_id: `task_K${n}`, op: 'insert',
    payload: { status: 'todo', assignee: 'nick-ingraham', project_id: 'proj_P1', ...payload },
    depends_on: null, client_ts: '2026-11-03T03:00:00Z', issued_at: '2026-11-03T03:00:00Z',
  } as any;
}

const rows = () =>
  db.prepare('SELECT id, kind, title FROM tasks ORDER BY id').all() as Array<{ id: string; kind: string; title: string }>;

describe('a check-in and a task of one title in one project are two rows', () => {
  it('a check-in is not adopted by an open task of the same title', async () => {
    const env = { DB: d1Adapter(db) } as any;
    const t = await applyInsert(env, ins({ title: "Beret's first draft" }), NICK, FLAGS);
    const c = await applyInsert(env, ins({ title: "Beret's first draft", kind: 'checkin' }), NICK, FLAGS);
    expect(t.status).toBe('accepted');
    expect(c.status).toBe('accepted');
    expect(c.canonical_id).toBeUndefined();   // an insert, not an adoption of the task
    expect(rows()).toEqual([
      { id: 'task_K1', kind: 'task', title: "Beret's first draft" },
      { id: 'task_K2', kind: 'checkin', title: "Beret's first draft" },
    ]);
  });

  it('nor is a task adopted by an open check-in (the other order)', async () => {
    const env = { DB: d1Adapter(db) } as any;
    await applyInsert(env, ins({ title: 'Ask Casey', kind: 'checkin' }), NICK, FLAGS);
    const t = await applyInsert(env, ins({ title: 'Ask Casey' }), NICK, FLAGS);
    expect(t.canonical_id).toBeUndefined();
    expect(rows().map((r) => r.kind)).toEqual(['checkin', 'task']);
  });

  it('control: a second check-in of the same title IS the first one (folded for case and edge spaces)', async () => {
    const env = { DB: d1Adapter(db) } as any;
    await applyInsert(env, ins({ title: 'Ask Casey', kind: 'checkin' }), NICK, FLAGS);
    const again = await applyInsert(env, ins({ title: '  ask CASEY ', kind: 'checkin' }), NICK, FLAGS);
    expect(again.status).toBe('accepted');
    expect(again.canonical_id).toBe('task_K1');
    expect(rows()).toHaveLength(1);
  });

  it('control: a payload with no kind is a task, and dedups onto a task', async () => {
    const env = { DB: d1Adapter(db) } as any;
    await applyInsert(env, ins({ title: 'Plain', kind: 'task' }), NICK, FLAGS);
    const again = await applyInsert(env, ins({ title: 'Plain' }), NICK, FLAGS);
    expect(again.canonical_id).toBe('task_K1');
  });

  it('race-loser: a same-kind pair trips the index and the catch adopts the winner of THAT kind', async () => {
    // An open task of the title exists too; the catch must not adopt it.
    db.prepare("INSERT INTO tasks (id, title, assignee, project_id) VALUES ('task_T', 'Ask Casey', 'nick-ingraham', 'proj_P1')").run();
    const base = d1Adapter(db);
    let first = true;
    const env = {
      DB: {
        ...base,
        prepare(sql: string) {
          const stmt = base.prepare(sql);
          if (!/SELECT\s+id\s+FROM\s+tasks\s+WHERE\s+lower\(trim\(title\)\)/i.test(sql)) return stmt;
          const wrap = (s: any): any => ({
            ...s,
            bind: (...v: unknown[]) => wrap(s.bind(...v)),
            first: async () => {
              if (first) {
                first = false;
                db.prepare("INSERT INTO tasks (id, title, assignee, project_id, kind) VALUES ('task_W', 'Ask Casey', 'nick-ingraham', 'proj_P1', 'checkin')").run();
                return null;
              }
              return s.first();
            },
          });
          return wrap(stmt);
        },
      },
    } as any;
    const r = await applyInsert(env, ins({ title: 'ask casey', kind: 'checkin' }), NICK, FLAGS);
    expect(r.status).toBe('accepted');
    expect(r.canonical_id).toBe('task_W');
  });
});

describe('taskTitleTakenCheck keys on the kind too', () => {
  it('an open check-in does not make the title "taken" for a task, and the reverse', async () => {
    db.prepare("INSERT INTO tasks (id, title, assignee, kind) VALUES ('task_c', 'Read the paper', 'nick-ingraham', 'checkin')").run();
    const taken = taskTitleTakenCheck(d1Adapter(db) as any);
    expect(await taken('Read the paper', null, 'nick-ingraham', 'task')).toBe(false);
    expect(await taken('Read the paper', null, 'nick-ingraham', 'checkin')).toBe(true);
  });
});
