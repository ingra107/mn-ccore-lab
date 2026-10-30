-- schema-v151-mail-watch.sql (2026-10-29) -- the mail watcher's private evidence.
--
-- Nick, 2026-10-29, approving the build: "Build it (Recommended)". Plan:
-- PB Scratch/plans/2026-10-29-watcher-seat-L1.md as amended by
-- Scratch/plans/2026-10-29-watcher-reconciled.md; decision
-- PB Context/Decisions/2026-10-29-email-watcher.md.
--
-- A read-only Apps Script ("Mail Watcher", gmail.readonly) runs as Nick in
-- slots (shared/mailWatch.ts MAIL_WATCH_SCHEDULE), asks POST /api/watcher/runs
-- for the threads tied to open tasks, reads each one, and closes the run with
-- per-thread results. Only api/routes/mail-watch.ts writes these tables, and
-- only under MAIL_WATCHER_KEY, which no task, project or mutation route accepts.
--
-- What the schema itself enforces:
--   * No table carries a task id or any task column, so a watcher row has
--     nothing a status could be written through. The thread-to-task join is
--     computed at read time from tasks.source_thread_id and gmail_thread links.
--   * No body column. mail_messages.excerpt is Gmail's snippet, capped at 200
--     characters by a CHECK.
--   * No stored "healthy" / "last checked" field. Freshness is derived at read
--     time (watchFreshness) from watch_runs + watch_run_threads.
--   * One run per slot (UNIQUE slot_at); one alarm row per missed_slot_at.
--
-- What the ROUTE code enforces, with the schema as a partial backstop (only
-- api/routes/mail-watch.ts writes these tables):
--   * A run closes only when every thread handed out at open has a result. The
--     route refuses such a close (409), and trg_watch_run_close_requires_every_thread
--     aborts an UPDATE that sets closed_at while a thread row is unresolved. The
--     trigger does NOT cover an INSERT of an already-closed run, or edits to
--     watch_run_threads after the close.
--   * One alarm per outage: watchFreshness keys missed_since on the first slot
--     after the latest closed run, so the key cannot move while the outage lasts.
--   * watch_threads (never pruned) holds each thread's first read and its
--     high-water mark, evaluated_through: the latest internal_at already
--     evaluated. A message on a thread's first read is baseline; a message at
--     or below the mark is never re-stored as new, so mail_messages' retention
--     prune cannot re-arm an old reply.
--
-- Visibility: all five tables are Nick-only in api/lib/table-scope.ts.
-- Retention: watch_runs (and its thread receipts, by cascade) and mail_messages
-- are in LEDGER_REGISTRY (api/lib/ledger-retention.ts).
--
-- APPLY (additive; harmless before the Worker that uses it):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v151-mail-watch.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v151-mail-watch.sql
-- ROLLBACK (no existing table references these):
--   DROP TRIGGER IF EXISTS trg_watch_run_close_requires_every_thread;
--   DROP TABLE IF EXISTS watch_run_threads; DROP TABLE IF EXISTS watch_runs;
--   DROP TABLE IF EXISTS mail_messages; DROP TABLE IF EXISTS watch_threads;
--   DROP TABLE IF EXISTS watch_alarms;
--   DELETE FROM schema_migrations WHERE version = 151;

CREATE TABLE IF NOT EXISTS watch_runs (
  id               TEXT PRIMARY KEY,                 -- 'wr_' + ulid
  slot_at          TEXT NOT NULL UNIQUE,             -- ISO UTC start of the slot served
  opened_at        TEXT NOT NULL,
  closed_at        TEXT,
  outcome          TEXT CHECK (outcome IN ('complete', 'partial')),
  threads_expected INTEGER NOT NULL CHECK (threads_expected >= 0),
  script_version   TEXT NOT NULL,
  alert_threads    INTEGER NOT NULL DEFAULT 0,       -- threads the close asked the script to ping
  alert_reported_at TEXT,                            -- the script reported its Telegram send
  alert_error      TEXT,                             -- the send failed; shown on the Today card
  CHECK ((closed_at IS NULL) = (outcome IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_watch_runs_opened ON watch_runs (opened_at);

CREATE TABLE IF NOT EXISTS watch_run_threads (
  run_id    TEXT NOT NULL REFERENCES watch_runs(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  result    TEXT CHECK (result IN ('read', 'not_found', 'error')),
  error     TEXT,
  PRIMARY KEY (run_id, thread_id)
);
CREATE INDEX IF NOT EXISTS idx_watch_run_threads_thread ON watch_run_threads (thread_id);

DROP TRIGGER IF EXISTS trg_watch_run_close_requires_every_thread;
CREATE TRIGGER trg_watch_run_close_requires_every_thread
BEFORE UPDATE OF closed_at ON watch_runs
WHEN NEW.closed_at IS NOT NULL AND EXISTS (
  SELECT 1 FROM watch_run_threads WHERE run_id = NEW.id AND result IS NULL)
BEGIN SELECT RAISE(ABORT, 'watch_run_incomplete'); END;

CREATE TABLE IF NOT EXISTS watch_threads (
  thread_id         TEXT PRIMARY KEY,
  first_read_at     TEXT NOT NULL,
  evaluated_through TEXT                             -- ISO UTC: latest internal_at already evaluated
);

CREATE TABLE IF NOT EXISTS mail_messages (
  message_id   TEXT PRIMARY KEY,                     -- Gmail message id
  thread_id    TEXT NOT NULL,
  internal_at  TEXT NOT NULL,                        -- ISO UTC (Gmail internalDate)
  party        TEXT NOT NULL CHECK (party IN ('nick', 'other', 'machine', 'unsure')),
  from_display TEXT,
  from_addr    TEXT,
  excerpt      TEXT CHECK (excerpt IS NULL OR length(excerpt) <= 200),
  first_run_id TEXT NOT NULL,                        -- the run that first stored it (no FK: runs are pruned first)
  baseline     INTEGER NOT NULL CHECK (baseline IN (0, 1)),
  alerted_at   TEXT                                  -- evaluated for an alert (set whether or not it pinged)
);
CREATE INDEX IF NOT EXISTS idx_mail_messages_thread ON mail_messages (thread_id, internal_at);
CREATE INDEX IF NOT EXISTS idx_mail_messages_internal ON mail_messages (internal_at);

CREATE TABLE IF NOT EXISTS watch_alarms (
  missed_slot_at TEXT PRIMARY KEY,                   -- first missed slot of the outage
  created_at     TEXT NOT NULL,
  sent_at        TEXT,
  send_error     TEXT
);

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (151, 'schema-v151-mail-watch.sql');
