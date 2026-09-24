// PB backlog #8496 + #8352 (Hub half), 2026-09-24 -- applyInsert on the REAL
// migrated schema (api/test-support/prod-schema-db.ts: bootstrap + every
// api/schema-v*.sql, so the partial UNIQUE indexes under test are the ones
// the migration chain builds, schema-v113 included).
//
//  1. #8496: a recurring-marked title is outside the name-identity class. The
//     serial arm does not adopt it and the index does not refuse it, so a new
//     instance can be created while the last one is open. A title that merely
//     CONTAINS the word "recurring" is still deduped.
//  2. #8352: a meeting-approval re-capture that lands on an OPEN, DECLINED
//     winner resets it to 'pending' in the same Hub write that adopts it, on
//     the serial and the race-loser arm. Accepted and done winners are not
//     touched (a done one is never adopted at all).
//  3. #8352: a dedup winner that vanishes before read-back is a transient,
//     unrecorded refusal, never an 'accepted' without a canonical row.

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
  applyInsert,
  handleMutations,
  DEDUP_WINNER_VANISHED_REASON_PREFIX,
} from './mutations';
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db';
import { classifyTaskDedupSelect } from '../lib/task-dedup-sql';

const USER = { email: 'nick@example.com' } as any;
const FLAGS = { dedup: true } as any;

let db: InstanceType<typeof Database>;
let n = 0;
beforeEach(() => {
  db = prodSchemaDb();
  n = 0;
});

function ins(payload: Record<string, unknown>, recordId?: string) {
  n += 1;
  return {
    mutation_id: `mut_T${n}`, origin_machine: 'home', table: 'tasks',
    record_id: recordId ?? `task_T${n}`, op: 'insert',
    payload: { assignee: 'nick-ingraham', status: 'todo', project_id: null, ...payload },
    depends_on: null, client_ts: '2026-09-24T03:00:00Z', issued_at: '2026-09-24T03:00:00Z',
  } as any;
}

/**
 * A D1 whose FIRST dedup SELECT of the given shape answers "no row", as a true
 * race does: the winner's INSERT commits after the loser's SELECT ran. The
 * loser's INSERT then trips the partial UNIQUE index for real and the catch
 * re-queries against the real table. `after` runs once that first SELECT has
 * answered, to model a row changing inside the window.
 */
function racingD1(shape: 'title' | 'meeting', opts: { after?: () => void; missFirst?: boolean } = {}) {
  const base = d1Adapter(db);
  let seen = 0;
  return {
    ...base,
    prepare(sql: string) {
      const stmt = base.prepare(sql);
      if (classifyTaskDedupSelect(sql) !== shape) return stmt;
      const wrap = (s: any): any => ({
        ...s,
        bind: (...v: unknown[]) => wrap(s.bind(...v)),
        first: async () => {
          seen += 1;
          const real = await s.first();
          if (seen === 1) {
            opts.after?.();
            if (opts.missFirst !== false) return null;
          }
          return real;
        },
      });
      return wrap(stmt);
    },
  };
}

const rows = (where = '1=1') =>
  db.prepare(`SELECT id, title, approval_status, status, last_mutation_id FROM tasks WHERE ${where} ORDER BY id`).all() as any[];

