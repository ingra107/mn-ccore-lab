-- Universal Quick Capture → Peripheral Brain inbox
-- Applied 2026-04-12 via:
--   npx wrangler d1 execute mnccore-lab --remote --file=migrations/inbox-table.sql
--
-- Feeds freeform captures from the Hub into Peripheral Brain's Inbox folder
-- via scripts/db/sync_d1_pull.py. Rows are marked synced_at once the PB side
-- has written a markdown file for them.

CREATE TABLE IF NOT EXISTS inbox (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  tag TEXT,
  project_id TEXT,
  author TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_inbox_synced ON inbox(synced_at);
CREATE INDEX IF NOT EXISTS idx_inbox_created ON inbox(created_at DESC);
