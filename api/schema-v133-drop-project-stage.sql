-- schema-v133-drop-project-stage.sql (2026-10-12)
--
-- Contract phase step 6 (PB Scratch/plans/2026-10-12-contract-phase-retire-
-- project-stage.md; Nick 2026-10-12, "Yes, back up then drop"). Drops
-- projects.stage and projects.stage_entered_at. A project's stage is its home
-- product's (products.stage, products.stage_entered_at) since step 1; the Hub
-- refuses both fields on the wire since step 3; v130 removed the last trigger
-- that named either column. PB drops its own projects.stage in the same
-- contract step (PB migration 148).
--
-- PRECONDITIONS (prod; each one is checked again by the apply order in the
-- plan, never assumed):
--   1. The backup is taken: PB scripts/db/d1_column_backup.py writes the
--      Time Travel bookmark and every (id, slug, stage, stage_entered_at) row
--      to ~/PB-State/data/shared/backups/ and verifies the count.
--   2. The deployed Worker names neither column in any SQL. A `SELECT *` /
--      `p.*` read just returns two fewer keys; a statement that NAMES a
--      dropped column fails "no such column" at prepare time, so the Worker
--      that carries this file must be live before it applies.
--   3. Both laptops run PB with migration 148 (no PB reader or writer of
--      projects.stage is left on either machine).
--
-- Checked on mnccore-lab and mnccore-lab-test before writing (sqlite_master,
-- sql LIKE '%stage%', 2026-10-12): no index, view or CHECK names either
-- column; the only triggers on projects that mention a stage read
-- project_home_seed / product_stages (v130), never NEW.stage.
--
-- NOT RE-RUNNABLE: SQLite has no DROP COLUMN IF EXISTS. The ledger row below
-- marks it applied; never re-run the file by hand.
--
-- APPLY (sanctioned wrapper only; test first, then prod):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v133-drop-project-stage.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v133-drop-project-stage.sql
--
-- ROLLBACK (data comes back from the step-5 backup, not from this file):
--   ALTER TABLE projects ADD COLUMN stage TEXT DEFAULT 'Idea';
--   ALTER TABLE projects ADD COLUMN stage_entered_at TEXT;
--   then the UPDATEs PB `d1_column_backup.py restore-sql <backup.json>` emits,
--   then DELETE FROM schema_migrations WHERE version = 133;
--   (or D1 Time Travel restore to the bookmark in the backup file, which also
--   rewinds every write made since).
--
-- Decision: PB Context/Decisions/2026-10-11-projects-hold-products.md.

ALTER TABLE projects DROP COLUMN stage;
ALTER TABLE projects DROP COLUMN stage_entered_at;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (133, 'schema-v133-drop-project-stage.sql');