describe('#8496 recurring-marked titles are outside the name-identity class', () => {
  it.each([
    'Weekly sync prep (recurring)',
    'Journal club prep (Recurring)',
    'Recurring: 24h audit of the importer',
    'RECURRING: monthly budget check',
    'standup_notes_RECURRING',
    '  Weekly sync prep (recurring)  ',
  ])('a second open %j is created, not adopted', async (title) => {
    const env = { DB: d1Adapter(db) } as any;
    const a = await applyInsert(env, ins({ title }), USER, FLAGS);
    const b = await applyInsert(env, ins({ title }), USER, FLAGS);
    expect(a.status).toBe('accepted');
    expect(b.status).toBe('accepted');
    expect(b.canonical_id).toBeUndefined();          // not a dedup adoption
    expect((b.canonical_payload as any).id).toBe('task_T2');
    expect(rows().map((r) => r.id)).toEqual(['task_T1', 'task_T2']);
  });

  it.each([
    'Review draft',
    'Fix recurring failure in sync-pull-morning',   // the word, not the marker
    'Send a recurring Monday Zoom invite',
    'nonrecurring task',                             // no marker token at all
  ])('control: a second open %j is still adopted', async (title) => {
    const env = { DB: d1Adapter(db) } as any;
    await applyInsert(env, ins({ title }), USER, FLAGS);
    const b = await applyInsert(env, ins({ title }), USER, FLAGS);
    expect(b.status).toBe('accepted');
    expect(b.canonical_id).toBe('task_T1');
    expect(rows()).toHaveLength(1);
  });

  it('the migrated index is the exempting one, and the superseded one is gone', () => {
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tasks'").all() as any[])
      .map((r) => r.name);
    expect(names).toContain('idx_tasks_title_norm_nonrecurring_active');
    expect(names).not.toContain('idx_tasks_title_norm_project_active');
  });

  it('the index itself: a recurring pair inserts raw, a plain pair is refused', () => {
    const raw = db.prepare("INSERT INTO tasks (id, title, assignee) VALUES (?, ?, 'nick')");
    raw.run('task_r1', 'Weekly X (recurring)');
    raw.run('task_r2', 'weekly x (RECURRING)');       // same key, still admitted
    raw.run('task_p1', 'Plain task');
    expect(() => raw.run('task_p2', ' plain TASK ')).toThrow(/UNIQUE constraint failed/);
  });

  it('race-loser, plain title: the index refuses and the catch adopts the winner', async () => {
    const env = { DB: racingD1('title', { after: () => {
      db.prepare("INSERT INTO tasks (id, title, assignee) VALUES ('task_W', 'Plain task', 'nick')").run();
    } }) } as any;
    const r = await applyInsert(env, ins({ title: 'plain task' }), USER, FLAGS);
    expect(r.status).toBe('accepted');
    expect(r.canonical_id).toBe('task_W');
    expect(rows()).toHaveLength(1);
  });

  it('race, recurring title: nothing refuses, both rows exist', async () => {
    const env = { DB: racingD1('title', { after: () => {
      db.prepare("INSERT INTO tasks (id, title, assignee) VALUES ('task_W', 'Weekly X (recurring)', 'nick')").run();
    } }) } as any;
    const r = await applyInsert(env, ins({ title: 'Weekly X (recurring)' }), USER, FLAGS);
    expect(r.status).toBe('accepted');
    expect(r.canonical_id).toBeUndefined();
    expect(rows()).toHaveLength(2);
  });
});

