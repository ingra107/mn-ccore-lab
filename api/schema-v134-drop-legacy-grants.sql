-- schema-v134-drop-legacy-grants.sql (2026-10-12)
--
-- Grants phase 2. Drops the three legacy grant tables. The Grants page,
-- search, insights, calendar and the public funding lists read grant
-- products since schema-v128 (Nick 2026-10-12: "we can keep grants separate
-- so use the current grants page to build out and make sure it reads the
-- right stuff"); a grant's dates and money are products.period_start /
-- period_end / amount_usd, and a post-award milestone is a tasks row with
-- kind='milestone' on that product. Decision: PB
-- Context/Decisions/2026-10-12-product-award-terms.md.
--
--   grants            2026-03-24 display seed for the dashboard card. 5 rows
--                     in prod, each mapped onto a product (the backup file
--                     keeps the legacy values; see PRECONDITIONS).
--   grant_milestones  schema-v29 post-award tracker. 0 rows in prod; its
--                     routes were archived 2026-10-12.
--   nih_grants        RePORTER cache (schema-v49). 0 rows in prod; nothing
--                     syncs it. /api/grants/similar calls RePORTER live and
--                     never read this table.
--
-- The one foreign key into any of them is milestones.grant_id REFERENCES
-- grants(id) (schema-v4). It is dropped as a column first: a DROP TABLE
-- grants under it would leave a dangling FK that fails the next milestones
-- write with "no such table: main.grants" (probe:
-- api/routes/grants.retirement-probe.test.ts at 2026-10-12). grant_milestones
-- .grant_id never declared an FK. milestones held 0 rows in prod and 0 with a
-- grant_id on 2026-10-12; nothing reads milestones.grant_id after this
-- commit (the GET /api/milestones grant_id filter is gone with it).
--
-- PRECONDITIONS (prod; the apply order checks each, never assumes):
--   1. Backup taken: scripts/d1_table_backup.py take writes the Time Travel
--      bookmark, each table's DDL and every row to
--      ~/PB-State/data/shared/backups/legacy-grants-2026-10-12.json and
--      refuses unless each table's row count equals SELECT COUNT(*).
--   2. The deployed Worker names none of the three tables and not
--      milestones.grant_id (this commit's Worker is live first).
--   3. Prod reads the same counts the backup took (5 / 0 / 0, milestones
--      grant_id 0). A milestones row with a grant_id stops the apply.
--
-- Checked on mnccore-lab (prod, read-only) and mnccore-lab-test 2026-10-12:
-- sqlite_master holds no view or trigger naming any of the three tables;
-- the only index on them is each table's own (dropped with it).
--
-- NOT RE-RUNNABLE: SQLite has no DROP COLUMN IF EXISTS. The ledger row below
-- marks it applied; never re-run the file by hand.
--
-- APPLY (sanctioned wrapper only; test first, then prod):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v134-drop-legacy-grants.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v134-drop-legacy-grants.sql
--
-- ROLLBACK: `python scripts/d1_table_backup.py restore-sql <backup.json>`
-- emits each table's recorded CREATE TABLE + CREATE INDEX and one INSERT
-- per row; then ALTER TABLE milestones ADD COLUMN grant_id TEXT REFERENCES
-- grants(id); then DELETE FROM schema_migrations WHERE version = 134. (Or
-- D1 Time Travel to the bookmark in the backup, which also rewinds every
-- write made since.)

ALTER TABLE milestones DROP COLUMN grant_id;

DROP TABLE grant_milestones;
DROP TABLE nih_grants;
DROP TABLE grants;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (134, 'schema-v134-drop-legacy-grants.sql');
