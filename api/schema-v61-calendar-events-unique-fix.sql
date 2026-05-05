-- v61: widen user_calendar_events unique key to (feed_id, uid, start_at)
--
-- Bug 2026-05-05: Hub's iCal parser expands RRULE client-side; all
-- recurring instances share the same UID (per iCal spec — RECURRENCE-ID
-- distinguishes them, not UID). Schema's UNIQUE(feed_id, uid) collapses
-- weekly meetings into 1 row, losing all but the last instance.
--
-- Fix: include start_at in unique key. Each instance has a different
-- start_at, so they coexist. Generate-today's calendar_cache.py uses
-- Google Calendar API's singleEvents=True which sidesteps this entirely;
-- iCal feeds need the schema-level fix.
--
-- Cache table is safe to wipe — next poll repopulates.

DELETE FROM user_calendar_events;

DROP INDEX IF EXISTS idx_user_calendar_events_user_start;
DROP INDEX IF EXISTS idx_user_calendar_events_feed;

-- SQLite can't drop a column-level UNIQUE; recreate the table.
CREATE TABLE user_calendar_events_new (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL,
  user_slug TEXT NOT NULL,
  uid TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  location TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT,
  is_all_day INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (feed_id) REFERENCES user_calendar_feeds(id) ON DELETE CASCADE,
  UNIQUE(feed_id, uid, start_at)
);

DROP TABLE user_calendar_events;
ALTER TABLE user_calendar_events_new RENAME TO user_calendar_events;

CREATE INDEX idx_user_calendar_events_user_start
  ON user_calendar_events(user_slug, start_at);

CREATE INDEX idx_user_calendar_events_feed
  ON user_calendar_events(feed_id);
