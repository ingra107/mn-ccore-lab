-- schema-v157-tasks-work-kind.sql (2026-11-03)
--
-- Today sections by kind of work. Nick, 2026-11-03: "Set when created, nightly
-- fill-in for blanks (Recommended)"; "Hand placement beats everything
-- (Recommended)"; and on the Sort strip: "we will keep track of how often I'm
-- doing this and if we need a different category". Decision: PB
-- Context/Decisions/2026-11-03-today-sections-and-checkin-prefix.md. Plan: PB
-- Scratch/plans/2026-11-03-today-sections-RECONCILED.md (seats L1 + MIN, codex
-- tie-break Scratch/consults/2026-11-03-today-sections/round3/codex-last.md).
--
-- WHAT IT ADDS (purely additive; every existing row reads (NULL, 'auto'), which
-- is "not sorted yet", so the Sort strip holds them until the fill runs):
--   work_kinds          the kinds of work, a LOOKUP TABLE (precedent:
--                       link_kinds for links.kind), so a kind Nick finds missing
--                       is one INSERT, never a CHECK rebuild or a deploy.
--   tasks.work_kind     FK -> work_kinds(code); NULL = Sort.
--   tasks.work_kind_set 'auto' | 'hand': who placed work_kind. Stamped by the
--                       Worker from the AUTH PATH (api/lib/task-work-kind.ts),
--                       never accepted from a caller (not in pb-schema
--                       TABLE_FIELDS, so a payload naming it is unknown_field).
--   task_sort_events    one row per hand sort / unsort / Reset, written in the
--                       SAME batch as the placement. No FK to tasks: the log
--                       outlives a deleted task (codex Q3).
--   trg_tasks_work_kind_transition
--                       the transition rule at the store (below).
--
-- THE TRANSITIONS (codex round 3, Q1):
--   automatic fill   (NULL, auto) -> (kind, auto)   PB API key, Gmail script, nightly fill
--   automatic clear  (kind, auto) -> (NULL, auto)   PB API key (a backfill rollback)
--   hand sort        any -> (kind, hand)            POST /api/tasks/:id/sort {op:'sort'}
--   hand unsort      any -> (NULL, hand)            POST /api/tasks/:id/sort {op:'unsort'}
--   Reset            any -> (NULL, auto)            POST /api/tasks/:id/sort {op:'reset'}
-- Anything else that changes the pair is refused.
--
-- LEVELS:
--   Level 1 at the store: a kind that is not a work_kinds code (FK); a
--     work_kind_set outside auto|hand (CHECK); a pair change that is neither a
--     fill/clear of a machine-placed row nor backed by a sort event carrying
--     this write's own mutation id and result (the trigger). The event is the
--     authorization: it is inserted by the sort route in the same batch, bound
--     to task id + mutation id + resulting pair, so there is no free-standing
--     "allow" switch to forget to clear.
--   Level 2 (api/lib/task-work-kind.ts, one chokepoint in applyInsert +
--     applyPatch): WHO may write which transition. D1 has no per-writer
--     authorization, so "only a Hub session sorts" cannot be a column rule; a
--     raw D1 writer that inserts its own event row can still forge a hand
--     placement. The Worker refuses a PB-key write over a hand placement
--     (work_kind_hand_set) and a PB-key change of one kind to another
--     (work_kind_fill_only), both business_rule, before the trigger would.
--   INSERT is not trigger-guarded: a new row has no placement to protect. A
--     Hub-session create carrying a kind is stamped 'hand' by the Worker; a
--     PB-key create is 'auto' (the column default).
--
-- APPLY (NOT executed by this commit; prod D1 DDL needs its own named go, and
-- a D1 Time Travel bookmark first). Additive and harmless before the Worker
-- that uses it: an old Worker never names the columns, and the trigger fires
-- only when a write sets work_kind or work_kind_set.
--   scripts/wrangler-d1 d1 time-travel info mnccore-lab      (record the bookmark)
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v157-tasks-work-kind.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v157-tasks-work-kind.sql
--
-- VERIFY after apply (read-only):
--   SELECT code, label, display_order, active FROM work_kinds ORDER BY display_order;
--     -> review|Review|1|1, writing|Writing|2|1, analysis|Analysis & Build|3|1, admin|Replies & admin|4|1
--   SELECT work_kind, work_kind_set, COUNT(*) FROM tasks GROUP BY 1, 2;
--     -> one row: NULL|auto|<every task>
--   SELECT name FROM sqlite_master WHERE name IN
--     ('work_kinds','task_sort_events','trg_tasks_work_kind_transition','idx_task_sort_events_task');
--     -> 4 rows
--   SELECT version FROM schema_migrations WHERE version = 157;   -> 157
--   FK probe on mnccore-lab-test ONLY (refused, nothing written):
--   UPDATE tasks SET work_kind = 'not_a_kind' WHERE id = (SELECT id FROM tasks LIMIT 1);
--     -> FOREIGN KEY constraint failed
--
-- ROLLBACK (Worker first: deploy one that does not send or check work_kind;
-- then, as one file):
--   DROP TRIGGER IF EXISTS trg_tasks_work_kind_transition;
--   UPDATE tasks SET work_kind = NULL WHERE work_kind IS NOT NULL;
--   ALTER TABLE tasks DROP COLUMN work_kind_set;
--   ALTER TABLE tasks DROP COLUMN work_kind;
--   DROP TABLE IF EXISTS task_sort_events;   -- keep a copy first: it is Nick's sort log
--   DROP TABLE IF EXISTS work_kinds;
--   DELETE FROM schema_migrations WHERE version = 157;
-- Leaving everything inert (no Worker writes it) is also a safe rollback.

