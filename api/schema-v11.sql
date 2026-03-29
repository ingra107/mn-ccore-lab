-- v11: Add reactions table for project updates and comments
-- Run with: wrangler d1 execute mnccore-lab --file=api/schema-v11.sql --remote

CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,  -- 'project_update' or 'comment'
  target_id TEXT NOT NULL,
  user_slug TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '👍',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reactions_target ON reactions(target_type, target_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reactions_unique ON reactions(target_type, target_id, user_slug, emoji);
