-- v10: Add PI strategic context ("Why This Matters Now") to projects
-- Run with: wrangler d1 execute mnccore-lab --file=api/schema-v10.sql --remote

ALTER TABLE projects ADD COLUMN pi_context TEXT;
