-- v48: index reconciliation between prod D1 and committed schema files.
--
-- Background: 2026-04-21 audit (after fixing the schema-drift CI workflow)
-- found 27 indexes drifted between prod and the committed api/schema*.sql
-- files. 24 existed only on prod (created via direct `wrangler d1 execute`
-- or /api/admin/migrate without committing the SQL) and 3 existed only
-- in committed migrations (committed but never applied, OR applied then
-- later dropped manually on prod).
--
-- Postmortem ran in chat 2026-04-21; lifted from there:
--   "users won't notice anything. But the workflow only becomes useful as
--    a guardrail once committed schema = prod schema. v48 is mostly a
--    docs reconciliation, with a small perf bonus."
--
-- This migration is idempotent — every statement uses IF NOT EXISTS, so
-- applying it to prod is a no-op for the 24 existing indexes and creates
-- the 3 currently-missing ones. After applying, prod and committed will
-- agree, and the schema-drift workflow returns to a quiet baseline.
--
-- Run via:
--   wrangler d1 execute mnccore-lab --remote --file api/schema-v48-index-reconcile.sql
-- Or via the admin endpoint:
--   POST /api/admin/migrate with {"version": 48}

-- ── 24 indexes that exist on prod but were missing from committed files ──
CREATE INDEX IF NOT EXISTS idx_action_items_category         ON action_items(category);
CREATE INDEX IF NOT EXISTS idx_action_items_parent           ON action_items(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_attachments_entity            ON file_attachments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_contributions_member          ON contributions(member_slug, created_at);
CREATE INDEX IF NOT EXISTS idx_contributions_type            ON contributions(type);
CREATE INDEX IF NOT EXISTS idx_inbox_created                 ON inbox(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_synced                  ON inbox(synced_at);
CREATE INDEX IF NOT EXISTS idx_narrative_projects_narrative  ON narrative_projects(narrative_id, position);
CREATE INDEX IF NOT EXISTS idx_narrative_projects_slug       ON narrative_projects(project_slug);
CREATE INDEX IF NOT EXISTS idx_nih_grants_lab                ON nih_grants(is_lab_grant);
CREATE INDEX IF NOT EXISTS idx_nih_grants_section            ON nih_grants(study_section);
CREATE INDEX IF NOT EXISTS idx_nih_grants_year               ON nih_grants(fiscal_year DESC);
CREATE INDEX IF NOT EXISTS idx_osr_position                  ON open_science_resources(position);
CREATE INDEX IF NOT EXISTS idx_osr_type                      ON open_science_resources(type, position);
CREATE INDEX IF NOT EXISTS idx_pp_project                    ON project_publications(project_id);
CREATE INDEX IF NOT EXISTS idx_pp_publication                ON project_publications(publication_id);
CREATE INDEX IF NOT EXISTS idx_proj_deps_from                ON project_dependencies(from_slug);
CREATE INDEX IF NOT EXISTS idx_proj_deps_to                  ON project_dependencies(to_slug);
CREATE INDEX IF NOT EXISTS idx_project_documents_project     ON project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_pubmed_sync_log_date          ON pubmed_sync_log(synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_trainee_milestones_slug       ON trainee_milestones(member_slug);
CREATE INDEX IF NOT EXISTS idx_trainee_milestones_type       ON trainee_milestones(milestone_type);
CREATE INDEX IF NOT EXISTS idx_watchlist_entity              ON watchlist(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_member              ON watchlist(member_slug);

-- ── 3 indexes that were committed in past migrations but don't exist on prod ──
-- (applied then dropped, OR committed but never applied — same fix either way)
CREATE INDEX IF NOT EXISTS idx_commitments_status            ON commitments(status);
CREATE INDEX IF NOT EXISTS idx_decisions_tags                ON decision_log(tags);
CREATE INDEX IF NOT EXISTS idx_task_subtasks_task            ON task_subtasks(task_id);
