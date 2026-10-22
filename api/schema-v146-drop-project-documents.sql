-- v146: drop the retired `project_documents` table (PB backlog #151, contract step).
--
-- project_documents (v38/v49) was a typed project library: folder/draft/data/protocol/
-- submission/link rows. Its only bulk writer was a one-time April backfill of folders
-- (Archive/2026-10-11-applied-oneoffs/scripts/populate-project-documents.py), and on
-- 2026-10-22 prod held 38 rows: 34 folder backfills the derived "Project folder" chip already
-- shows, 4 unique. Since v145 a project document is a `links` row with a kind; the project
-- page's "Add document" posts to POST /api/projects/:slug/links. The Worker that ships with
-- v145 no longer reads or writes this table, and the tombstone cascade no longer names it.
-- Nothing else in the chain references it (no view, trigger or FK points AT it; its own FK
-- points at projects).
--
-- Decision: PB Context/Decisions/2026-10-22-project-documents-on-links.md.
--
-- APPLY ONLY AFTER ALL of these are true, in this order (orchestrator-only, prod):
--   1. The Worker that no longer names project_documents is deployed (v145 runbook step 5).
--   2. The export is on disk and read back, with its count equal to prod's:
--        scripts/wrangler-d1 d1 execute mnccore-lab --remote --json \
--          --command "SELECT * FROM project_documents ORDER BY project_id, id"
--      saved to ~/PB-State/data/backups/2026-10-22-project_documents.json, and
--        SELECT COUNT(*) FROM project_documents   == the row count of that file.
--   3. The 4 unique rows are carried into `links` (PB scripts/links/carry_project_documents_151.py
--      --execute) and every exported row has a decision line (carried or covered).
--   4. A Time Travel bookmark is recorded: npx wrangler d1 time-travel info mnccore-lab
-- APPLY:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v146-drop-project-documents.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v146-drop-project-documents.sql
-- ROLLBACK (then re-INSERT the rows from the step-2 export):
--   CREATE TABLE IF NOT EXISTS project_documents (
--     id TEXT PRIMARY KEY,
--     project_id TEXT NOT NULL,
--     title TEXT NOT NULL,
--     url TEXT NOT NULL,
--     doc_type TEXT DEFAULT 'link',
--     created_at TEXT DEFAULT (datetime('now')),
--     created_by TEXT,
--     FOREIGN KEY (project_id) REFERENCES projects(id)
--   );
--   CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents(project_id);
--   DELETE FROM schema_migrations WHERE version = 146;

DROP INDEX IF EXISTS idx_project_documents_project;
DROP TABLE IF EXISTS project_documents;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (146, 'schema-v146-drop-project-documents.sql');
