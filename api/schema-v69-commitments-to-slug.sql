-- Schema v69 — commitments.to_slug (M4 D9 additive column)
--
-- Adds a nullable to_slug column to the commitments mirror table so that
-- commitments can be looked up by team-member slug in addition to the
-- existing fuzzy to_whom text match.  The commitments jsonl file remains
-- canonical; this D1 table is a synced read-mirror only.  No promote/migrate.
--
-- Apply via:
--   wrangler d1 execute mnccore-lab --remote --file=api/schema-v69-commitments-to-slug.sql
--
-- Must be applied BEFORE deploying the handler update that inserts to_slug,
-- otherwise INSERT OR REPLACE will fail on the unknown column.

ALTER TABLE commitments ADD COLUMN to_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_commitments_to_slug ON commitments(to_slug);
