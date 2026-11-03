// schema-v157 (2026-11-03): tasks.work_kind / work_kind_set, work_kinds and
// task_sort_events on the REAL migrated schema (api/test-support/prod-schema-db.ts
// replays every api/schema-v*.sql, foreign keys ON).
//
// Pins, at the store: the FK refuses an unknown kind; the CHECK refuses a bad
// work_kind_set; the transition trigger refuses an unlogged change and admits
// a fill, an automatic clear and an event-backed sort/unsort/Reset; the sort log
// outlives its task. At the door (api/lib/task-work-kind.ts): provenance comes
// from the auth path (PB key = auto, Hub session = hand), an automatic write
// never moves a hand placement, the sort route writes its event in the same
// batch and refuses the PB key, and a caller can never send work_kind_set.
// Plus the New flag: an API-key create is not born acknowledged, and any write
// by the assignee from a Hub session acknowledges.

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { applyUpdate, applyInsert, applyMutation, applyWorkKindSort } from './mutations';
import { prodSchemaDb, d1Adapter, insertRow } from '../test-support/prod-schema-db';
import { _resetValidationFlagsCache } from '../helpers';
import { withReceiptOrigin } from '../lib/receipts';
import { classifyTriggerFailure } from '../lib/trigger-rule-codes';
import { parseSortBody, workKindPatchRefusal } from '../lib/task-work-kind';

const NICK = { email: 'ingra107@umn.edu', slug: 'nick-ingraham', name: 'Nick', isPi: true } as any;

let db: InstanceType<typeof Database>;
let n = 0;
beforeEach(() => {
  db = prodSchemaDb();
  n = 0;
  _resetValidationFlagsCache();
  db.prepare(
    "INSERT INTO tasks (id, title, assignee, seq, status) VALUES ('task_A', 'Review Casey abstract', 'nick-ingraham', 1, 'todo')",
  ).run();
});

const browserEnv = () => ({ DB: d1Adapter(db) } as any);
const pbKeyEnv = () => withReceiptOrigin(browserEnv(), new Request('https://hub.test/api/mutations'), true) as any;
const row = (id = 'task_A') =>
  db.prepare('SELECT work_kind, work_kind_set, acknowledged_at, acknowledged_by FROM tasks WHERE id = ?').get(id) as
    { work_kind: string | null; work_kind_set: string; acknowledged_at: string | null; acknowledged_by: string | null } | undefined;
const events = () => db.prepare('SELECT * FROM task_sort_events ORDER BY id').all() as Array<Record<string, unknown>>;

function mut(op: 'update' | 'insert', fields: Record<string, unknown>, record = 'task_A') {
  n += 1;
  return {
    mutation_id: `mut_WK_${n}`, origin_machine: 'home', table: 'tasks', record_id: record, op,
    base_seq: null, base_row_hash: null,
    ...(op === 'update' ? { patch: fields } : { payload: fields }),
    depends_on: null, client_ts: '2026-11-03T12:00:00Z', issued_at: '2026-11-03T12:00:00Z',
  } as any;
}

const sort = (cmd: Record<string, unknown>, env = browserEnv(), id = 'task_A') => {
  const parsed = parseSortBody(cmd, NICK.slug);
  if (typeof parsed === 'string') throw new Error(parsed);
  return applyWorkKindSort(env, { record_id: id, cmd: parsed, user: NICK });
};

