-- schema-v104-artifact-tags.sql (2026-07-23)
--
-- Artifacts Reference Gallery — the collection axis.
-- Design ref: docs/superpowers/specs/2026-07-23-artifacts-reference-gallery-design.md.
--
-- A many-to-many join between artifacts and free-form collection tags. Tags are
-- the ONLY curation gate for the gallery: an artifact appears at /portal/artifacts
-- iff it has >=1 row here, so untagged ephemeral Hermes deliverables stay off the
-- shelf automatically (no separate is_reference flag).
--
--   - tag is stored lowercased/trimmed, [a-z0-9-] only (the writer's normalizeTag
--     in api/routes/artifacts.ts is the single normalization point).
--   - PRIMARY KEY (artifact_id, tag) makes a re-add a no-op (INSERT OR IGNORE).
--   - ON DELETE CASCADE: deleting an artifact drops its tags. (D1 does not enforce
--     FKs unless PRAGMA foreign_keys=ON per-connection, which the Worker does not
--     set; the artifact delete path — handleDeleteArtifact — is the belt-and-braces
--     cleanup. The FK is declared for schema intent + when-enabled correctness.)
--   - idx_artifact_tags_tag powers GET /api/artifact-tags (GROUP BY tag) and the
--     ?tag= gallery filter.
--
-- Purely additive: no backfill, no column change on artifacts. Hub-D1-local
-- (artifacts live only in D1, not brain.db) so NO brain.db mirror and NO shared
-- schema registry entry are needed.
--
-- Rollback: DROP INDEX idx_artifact_tags_tag; DROP TABLE artifact_tags;
--
-- Apply:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v104-artifact-tags.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v104-artifact-tags.sql

CREATE TABLE IF NOT EXISTS artifact_tags (
  artifact_id TEXT NOT NULL,
  tag         TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (artifact_id, tag),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_artifact_tags_tag ON artifact_tags(tag);
