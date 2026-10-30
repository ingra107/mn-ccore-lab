-- schema-v152-task-steps-and-checkins.sql (2026-10-30)
--
-- Steps (child tasks under a parent) and check-ins (kind='checkin').
--
-- Nick, 2026-10-30 (PB Context/Decisions/2026-10-30-consult-followups-nick-rulings.md
-- "Task shape"): Steps: "Child tasks under a parent" -- NOT the unused
-- task_subtasks checklist. Each step stays a full task (own due, owner,
-- comments), grouped under a parent with progress ("1 of 4"). Check-ins:
-- "Their own thin kind (Recommended)": one-line row named "Check in: ...",
-- one-tap done, outside the Deep Work cap.
-- Plan: PB Scratch/plans/2026-10-30-steps-checkins-RECONCILED.md (Dual-Plan,
-- seats A + MIN, codex tie-break).
--
-- Purely ADDITIVE. tasks.parent_id is NULL on every existing row, no row has
-- kind='checkin', and every trigger below is inert until a writer sets one.
--
-- A parent is STRUCTURAL: any task with at least one live step. There is no
-- kind='parent'. "1 of 4" is derived on read (api/lib/task-steps.ts), never
-- stored. PB brain.db carries the column with no FK and no trigger: it is a
-- cache, and a cache-side check stricter than the arbiter can only lose writes.
--
-- WHAT THE SCHEMA MAKES UNREPRESENTABLE (Level 1 at the arbiter):
--   - a dangling parent: parent_id is an FK to tasks(id). D1 enforces FKs.
--   - a task that is its own parent: CHECK tasks_parent_not_self.
--   - a parent hard-deleted under its steps: ON DELETE SET NULL releases them.
--
-- WHAT STAYS LEVEL 2 (one trigger each; why Level 1 is unreachable: each is a
-- predicate over OTHER rows, which no SQLite column constraint can read):
--   - one level only (a step cannot have steps, a parent cannot become a step):
--     trg_tasks_parent_ins / trg_tasks_parent_upd. One level makes a cycle
--     impossible: a cycle needs a parent that is itself a step.
--   - a question is neither a step nor a parent (same two triggers; v142 makes
--     question-ness immutable, so a row cannot become a question later).
--   - a step attaches only to a LIVE parent (same two triggers).
--   - a restored step whose parent can no longer hold it comes back as an
--     ordinary task: trg_tasks_parent_restore_release (the depth hole a
--     soft-deleted step would otherwise open: delete step S of P, attach P
--     under G, restore S -> depth 2).
--   - a parent is not completed while any live step is open:
--     trg_tasks_parent_open_steps. A person completes the parent; this only
--     refuses the transition (plan divergence 2, MIN + codex).
--   - a check-in's title starts "Check in: ": trg_tasks_checkin_title_ins /
--     _upd. Stored, not derived at render, because Telegram cards, the Gmail
--     Apps Script and search render `title` with no kind-aware code.
--
-- Soft delete (the path every route uses): applyDelete's task dependents
-- release the parent's live steps in the delete's own batch
-- (api/routes/mutations.ts). Nothing is deleted; each step stays a full task.
--
-- HAZARD for any future `tasks` table rebuild: the rebuild's implicit DELETE
-- fires ON DELETE SET NULL here and clears every parent_id (the v124 class,
-- which cascaded task_subtasks/task_handoffs/task_files). Copy
-- (id, parent_id) aside and restore it after the rebuild.
--
-- Errors: every RAISE(ABORT) arrives at /api/mutations as code 'constraint'
-- (applyErrorResult -> isConstraintFailure), which PB maps to refuse_loud.
--
-- Rollback (Worker first, so nothing writes parent_id or kind='checkin'):
--   UPDATE tasks SET kind = 'task' WHERE kind = 'checkin';   -- record the ids first
--   DROP TRIGGER IF EXISTS trg_tasks_parent_ins;
--   DROP TRIGGER IF EXISTS trg_tasks_parent_upd;
--   DROP TRIGGER IF EXISTS trg_tasks_parent_restore_release;
--   DROP TRIGGER IF EXISTS trg_tasks_parent_open_steps;
--   DROP TRIGGER IF EXISTS trg_tasks_checkin_title_ins;
--   DROP TRIGGER IF EXISTS trg_tasks_checkin_title_upd;
--   DROP INDEX IF EXISTS idx_tasks_parent;
--   DELETE FROM schema_migrations WHERE version = 152;
--   The column STAYS: SQLite refuses DROP COLUMN on a column carrying a
--   REFERENCES clause; dropping it needs the tasks rebuild above. An inert
--   nullable column is the rollback shape.

ALTER TABLE tasks ADD COLUMN parent_id TEXT
  REFERENCES tasks(id) ON DELETE SET NULL
  CONSTRAINT tasks_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id);

CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id) WHERE parent_id IS NOT NULL;

