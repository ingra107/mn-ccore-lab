-- schema-v80-retro-parity.sql (2026-06-11)
-- RETROACTIVE parity migration — records two changes that were applied to prod
-- WITHOUT a numbered schema file, so the nightly drift check's migration
-- replay can converge to prod again. Nothing here changes prod; prod already
-- has this state. (Caught by the drift check 2026-06-10/11 once the INFRA-5
-- snapshot failure stopped masking the diff step.)
--
-- 1. Slice-D project_dependencies DROP+recreate (applied to prod 2026-06-09,
--    "unnumbered" per CLAUDE.md): slug-keyed from_slug/to_slug → typed
--    from_project_id/to_project_id with FK cascades + self-edge CHECK.
--    DDL below is verbatim from prod sqlite_master.
-- 2. daily_plans + daily_reflections DROP (T1 retirement, applied to prod
--    2026-06-10 ~23:20 CT; decision: PB Context/Decisions/
--    2026-06-10-daily-plans-retirement.md; snapshots in
--    Scratch/t1-drop-snapshots-2026-06-10/).

-- (1) Slice-D project_dependencies rekey
DROP TABLE IF EXISTS project_dependencies;
CREATE TABLE project_dependencies (
  id                TEXT PRIMARY KEY,
  from_project_id   TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  to_project_id     TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'feeds_into'
                      CHECK (relationship_type IN ('feeds_into', 'blocks', 'shares_data', 'related_to')),
  note              TEXT,
  created_by        TEXT,
  created_at        TEXT DEFAULT (datetime('now')),
  UNIQUE (from_project_id, to_project_id),
  CHECK (from_project_id <> to_project_id)
);
CREATE INDEX idx_deps_from ON project_dependencies(from_project_id);
CREATE INDEX idx_deps_to   ON project_dependencies(to_project_id);

-- (2) daily_plans retirement (IA-1 / T1)
DROP TABLE IF EXISTS daily_plans;
DROP TABLE IF EXISTS daily_reflections;
