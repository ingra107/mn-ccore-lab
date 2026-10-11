-- backfill-v102-daily-thought.sql (2026-07-23)
-- Hermes Lane Unification, Phase 4 (docs/superpowers/plans/2026-07-22-hermes-lane-unification.md §4).
--
-- Replay the historical `ai_requests WHERE source_type='daily_thought'` rows
-- (the typed-`@hermes`-prefix asks that predate the writer flip) into the
-- unified activity_entries timeline, TWO rows per source row: a question ROOT
-- and an answer REPLY, so the owner's old asks render through the SAME card as
-- every going-forward Hermes conversation. The `ai_requests` rows are NOT
-- deleted (they stay as transport log + token accounting).
--
-- GROUND TRUTH (live prod D1, probed 2026-07-23, NOT assumed):
--   * 16 daily_thought rows total: 7 task-keyed, 9 date-keyed. 0 unanswered
--     (response NOT NULL for all 16), 0 with NULL responded_at.
--   * ALL 16 carry requested_by='ingra107@umn.edu' -> actorSlug() -> 'nick-ingraham'.
--   * All 7 task-keyed source_ids reference a LIVE task (deleted_at IS NULL);
--     3 of those tasks have a NULL project_id (unassigned) -> derived NULL, fine.
--   * Stored `prompt` has the @hermes token stripped, so '@hermes ' || prompt
--     reconstructs the original typed text (no double token).
--
-- COLUMN MAPPING (RENDER-shape-compatible with what the Phase 5 comment-endpoint
-- writers + the reply-writeback at api/routes/ai-requests.ts:311-330 produce --
-- same card, same thread. NOT byte-identical: backfill carries deterministic ids
-- + populated source_table/source_id provenance and PRESERVES the historical
-- created_at/responded_at, whereas a fresh live row mints an id, leaves source_*
-- NULL, and stamps datetime('now')):
--   id            'bk_ai_req_<ar.id>' (root) / 'bk_ai_resp_<ar.id>' (reply) --
--                 deterministic so the reply's parent_id needs no join and a
--                 re-run is a clean no-op.
--   entity_type   'task' when source_id LIKE 'task_%'; 'day' when source_id is a
--                 YYYY-MM-DD civil date. Everything else is SKIPPED (§4).
--   entity_id     ar.source_id (the task id or the date key).
--   project_id    task -> tasks.project_id (may be NULL); day -> NULL (a Today-bar
--                 ask must never move a project health score, §3.2).
--   kind          'comment' (both rows) -- POST /api/days/:date/activity (days.ts:73),
--                 POST task comments (tasks.ts:590), and the reply writeback all
--                 use 'comment'.
--   visibility    'author' on BOTH rows. NON-NEGOTIABLE (§4): these exchanges are
--                 requester-scoped today (Rule 78); backfilling as 'team' would
--                 retroactively publish every private Hermes exchange to the lab.
--   actor_slug    root 'nick-ingraham' (= actorSlug('ingra107@umn.edu'), the sole
--                 requester across all 16 rows, verified above); reply 'claude-ai'.
--   body          root '@hermes ' || ar.prompt; reply ar.response.
--   mentions_json root '["hermes"]' (parseMentions('@hermes ...') filtered of the
--                 self-slug = ["hermes"] -- matches every live @hermes root, e.g.
--                 the existing kind='update'/'comment' rows); reply NULL.
--   parent_id     root NULL; reply 'bk_ai_req_<ar.id>' (points at its own root id).
--   source_table  root 'ai_requests'; reply 'ai_requests_response' (idempotency key
--                 with source_id, and the rollback selector).
--   source_id     ar.id (both rows).
--   created_at    root ar.created_at; reply ar.responded_at. PRESERVED, never now.
--
-- REQUESTER GUARD (deliberate, documented deviation from the literal
-- `actorSlug(requested_by)` spec): the WHERE restricts to
-- lower(requested_by)='ingra107@umn.edu' and hardcodes 'nick-ingraham'. This is
-- a bounded one-time backfill of a data set that is 100% Nick's (verified). The
-- guard makes mis-attribution UNREPRESENTABLE (a hypothetical non-Nick row is
-- SKIPPED, never written under the wrong slug) rather than reproducing the
-- 21-entry EMAIL_PREFIX_TO_SLUG dict in SQL where it could drift from helpers.ts.
-- Any of Nick's own new daily_thought rows created before the Phase 5 flip WILL
-- migrate cleanly on a re-run (same requester, INSERT OR IGNORE).
--
-- IDEMPOTENT: INSERT OR IGNORE against the partial UNIQUE index
-- idx_ae_source(source_table, source_id) (schema-v77) -- a re-run never dupes.
-- Reply-first-then-root or root-first ordering is irrelevant because the reply's
-- parent_id is the DETERMINISTIC root id string, not a looked-up value.
--
-- ROLLBACK (one line, no data component):
--   DELETE FROM activity_entries WHERE source_table IN ('ai_requests','ai_requests_response');
-- D1 Time-Travel (30d) is the backstop.
--
-- APPLY -- sanctioned wrapper ONLY (test FIRST, probe, then prod):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/backfill-v102-daily-thought.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/backfill-v102-daily-thought.sql

