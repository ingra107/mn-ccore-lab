-- schema-v159-drop-workflow-templates.sql (2026-11-05)
--
-- Drop `workflow_templates`. It came from the 2026-03-27 Settings feature (schema-v9)
-- with three seeded rows that never changed; product_stages replaced the idea, and the
-- Settings Templates tab and its routes were removed 2026-11-05 (F08/F09). Nothing reads
-- or writes it: `git grep workflow_templates` in this repo finds this file, schema-v9 and
-- docs; in PB only archived notes and the decisions desk that recorded Nick's call.
-- Nick chose the drop 2026-11-05. No view, trigger or foreign key names it. This does not
-- touch lab_settings, including its `workflow_stages` row.
--
-- APPLY AFTER the deploy that carries this file's api/lib/table-scope.ts, in this order:
--   1. Deploy. The Worker then no longer lists the table, and nothing names it.
--   2. Back up: python scripts/d1_table_backup.py workflow_templates
--      and record a Time Travel bookmark: npx wrangler d1 time-travel info mnccore-lab
--   3. Apply:
--        scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v159-drop-workflow-templates.sql
--        scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v159-drop-workflow-templates.sql
--
-- Until step 3 the nightly schema-drift job reports this file as committed and unapplied,
-- and the table as an extra. That report is expected for as long as the two stay apart.
-- It is independent of schema-v158: either can be applied first.
--
-- ROLLBACK (the three rows are schema-v9's, unchanged; the backup holds them too):
--   CREATE TABLE IF NOT EXISTS workflow_templates ( ...as in api/schema-v9.sql... );
--   INSERT OR IGNORE INTO workflow_templates ( ...as in api/schema-v9.sql... );
--   DELETE FROM schema_migrations WHERE version = 159;

DROP TABLE IF EXISTS workflow_templates;

-- Self-registration: this row is the proof that schema-v159 itself ran to
-- completion (must stay the LAST statement in this file -- v105's ledger
-- epoch, enforced by scripts/check-schema-versions.py assertion 4).
INSERT OR IGNORE INTO schema_migrations (version, filename)
VALUES (159, 'schema-v159-drop-workflow-templates.sql');