describe('schema-v157 at the store', () => {
  it('seeds the four kinds and every existing row reads (NULL, auto)', () => {
    const kinds = db.prepare('SELECT code, label FROM work_kinds ORDER BY display_order').all();
    expect(kinds).toEqual([
      { code: 'review', label: 'Review' }, { code: 'writing', label: 'Writing' },
      { code: 'analysis', label: 'Analysis & Build' }, { code: 'admin', label: 'Replies & admin' },
    ]);
    expect(row()).toMatchObject({ work_kind: null, work_kind_set: 'auto' });
  });

  it('the FK refuses a kind that is not in work_kinds (fill shape, so only the FK can stop it)', () => {
    expect(() => db.prepare("UPDATE tasks SET work_kind = 'teaching' WHERE id = 'task_A'").run())
      .toThrow(/FOREIGN KEY constraint failed/);
  });

  it('a new kind is one INSERT, then fills', () => {
    db.prepare("INSERT INTO work_kinds (code, label, display_order) VALUES ('teaching', 'Teaching', 5)").run();
    db.prepare("UPDATE tasks SET work_kind = 'teaching' WHERE id = 'task_A'").run();
    expect(row()?.work_kind).toBe('teaching');
  });

  it('the CHECK refuses a work_kind_set outside auto|hand (INSERT: no trigger in front of it)', () => {
    expect(() => db.prepare(
      "INSERT INTO tasks (id, title, assignee, seq, status, work_kind_set) VALUES ('task_R', 'x', 'nick-ingraham', 2, 'todo', 'robot')",
    ).run()).toThrow(/CHECK constraint failed/);
    // On UPDATE the BEFORE trigger refuses first; either way nothing lands.
    expect(() => db.prepare("UPDATE tasks SET work_kind_set = 'robot' WHERE id = 'task_A'").run())
      .toThrow(/work_kind_transition|CHECK constraint failed/);
  });

  it('the trigger admits a fill and an automatic clear, and refuses an unlogged change', () => {
    db.prepare("UPDATE tasks SET work_kind = 'review' WHERE id = 'task_A'").run();          // fill
    expect(() => db.prepare("UPDATE tasks SET work_kind = 'writing' WHERE id = 'task_A'").run())
      .toThrow(/work_kind_transition/);                                                     // auto over auto
    expect(() => db.prepare("UPDATE tasks SET work_kind_set = 'hand' WHERE id = 'task_A'").run())
      .toThrow(/work_kind_transition/);                                                     // forged hand
    db.prepare("UPDATE tasks SET work_kind = NULL WHERE id = 'task_A'").run();              // auto clear
    expect(row()).toMatchObject({ work_kind: null, work_kind_set: 'auto' });
  });

  it('auto over hand is refused at the store', () => {
    db.prepare(
      "INSERT INTO task_sort_events (mutation_id, task_id, actor, at, op, to_kind, to_set) VALUES ('mut_x', 'task_A', 'nick-ingraham', 'now', 'sort', 'writing', 'hand')",
    ).run();
    db.prepare("UPDATE tasks SET work_kind = 'writing', work_kind_set = 'hand', last_mutation_id = 'mut_x' WHERE id = 'task_A'").run();
    expect(() => db.prepare("UPDATE tasks SET work_kind = 'review', work_kind_set = 'auto', last_mutation_id = 'mut_y' WHERE id = 'task_A'").run())
      .toThrow(/work_kind_transition/);
    expect(() => db.prepare("UPDATE tasks SET work_kind = NULL, work_kind_set = 'auto', last_mutation_id = 'mut_z' WHERE id = 'task_A'").run())
      .toThrow(/work_kind_transition/);
    expect(row()).toMatchObject({ work_kind: 'writing', work_kind_set: 'hand' });
  });

  it('an event for a DIFFERENT result does not authorize the write', () => {
    db.prepare(
      "INSERT INTO task_sort_events (mutation_id, task_id, actor, at, op, to_kind, to_set) VALUES ('mut_x', 'task_A', 'nick-ingraham', 'now', 'sort', 'writing', 'hand')",
    ).run();
    expect(() => db.prepare("UPDATE tasks SET work_kind = 'review', work_kind_set = 'hand', last_mutation_id = 'mut_x' WHERE id = 'task_A'").run())
      .toThrow(/work_kind_transition/);
  });

  it('the event CHECK ties op to its result', () => {
    expect(() => db.prepare(
      "INSERT INTO task_sort_events (mutation_id, task_id, actor, at, op, to_kind, to_set) VALUES ('m1', 'task_A', 'n', 'now', 'reset', 'review', 'auto')",
    ).run()).toThrow(/CHECK constraint failed/);
  });

  it("the trigger's rule id is a business_rule refusal", () => {
    expect(classifyTriggerFailure('work_kind_transition: a task\'s kind of work changes only ...')).toEqual(
      { code: 'business_rule', rule_id: 'work_kind_transition' });
  });
});

