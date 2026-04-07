-- v33: Add task acknowledgment columns for closed-loop communication
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v33.sql --remote

-- Acknowledge when a task assignment is received (aviation CRM pattern)
ALTER TABLE tasks ADD COLUMN acknowledged_at TEXT;
ALTER TABLE tasks ADD COLUMN acknowledged_by TEXT;
