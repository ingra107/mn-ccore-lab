-- v52 — fix v51 trigger UPDATE OF column gap
--
-- v51 listed specific columns in UPDATE OF for the seq-bump triggers.
-- That list was incomplete:
--   projects missing: pi_context, strategic_context, short_name,
--                     key_link_1, key_link_1_desc, key_link_2, ..._3
--   tasks missing:    instructions, watchers, reminder_days, deadline
-- An UPDATE that touched ONLY a missing column did not fire the trigger,
-- so seq stayed put and brain.db never re-pulled the change. Class of
-- silent-data-loss bug exactly equivalent to the wall-clock-cursor bug
-- the migration was supposed to fix.
--
-- Fix: drop the AFTER UPDATE OF triggers, replace with AFTER UPDATE
-- (no OF clause) so they fire on EVERY row update. The WHEN NEW.seq =
-- OLD.seq guard prevents recursion (when the trigger itself UPDATEs
-- seq, OLD.seq != NEW.seq so the trigger doesn't re-fire).
--
-- Cost: triggers fire on display-only column updates too (e.g.
-- group_override, acknowledged_at). Pulls that re-fetch those rows
-- compare local + remote and find no real change → counted as
-- skipped_stale. Tiny extra network cost, no correctness issue.
-- Worth it to eliminate the column-drift bug class entirely.

DROP TRIGGER IF EXISTS trg_projects_seq_update;
CREATE TRIGGER trg_projects_seq_update AFTER UPDATE ON projects
FOR EACH ROW
WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE projects
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM projects WHERE id != NEW.id)
  WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS trg_tasks_seq_update;
CREATE TRIGGER trg_tasks_seq_update AFTER UPDATE ON tasks
FOR EACH ROW
WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE tasks
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM tasks WHERE id != NEW.id)
  WHERE id = NEW.id;
END;
