-- schema-v83-processed-mutations-retention-index.sql (2026-06-18, post-mortem)
-- Capture the idx_processed_mutations_processed_at index in the migration
-- history. This index was added DIRECTLY to prod D1 during the 2026-06-18
-- incident (drain + index added out-of-band, before the migration system was
-- updated). Without this file the schema-version snapshot diverges from prod,
-- CI fails the drift check, and the pre-commit gate blocks future schema work.
--
-- The existing composite index (origin_machine, processed_at) was insufficient
-- for the retention DELETE (WHERE processed_at < ?), which triggered a full
-- table scan on 88k rows until this simple index was added.
--
-- APPLY: already live on prod D1 (applied 2026-06-18 out-of-band).
-- Test env: safe to re-apply — CREATE INDEX IF NOT EXISTS is idempotent.
--
-- APPLY (test FIRST, probe, then prod) — sanctioned wrapper ONLY:  wrangler-d1-allowed
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v83-processed-mutations-retention-index.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=api/schema-v83-processed-mutations-retention-index.sql
--   (already applied to prod — second command is a no-op on prod, safe to run)

CREATE INDEX IF NOT EXISTS idx_processed_mutations_processed_at
    ON processed_mutations(processed_at);
