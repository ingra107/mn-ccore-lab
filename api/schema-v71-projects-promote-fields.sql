-- schema-v71-projects-promote-fields.sql (2026-05-29)
-- Promote 17 project fields from PB-only (brain.db cache, stripped from the Hub
-- wire) to Hub-canonical synced columns. These were dropped from /api/mutations
-- by fc2d9eb5 (2026-04-30, codex A3 Gap #3b) only because Hub had no column yet
-- -- NOT by principle. Adding the columns + mutations.ts TABLE_FIELDS entries +
-- the brain.db pull-back allowlist makes them converge home<->work and makes
-- brain.db truly Hub-rebuildable (ethos #6).
--
--   Bucket B (converge):  next_action, due_date, tier, domain
--   Bucket C (reference): citation, doi, pubmed_id, publication_date, journal,
--                         author_role, primary_folder, manuscript_path,
--                         analysis_path, key_files, github_url, box_url,
--                         context_links
--
-- `journal` is a NEW column, intentionally SEPARATE from the PWA M-11
-- publications field `journal_name` (distinct lineage).
--
-- All 17 are nullable TEXT, no default -- purely additive. NO backfill here; the
-- per-row values are seeded by Peripheral-Brain scripts/db/seed_promoted_project_fields.py
-- (run on WORK after this deploy is probe-verified). Reversible: the columns are
-- left inert on rollback (no destructive DROP).
--
-- Decision doc: Peripheral-Brain/Context/Decisions/2026-05-29-promote-project-fields-hub-canonical.md
--
-- APPLY:
--   wrangler d1 execute mnccore-lab      --remote --file=api/schema-v71-projects-promote-fields.sql
--   wrangler d1 execute mnccore-lab-test --remote --file=api/schema-v71-projects-promote-fields.sql
ALTER TABLE projects ADD COLUMN next_action TEXT;
ALTER TABLE projects ADD COLUMN due_date TEXT;
ALTER TABLE projects ADD COLUMN tier TEXT;
ALTER TABLE projects ADD COLUMN domain TEXT;
ALTER TABLE projects ADD COLUMN citation TEXT;
ALTER TABLE projects ADD COLUMN doi TEXT;
ALTER TABLE projects ADD COLUMN pubmed_id TEXT;
ALTER TABLE projects ADD COLUMN publication_date TEXT;
ALTER TABLE projects ADD COLUMN journal TEXT;
ALTER TABLE projects ADD COLUMN author_role TEXT;
ALTER TABLE projects ADD COLUMN primary_folder TEXT;
ALTER TABLE projects ADD COLUMN manuscript_path TEXT;
ALTER TABLE projects ADD COLUMN analysis_path TEXT;
ALTER TABLE projects ADD COLUMN key_files TEXT;
ALTER TABLE projects ADD COLUMN github_url TEXT;
ALTER TABLE projects ADD COLUMN box_url TEXT;
ALTER TABLE projects ADD COLUMN context_links TEXT;
