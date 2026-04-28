-- v52 (2026-04-27): personal calendar feeds + cached events.
--
-- iCal-feed integration. Each user can paste a private iCal URL (Google,
-- Outlook, iCloud — anything that exports the .ics format). Hub polls
-- the URL lazily on Today page load (when last_polled_at >15min stale)
-- and renders events alongside team meetings.
--
-- No OAuth, no GCP project, no Workspace verification. The URL itself
-- is the secret — anyone with it can read the calendar — so don't expose
-- it back through the API after save (display "configured" instead).
--
-- Issue #45.
--
-- Additive. Safe to apply to production D1.

CREATE TABLE IF NOT EXISTS user_calendar_feeds (
  id TEXT PRIMARY KEY,
  user_slug TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  feed_label TEXT NOT NULL DEFAULT 'Primary',
  last_polled_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_slug, feed_url)
);

CREATE INDEX IF NOT EXISTS idx_user_calendar_feeds_user
  ON user_calendar_feeds(user_slug);

CREATE TABLE IF NOT EXISTS user_calendar_events (
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
  UNIQUE(feed_id, uid)
);

CREATE INDEX IF NOT EXISTS idx_user_calendar_events_user_start
  ON user_calendar_events(user_slug, start_at);

CREATE INDEX IF NOT EXISTS idx_user_calendar_events_feed
  ON user_calendar_events(feed_id);
