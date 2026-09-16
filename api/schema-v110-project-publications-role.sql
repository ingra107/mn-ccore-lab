-- schema-v110-project-publications-role.sql (2026-09-16)
--
-- `project_publications` (schema-v49: project_id, publication_id, created_at;
-- PK on the pair) is the project's PUBLISHED OUTPUT — the junction "Phase 25
-- paper-link-to-project" created and never wired (0 rows, 0 routes until
-- today, GH #129). A project lists its main paper, a letter and a preprint,
-- and one paper (Nick's LPV adherence paper) sits under both the K23 and its
-- own project, so the pair stays the identity and `role` is an attribute of
-- the link: 'primary' (the paper the project produced) | 'secondary' |
-- 'preprint'. NOT NULL DEFAULT 'primary' so every row is classified; the value
-- set is guarded at the API (api/routes/project-publications.ts), not by a
-- CHECK, matching v106's posture.
--
-- Additive. Hub-only table (no brain.db twin); citation facts stay in
-- `publications`, nothing is copied onto `projects`.
--
-- ROLLBACK:
--   ALTER TABLE project_publications DROP COLUMN role;
--
-- Apply (NOT executed by this commit -- prod D1 DDL needs its own named
-- authorization; granted by Nick's plan approval 2026-09-16):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v110-project-publications-role.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v110-project-publications-role.sql

ALTER TABLE project_publications ADD COLUMN role TEXT NOT NULL DEFAULT 'primary';

-- Self-registration: this row is the proof that schema-v110 itself ran to
-- completion (must stay the LAST statement in this file -- v105's ledger
-- epoch, enforced by scripts/check-schema-versions.py assertion 4).
INSERT OR IGNORE INTO schema_migrations (version, filename)
VALUES (110, 'schema-v110-project-publications-role.sql');
