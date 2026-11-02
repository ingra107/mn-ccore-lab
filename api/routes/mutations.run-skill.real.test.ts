// schema-v155 (2026-11-02): tasks.run_skill, the teal Run button's skill, on the
// REAL migrated schema (api/test-support/prod-schema-db.ts replays every
// api/schema-v*.sql, so the column and its CHECK come from the migration).
//
// Pins: only the PB API key may change run_skill (not a hub_ui: route, not a PI
// browser session); a question or check-in never carries one; the D1 CHECK
// refuses a bad shape even from a raw write; a whole-row copy that carries the
// stored value unchanged passes; and the column's own CHECK does not block
// SQLite's DROP COLUMN (the documented rollback).

import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { applyUpdate, applyInsert, applyMutation } from './mutations';
import { prodSchemaDb, d1Adapter } from '../test-support/prod-schema-db';
import { _resetValidationFlagsCache } from '../helpers';
import { withReceiptOrigin } from '../lib/receipts';
import { runSkillError } from '../lib/task-run-skill';

const USER = { email: 'nick@example.com', slug: 'nick-ingraham', isPi: true } as any;

let db: InstanceType<typeof Database>;
let n = 0;
beforeEach(() => {
  db = prodSchemaDb();
  n = 0;
  _resetValidationFlagsCache();
  db.prepare(
    "INSERT INTO tasks (id, title, assignee, seq, status, source) VALUES ('task_A', 'Send agenda', 'nick-ingraham', 1, 'todo', 'mnccore_agenda_prep')",
  ).run();
});

const browserEnv = () => ({ DB: d1Adapter(db) } as any);
const pbKeyEnv = () => withReceiptOrigin(browserEnv(), new Request('https://hub.test/api/mutations'), true) as any;
const stored = (id = 'task_A') => (db.prepare('SELECT run_skill FROM tasks WHERE id = ?').get(id) as { run_skill: string | null } | undefined)?.run_skill;

function mut(op: 'update' | 'insert', fields: Record<string, unknown>, record = 'task_A', origin = 'home') {
  n += 1;
  return {
    mutation_id: `mut_RS_${n}`, origin_machine: origin, table: 'tasks', record_id: record, op,
    base_seq: null, base_row_hash: null,
    ...(op === 'update' ? { patch: fields } : { payload: fields }),
    depends_on: null, client_ts: '2026-11-02T12:00:00Z', issued_at: '2026-11-02T12:00:00Z',
  } as any;
}

