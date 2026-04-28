-- v53 — fix v52 seq trigger: include self in MAX(seq) computation
-- anti-pattern-allowed-file: this file's body comment quotes the v52 buggy
--   line `MAX(seq) WHERE id != NEW.id` to document what's being fixed.
--   The actual trigger DDL below uses `MAX(seq)` with no `WHERE id != NEW.id`.
--   File is the FIX.
--
-- v52 fixed the column-coverage gap by removing UPDATE OF (so triggers
-- fire on every column change). But the trigger body still excludes the
-- row itself from the MAX(seq) calc:
--
--   SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM projects WHERE id != NEW.id)
--
-- Consequence: if a row is currently the highest-seq row, consecutive
-- UPDATEs to that same row don't bump seq because MAX(other rows) <
-- this row's seq. Smoke test 2026-04-28T12:50 reproduced exactly this:
-- 3 UPDATEs on `p1-gender-disparities-low-tidal-volume` all kept seq=164.
--
-- Real-world impact: if a user edits the same project twice in a row,
-- brain.db pulls the first edit (seq advanced past last_seen_seq) but
-- the second edit never propagates (seq didn't move).
--
-- Fix: drop `WHERE id != NEW.id`. Include the row itself in MAX. Now:
--   row1 starts seq=164. UPDATE fires. MAX(seq) = 164. Set seq=165.
--   Trigger re-fires: NEW.seq=165, OLD.seq=164 → WHEN guard fails → recursion stops.
--   Next UPDATE on same row: NEW.seq=165, OLD.seq=165 → guard passes → trigger
--   computes MAX = 165 → set seq=166. Recursion stops on subsequent fire.
--
-- The recursion guard `WHEN NEW.seq = OLD.seq` still prevents infinite loops:
-- the trigger's own inner UPDATE changes NEW.seq != OLD.seq for the
-- recursive trigger invocation, so it short-circuits.

DROP TRIGGER IF EXISTS trg_projects_seq_update;
CREATE TRIGGER trg_projects_seq_update AFTER UPDATE ON projects
FOR EACH ROW
WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE projects
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM projects)
  WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS trg_tasks_seq_update;
CREATE TRIGGER trg_tasks_seq_update AFTER UPDATE ON tasks
FOR EACH ROW
WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE tasks
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM tasks)
  WHERE id = NEW.id;
END;

-- INSERT triggers also had `WHERE rowid != NEW.rowid`. For inserts that's
-- correct (the new row's seq=0 at trigger time, so excluding itself doesn't
-- matter — MAX still picks up all existing rows). Leaving INSERT triggers
-- alone; the bug is UPDATE-only.
