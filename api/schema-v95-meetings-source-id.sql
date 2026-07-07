-- schema-v95-meetings-source-id.sql (2026-07-07)
-- PB pipeline identity bridge: the calendar-match id PB stamps on extracted
-- tasks (tasks.meeting_id = 'cal-YYYYMMDDTHHMM-<slug>') never equals the
-- Hub-minted meetings.id ('mtg-<date>-<rand8>'), so the meeting-detail task
-- join found 0 pipeline tasks. source_id carries PB's id; the join becomes
-- meeting_id IN (id, source_id). Pipeline-owned, not user-editable.
--
-- HUB-ONLY column on a HUB-ONLY table (no brain.db meetings twin; no
-- pb-schema codegen). Registered in PB Context/Topics/shared-schema-registry.md.
--
-- Purely additive. Reversible: ALTER TABLE meetings DROP COLUMN source_id;
--
-- APPLY (test FIRST, probe, then prod) — sanctioned wrapper ONLY:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v95-meetings-source-id.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v95-meetings-source-id.sql

ALTER TABLE meetings ADD COLUMN source_id TEXT;
-- Partial UNIQUE: two meeting rows claiming the same calendar source is
-- unrepresentable; unlimited NULLs (Hub-UI meetings) allowed. (Dual-Plan
-- builder addition, 2026-07-07.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_source_id
  ON meetings(source_id) WHERE source_id IS NOT NULL;
