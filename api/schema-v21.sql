-- v21: Enhanced decisions — linked_projects, outcome_sentiment, tag index
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v21.sql --remote

-- Add linked_projects column (comma-separated project slugs)
ALTER TABLE decision_log ADD COLUMN linked_projects TEXT;

-- Add outcome_sentiment for positive/negative/neutral/pending tracking
ALTER TABLE decision_log ADD COLUMN outcome_sentiment TEXT DEFAULT 'pending';

-- Index for tag-based queries
CREATE INDEX IF NOT EXISTS idx_decisions_tags ON decision_log(tags);
