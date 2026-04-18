-- MN-CCORE Lab Hub — Schema v4: Notifications, CV fields, Grant timeline
-- Run with: wrangler d1 execute mnccore-lab --file=api/schema-v4.sql

-- Notifications system (for @mentions, assignments, deadlines)
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_slug TEXT NOT NULL,
  type TEXT NOT NULL,              -- 'mention', 'assignment', 'deadline', 'update'
  source_type TEXT NOT NULL,       -- 'comment', 'project_update', 'action_item', 'meeting'
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,                       -- relative URL e.g. /projects/lpv-paper
  read INTEGER DEFAULT 0,
  read_at TEXT,                    -- stamped when marked read (2026-04-18)
  email_sent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient_slug, read);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at DESC);

-- Extend milestones to support grant milestones
ALTER TABLE milestones ADD COLUMN grant_id TEXT REFERENCES grants(id);

-- Populate grant dates (these are the real dates from Nick's grants)
UPDATE grants SET start_date = '2023-07-01', end_date = '2028-06-30'
  WHERE title LIKE '%Provider Practice Variation%' AND mechanism = 'K23';

UPDATE grants SET start_date = '2024-09-01', end_date = '2026-08-31'
  WHERE title LIKE '%Decision-Making Styles%' AND mechanism = 'R03';

UPDATE grants SET start_date = '2027-07-01', end_date = '2032-06-30'
  WHERE title LIKE '%ADHERE-LPV%' AND mechanism = 'R01';

UPDATE grants SET start_date = '2027-07-01', end_date = '2032-06-30'
  WHERE title LIKE '%Provider Variation Across%' AND mechanism = 'R01';

UPDATE grants SET start_date = '2027-07-01', end_date = '2032-06-30'
  WHERE title LIKE '%IHCA Survivability%' AND mechanism = 'K23';
