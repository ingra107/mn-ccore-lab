// #145 follow-up (schema-v138, 2026-10-13): a PROJECT-LESS task is its assignee's,
// so its name identity is (title, assignee). Two people's same-named private
// tasks are two tasks; the dedup cannot adopt another person's row, and the
// index does not refuse the second create. A task on a project is still keyed on
// the project alone.
//
// Real migrated schema (prodSchemaDb: bootstrap + every api/schema-v*.sql), the
// real applyInsert, and the digest Make-task oracle.

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { applyInsert } from './mutations';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';
import { taskTitleTakenCheck } from '../lib/task-dedup-sql';

const NICK = { email: 'nick@example.com', slug: 'nick-ingraham' } as any;
const CASEY = { email: 'casey@example.com', slug: 'casey-eddington' } as any;
const FLAGS = { dedup: true } as any;

let db: InstanceType<typeof Database>;
let n = 0;
beforeEach(() => {
  db = prodSchemaDb();
  n = 0;
});

function ins(payload: Record<string, unknown>) {
  n += 1;
  return {
    mutation_id: `mut_A${n}`, origin_machine: 'home', table: 'tasks',
    record_id: `task_A${n}`, op: 'insert',
    payload: { status: 'todo', project_id: null, ...payload },
    depends_on: null, client_ts: '2026-10-13T03:00:00Z', issued_at: '2026-10-13T03:00:00Z',
  } as any;
}

const ids = () => (db.prepare('SELECT id FROM tasks ORDER BY id').all() as Array<{ id: string }>).map((r) => r.id);

describe('a project-less task is keyed on its assignee', () => {
  it('two people each get their own open task of the same name', async () => {
    const env = { DB: d1Adapter(db) } as any;
    const a = await applyInsert(env, ins({ title: 'Review draft', assignee: 'nick-ingraham' }), NICK, FLAGS);
    const b = await applyInsert(env, ins({ title: 'Review draft', assignee: 'casey-eddington' }), CASEY, FLAGS);
    expect(a.status).toBe('accepted');
    expect(b.status).toBe('accepted');
    expect(b.canonical_id).toBeUndefined();           // an insert, not an adoption of Nick's row
    expect(ids()).toEqual(['task_A1', 'task_A2']);
  });

  it('control: the same person and title is still one task, folded for case and edge spaces', async () => {
    const env = { DB: d1Adapter(db) } as any;
    await applyInsert(env, ins({ title: 'Review draft', assignee: 'casey-eddington' }), CASEY, FLAGS);
    const again = await applyInsert(env, ins({ title: '  review DRAFT ', assignee: 'casey-eddington' }), CASEY, FLAGS);
    expect(again.status).toBe('accepted');
    expect(again.canonical_id).toBe('task_A1');
    expect(ids()).toEqual(['task_A1']);
  });

  it('control: a task on a project is keyed on the project alone, whoever owns it', async () => {
    insertRow(db, 'projects', { id: 'proj_P1', slug: 'p1', title: 'P1' });
    const env = { DB: d1Adapter(db) } as any;
    await applyInsert(env, ins({ title: 'Review draft', assignee: 'nick-ingraham', project_id: 'proj_P1' }), NICK, FLAGS);
    const b = await applyInsert(env, ins({ title: 'Review draft', assignee: 'casey-eddington', project_id: 'proj_P1' }), CASEY, FLAGS);
    expect(b.status).toBe('accepted');
    expect(b.canonical_id).toBe('task_A1');
    expect(ids()).toEqual(['task_A1']);
  });

  it('the index agrees: a raw cross-assignee project-less pair inserts, a same-assignee pair is refused', () => {
    const raw = db.prepare('INSERT INTO tasks (id, title, assignee) VALUES (?, ?, ?)');
    raw.run('task_r1', 'Plain task', 'nick-ingraham');
    raw.run('task_r2', ' plain TASK ', 'casey-eddington');
    expect(() => raw.run('task_r3', 'Plain task', 'casey-eddington')).toThrow(/UNIQUE constraint failed/);
  });

  it('race-loser: the same person trips the index and the catch adopts the winner', async () => {
    const base = d1Adapter(db);
    let first = true;
    // The serial SELECT answers "no row" (the winner commits after it ran); the
    // INSERT then trips the real index and the catch re-queries the real table.
    const env = {
      DB: {
        ...base,
        prepare(sql: string) {
          const stmt = base.prepare(sql);
          if (!/SELECT\s+id\s+FROM\s+tasks\s+WHERE\s+lower\(trim\(title\)\)\s*=\s*lower\(trim\(\?\)\)\s+AND\s+project_id\s+IS/i.test(sql)) return stmt;
          const wrap = (s: any): any => ({
            ...s,
            bind: (...v: unknown[]) => wrap(s.bind(...v)),
            first: async () => {
              if (first) {
                first = false;
                db.prepare("INSERT INTO tasks (id, title, assignee) VALUES ('task_W', 'Plain task', 'casey-eddington')").run();
                return null;
              }
              return s.first();
            },
          });
          return wrap(stmt);
        },
      },
    } as any;
    const r = await applyInsert(env, ins({ title: 'plain task', assignee: 'casey-eddington' }), CASEY, FLAGS);
    expect(r.status).toBe('accepted');
    expect(r.canonical_id).toBe('task_W');
    expect(ids()).toEqual(['task_W']);
  });
});

describe('taskTitleTakenCheck (the digest Make-task oracle) uses the same key', () => {
  it('another person\'s open project-less task of that title is not "taken"; the caller\'s own is', async () => {
    db.prepare('INSERT INTO tasks (id, title, assignee) VALUES (?, ?, ?)').run('task_n', 'Read the paper', 'nick-ingraham');
    const taken = taskTitleTakenCheck(d1Adapter(db) as any);
    expect(await taken('Read the paper', null, 'casey-eddington')).toBe(false);
    expect(await taken('Read the paper', null, 'nick-ingraham')).toBe(true);
    expect(await taken(' read THE paper', null, 'nick-ingraham')).toBe(true);
  });
});
