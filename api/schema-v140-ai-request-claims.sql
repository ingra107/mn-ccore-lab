-- schema-v140-ai-request-claims.sql (2026-10-14)
-- One answer per Hermes ask: a fenced claim on ai_requests, and a terminal row
-- that nothing can rewrite, delete or replace.
--
-- WHY. Nick, 2026-10-14: "Hermes can't answer the same @claude ask twice ...
-- Build it?" -> "Build it (Recommended)". The failover build of that morning
-- (PB scripts/db/failover.py, commit 14d5eccf1) lets WORK stand in for HOME,
-- and a hand-back can leave both machines' hub_ai_listener running for ~2h+.
-- Until now nothing on the Hub stopped the second one: handleUpdateAIResponse
-- ran an UNCONDITIONAL `UPDATE ai_requests SET response = ?, status = ? WHERE
-- id = ?` and then published, so a second listener overwrote the first answer
-- in the placeholder and re-ran every pre-answer side effect.
-- Plan: PB Scratch/plans/2026-10-14-hermes-claim-reconciled.md (three cold
-- seats, two of three per decision).
--
-- WHAT.
--   * Seven claim columns. A claimed row stays status='pending'; ownership
--     lives here, not in a new status value (no reader of `status` changes
--     meaning).
--       claim_attempts      acquisitions that did NOT end in a release (a crash,
--                           a lease that ran out, or the live one), 0..3
--                           (CHECK). The service sweep fails a row whose third
--                           such lease is gone. A release refunds its attempt.
--       claim_releases      releases after a known transient (backlog lock busy,
--                           a failed /revise), 0..10 (CHECK). Each release
--                           pushes the next claim out by 1, 2, 4 ... minutes
--                           (capped at 30); the tenth exhausts the row. Its own
--                           budget so a busy lock cannot burn the crash budget.
--       claimed_by          diagnostic only (machine name). Never authority.
--       claim_token         fresh server-minted token per acquisition. The
--                           terminal /response of a claimed row must carry the
--                           current one (a takeover mints a new one, a release
--                           clears it). Never returned by the requester GET.
--       claim_expires_at    UTC unix seconds, D1 clock: when the lease (or a
--                           release's backoff) ends. Gates /claim and the queue.
--       response_commit_id  fresh per terminal submission; every publication
--                           and notification statement in the acceptance batch
--                           is guarded on it, so a losing submission writes
--                           nothing.
--       exhaustion_alert    'owed' when the sweep fails a row, 'sent' once a
--                           listener has alerted Nick and acked. The queue keeps
--                           returning owed rows, so a lost /queue response does
--                           not lose the alert.
--   * Three RAISE(ABORT) triggers (the schema-v101 precedent): a terminal row's
--     result and identity fields cannot be rewritten, the row cannot be
--     deleted, and an INSERT (OR REPLACE) cannot land on its id. Metadata such
--     as requested_by / project_slug (slug renames) stays writable.
--
-- Level 2, gate-enforced (ethos #15: a gate is Level 2). The triggers are the
-- database half; the fenced UPDATE in api/routes/ai-requests.ts is the route
-- half. Duplicate PRE-answer side effects from an old listener are not
-- prevented here; those sinks carry no request identity.
--
-- Writer sweep before the triggers (2026-10-14, both repos + scripts): the only
-- statement that writes ai_requests.status/response is handleUpdateAIResponse.
-- scripts/rename-team-slugs.sql, scripts/generate-slug-migration.py and
-- api/lib/project-slug.ts UPDATE requested_by / project_slug only (not guarded
-- columns). No DELETE FROM ai_requests and no INSERT OR REPLACE anywhere. PB
-- has no direct D1 writer of this table.
--
-- RETENTION. Terminal ai_requests rows cannot be deleted. Any retention job or
-- table-rebuild migration (the CREATE-copy-DROP-RENAME shape) must drop these
-- three triggers first and re-create them after.
--
-- HUB-ONLY columns -- NO Peripheral Brain lockstep (brain.db has no
-- ai_requests table; same class as v82). The cross-repo CONTRACT (claim /
-- release / queue routes, token on /response) is recorded in PB
-- Context/Topics/shared-schema-registry.md.
--
-- APPLY (quiesce /response first; see the PB plan's runbook) -- sanctioned
-- wrapper ONLY, test first:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v140-ai-request-claims.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab --remote --file=api/schema-v140-ai-request-claims.sql
--
-- ROLLBACK. The preferred rollback keeps the schema, the triggers and the
-- guarded route, and only revokes live claims (stop every listener first):
--   UPDATE ai_requests SET claimed_by = NULL, claim_token = NULL, claim_expires_at = NULL
--    WHERE status = 'pending';
-- Restoring the old unconditional /response is NOT an acceptable rollback while
-- two listeners can run. To remove this migration entirely, FIRST redeploy the
-- previous Pages build (the new routes name these columns, so every
-- /api/ai-requests call 500s once they are gone), then:
--   DROP TRIGGER IF EXISTS ai_requests_terminal_result_immutable;
--   DROP TRIGGER IF EXISTS ai_requests_terminal_no_delete;
--   DROP TRIGGER IF EXISTS ai_requests_terminal_no_replace;
--   ALTER TABLE ai_requests DROP COLUMN exhaustion_alert;
--   ALTER TABLE ai_requests DROP COLUMN claim_releases;
--   ALTER TABLE ai_requests DROP COLUMN response_commit_id;
--   ALTER TABLE ai_requests DROP COLUMN claim_expires_at;
--   ALTER TABLE ai_requests DROP COLUMN claim_token;
--   ALTER TABLE ai_requests DROP COLUMN claimed_by;
--   ALTER TABLE ai_requests DROP COLUMN claim_attempts;
--   DELETE FROM schema_migrations WHERE version = 140;
-- (the triggers must go before any DELETE of a terminal row, and before the
-- column drops, which they name).
--
-- The ALTERs are not idempotent (SQLite has no ADD COLUMN IF NOT EXISTS); each
-- CREATE TRIGGER is preceded by DROP TRIGGER IF EXISTS. The triggers only
-- RAISE(ABORT); they never write.

ALTER TABLE ai_requests ADD COLUMN claim_attempts INTEGER NOT NULL DEFAULT 0
  CHECK (claim_attempts BETWEEN 0 AND 3);
ALTER TABLE ai_requests ADD COLUMN claimed_by TEXT;
ALTER TABLE ai_requests ADD COLUMN claim_token TEXT;
ALTER TABLE ai_requests ADD COLUMN claim_expires_at INTEGER;
ALTER TABLE ai_requests ADD COLUMN response_commit_id TEXT;
ALTER TABLE ai_requests ADD COLUMN claim_releases INTEGER NOT NULL DEFAULT 0
  CHECK (claim_releases BETWEEN 0 AND 10);
ALTER TABLE ai_requests ADD COLUMN exhaustion_alert TEXT
  CHECK (exhaustion_alert IS NULL OR exhaustion_alert IN ('owed', 'sent'));

DROP TRIGGER IF EXISTS ai_requests_terminal_result_immutable;
DROP TRIGGER IF EXISTS ai_requests_terminal_no_delete;
DROP TRIGGER IF EXISTS ai_requests_terminal_no_replace;

-- `UPDATE OF col` fires whenever a listed column is in the SET list, whatever
-- the value, so an identical re-post is refused too.
CREATE TRIGGER ai_requests_terminal_result_immutable
BEFORE UPDATE OF
  id, status, response, responded_at, input_tokens, output_tokens,
  claimed_by, claim_token, claim_expires_at, claim_attempts, claim_releases,
  response_commit_id
ON ai_requests FOR EACH ROW
WHEN OLD.status IN ('completed', 'failed')
BEGIN SELECT RAISE(ABORT, 'ai_request terminal result is immutable (schema-v140): one answer per ask'); END;

CREATE TRIGGER ai_requests_terminal_no_delete
BEFORE DELETE ON ai_requests FOR EACH ROW
WHEN OLD.status IN ('completed', 'failed')
BEGIN SELECT RAISE(ABORT, 'ai_request terminal history cannot be deleted (schema-v140)'); END;

-- Explicit, rather than relying on REPLACE's implicit delete firing the DELETE
-- trigger (it does not unless recursive_triggers is on).
CREATE TRIGGER ai_requests_terminal_no_replace
BEFORE INSERT ON ai_requests FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM ai_requests WHERE id = NEW.id AND status IN ('completed', 'failed'))
BEGIN SELECT RAISE(ABORT, 'ai_request terminal history cannot be replaced (schema-v140)'); END;

-- Self-registration: must stay the LAST statement (v105 ledger epoch).
INSERT OR IGNORE INTO schema_migrations (version, filename)
VALUES (140, 'schema-v140-ai-request-claims.sql');
