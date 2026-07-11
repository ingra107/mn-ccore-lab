// schema-v98 tasks completion-triad guard — SQL trigger-level tests.
//
// Runs against a REAL SQLite engine (better-sqlite3), applying the ACTUAL
// migration file (schema-v98-tasks-completion-triad-guard.sql) via readFileSync,
// following the established fixture pattern in
// api/routes/dependencies.slice-d.test.ts (real engine + minimal hand-rolled
// table DDL + the real migration SQL — the in-memory JS-object D1 stub used
// elsewhere in this repo, e.g. mutations.enum-validation.test.ts, cannot
// exercise actual trigger/RAISE(ABORT) behavior).
//
// The seq-trigger interaction case also applies the real schema-v53 seq
// trigger (trg_tasks_seq_update) so we can prove the new BEFORE INSERT/UPDATE
// guard doesn't interfere with the pre-existing AFTER UPDATE seq trigger.
// schema-v53-seq-trigger-include-self.sql also (re)creates
// trg_projects_seq_update ON projects, so a minimal `projects` table is
// included in the fixture purely so that CREATE TRIGGER doesn't fail on a
// missing table — no other test in this file touches projects.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const V98_SQL = readFileSync(
  join(__dirname, 'schema-v98-tasks-completion-triad-guard.sql'),
  'utf-8',
);
const SEQ_TRIGGER_SQL = readFileSync(
  join(__dirname, 'schema-v53-seq-trigger-include-self.sql'),
  'utf-8',
);

// Minimal fixture DDL — only the columns the two trigger files reference.
const FIXTURE_DDL = `
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    status TEXT,
    completed INTEGER,
    completed_at TEXT,
    deleted_at TEXT,
    seq INTEGER DEFAULT 0
  );
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    seq INTEGER DEFAULT 0
  );
`;

let db: InstanceType<typeof Database>;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(FIXTURE_DDL);
  // seq trigger (schema-v53) precedes the new guard (schema-v98), matching
  // real migration application order (ascending version number).
  db.exec(SEQ_TRIGGER_SQL);
  db.exec(V98_SQL);
});

describe('schema-v98 tasks completion-triad guard trigger', () => {
  it('rejects INSERT with status=done, completed!=1, completed_at NULL', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO tasks (id, status, completed, completed_at) VALUES (?, 'done', 0, NULL)`,
      ).run('task_bad_ins_1');
    }).toThrow(/tasks completion triad guard/);
  });

  it('accepts INSERT with status=done, completed=1, completed_at set (legit)', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO tasks (id, status, completed, completed_at) VALUES (?, 'done', 1, '2026-07-10 00:00:00')`,
      ).run('task_good_ins_1');
    }).not.toThrow();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get('task_good_ins_1');
    expect(row).toBeTruthy();
  });

  it('rejects INSERT with completed_at set but completed != 1 (4th clause)', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO tasks (id, status, completed, completed_at) VALUES (?, 'todo', 0, '2026-07-10 00:00:00')`,
      ).run('task_bad_ins_2');
    }).toThrow(/tasks completion triad guard/);
  });

  it('rejects UPDATE that sets status=done without flipping completed/completed_at', () => {
    db.prepare(
      `INSERT INTO tasks (id, status, completed, completed_at) VALUES (?, 'todo', 0, NULL)`,
    ).run('task_upd_1');
    expect(() => {
      db.prepare(`UPDATE tasks SET status = 'done' WHERE id = ?`).run('task_upd_1');
    }).toThrow(/tasks completion triad guard/);
  });

  it('allows UPDATE to status=deleted on a completed row (tombstone exemption)', () => {
    db.prepare(
      `INSERT INTO tasks (id, status, completed, completed_at) VALUES (?, 'done', 1, '2026-07-10 00:00:00')`,
    ).run('task_del_1');
    expect(() => {
      db.prepare(`UPDATE tasks SET status = 'deleted' WHERE id = ?`).run('task_del_1');
    }).not.toThrow();
    const row: any = db.prepare('SELECT * FROM tasks WHERE id = ?').get('task_del_1');
    expect(row.status).toBe('deleted');
  });

  it('seq-trigger interaction untouched — a benign UPDATE still bumps seq via trg_tasks_seq_update', () => {
    db.prepare(
      `INSERT INTO tasks (id, status, completed, completed_at, seq) VALUES (?, 'todo', 0, NULL, 5)`,
    ).run('task_seq_1');
    expect(() => {
      db.prepare(`UPDATE tasks SET status = 'todo' WHERE id = ?`).run('task_seq_1');
    }).not.toThrow();
    const row: any = db.prepare('SELECT * FROM tasks WHERE id = ?').get('task_seq_1');
    expect(row.seq).toBeGreaterThan(5);
  });
});
