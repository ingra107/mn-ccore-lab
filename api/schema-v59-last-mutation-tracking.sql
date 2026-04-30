-- v59 -- A3 echo suppression: last_mutation_id on every mutation-target table
--
-- Per Peripheral-Brain workflow-restructure plan rev 4 sec A3.0:
-- every Hub write via /api/mutations stamps the row with the originating
-- mutation_id. PB pull-side compares to local outbox; if local outbox
-- shows "this mutation_id was already acked here," the pull is a no-op
-- (avoids spurious re-enqueue).
--
-- Sequencing constraint:
--   - v57 already shipped 2026-04-29 (W2a inbox_events table created).
--   - v59 cannot run before v57 (column-on-non-existent-table error).
--   - inbox_events.last_mutation_id was already declared at CREATE in v57.
--     day_capacity.last_mutation_id was already declared at CREATE in v55.
--     v59 only adds the column to tasks, projects, project_state_log.
--
-- Apply via:
--   wrangler d1 execute mnccore-lab --remote --file=api/schema-v59-last-mutation-tracking.sql

ALTER TABLE tasks             ADD COLUMN last_mutation_id TEXT;
ALTER TABLE projects          ADD COLUMN last_mutation_id TEXT;
ALTER TABLE project_state_log ADD COLUMN last_mutation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_last_mutation
    ON tasks(last_mutation_id) WHERE last_mutation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_last_mutation
    ON projects(last_mutation_id) WHERE last_mutation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_state_log_last_mutation
    ON project_state_log(last_mutation_id) WHERE last_mutation_id IS NOT NULL;