-- ROOT rows (the question) -- kind='comment', actor 'nick-ingraham', visibility 'author'.
INSERT OR IGNORE INTO activity_entries
  (id, entity_type, entity_id, project_id, kind, visibility, actor_slug, body, mentions_json, update_type, metadata_json, source_table, source_id, parent_id, created_at)
SELECT
  'bk_ai_req_' || ar.id,
  CASE WHEN ar.source_id LIKE 'task\_%' ESCAPE '\' THEN 'task' ELSE 'day' END,
  ar.source_id,
  CASE WHEN ar.source_id LIKE 'task\_%' ESCAPE '\'
       THEN (SELECT t.project_id FROM tasks t WHERE t.id = ar.source_id)
       ELSE NULL END,
  'comment',
  'author',
  'nick-ingraham',
  '@hermes ' || ar.prompt,
  '["hermes"]',
  NULL,
  NULL,
  'ai_requests',
  ar.id,
  NULL,
  ar.created_at
FROM ai_requests ar
WHERE ar.source_type = 'daily_thought'
  AND lower(ar.requested_by) = 'ingra107@umn.edu'
  AND (
    (ar.source_id LIKE 'task\_%' ESCAPE '\'
       AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = ar.source_id AND t.deleted_at IS NULL))
    OR ar.source_id GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  );

-- REPLY rows (Hermes's answer) -- kind='comment', actor 'claude-ai', visibility
-- 'author', parented to the matching root. Skipped when the answer is still
-- pending (response IS NULL) or has no answer timestamp.
INSERT OR IGNORE INTO activity_entries
  (id, entity_type, entity_id, project_id, kind, visibility, actor_slug, body, mentions_json, update_type, metadata_json, source_table, source_id, parent_id, created_at)
SELECT
  'bk_ai_resp_' || ar.id,
  CASE WHEN ar.source_id LIKE 'task\_%' ESCAPE '\' THEN 'task' ELSE 'day' END,
  ar.source_id,
  CASE WHEN ar.source_id LIKE 'task\_%' ESCAPE '\'
       THEN (SELECT t.project_id FROM tasks t WHERE t.id = ar.source_id)
       ELSE NULL END,
  'comment',
  'author',
  'claude-ai',
  ar.response,
  NULL,
  NULL,
  NULL,
  'ai_requests_response',
  ar.id,
  'bk_ai_req_' || ar.id,
  ar.responded_at
FROM ai_requests ar
WHERE ar.source_type = 'daily_thought'
  AND lower(ar.requested_by) = 'ingra107@umn.edu'
  AND ar.response IS NOT NULL
  AND ar.responded_at IS NOT NULL
  AND (
    (ar.source_id LIKE 'task\_%' ESCAPE '\'
       AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = ar.source_id AND t.deleted_at IS NULL))
    OR ar.source_id GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  );
