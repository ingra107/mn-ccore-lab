-- schema-v79-artifacts.sql (2026-06-11)
-- Hermes Artifacts v1 — link-shareable, interactive long-form deliverables.
--
-- Design ref: docs/superpowers/plans/2026-06-11-hermes-artifacts-design.md (Nick-approved).
-- Markdown is the SOURCE format; the /portal/artifacts/:id page renders it. Long
-- Hermes outputs (>1500 chars) OR explicit "write up / document" asks become an
-- artifact + a short feed reply with the link, instead of a giant feed comment.
--
-- These are HUB-ONLY tables — NO Peripheral Brain lockstep (no PB schema, no
-- enums.py, no shared-schema-registry entry). The interactive loop rides the
-- existing unified activity timeline: artifact comments write activity_entries
-- (entity_type='artifact'), @hermes mentions create ai_requests
-- (source_type='artifact_comment'), the listener regenerates and POSTs to
-- /api/artifacts/:id/revise → version++, old body archived to artifact_versions.
--
-- Columns (artifacts):
--   id            TEXT PK   'art_<random>' minted by the create route.
--   title         TEXT      concise human title (Hermes generates one).
--   body_md       TEXT      markdown SOURCE (rendered as the page).
--   version       INTEGER   current version (starts at 1, ++ per revise).
--   task_id       TEXT      optional origin task id (nullable).
--   project_id    TEXT      optional origin project id — typed proj_* PK
--                           (Slice-C convention), nullable.
--   created_by    TEXT      actor slug ('claude-ai' for Hermes).
--   created_at    TEXT      UTC 'YYYY-MM-DD HH:MM:SS' (store UTC, render local).
--   updated_at    TEXT      UTC, bumped on every revise.
--
-- artifact_versions = append-only provenance: the PRIOR body is archived here at
-- each revision so Hermes text vs. team input never blurs. PK (artifact_id,
-- version) makes a re-applied revision idempotent.
--
-- Purely additive (CREATE TABLE IF NOT EXISTS + indexes). Reversible:
--   DROP TABLE artifact_versions; DROP TABLE artifacts;
-- (No FK references either table; activity_entries rows for entity_type='artifact'
-- are cleaned by the delete cascade in the route layer, not by a DB FK.)
--
-- APPLY (test FIRST, probe, then prod) — sanctioned wrapper ONLY:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v79-artifacts.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v79-artifacts.sql

CREATE TABLE IF NOT EXISTS artifacts (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  body_md     TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  task_id     TEXT,
  project_id  TEXT,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS artifact_versions (
  artifact_id   TEXT NOT NULL,
  version       INTEGER NOT NULL,
  body_md       TEXT NOT NULL,
  revised_by    TEXT,
  revision_note TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (artifact_id, version)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_recent
  ON artifacts (updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_task
  ON artifacts (task_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_project
  ON artifacts (project_id);
CREATE INDEX IF NOT EXISTS idx_artifact_versions_artifact
  ON artifact_versions (artifact_id, version DESC);
