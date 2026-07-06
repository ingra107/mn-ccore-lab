-- schema-v94-artifact-visibility.sql (2026-07-06)
-- Hub-hosted public artifacts — share a live HTML artifact via a link, no login.
--
-- Design ref: ~/Peripheral-Brain/Scratch/plans/2026-07-06-hub-hosted-public-artifacts-design.md
-- (Nick-approved 2026-07-06, PB #491 follow-on). Backend slice of the phased plan
-- (P1 hub-backend / P2 hub-frontend / P3 PB publish script / P4 security review / P5 deploy).
--
-- Two additive, defaulted columns on the HUB-ONLY `artifacts` table (schema-v79 —
-- no Peripheral Brain lockstep, no enums.py, no shared-schema-registry entry):
--
--   content_type TEXT NOT NULL DEFAULT 'markdown'  -- 'markdown' | 'html'
--   visibility    TEXT NOT NULL DEFAULT 'team'      -- 'team' | 'public'
--
-- Every EXISTING row keeps today's behavior exactly: markdown body, team-only
-- (CF-Access-gated /portal/artifacts/:id). Public is opt-in per artifact — no
-- artifact becomes public as a side effect of this migration. CHECK constraints
-- make an invalid value unrepresentable at the DB layer (Level 1, ethos #15) —
-- the app-layer validation in handleCreateArtifact (api/routes/artifacts.ts)
-- is the primary UX-facing 400, this is the backstop for any writer that
-- bypasses the route (e.g. a raw direct-D1 UPDATE).
--
-- The new public GET /a/:id route (functions/a/[id].ts + handleGetPublicArtifact
-- in api/routes/public-artifact.ts) serves body_md ONLY when
-- visibility='public' AND content_type='html'; every other combination 404s.
--
-- Purely additive. Reversible: ALTER TABLE artifacts DROP COLUMN content_type;
-- ALTER TABLE artifacts DROP COLUMN visibility; (SQLite 3.35+/D1 supports
-- DROP COLUMN; no data loss on drop since both are derived defaults unless a
-- caller has actually opted an artifact into html/public).
--
-- APPLY (test FIRST, probe, then prod) — sanctioned wrapper ONLY:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v94-artifact-visibility.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v94-artifact-visibility.sql

ALTER TABLE artifacts ADD COLUMN content_type TEXT NOT NULL DEFAULT 'markdown'
  CHECK (content_type IN ('markdown', 'html'));

ALTER TABLE artifacts ADD COLUMN visibility TEXT NOT NULL DEFAULT 'team'
  CHECK (visibility IN ('team', 'public'));
