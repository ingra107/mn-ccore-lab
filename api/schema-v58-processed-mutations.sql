-- v58 -- A3 mutation protocol idempotency table
--
-- Per Peripheral-Brain workflow-restructure plan rev 4 sec A3.0 + A3.2.
-- Hub stores mutation_id of EVERY processed mutation (any outcome) so
-- retries return the original verdict regardless of outcome. Otherwise a
-- retried mutation could re-evaluate against a different Hub state and
-- get a different result.
--
-- Sequencing: ships BEFORE v59 (last_mutation_id columns) and BEFORE the
-- /api/mutations route deploys. The route reads from this table on every
-- request to short-circuit duplicate mutation_ids.
--
-- Apply via:
--   wrangler d1 execute mnccore-lab --remote --file=api/schema-v58-processed-mutations.sql
--
-- Pre-A3 snapshot manifest must be committed (verify_pre_a3_snapshot.py
-- exits 0 on both PB machines) before this deploys.

CREATE TABLE IF NOT EXISTS processed_mutations (
    mutation_id TEXT PRIMARY KEY,            -- mut_<ULID> from PB outbox
    origin_machine TEXT NOT NULL,            -- 'work'|'home'|'hub-ui'|'hub-pwa'|'gmail-script'|'mobile-pwa'|'server'
    processed_at TEXT NOT NULL,              -- when Hub finalized verdict (any outcome)
    outcome TEXT NOT NULL,                   -- 'accepted'|'merged_clean'|'conflict'|'dependency_failed'|'error'
    original_response_json TEXT NOT NULL,    -- canonical response; returned verbatim on retry
    table_name TEXT NOT NULL,                -- 'tasks'|'projects'|'inbox_events'|'day_capacity'|'project_state_log'
    record_id TEXT NOT NULL                  -- target row PK
);

CREATE INDEX IF NOT EXISTS idx_processed_mutations_record
    ON processed_mutations(table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_processed_mutations_origin
    ON processed_mutations(origin_machine, processed_at);

-- On retry: SELECT original_response_json WHERE mutation_id = ?
-- Return as-is. Do not re-evaluate. Do not re-apply.
