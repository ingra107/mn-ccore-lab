-- v13: "Future Me" notes on milestones — personal institutional memory
-- Run with: wrangler d1 execute mnccore-lab --file=api/schema-v13.sql --remote

ALTER TABLE milestones ADD COLUMN future_note TEXT;
ALTER TABLE milestones ADD COLUMN future_note_author TEXT;
