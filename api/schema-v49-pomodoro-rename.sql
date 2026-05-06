-- schema-v49-pomodoro-rename.sql
-- Resolves Stage 3 Phase 1 name collision: existing Hub UI pomodoro_sessions
-- renamed to hub_pomodoro_slots, then Stage 3 PB-sync pomodoro_sessions applied.
--
-- Background:
--   schema-v48-stage3-8tables.sql applied 8 of 9 Stage 3 tables (2026-05-06).
--   pomodoro_sessions was excluded because the name was already taken by the
--   Hub UI slot-tracker (id TEXT PK, plan_date, slot_type, etc.).
--   Nick chose Option A: rename Hub UI table → hub_pomodoro_slots, then apply
--   the Stage 3 PB Pomodoro timer schema under the original name.
--
-- Nick decision: PB chat 2026-05-06 16:00Z
-- ============================================================

-- Step 1: Create hub_pomodoro_slots with the Hub UI schema
--         (mirrors schema-v20.sql exactly, new name)
CREATE TABLE IF NOT EXISTS hub_pomodoro_slots (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  plan_date TEXT NOT NULL,
  slot_type TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_minutes INTEGER DEFAULT 25,
  completed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Step 2: Copy existing rows from the old Hub UI table
INSERT INTO hub_pomodoro_slots SELECT * FROM pomodoro_sessions;

-- Step 3: Drop old indexes before dropping the table
DROP INDEX IF EXISTS idx_pomo_task;
DROP INDEX IF EXISTS idx_pomo_date;

-- Step 4: Drop the old Hub UI table
DROP TABLE pomodoro_sessions;

-- Step 5: Recreate indexes on hub_pomodoro_slots
CREATE INDEX IF NOT EXISTS idx_pomo_slots_task ON hub_pomodoro_slots(task_id);
CREATE INDEX IF NOT EXISTS idx_pomo_slots_date ON hub_pomodoro_slots(plan_date);

-- ============================================================
-- Stage 3 schema-v48 carve-out: pomodoro_sessions (PB Pomodoro timer)
-- Source: proposed-hub-schema-v48.sql lines 162-195
-- PK = (start_time, source); machine_id + seq per substrate-doctrine plan
-- ============================================================
CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  task_id        TEXT,
  project_id     TEXT,
  start_time     TEXT NOT NULL,
  end_time       TEXT,
  duration_min   INTEGER,
  completed      INTEGER,
  notes          TEXT,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now')),
  source         TEXT NOT NULL,
  confidence_score REAL,
  phase          TEXT,
  machine_id     TEXT,
  seq            INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (start_time, source)
);
CREATE INDEX IF NOT EXISTS idx_pomodoro_machine    ON pomodoro_sessions(machine_id);
CREATE INDEX IF NOT EXISTS idx_pomodoro_project    ON pomodoro_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_pomodoro_start_time ON pomodoro_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_pomodoro_seq        ON pomodoro_sessions(seq);

DROP TRIGGER IF EXISTS trg_pomodoro_seq_insert;
CREATE TRIGGER trg_pomodoro_seq_insert AFTER INSERT ON pomodoro_sessions
FOR EACH ROW WHEN NEW.seq = 0
BEGIN
  UPDATE pomodoro_sessions SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM pomodoro_sessions WHERE rowid != NEW.rowid) WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_pomodoro_seq_update;
CREATE TRIGGER trg_pomodoro_seq_update AFTER UPDATE ON pomodoro_sessions
FOR EACH ROW WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE pomodoro_sessions SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM pomodoro_sessions) WHERE start_time = NEW.start_time AND source = NEW.source;
END;
