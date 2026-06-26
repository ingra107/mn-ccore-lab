-- schema-v89-launch-log.sql (2026-06-25)
-- @-tag delegation launch log: recovery surface + mobile queue.
-- Hub-D1-ONLY. NOT registered in PB synced_table_registry; no brain.db mirror.
-- The seed lives ONLY here; it is never written to activity_entries.
--
-- NOTE: seq / last_mutation_id / seq-triggers omitted intentionally.
-- This is a Hub-only table; A3 sync machinery is unused and was stripped
-- (fix-hub-report: deprecation-lens cleanup, 2026-06-25).
CREATE TABLE IF NOT EXISTS launch_log (
    id              TEXT PRIMARY KEY,
    tag             TEXT NOT NULL CHECK (tag IN ('quickchat','workon')),
    seed            TEXT NOT NULL DEFAULT '',
    origin          TEXT NOT NULL CHECK (origin IN ('computer','mobile')),
    target_machine  TEXT,
    project_slug    TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','launched','failed','completed','expired')),
    requested_by    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    launched_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_launch_log_status ON launch_log(status);
CREATE INDEX IF NOT EXISTS idx_launch_log_origin_status ON launch_log(origin, status);
CREATE INDEX IF NOT EXISTS idx_launch_log_requested_by ON launch_log(requested_by, created_at);

-- Drop any stale seq triggers that may have been applied from a prior schema draft.
DROP TRIGGER IF EXISTS trg_launch_log_seq_insert;
DROP TRIGGER IF EXISTS trg_launch_log_seq_update;
