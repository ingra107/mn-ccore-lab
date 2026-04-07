-- v32: Add link_type to paper_project_links for richer paper-project relationships
-- Run: wrangler d1 execute mnccore-lab --file=api/schema-v32.sql --remote

-- Add link_type column: 'output' (paper from project), 'input' (informing paper), 'related'
ALTER TABLE paper_project_links ADD COLUMN link_type TEXT DEFAULT 'output';
