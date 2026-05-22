-- schema-v68-stage-entered-at.sql (2026-05-22)
-- Add projects.stage_entered_at: timestamp the project last ENTERED its current
-- stage. Maintained by api/routes/mutations.ts::applyPatch (bumped only on a
-- genuine stage transition). Fixes the Manuscripts daysInStage bug where any field
-- edit reset the stale-days counter (it had measured updated_at).
--
-- Backfill seeds existing rows from the best available proxy so counts don't jump
-- on deploy; going forward the column is authoritative.
--
-- APPLY:
--   wrangler d1 execute mnccore-lab      --remote --file=api/schema-v68-stage-entered-at.sql
--   wrangler d1 execute mnccore-lab-test --remote --file=api/schema-v68-stage-entered-at.sql
ALTER TABLE projects ADD COLUMN stage_entered_at TEXT;
UPDATE projects SET stage_entered_at = COALESCE(last_meaningful_movement, updated_at, created_at) WHERE stage_entered_at IS NULL;