describe('provenance comes from the auth path', () => {
  it('a PB-key fill of an unsorted task lands as auto', async () => {
    const r = await applyUpdate(pbKeyEnv(), mut('update', { work_kind: 'review' }), NICK);
    expect(r.status).toBe('accepted');
    expect(row()).toMatchObject({ work_kind: 'review', work_kind_set: 'auto' });
    expect(events()).toEqual([]);
  });

  it('a PB-key write over a hand placement is refused, work_kind_hand_set', async () => {
    await sort({ op: 'sort', work_kind: 'writing' });
    await expect(applyUpdate(pbKeyEnv(), mut('update', { work_kind: 'review' }), NICK)).rejects.toThrow(/^work_kind_hand_set:/);
    await expect(applyUpdate(pbKeyEnv(), mut('update', { work_kind: null }), NICK)).rejects.toThrow(/^work_kind_hand_set:/);
    expect(row()).toMatchObject({ work_kind: 'writing', work_kind_set: 'hand' });
  });

  it('a PB-key write never moves a task Nick left in Sort by hand', async () => {
    await sort({ op: 'unsort' });
    await expect(applyUpdate(pbKeyEnv(), mut('update', { work_kind: 'review' }), NICK)).rejects.toThrow(/^work_kind_hand_set:/);
    expect(row()).toMatchObject({ work_kind: null, work_kind_set: 'hand' });
  });

  it('a PB-key change of one machine kind to another is refused, work_kind_fill_only', async () => {
    await applyUpdate(pbKeyEnv(), mut('update', { work_kind: 'review' }), NICK);
    await expect(applyUpdate(pbKeyEnv(), mut('update', { work_kind: 'writing' }), NICK)).rejects.toThrow(/^work_kind_fill_only:/);
  });

  it('the refusal reaches the caller as business_rule through the mutation door', async () => {
    await sort({ op: 'sort', work_kind: 'writing' });
    const r = await applyMutation(pbKeyEnv(), {
      table: 'tasks', record_id: 'task_A', op: 'update', route: 'gmail', patch: { work_kind: 'admin' }, user: NICK,
    });
    expect(r.status).toBe('error');
    expect(r.code).toBe('business_rule');
    expect(r.reason).toMatch(/work_kind_hand_set/);
  });

  it('a PB-key write carrying the stored value unchanged passes (a whole-row echo)', async () => {
    await sort({ op: 'sort', work_kind: 'writing' });
    const r = await applyUpdate(pbKeyEnv(), mut('update', { work_kind: 'writing', title: 'Review Casey abstract v2' }), NICK);
    expect(r.status).toBe('accepted');
    expect(row()).toMatchObject({ work_kind: 'writing', work_kind_set: 'hand' });
  });

  it('a Hub session cannot change work_kind through the generic door', async () => {
    await expect(applyUpdate(browserEnv(), mut('update', { work_kind: 'review' }), NICK)).rejects.toThrow(/^work_kind_writer:/);
    expect(row()?.work_kind).toBeNull();
  });

  it('an unknown or retired kind is refused at the door', async () => {
    await expect(applyUpdate(pbKeyEnv(), mut('update', { work_kind: 'teaching' }), NICK)).rejects.toThrow(/^work_kind_unknown:/);
    db.prepare("UPDATE work_kinds SET active = 0 WHERE code = 'admin'").run();
    await expect(applyUpdate(pbKeyEnv(), mut('update', { work_kind: 'admin' }), NICK)).rejects.toThrow(/retired/);
  });

  it('no caller can send work_kind_set (not a wire field)', async () => {
    const r = await applyMutation(pbKeyEnv(), {
      table: 'tasks', record_id: 'task_A', op: 'update', route: 'x', patch: { work_kind_set: 'hand' }, user: NICK,
    });
    expect(r.status).toBe('error');
    expect(r.code).toBe('unknown_field');
    expect(row()?.work_kind_set).toBe('auto');
  });

  it('a PB-key insert with a kind is auto; a Hub-session insert with a kind is hand', async () => {
    const pb = await applyInsert(pbKeyEnv(), mut('insert', {
      title: 'Sign the IRB form', assignee: 'nick-ingraham', status: 'todo', priority: 'medium', work_kind: 'admin',
    }, 'task_PB'), NICK);
    expect(pb.status).toBe('accepted');
    expect(row('task_PB')).toMatchObject({ work_kind: 'admin', work_kind_set: 'auto' });
    const hub = await applyInsert(browserEnv(), mut('insert', {
      title: 'Draft Aim 2', assignee: 'nick-ingraham', status: 'todo', priority: 'medium', work_kind: 'writing',
    }, 'task_HUB'), NICK);
    expect(hub.status).toBe('accepted');
    expect(row('task_HUB')).toMatchObject({ work_kind: 'writing', work_kind_set: 'hand' });
    const none = await applyInsert(browserEnv(), mut('insert', {
      title: 'No kind', assignee: 'nick-ingraham', status: 'todo', priority: 'medium',
    }, 'task_NONE'), NICK);
    expect(none.status).toBe('accepted');
    expect(row('task_NONE')).toMatchObject({ work_kind: null, work_kind_set: 'auto' });
  });

  it('a Hub-session insert with a kind for SOMEONE ELSE is auto (their placement to make)', async () => {
    const r = await applyInsert(browserEnv(), mut('insert', {
      title: 'Fix the cohort join', assignee: 'casey-eddington', status: 'todo', priority: 'medium', work_kind: 'analysis',
    }, 'task_CASEY'), NICK);
    expect(r.status).toBe('accepted');
    expect(row('task_CASEY')).toMatchObject({ work_kind: 'analysis', work_kind_set: 'auto' });
  });

  it('an insert with an unknown kind is refused before anything is written', async () => {
    const r = await applyInsert(pbKeyEnv(), mut('insert', {
      title: 'x', assignee: 'nick-ingraham', status: 'todo', priority: 'medium', work_kind: 'focus',
    }, 'task_BAD'), NICK);
    expect(r.status).toBe('error');
    expect(JSON.stringify(r)).toMatch(/work_kind_unknown/);
    expect(row('task_BAD')).toBeUndefined();
  });
});

