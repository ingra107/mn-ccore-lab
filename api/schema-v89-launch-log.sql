-- schema-v89-launch-log.sql (2026-06-25)
-- @-tag delegation launch log: recovery surface + mobile queue.
-- Hub-D1-ONLY. NOT registered in PB synced_table_registry; no brain.db mirror.
-- The seed lives ONLY here; it is never written to activity_entries.
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
    launched_at     TEXT,
    seq             INTEGER DEFAULT 0,
    last_mutation_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_launch_log_status ON launch_log(status);
CREATE INDEX IF NOT EXISTS idx_launch_log_origin_status ON launch_log(origin, status);
CREATE INDEX IF NOT EXISTS idx_launch_log_requested_by ON launch_log(requested_by, created_at);

-- seq assignment (v53 canonical pattern, mirrors schema-v88 links)
DROP TRIGGER IF EXISTS trg_launch_log_seq_insert;
CREATE TRIGGER trg_launch_log_seq_insert AFTER INSERT ON launch_log
FOR EACH ROW WHEN NEW.seq = 0
BEGIN
  UPDATE launch_log SET seq = (SELECT COALESCE(MAX(seq),0)+1 FROM launch_log WHERE rowid != NEW.rowid)
  WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_launch_log_seq_update;
CREATE TRIGGER trg_launch_log_seq_update AFTER UPDATE ON launch_log
FOR EACH ROW WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE launch_log SET seq = (SELECT COALESCE(MAX(seq),0)+1 FROM launch_log) WHERE id = NEW.id;
END;
