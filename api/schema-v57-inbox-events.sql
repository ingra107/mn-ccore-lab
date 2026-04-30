-- Schema v57 — inbox_events table + seq triggers for W2a
--
-- Mirrors brain.db migration 051. W2a plan rev 4 §W2.
--
-- Three concerns:
--   1. CREATE TABLE inbox_events (canonical convergence layer; coexists with
--      existing Hub `inbox` table per A0 Decision #4)
--   2. INSERT/UPDATE seq triggers for inbox_events (matches v53 pattern:
--      include-self in MAX(seq) so consecutive same-row updates advance)
--   3. INSERT/UPDATE seq triggers for day_capacity + project_state_log
--      (W1 schema-v55 created the tables but did NOT add seq triggers; W2a
--      sync.py CORE_TABLES extension needs those tables to advance seq on
--      every mutation so brain.db's last_seen_seq cursor moves)
--
-- v59 (A3) will add `last_mutation_id` column to inbox_events. v59 cannot
-- run before v57 (column-on-non-existent-table error). This sequencing was
-- the codex r9 B2 blocker that drove the rev 4 W2/W2a split.
--
-- Apply via:
--   wrangler d1 execute mnccore-lab --remote --file=api/schema-v57-inbox-events.sql
--
-- Deploy AFTER home + work brain.db verified migration 051 applied cleanly.

-- ── 1. inbox_events table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inbox_events (
    id TEXT PRIMARY KEY,                    -- evt_<ULID>
    source TEXT NOT NULL,                   -- telegram|gmail|hub_pwa|file_watcher|pomodoro|chat|today_md|hub_ui
    source_external_id TEXT,                -- per-source dedup key
    raw_text TEXT,
    raw_payload_json TEXT,
    raw_hash TEXT,                          -- SHA256 of raw_text for soft 24h dedup
    suggested_project_id TEXT,
    suggested_action TEXT,                  -- 'task'|'note'|'attach'|'park'|'delete'
    confidence REAL,                        -- 0.0-1.0
    captured_at TEXT NOT NULL,
    triaged_at TEXT,
    triage_outcome TEXT,                    -- 'task_created'|'attached_to_project'|'deleted'|'parked'|'deferred'
    resulting_task_id TEXT,
    triaged_by TEXT,                        -- 'auto'|'nick'|'claude'
    notes TEXT,
    last_mutation_id TEXT,                  -- A3 column (added by v59)
    seq INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_events_source_extid
    ON inbox_events(source, source_external_id)
    WHERE source_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_events_raw_hash_recent
    ON inbox_events(raw_hash, captured_at)
    WHERE raw_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_events_seq ON inbox_events(seq);
CREATE INDEX IF NOT EXISTS idx_inbox_events_deleted ON inbox_events(deleted_at);
CREATE INDEX IF NOT EXISTS idx_inbox_events_pending
    ON inbox_events(captured_at) WHERE triaged_at IS NULL;

-- ── 2. inbox_events seq triggers (v53 pattern: include self in MAX) ──────────

DROP TRIGGER IF EXISTS trg_inbox_events_seq_insert;
CREATE TRIGGER trg_inbox_events_seq_insert AFTER INSERT ON inbox_events
FOR EACH ROW
WHEN NEW.seq = 0
BEGIN
  UPDATE inbox_events
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM inbox_events WHERE rowid != NEW.rowid)
  WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_inbox_events_seq_update;
CREATE TRIGGER trg_inbox_events_seq_update AFTER UPDATE ON inbox_events
FOR EACH ROW
WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE inbox_events
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM inbox_events)
  WHERE id = NEW.id;
END;

-- ── 3. day_capacity seq triggers (gap from v55) ──────────────────────────────

DROP TRIGGER IF EXISTS trg_day_capacity_seq_insert;
CREATE TRIGGER trg_day_capacity_seq_insert AFTER INSERT ON day_capacity
FOR EACH ROW
WHEN NEW.seq = 0
BEGIN
  UPDATE day_capacity
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM day_capacity WHERE rowid != NEW.rowid)
  WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_day_capacity_seq_update;
CREATE TRIGGER trg_day_capacity_seq_update AFTER UPDATE ON day_capacity
FOR EACH ROW
WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE day_capacity
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM day_capacity)
  WHERE date = NEW.date;
END;

-- ── 4. project_state_log seq triggers (gap from v55) ─────────────────────────

DROP TRIGGER IF EXISTS trg_project_state_log_seq_insert;
CREATE TRIGGER trg_project_state_log_seq_insert AFTER INSERT ON project_state_log
FOR EACH ROW
WHEN NEW.seq = 0
BEGIN
  UPDATE project_state_log
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM project_state_log WHERE rowid != NEW.rowid)
  WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_project_state_log_seq_update;
CREATE TRIGGER trg_project_state_log_seq_update AFTER UPDATE ON project_state_log
FOR EACH ROW
WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE project_state_log
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM project_state_log)
  WHERE id = NEW.id;
END;