describe('the sort route: hand sort, unsort, Reset, each logged in the same batch', () => {
  it('sort -> (kind, hand) with one event', async () => {
    const r = await sort({ op: 'sort', work_kind: 'analysis', from_section: 'sort', missing_category_note: 'teaching?' });
    expect(r.status).toBe('accepted');
    expect(row()).toMatchObject({ work_kind: 'analysis', work_kind_set: 'hand' });
    const [e] = events();
    expect(e).toMatchObject({
      task_id: 'task_A', actor: 'nick-ingraham', op: 'sort', from_kind: null, from_set: 'auto',
      to_kind: 'analysis', to_set: 'hand', from_section: 'sort', missing_category_note: 'teaching?',
      mutation_id: r.mutation_id,
    });
  });

  it('unsort -> (NULL, hand); Reset -> (NULL, auto); each logged', async () => {
    await sort({ op: 'sort', work_kind: 'review' });
    await sort({ op: 'unsort', from_section: 'review' });
    expect(row()).toMatchObject({ work_kind: null, work_kind_set: 'hand' });
    await sort({ op: 'reset' });
    expect(row()).toMatchObject({ work_kind: null, work_kind_set: 'auto' });
    expect(events().map((e) => [e.op, e.from_kind, e.from_set, e.to_kind, e.to_set])).toEqual([
      ['sort', null, 'auto', 'review', 'hand'],
      ['unsort', 'review', 'hand', null, 'hand'],
      ['reset', null, 'hand', null, 'auto'],
    ]);
    // After Reset the fill may place it again.
    const r = await applyUpdate(pbKeyEnv(), mut('update', { work_kind: 'admin' }), NICK);
    expect(r.status).toBe('accepted');
  });

  it('confirming the current kind is still one logged action', async () => {
    await sort({ op: 'sort', work_kind: 'review' });
    const r = await sort({ op: 'sort', work_kind: 'review' });
    expect(r.status).toBe('accepted');
    expect(events()).toHaveLength(2);
  });

  it('hand overrides an automatic kind', async () => {
    await applyUpdate(pbKeyEnv(), mut('update', { work_kind: 'admin' }), NICK);
    await sort({ op: 'sort', work_kind: 'writing' });
    expect(row()).toMatchObject({ work_kind: 'writing', work_kind_set: 'hand' });
  });

  it('the PB key cannot sort by hand', async () => {
    const r = await sort({ op: 'sort', work_kind: 'writing' }, pbKeyEnv());
    expect(r.status).toBe('error');
    expect(r.reason).toMatch(/work_kind_writer/);
    expect(events()).toEqual([]);
  });

  it('only the assignee can sort by hand (code review 2026-11-03)', async () => {
    db.prepare("UPDATE tasks SET assignee = 'casey-eddington' WHERE id = 'task_A'").run();
    const r = await sort({ op: 'sort', work_kind: 'writing' });
    expect(r.status).toBe('error');
    expect(r.reason).toMatch(/work_kind_not_assignee/);
    expect(events()).toEqual([]);
    expect(row()).toMatchObject({ work_kind: null, work_kind_set: 'auto' });
  });

  it('an unknown kind is refused and leaves no event', async () => {
    const r = await sort({ op: 'sort', work_kind: 'teaching' });
    expect(r.status).toBe('error');
    expect(events()).toEqual([]);
    expect(row()).toMatchObject({ work_kind: null, work_kind_set: 'auto' });
  });

  it('a missing task is record_not_found, no event', async () => {
    const r = await sort({ op: 'sort', work_kind: 'review' }, browserEnv(), 'task_NOPE');
    expect(r.code).toBe('record_not_found');
    expect(events()).toEqual([]);
  });

  it('the log outlives a deleted task (no FK to tasks)', async () => {
    await sort({ op: 'sort', work_kind: 'review' });
    db.prepare("DELETE FROM tasks WHERE id = 'task_A'").run();
    expect(events()).toHaveLength(1);
  });

  it('parseSortBody refuses malformed commands', () => {
    expect(parseSortBody({ op: 'sort' }, 'x')).toMatch(/needs work_kind/);
    expect(parseSortBody({ op: 'reset', work_kind: 'review' }, 'x')).toMatch(/takes no work_kind/);
    expect(parseSortBody({ op: 'pin' }, 'x')).toMatch(/op must be/);
    expect(parseSortBody({ op: 'unsort', from_section: 7 }, 'x')).toMatch(/from_section/);
    expect(parseSortBody({ op: 'sort', work_kind: 'review', work_kind_set: 'auto' }, 'x')).toMatchObject({ op: 'sort' });
  });

  it('the pure rule', () => {
    expect(workKindPatchRefusal({ work_kind: null, work_kind_set: 'auto' }, { title: 'x' }, true)).toBeNull();
    expect(workKindPatchRefusal({ work_kind: null, work_kind_set: 'auto' }, { work_kind: 'review' }, true)).toBeNull();
    expect(workKindPatchRefusal({ work_kind: 'review', work_kind_set: 'auto' }, { work_kind: null }, true)).toBeNull();
    expect(workKindPatchRefusal({ work_kind: 'review', work_kind_set: 'auto' }, { work_kind: 'admin' }, true)?.code).toBe('business_rule');
    expect(workKindPatchRefusal({ work_kind: null, work_kind_set: 'hand' }, { work_kind: 'admin' }, true)?.message).toMatch(/^work_kind_hand_set/);
    expect(workKindPatchRefusal({ work_kind: null, work_kind_set: 'auto' }, { work_kind: 'admin' }, false)?.code).toBe('value_invalid');
  });
});