describe('#8352 Hub half: a declined meeting approval is reset in the adopting write', () => {
  const meeting = (extra: Record<string, unknown> = {}) => ({
    title: 'Meeting: Standup [pending approval]', source: 'meeting_approval',
    meeting_id: 'mtg_1', approval_status: 'pending', ...extra,
  });
  const seed = (approval: string, status = 'todo') =>
    db.prepare(
      "INSERT INTO tasks (id, title, assignee, source, meeting_id, approval_status, status, completed, completed_at) " +
      "VALUES ('task_W', 'Meeting: Standup [pending approval]', 'nick', 'meeting_approval', 'mtg_1', ?, ?, ?, ?)",
    ).run(approval, status, status === 'done' ? 1 : 0, status === 'done' ? '2026-09-20 12:00:00' : null);

  it('open + declined winner: adopted AND reset to pending, one row, returned as canonical', async () => {
    seed('declined');
    const env = { DB: d1Adapter(db) } as any;
    const r = await applyInsert(env, ins(meeting()), USER, FLAGS);
    expect(r.status).toBe('accepted');
    expect(r.canonical_id).toBe('task_W');
    expect((r.canonical_payload as any).approval_status).toBe('pending');
    expect(r.reason).toMatch(/reset declined -> pending/);
    expect(rows()).toEqual([expect.objectContaining({
      id: 'task_W', approval_status: 'pending', last_mutation_id: 'mut_T1' })]);
  });

  it('a second re-capture after the reset changes nothing (the WHERE is the whole rule)', async () => {
    seed('declined');
    const env = { DB: d1Adapter(db) } as any;
    await applyInsert(env, ins(meeting()), USER, FLAGS);
    const seqBefore = (db.prepare("SELECT seq FROM tasks WHERE id='task_W'").get() as any).seq;
    const r = await applyInsert(env, ins(meeting()), USER, FLAGS);
    expect(r.reason).not.toMatch(/reset/);
    expect((db.prepare("SELECT seq FROM tasks WHERE id='task_W'").get() as any).seq).toBe(seqBefore);
    expect(rows()[0].last_mutation_id).toBe('mut_T1');
  });

  it('open + accepted winner: adopted as-is', async () => {
    seed('accepted');
    const env = { DB: d1Adapter(db) } as any;
    const r = await applyInsert(env, ins(meeting()), USER, FLAGS);
    expect(r.canonical_id).toBe('task_W');
    expect((r.canonical_payload as any).approval_status).toBe('accepted');
    expect(r.reason).not.toMatch(/reset/);
  });

  it('a create that does not ask for pending never resets', async () => {
    seed('declined');
    const env = { DB: d1Adapter(db) } as any;
    const r = await applyInsert(env, ins(meeting({ approval_status: 'accepted' })), USER, FLAGS);
    expect((r.canonical_payload as any).approval_status).toBe('declined');
  });

  it('DONE + declined winner: never adopted, a new row is minted (v60 recreation intent)', async () => {
    seed('declined', 'done');
    const env = { DB: d1Adapter(db) } as any;
    const r = await applyInsert(env, ins(meeting()), USER, FLAGS);
    expect(r.canonical_id).toBeUndefined();
    expect(rows().map((x) => [x.id, x.approval_status, x.status])).toEqual([
      ['task_T1', 'pending', 'todo'],
      ['task_W', 'declined', 'done'],
    ]);
  });

  it('race-loser arm: the declined winner committed inside the window is reset too', async () => {
    const env = { DB: racingD1('meeting', { after: () => seed('declined') }) } as any;
    const r = await applyInsert(env, ins(meeting()), USER, FLAGS);
    expect(r.status).toBe('accepted');
    expect(r.canonical_id).toBe('task_W');
    expect((r.canonical_payload as any).approval_status).toBe('pending');
    expect(rows()).toHaveLength(1);
  });

  it('a winner accepted inside the window is not reset (the UPDATE is its own CAS)', async () => {
    seed('declined');
    const env = { DB: racingD1('meeting', { missFirst: false, after: () => {
      db.prepare("UPDATE tasks SET approval_status = 'accepted' WHERE id = 'task_W'").run();
    } }) } as any;
    const r = await applyInsert(env, ins(meeting()), USER, FLAGS);
    expect((r.canonical_payload as any).approval_status).toBe('accepted');
  });
});

describe('#8352: a dedup winner gone at read-back is refused, not accepted', () => {
  it('transient error, no receipt, and a retry of the same mutation_id inserts', async () => {
    db.prepare("INSERT INTO tasks (id, title, assignee) VALUES ('task_W', 'Plain task', 'nick')").run();
    const env = {
      PB_API_KEY: 'k',
      DB: racingD1('title', { missFirst: false, after: () => {
        db.prepare("DELETE FROM tasks WHERE id = 'task_W'").run();
      } }),
    } as any;
    const mut = ins({ title: 'Plain task' });
    const post = () => handleMutations(new Request('https://t/api/mutations', {
      method: 'POST', body: JSON.stringify({ mutations: [mut] }),
      headers: { authorization: 'Bearer k', 'content-type': 'application/json' },
    }), USER, env);
    const first = (await (await post()).json() as any).results[0];
    expect(first.status).toBe('error');
    expect(first.reason.startsWith(DEDUP_WINNER_VANISHED_REASON_PREFIX)).toBe(true);
    // PB pins this exact text as TRANSIENT in
    // Peripheral-Brain tests/db/test_hub_dedup_winner_vanished_is_transient.py.
    expect(first.reason).toBe(
      'dedup_winner_vanished: task_W matched the dedup SELECT but was gone at read-back; nothing written, retry');
    expect(db.prepare('SELECT 1 FROM processed_mutations WHERE mutation_id = ?').get(mut.mutation_id)).toBeUndefined();

    const second = (await (await post()).json() as any).results[0];
    expect(second.status).toBe('accepted');
    expect((second.canonical_payload as any).id).toBe(mut.record_id);
  });
});