CREATE TABLE IF NOT EXISTS work_kinds (
  code          TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

INSERT OR IGNORE INTO work_kinds (code, label, display_order, active) VALUES
  ('review',   'Review',           1, 1),
  ('writing',  'Writing',          2, 1),
  ('analysis', 'Analysis & Build', 3, 1),
  ('admin',    'Replies & admin',  4, 1);

ALTER TABLE tasks ADD COLUMN work_kind TEXT REFERENCES work_kinds(code);

ALTER TABLE tasks ADD COLUMN work_kind_set TEXT NOT NULL DEFAULT 'auto'
  CONSTRAINT tasks_work_kind_set_values CHECK (work_kind_set IN ('auto', 'hand'));

CREATE TABLE IF NOT EXISTS task_sort_events (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  mutation_id           TEXT NOT NULL UNIQUE,
  task_id               TEXT NOT NULL,
  actor                 TEXT NOT NULL,
  at                    TEXT NOT NULL,
  op                    TEXT NOT NULL CHECK (op IN ('sort', 'unsort', 'reset')),
  from_kind             TEXT,
  from_set              TEXT,
  to_kind               TEXT REFERENCES work_kinds(code),
  to_set                TEXT NOT NULL CHECK (to_set IN ('auto', 'hand')),
  from_section          TEXT,
  missing_category_note TEXT,
  CHECK (
    (op = 'sort'   AND to_kind IS NOT NULL AND to_set = 'hand') OR
    (op = 'unsort' AND to_kind IS NULL     AND to_set = 'hand') OR
    (op = 'reset'  AND to_kind IS NULL     AND to_set = 'auto')
  )
);

CREATE INDEX IF NOT EXISTS idx_task_sort_events_task ON task_sort_events(task_id, at);
-- Retention index for LEDGER_REGISTRY (api/lib/ledger-retention.ts): the prune
-- deletes by `at`. Old events are safe to prune: the transition trigger only
-- reads the event carrying the current write's own mutation id.
CREATE INDEX IF NOT EXISTS idx_task_sort_events_at ON task_sort_events(at);

CREATE TRIGGER IF NOT EXISTS trg_tasks_work_kind_transition
BEFORE UPDATE OF work_kind, work_kind_set ON tasks
WHEN (OLD.work_kind IS NOT NEW.work_kind OR OLD.work_kind_set IS NOT NEW.work_kind_set)
  -- automatic fill: an unsorted, machine-placed row gets its first kind
  AND NOT (OLD.work_kind IS NULL AND OLD.work_kind_set = 'auto'
           AND NEW.work_kind IS NOT NULL AND NEW.work_kind_set = 'auto')
  -- automatic clear: a machine-placed kind is taken back (backfill rollback)
  AND NOT (OLD.work_kind_set = 'auto' AND NEW.work_kind IS NULL AND NEW.work_kind_set = 'auto')
  -- hand sort / unsort / Reset: this write's own event, in this batch
  AND NOT EXISTS (
    SELECT 1 FROM task_sort_events e
    WHERE e.mutation_id = NEW.last_mutation_id
      AND e.task_id = NEW.id
      AND e.to_kind IS NEW.work_kind
      AND e.to_set = NEW.work_kind_set
  )
BEGIN
  SELECT RAISE(ABORT, 'work_kind_transition: a task''s kind of work changes only by an automatic fill of an unsorted row or a logged sort (POST /api/tasks/:id/sort)');
END;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (157, 'schema-v157-tasks-work-kind.sql');