-- ── steps: one level, live parent, no questions ─────────────────────────────
DROP TRIGGER IF EXISTS trg_tasks_parent_ins;
CREATE TRIGGER trg_tasks_parent_ins BEFORE INSERT ON tasks
FOR EACH ROW
WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN COALESCE(NEW.kind, 'task') = 'question'
      THEN RAISE(ABORT, 'task_parent_question: a question cannot be a step')
    WHEN NOT EXISTS (SELECT 1 FROM tasks p WHERE p.id = NEW.parent_id AND p.deleted_at IS NULL)
      THEN RAISE(ABORT, 'task_parent_not_live: a step''s parent must be a live task')
    WHEN EXISTS (SELECT 1 FROM tasks p WHERE p.id = NEW.parent_id AND COALESCE(p.kind, 'task') = 'question')
      THEN RAISE(ABORT, 'task_parent_question: a question cannot have steps')
    WHEN EXISTS (SELECT 1 FROM tasks p WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL)
      THEN RAISE(ABORT, 'task_parent_depth: a step cannot have steps')
  END;
END;

DROP TRIGGER IF EXISTS trg_tasks_parent_upd;
CREATE TRIGGER trg_tasks_parent_upd BEFORE UPDATE OF parent_id ON tasks
FOR EACH ROW
WHEN NEW.parent_id IS NOT NULL AND NEW.parent_id IS NOT OLD.parent_id
BEGIN
  SELECT CASE
    WHEN COALESCE(NEW.kind, 'task') = 'question'
      THEN RAISE(ABORT, 'task_parent_question: a question cannot be a step')
    WHEN NOT EXISTS (SELECT 1 FROM tasks p WHERE p.id = NEW.parent_id AND p.deleted_at IS NULL)
      THEN RAISE(ABORT, 'task_parent_not_live: a step''s parent must be a live task')
    WHEN EXISTS (SELECT 1 FROM tasks p WHERE p.id = NEW.parent_id AND COALESCE(p.kind, 'task') = 'question')
      THEN RAISE(ABORT, 'task_parent_question: a question cannot have steps')
    WHEN EXISTS (SELECT 1 FROM tasks p WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL)
      THEN RAISE(ABORT, 'task_parent_depth: a step cannot have steps')
    WHEN EXISTS (SELECT 1 FROM tasks c WHERE c.parent_id = NEW.id AND c.deleted_at IS NULL)
      THEN RAISE(ABORT, 'task_parent_depth: a task with steps cannot become a step')
  END;
END;

-- A restore (deleted_at back to NULL) of a step whose parent is gone, is a
-- step, or is a question: the step comes back as an ordinary task.
DROP TRIGGER IF EXISTS trg_tasks_parent_restore_release;
CREATE TRIGGER trg_tasks_parent_restore_release AFTER UPDATE OF deleted_at ON tasks
FOR EACH ROW
WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL AND NEW.parent_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM tasks p
    WHERE p.id = NEW.parent_id AND p.deleted_at IS NULL AND p.parent_id IS NULL
      AND COALESCE(p.kind, 'task') <> 'question'
 )
BEGIN
  UPDATE tasks SET parent_id = NULL, updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ── a parent closes only when its steps are closed ──────────────────────────
DROP TRIGGER IF EXISTS trg_tasks_parent_open_steps;
CREATE TRIGGER trg_tasks_parent_open_steps BEFORE UPDATE OF status, completed ON tasks
FOR EACH ROW
WHEN ((NEW.status = 'done' AND OLD.status IS NOT 'done')
      OR (NEW.completed = 1 AND COALESCE(OLD.completed, 0) = 0))
 AND EXISTS (
   SELECT 1 FROM tasks c
    WHERE c.parent_id = NEW.id AND c.deleted_at IS NULL
      AND COALESCE(c.status, 'todo') NOT IN ('done', 'deleted')
 )
BEGIN
  SELECT RAISE(ABORT, 'task_parent_open_steps: finish or release its steps before completing the parent');
END;

-- ── check-ins: the title says what the row is ───────────────────────────────
DROP TRIGGER IF EXISTS trg_tasks_checkin_title_ins;
CREATE TRIGGER trg_tasks_checkin_title_ins BEFORE INSERT ON tasks
FOR EACH ROW
WHEN NEW.kind = 'checkin' AND substr(COALESCE(NEW.title, ''), 1, 10) <> 'Check in: '
BEGIN
  SELECT RAISE(ABORT, 'checkin_title: a check-in''s title starts with "Check in: "');
END;

DROP TRIGGER IF EXISTS trg_tasks_checkin_title_upd;
CREATE TRIGGER trg_tasks_checkin_title_upd BEFORE UPDATE OF kind, title ON tasks
FOR EACH ROW
WHEN NEW.kind = 'checkin' AND substr(COALESCE(NEW.title, ''), 1, 10) <> 'Check in: '
BEGIN
  SELECT RAISE(ABORT, 'checkin_title: a check-in''s title starts with "Check in: "');
END;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (152, 'schema-v152-task-steps-and-checkins.sql');
