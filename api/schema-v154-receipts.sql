-- schema-v154-receipts.sql (2026-10-30) -- receipts: what PB changed, and Undo.
--
-- Nick, 2026-10-30: "instead of me having to do like the process task
-- everyday". Ruling: the receipt lists "Everything PB changed overnight
-- (Recommended)". Decision (the v1 contract this file implements):
-- PB Context/Decisions/2026-10-30-receipts-and-headless-process.md. Plan:
-- PB Scratch/plans/2026-10-30-receipts-RECONCILED.md (seat L1 + seat MIN, codex
-- third seat).
--
-- Three Hub-only tables, no brain.db mirror:
--
--   receipt_runs    one row per PB run (a lane's pass), or one
--                   'unattributed:<machine>:<CT date>' run per machine per day
--                   for a PB-key write that named no run. State (open / ok /
--                   failed) is derived from finished_at and failure lines,
--                   never stored.
--   receipt_lines   one row per change the Hub landed for PB, per failure, per
--                   item left for Nick. The Hub writes a change line in the SAME
--                   D1 batch as the write (api/lib/receipts.ts), so a line that
--                   fails to insert rolls the write back. Changed fields only.
--   receipt_claims  durable per-source claims for the headless executor
--                   (source_key PRIMARY KEY: the claim IS the row).
--
-- WHAT THE SCHEMA MAKES UNREPRESENTABLE (Level 1 at the arbiter):
--   - an enum value outside the contract: a CHECK on every enum column.
--   - two undos of one line: partial UNIQUE idx_receipt_lines_one_undo (an undo
--     line's source_ref is 'undo:<line id>').
--   - a half-recorded undo, or an undo of a line with nothing to reverse:
--     undone_at/undo_line_id travel as a pair, and only a reversible
--     inverse_kind may carry them.
--   - a 'none' / 'revert_commit' line with no reason; a reason on a reversible one.
--   - a reversible change line missing what its inverse needs (before-image,
--     landed version, the right op).
--   - one action recorded twice for one entity: UNIQUE idx_receipt_lines_one_per_action.
--   - a settled claim holding a lease, or a live claim without one.
--   - a line in a run that does not exist: the FK (ON DELETE CASCADE, so the
--     90-day prune of a run takes its lines).
--
-- WHAT STAYS LEVEL 2 (a trigger; the predicate is over a row's history):
--   - a line is never edited except undone_at/undo_line_id, set once:
--     trg_receipt_lines_immutable.
--   - an unattributed run is named 'unattributed:...' and nothing else is:
--     the CHECK on receipt_runs is Level 1; the route never mints that prefix.
--
-- Visibility: all three tables are Nick-only in api/lib/table-scope.ts
-- (nickOnly, the mail-watch / v153 rule): his session with the PI flag and the
-- PB key's raw handle. Owner-only reads are the routes' rule too.
--
-- Retention: receipt_runs (active_at) and receipt_lines (created_at) are in
-- api/lib/ledger-retention.ts at 90 days. active_at is the run's newest
-- moment -- started, finished, or its newest line -- kept by
-- trg_receipt_lines_run_active, so a run whose id PB reuses every day (a
-- stable X-PB-Run) is never pruned while it is still collecting lines; the
-- prune takes a run only once all three are past 90 days.
-- seen_at is a high-water mark, not a flag: a line is unseen when it was
-- created after its run's seen_at, so a line landing after Nick's Seen tap
-- still shows. receipt_claims is NOT pruned by age:
-- a claim is a source's consumption identity and must outlive its receipt, or
-- the executor would re-consume an old comment (contract: "claims kept while a
-- source still exists"). It has no FK to receipt_runs for the same reason.
--
-- APPLY (additive; harmless before the Worker that uses it):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v154-receipts.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v154-receipts.sql
-- ROLLBACK (Worker first: the capture writes these tables in the same batch as
-- every PB write, so a Worker that captures against a dropped table fails
-- every PB write; no other table references these):
--   DROP TABLE IF EXISTS receipt_claims;
--   DROP TABLE IF EXISTS receipt_lines;
--   DROP TABLE IF EXISTS receipt_runs;
--   DELETE FROM schema_migrations WHERE version = 154;
--   (dropping a table drops its triggers and indexes)

CREATE TABLE IF NOT EXISTS receipt_runs (
  id          TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 160),
  lane        TEXT NOT NULL CHECK (length(lane) BETWEEN 1 AND 80),
  machine     TEXT NOT NULL CHECK (length(machine) BETWEEN 1 AND 80),
  started_at  TEXT NOT NULL,                              -- ISO UTC
  finished_at TEXT,
  origin      TEXT NOT NULL CHECK (origin IN ('pb', 'unattributed')),
  seen_at     TEXT,                                       -- ISO UTC high-water mark
  active_at   TEXT NOT NULL,                              -- ISO UTC: max(started, finished, newest line)
  CHECK ((origin = 'unattributed') = (substr(id, 1, 13) = 'unattributed:'))
);
CREATE INDEX IF NOT EXISTS idx_receipt_runs_started ON receipt_runs (started_at);
CREATE INDEX IF NOT EXISTS idx_receipt_runs_lane ON receipt_runs (lane, started_at);
CREATE INDEX IF NOT EXISTS idx_receipt_runs_active ON receipt_runs (active_at);

CREATE TABLE IF NOT EXISTS receipt_lines (
  id                 TEXT PRIMARY KEY,                    -- 'rcl_' + hex
  run_id             TEXT NOT NULL REFERENCES receipt_runs(id) ON DELETE CASCADE,
  action_id          TEXT NOT NULL CHECK (length(action_id) BETWEEN 1 AND 200),
  kind               TEXT NOT NULL CHECK (kind IN ('change', 'failure', 'left_for_nick')),
  entity_type        TEXT CHECK (entity_type IS NULL OR length(entity_type) BETWEEN 1 AND 80),
  entity_id          TEXT CHECK (entity_id IS NULL OR length(entity_id) BETWEEN 1 AND 300),
  op                 TEXT CHECK (op IN ('insert', 'update', 'delete', 'append', 'external')),
  fields_before_json TEXT CHECK (fields_before_json IS NULL
                       OR (json_valid(fields_before_json) AND json_type(fields_before_json) = 'object')),
  fields_after_json  TEXT CHECK (fields_after_json IS NULL
                       OR (json_valid(fields_after_json) AND json_type(fields_after_json) = 'object')),
  landed_version     INTEGER,
  source_ref         TEXT CHECK (source_ref IS NULL OR length(source_ref) BETWEEN 1 AND 500),
  summary            TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 500),
  inverse_kind       TEXT NOT NULL CHECK (inverse_kind IN
                       ('patch', 'tombstone', 'hide_entry', 'current_draft_undo', 'revert_commit', 'none')),
  inverse_reason     TEXT CHECK (inverse_reason IS NULL OR length(inverse_reason) BETWEEN 1 AND 500),
  undone_at          TEXT,
  undo_line_id       TEXT,
  created_at         TEXT NOT NULL,                       -- ISO UTC
  -- A change line names its op; a failure or left-for-Nick line has none.
  CHECK ((kind = 'change') = (op IS NOT NULL)),
  -- A Hub-side change names what it changed; only an external op may not.
  CHECK (op IS NULL OR op = 'external' OR (entity_type IS NOT NULL AND entity_id IS NOT NULL)),
  -- A reason exactly when there is no Undo.
  CHECK ((inverse_kind IN ('none', 'revert_commit')) = (inverse_reason IS NOT NULL)),
  -- Only a change line can be reversible, and each inverse carries what it needs.
  CHECK (kind = 'change' OR inverse_kind = 'none'),
  CHECK (inverse_kind <> 'patch' OR (op IN ('update', 'delete') AND fields_before_json IS NOT NULL
                                     AND fields_after_json IS NOT NULL AND landed_version IS NOT NULL)),
  CHECK (inverse_kind <> 'tombstone' OR (op = 'insert' AND landed_version IS NOT NULL)),
  CHECK (inverse_kind <> 'hide_entry' OR (op = 'append' AND entity_type = 'activity_entries'
                                          AND fields_after_json IS NOT NULL)),
  CHECK (inverse_kind <> 'current_draft_undo' OR (entity_type = 'products'
                                                  AND substr(source_ref, 1, 21) = 'current_draft_change:')),
  -- Undone: both stamps or neither, and only on a line with an Undo.
  CHECK ((undone_at IS NULL) = (undo_line_id IS NULL)),
  CHECK (undone_at IS NULL OR inverse_kind IN ('patch', 'tombstone', 'hide_entry', 'current_draft_undo'))
);
-- The overnight read: a run's lines in order, and the 90-day prune.
CREATE INDEX IF NOT EXISTS idx_receipt_lines_run ON receipt_lines (run_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_receipt_lines_created ON receipt_lines (created_at);
CREATE INDEX IF NOT EXISTS idx_receipt_lines_entity ON receipt_lines (entity_type, entity_id);
-- One undo per line: the undo line's source_ref is 'undo:<line id>'.
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_lines_one_undo ON receipt_lines (source_ref)
  WHERE substr(source_ref, 1, 5) = 'undo:';
-- One line per (action, kind, entity, op, source): a replayed write or a
-- retried PB post records nothing twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_lines_one_per_action ON receipt_lines
  (action_id, kind, COALESCE(entity_type, ''), COALESCE(entity_id, ''), COALESCE(op, ''), COALESCE(source_ref, ''));

DROP TRIGGER IF EXISTS trg_receipt_lines_immutable;
CREATE TRIGGER trg_receipt_lines_immutable BEFORE UPDATE ON receipt_lines
FOR EACH ROW
WHEN OLD.undone_at IS NOT NULL
  OR NEW.id IS NOT OLD.id OR NEW.run_id IS NOT OLD.run_id OR NEW.action_id IS NOT OLD.action_id
  OR NEW.kind IS NOT OLD.kind OR NEW.entity_type IS NOT OLD.entity_type OR NEW.entity_id IS NOT OLD.entity_id
  OR NEW.op IS NOT OLD.op OR NEW.fields_before_json IS NOT OLD.fields_before_json
  OR NEW.fields_after_json IS NOT OLD.fields_after_json OR NEW.landed_version IS NOT OLD.landed_version
  OR NEW.source_ref IS NOT OLD.source_ref OR NEW.summary IS NOT OLD.summary
  OR NEW.inverse_kind IS NOT OLD.inverse_kind OR NEW.inverse_reason IS NOT OLD.inverse_reason
  OR NEW.created_at IS NOT OLD.created_at
BEGIN SELECT RAISE(ABORT, 'receipt_line_immutable: a receipt line is never edited; only an undo stamps it, once'); END;

-- A line moves its run's active_at forward (the 90-day prune reads it).
DROP TRIGGER IF EXISTS trg_receipt_lines_run_active;
CREATE TRIGGER trg_receipt_lines_run_active AFTER INSERT ON receipt_lines
FOR EACH ROW
BEGIN
  UPDATE receipt_runs SET active_at = NEW.created_at WHERE id = NEW.run_id AND active_at < NEW.created_at;
END;

CREATE TABLE IF NOT EXISTS receipt_claims (
  source_key  TEXT PRIMARY KEY CHECK (length(source_key) BETWEEN 3 AND 300 AND (
                substr(source_key, 1, 8) = 'comment:' OR substr(source_key, 1, 9) = 'question:'
                OR substr(source_key, 1, 6) = 'inbox:' OR substr(source_key, 1, 5) = 'file:')),
  run_id      TEXT NOT NULL CHECK (length(run_id) BETWEEN 1 AND 160),
  claimed_at  TEXT NOT NULL,                              -- ISO UTC
  lease_until TEXT,
  state       TEXT NOT NULL CHECK (state IN ('claimed', 'done', 'failed', 'left')),
  generation  INTEGER NOT NULL CHECK (generation >= 1),
  CHECK ((state = 'claimed') = (lease_until IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_receipt_claims_run ON receipt_claims (run_id);

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (154, 'schema-v154-receipts.sql');
