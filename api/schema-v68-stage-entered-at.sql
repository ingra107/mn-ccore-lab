-- schema-v68-stage-entered-at.sql (2026-05-22)
-- Add projects.stage_entered_at: timestamp the project last ENTERED its current
-- stage. Maintained by api/routes/mutations.ts::applyPatch (bumped only on a
-- genuine stage transition). Fixes the Manuscripts daysInStage bug where any field
-- edit reset the stale-days counter (it had measured updated_at).
--
-- Backfill seeds existing rows from updated_at (falling back to created_at) so
-- day counts don't jump on deploy -- this matches the pre-fix daysInStage source,
-- so existing rows render identically until their next stage change makes the
-- column authoritative. Deliberately does NOT reference last_meaningful_movement
-- (a v55 column): keeping the backfill to always-present columns makes the
-- migration robust across any D1 migration state.
--
-- APPLY:
--   wrangler d1 execute mnccore-lab      --remote --file=api/schema-v68-stage-entered-at.sql
--   wrangler d1 execute mnccore-lab-test --remote --file=api/schema-v68-stage-entered-at.sql
ALTER TABLE projects ADD COLUMN stage_entered_at TEXT;
UPDATE projects SET stage_entered_at = COALESCE(updated_at, created_at) WHERE stage_entered_at IS NULL;