describe('the New flag (acknowledged_at)', () => {
  const create = (env: any, id: string) => applyInsert(env, mut('insert', {
    title: `Task ${id}`, assignee: 'nick-ingraham', status: 'todo', priority: 'medium',
  }, id), NICK);

  it('an API-key create is NOT born acknowledged, even though the key resolves to Nick', async () => {
    await create(pbKeyEnv(), 'task_M');
    expect(row('task_M')).toMatchObject({ acknowledged_at: null, acknowledged_by: null });
  });

  it('a Hub-session create by its own assignee is still born acknowledged', async () => {
    await create(browserEnv(), 'task_S');
    expect(row('task_S')?.acknowledged_at).toBeTruthy();
    expect(row('task_S')?.acknowledged_by).toBe('nick-ingraham');
  });

  it('any Hub-session write by the assignee acknowledges (a date change)', async () => {
    const r = await applyMutation(browserEnv(), {
      table: 'tasks', record_id: 'task_A', op: 'update', route: 'handleUpdateTask', patch: { due_date: '2026-11-10' }, user: NICK,
    });
    expect(r.status).toBe('accepted');
    expect(row()?.acknowledged_at).toBeTruthy();
    expect(row()?.acknowledged_by).toBe('nick-ingraham');
  });

  it('a hand sort acknowledges too', async () => {
    await sort({ op: 'sort', work_kind: 'review' });
    expect(row()?.acknowledged_at).toBeTruthy();
  });

  it('a PB-key write does not acknowledge', async () => {
    await applyUpdate(pbKeyEnv(), mut('update', { due_date: '2026-11-10' }), NICK);
    expect(row()?.acknowledged_at).toBeNull();
  });

  it("someone else's Hub write does not acknowledge Nick's task", async () => {
    const CASEY = { email: 'casey@umn.edu', slug: 'casey-eddington', name: 'Casey' } as any;
    await applyMutation(browserEnv(), {
      table: 'tasks', record_id: 'task_A', op: 'update', route: 'handleUpdateTask', patch: { due_date: '2026-11-10' }, user: CASEY,
    });
    expect(row()?.acknowledged_at).toBeNull();
  });

  it('reassigning still clears it for the new owner', async () => {
    db.prepare("UPDATE tasks SET acknowledged_at = '2026-11-01 00:00:00', acknowledged_by = 'nick-ingraham' WHERE id = 'task_A'").run();
    await applyMutation(browserEnv(), {
      table: 'tasks', record_id: 'task_A', op: 'update', route: 'handleUpdateTask', patch: { assignee: 'casey-eddington' }, user: NICK,
    });
    expect(row()).toMatchObject({ acknowledged_at: null, acknowledged_by: null });
  });
});

