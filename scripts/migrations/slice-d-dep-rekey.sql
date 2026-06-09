-- Slice D — re-key project_dependencies on durable project PKs
-- ============================================================
-- WHY: edges were keyed on (from_slug, to_slug) with NO FK and NO cascade.
-- A project slug rename mutated projects.slug with no cascade, STRANDING every
-- edge (dangling slug). Proven prod state: all 8 rows are double-orphans
-- (neither endpoint resolves to a live project) — unrecoverable junk, Nick-approved
-- to drop. This migration makes stranding UNREPRESENTABLE by construction:
--   * edges hold from_project_id / to_project_id (proj_* PKs) — a rename can't
--     touch them (slug lives only on projects; edges no longer reference slug);
--   * FK REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE — D1 enforces
--     FKs, so an edge to a missing project is unrepresentable, and a hard project
--     delete (or PK change) cascades atomically;
--   * CHECK (from_project_id <> to_project_id) — self-edge is a DB invariant.
-- Slug is resolved PK->slug at the READ edge (JOIN in api/routes/dependencies.ts
-- + narratives.ts), so the API contract (from_slug/to_slug) is unchanged and the
-- frontend needs zero changes.
--
-- D1 has no DROP COLUMN and the PK/constraints change, so this is a table
-- RECREATION. Because there are 0 surviving edges, there is NO data backfill —
-- the old table (and its 8 orphan rows + 4 redundant slug indexes) is dropped and
-- the new table starts empty.
--
-- Run as ONE batch via: wrangler d1 execute mnccore-lab --remote --file <this>
-- (wrangler wraps the file; D1 auto-rolls back the whole batch on any error).
-- The fail-closed double-orphan interlock + Time-Travel bookmark live in the
-- runbook (RUNBOOK-slice-d-dep-rekey.md) — DO NOT run --remote without them.

PRAGMA foreign_keys = OFF;   -- batch-safe: the recreate references projects(id);
                             -- disable enforcement for the batch, re-enable + check at end.

-- POINT OF NO RETURN (within the Time-Travel window): drops the 8 orphan rows,
-- the old composite-slug PK, and all 4 slug indexes
-- (idx_deps_from / idx_deps_to / idx_proj_deps_from / idx_proj_deps_to).
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

PRAGMA foreign_key_check;    -- expect 0 rows (empty table, FK targets valid)
PRAGMA foreign_keys = ON;    -- restore enforcement