describe('schema-v155 lands the column with its shape CHECK', () => {
  it('tasks.run_skill exists and NULL is the default', () => {
    const cols = (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain('run_skill');
    expect(stored()).toBeNull();
  });

  for (const bad of ['', 'A', 'x y', '-x', '../x', 'x.md', 'a'.repeat(65), 'x\n']) {
    it(`a raw D1 write of ${JSON.stringify(bad)} is refused by the CHECK`, () => {
      expect(() => db.prepare("UPDATE tasks SET run_skill = ? WHERE id = 'task_A'").run(bad)).toThrow(/CHECK constraint failed/);
    });
  }

  it('a raw write of a skill-directory name passes the CHECK', () => {
    db.prepare("UPDATE tasks SET run_skill = 'mnccore-agenda' WHERE id = 'task_A'").run();
    expect(stored()).toBe('mnccore-agenda');
  });

  it("rollback: DROP COLUMN works with the column's own CHECK (Hypothesis in the plan's Claims)", () => {
    db.prepare("UPDATE tasks SET run_skill = 'mnccore-agenda' WHERE id = 'task_A'").run();
    db.prepare('UPDATE tasks SET run_skill = NULL WHERE run_skill IS NOT NULL').run();
    db.exec('ALTER TABLE tasks DROP COLUMN run_skill');
    const cols = (db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).not.toContain('run_skill');
  });
});

describe('only the PB API key may change run_skill', () => {
  it('a PB-key update sets it', async () => {
    const r = await applyUpdate(pbKeyEnv(), mut('update', { run_skill: 'mnccore-agenda' }), USER);
    expect(r.status).toBe('accepted');
    expect(stored()).toBe('mnccore-agenda');
  });

  it('a PB-key insert carries it', async () => {
    const r = await applyInsert(pbKeyEnv(), mut('insert', {
      title: 'Send agenda for Nov 17', assignee: 'nick-ingraham', status: 'todo', priority: 'medium',
      source: 'mnccore_agenda_prep', run_skill: 'mnccore-agenda',
    }, 'task_B'), USER);
    expect(r.status).toBe('accepted');
    expect(stored('task_B')).toBe('mnccore-agenda');
  });

  it('a PI browser session through /api/mutations (no PB key) is refused', async () => {
    await expect(applyUpdate(browserEnv(), mut('update', { run_skill: 'mnccore-agenda' }), USER))
      .rejects.toThrow(/^run_skill_writer:/);
    expect(stored()).toBeNull();
  });

  it('a browser-session insert is refused', async () => {
    const r = await applyInsert(browserEnv(), mut('insert', {
      title: 'x', assignee: 'nick-ingraham', status: 'todo', priority: 'medium', run_skill: 'mnccore-agenda',
    }, 'task_C'), USER);
    expect(r.status).toBe('error');
    expect(String((r as any).reason ?? (r as any).error ?? JSON.stringify(r))).toMatch(/run_skill_writer/);
    expect(stored('task_C')).toBeUndefined();
  });

  it('a hub_ui: route is refused even when the request carried the PB key', async () => {
    const r = await applyMutation(pbKeyEnv(), {
      table: 'tasks', record_id: 'task_A', op: 'update', route: 'tasks_patch', patch: { run_skill: 'mnccore-agenda' }, user: USER,
    } as any);
    expect(r.status).toBe('error');
    expect(JSON.stringify(r)).toMatch(/run_skill_writer/);
    expect(stored()).toBeNull();
  });

  it('clearing it is a change too: a browser session cannot clear a PB value', async () => {
    db.prepare("UPDATE tasks SET run_skill = 'mnccore-agenda' WHERE id = 'task_A'").run();
    await expect(applyUpdate(browserEnv(), mut('update', { run_skill: null }), USER)).rejects.toThrow(/^run_skill_writer:/);
    expect(stored()).toBe('mnccore-agenda');
  });

  it('a write that carries the stored value unchanged (a whole-row copy) passes', async () => {
    db.prepare("UPDATE tasks SET run_skill = 'mnccore-agenda' WHERE id = 'task_A'").run();
    const r = await applyUpdate(browserEnv(), mut('update', { run_skill: 'mnccore-agenda', title: 'Send agenda (edited)' }), USER);
    expect(r.status).toBe('accepted');
    expect(stored()).toBe('mnccore-agenda');
  });

  it('an ordinary browser edit that does not touch run_skill is unaffected', async () => {
    db.prepare("UPDATE tasks SET run_skill = 'mnccore-agenda' WHERE id = 'task_A'").run();
    const r = await applyUpdate(browserEnv(), mut('update', { title: 'Send agenda now' }), USER);
    expect(r.status).toBe('accepted');
  });
});

describe('kinds and shape', () => {
  it('a check-in cannot carry one', async () => {
    const r = await applyInsert(pbKeyEnv(), mut('insert', {
      title: 'Check in: Casey', assignee: 'nick-ingraham', status: 'todo', priority: 'medium', kind: 'checkin', run_skill: 'mnccore-agenda',
    }, 'task_D'), USER);
    expect(r.status).toBe('error');
    expect(JSON.stringify(r)).toMatch(/run_skill_kind/);
  });

  it('a bad shape from the PB key gets a readable refusal before the CHECK', async () => {
    await expect(applyUpdate(pbKeyEnv(), mut('update', { run_skill: '../evil' }), USER)).rejects.toThrow(/^run_skill_shape:/);
  });

  it('the pure function: a question with a value is refused whoever writes it', () => {
    expect(runSkillError({}, { kind: 'question', run_skill: 'x' }, { run_skill: 'x' }, 'home', true)).toMatch(/^run_skill_kind:/);
    expect(runSkillError({}, { kind: 'task' }, {}, 'hub_ui:x', false)).toBeNull();
  });
});