describe('a sort whose row write misses compare-and-swap leaves no event behind', () => {
  it('first attempt misses (row moved), retry lands: exactly one event, for the write that happened', async () => {
    let fired = false;
    const env = {
      DB: d1Adapter(db, {
        beforeBatch: () => {
          if (fired) return;
          fired = true;
          db.prepare("UPDATE tasks SET title = 'moved', last_mutation_id = 'mut_other' WHERE id = 'task_A'").run();
        },
      }),
    } as any;
    const r = await sort({ op: 'sort', work_kind: 'writing' }, env);
    expect(fired).toBe(true);
    expect(r.status).toBe('accepted');
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ mutation_id: r.mutation_id, to_kind: 'writing', to_set: 'hand' });
  });

  it('three misses in a row: the sort fails and the log holds nothing', async () => {
    let k = 0;
    const env = {
      DB: d1Adapter(db, {
        beforeBatch: () => {
          k += 1;
          db.prepare(`UPDATE tasks SET title = 'moved ${k}', last_mutation_id = 'mut_o${k}' WHERE id = 'task_A'`).run();
        },
      }),
    } as any;
    const r = await sort({ op: 'sort', work_kind: 'writing' }, env);
    expect(r.status).not.toBe('accepted');
    expect(events()).toEqual([]);
    expect(row()).toMatchObject({ work_kind: null, work_kind_set: 'auto' });
  });
});

describe('GET /api/tasks?others_of=<slug> (the With others section)', () => {
  it('returns open work that sits with someone else in my projects or that I assigned, never my own', async () => {
    const { handleGetTasks } = await import('./tasks');
    db.prepare("INSERT INTO team_members (id, slug, name, role, email) VALUES ('m1', 'nick-ingraham', 'Nick', 'pi', 'ingra107@umn.edu')").run();
    db.prepare("INSERT INTO team_members (id, slug, name, role, email) VALUES ('m2', 'casey-eddington', 'Casey', 'member', 'casey@umn.edu')").run();
    insertRow(db, 'projects', { id: 'proj_MINE', slug: 'mine', title: 'Mine' });
    insertRow(db, 'projects', { id: 'proj_THEIRS', slug: 'theirs', title: 'Theirs' });
    db.prepare("INSERT INTO project_members (project_id, member_slug, added_by) VALUES ('proj_MINE', 'nick-ingraham', 'x')").run();
    const ins = db.prepare('INSERT INTO tasks (id, title, assignee, seq, status, project_id, assigned_by) VALUES (?, ?, ?, ?, ?, ?, ?)');
    ins.run('t_member', 'Casey in my project', 'casey-eddington', 10, 'todo', 'proj_MINE', null);
    ins.run('t_assigned', 'I assigned it', 'casey-eddington', 11, 'todo', 'proj_THEIRS', 'INGRA107@umn.edu');
    ins.run('t_assigned_slug', 'Older slug assigner', 'casey-eddington', 12, 'todo', null, 'nick-ingraham');
    ins.run('t_other', 'Not my business', 'casey-eddington', 13, 'todo', 'proj_THEIRS', 'casey@umn.edu');
    ins.run('t_mine', 'Mine in my project', 'nick-ingraham', 14, 'todo', 'proj_MINE', null);
    const res = await handleGetTasks(new URL('https://hub.test/api/tasks?others_of=nick-ingraham&completed=false'), browserEnv());
    const ids = ((await res.json()) as { data: Array<{ id: string }> }).data.map((t) => t.id).sort();
    expect(ids).toEqual(['t_assigned', 't_assigned_slug', 't_member']);
  });
});
