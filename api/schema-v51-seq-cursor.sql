-- v51 — server-assigned monotonic seq cursor for projects + tasks
-- anti-pattern-allowed-file: this file documents the FIRST iteration of the
--   seq-cursor work and contains the v51 anti-patterns (AFTER UPDATE OF
--   column lists; MAX(seq) WHERE id != NEW.id) that were SUPERSEDED by
--   v52 + v53 (DROP TRIGGER + CREATE TRIGGER without OF and including self
--   in MAX). Production state is v53. v51 file kept as historical record;
--   Codex Mechanism #2 anti-pattern checker would correctly flag this
--   file's contents as bugs — they were the bugs we fixed.
--
-- Per Context/Topics/research-bidirectional-sync-2026-04-28.md (Peripheral
-- Brain repo) and the 2026-04-28 home<->work brainstorm, replace wall-clock
-- updated_at as the sync pull cursor with a server-assigned monotonic
-- sequence number. D1 single-primary serializes writes (SQLite under the
-- hood), so a `(SELECT COALESCE(MAX(seq),0) + 1 FROM <tbl>)` expression
-- inside an UPDATE statement is race-free without needing a Durable Object.
--
-- Triggers (rather than rewriting ~24 INSERT/UPDATE call sites in
-- api/routes/projects.ts + api/routes/tasks.ts) auto-stamp `seq` on every
-- write that mutates a sync-relevant column. Hub-only fields (group_override,
-- acknowledged_at, deleted_at-only updates) are excluded from the
-- UPDATE OF column list to avoid bumping seq on display-only changes.
--
-- The pull-side change (api/routes/projects.ts + tasks.ts GET handlers)
-- adds a ?seq_after=N query param; brain.db's hub.py driver flips to that
-- param via PB_USE_SEQ_CURSOR=1 env gate (see Peripheral-Brain
-- scripts/db/sync/drivers/hub.py — home is shipping that side).
--
-- Backfill: existing rows get seq = rowid as a one-time ordering seed.
-- D1 / SQLite ROWID is insert-order at backfill time, so the seeded seq
-- values reflect the order rows were inserted historically. Note that
-- ROWID itself is NOT durable — `VACUUM` (and certain pragmas) can
-- renumber rowids on tables without an INTEGER PRIMARY KEY alias.
-- These tables use `id TEXT PRIMARY KEY`, not INTEGER PK, so rowid is
-- a non-aliased system rowid that could shift. AFTER the one-time
-- backfill writes a persisted `seq INTEGER` value into the row, that
-- value is durable. Triggers maintain seq strictly via MAX(seq)+1, so
-- post-backfill seq is independent of ROWID changes.
-- New rows get seq = MAX(seq) + 1 from the trigger on first write.
-- Both paths produce strictly-increasing seq globally per table.
--
-- Rollback: drop triggers + drop column. brain.db's hub.py respects
-- PB_USE_SEQ_CURSOR=0 (default) and continues using updated_at cursor
-- until both sides confirm cutover. No schema rollback needed for cutoff.

-- ── Schema additions ───────────────────────────────────────────────────────

ALTER TABLE projects ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_projects_seq ON projects(seq);
CREATE INDEX IF NOT EXISTS idx_tasks_seq ON tasks(seq);

-- ── Backfill (one-shot; rowid preserves insert order) ──────────────────────

UPDATE projects SET seq = rowid WHERE seq = 0;
UPDATE tasks SET seq = rowid WHERE seq = 0;

-- ── Triggers — auto-bump seq on every sync-relevant write ──────────────────

-- Projects: bump seq on insert (covers row creation from any handler)
DROP TRIGGER IF EXISTS trg_projects_seq_insert;
CREATE TRIGGER trg_projects_seq_insert AFTER INSERT ON projects
FOR EACH ROW
WHEN NEW.seq = 0
BEGIN
  UPDATE projects
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM projects WHERE rowid != NEW.rowid)
  WHERE rowid = NEW.rowid;
END;

-- Projects: bump seq on update of sync-relevant columns. The WHEN guard
-- prevents recursive trigger firing (the trigger's own UPDATE sets seq;
-- we don't want to fire again on that update).
DROP TRIGGER IF EXISTS trg_projects_seq_update;
CREATE TRIGGER trg_projects_seq_update
AFTER UPDATE OF
  title, status, description, category, pi, slug, stage, deleted_at, stage_notes
ON projects
FOR EACH ROW
WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE projects
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM projects WHERE id != NEW.id)
  WHERE id = NEW.id;
END;

-- Tasks: same pattern. UPDATE OF list omits Hub-only fields like
-- group_override + acknowledged_at + acknowledged_by — those are display
-- preferences, not sync-relevant changes.
DROP TRIGGER IF EXISTS trg_tasks_seq_insert;
CREATE TRIGGER trg_tasks_seq_insert AFTER INSERT ON tasks
FOR EACH ROW
WHEN NEW.seq = 0
BEGIN
  UPDATE tasks
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM tasks WHERE rowid != NEW.rowid)
  WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_tasks_seq_update;
CREATE TRIGGER trg_tasks_seq_update
AFTER UPDATE OF
  title, description, assignee, project_id, due_date, priority, status,
  source, completed, completed_at, completed_by, deleted_at, notes,
  effort, short_title, key_link_1, key_link_1_desc, key_link_2,
  key_link_2_desc, key_link_3, key_link_3_desc, source_thread_id,
  related_message_ids, blocked_by, description_json, meeting_id,
  assigned_by
ON tasks
FOR EACH ROW
WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE tasks
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM tasks WHERE id != NEW.id)
  WHERE id = NEW.id;
END;

-- ── Sanity checks (informational; D1 ignores SELECT in migrations) ─────────
-- Expected post-migration state:
--   - projects.seq is 1..N (no zeros, no gaps unless rowid skipped)
--   - tasks.seq is 1..N
--   - max(seq) per table = COUNT(*) per table
--
-- After deploy, GET /api/projects?seq_after=0 should return all rows
-- ordered by seq ASC. GET /api/projects?seq_after=<max-on-client> returns
-- only newer rows. brain.db pulls with last_seen_seq from sync_cursors.
