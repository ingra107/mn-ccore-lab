-- schema-v111-tasks-question.sql (2026-09-17)
--
-- A question is a task row with kind='question' (PB decision
-- Context/Decisions/2026-09-17-question-task-kind.md; PB mig 130). Nick's
-- spec: a question a process is waiting on appears on his Today page and on
-- Telegram, he answers on either, and the other surface converges. One noun,
-- one row shape: a third kind is one more value, not a table (the 2026-09-16
-- milestone decision's rule). Three Hub-synced TEXT (JSON) columns carry the
-- whole contract; nothing else is new:
--
--   question_spec_json      immutable ask: {v, kind, prompt, choices[{key,label,
--                           payload?}], allow_text, rec}. Required on every
--                           kind='question' row (the API refuses the insert).
--   question_answer_json    NULL = unanswered. Non-null = {v, choice, text?,
--                           via:'hub'|'telegram'|'policy', at}. THE ONLY answer
--                           store. Answered is not done: the CONSUMER closes
--                           the row after its durable effect, and the API
--                           refuses status='done'/'deleted' while this is NULL.
--   question_telegram_json  NULL = no card sent. {chat_id, message_id,
--                           rendered_at}; rendered_at is the convergence
--                           watermark the HOME reconciler compares to answer.at.
--
-- All three nullable, no default, no backfill: every existing row and every
-- writer that omits them stays an ordinary task. Shape is guarded at the API
-- chokepoint (api/routes/mutations.ts applyInsert/applyPatch), not by a CHECK
-- -- D1 cannot type-check JSON in TEXT, so the single write path is the
-- narrowest place (Level 2, mechanism stated). brain.db mirrors the columns
-- (PB mig 130) and the pb-schema contract carries them.
--
-- idx_tasks_question_meeting_match: one LIVE "which meeting was this?"
-- question per staged transcript. Structural backstop for the consumer's own
-- idempotency fact (the ingest manifest's question_task_id); the (title,
-- project_id) dedup arm in applyInsert already adopts a same-subject re-mint,
-- so this index only fires on a differently-titled duplicate, which is a
-- consumer bug and dead-letters loud. Same shape as
-- idx_tasks_meeting_approval_active (schema-v92).
--
-- R10 lockstep: this DDL lands on test then prod BEFORE the Worker that
-- validates and reads these columns deploys; PB mints a kind='question' row
-- only after that (the v90 approval_status incident class, ordered away).
--
-- ROLLBACK: redeploy the previous Worker first (the columns are inert when
-- unwritten), then, once no row holds kind='question':
--   DROP INDEX IF EXISTS idx_tasks_question_meeting_match;
--   ALTER TABLE tasks DROP COLUMN question_telegram_json;
--   ALTER TABLE tasks DROP COLUMN question_answer_json;
--   ALTER TABLE tasks DROP COLUMN question_spec_json;
--
-- Apply (NOT executed by this commit -- prod D1 DDL needs its own named
-- authorization; granted by Nick's plan approval 2026-09-17):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v111-tasks-question.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v111-tasks-question.sql

ALTER TABLE tasks ADD COLUMN question_spec_json TEXT;
ALTER TABLE tasks ADD COLUMN question_answer_json TEXT;
ALTER TABLE tasks ADD COLUMN question_telegram_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_question_meeting_match
  ON tasks(source, meeting_id)
  WHERE kind = 'question' AND source = 'meeting_match' AND deleted_at IS NULL AND status != 'done';

-- Self-registration: this row is the proof that schema-v111 itself ran to
-- completion (must stay the LAST statement in this file -- v105's ledger
-- epoch, enforced by scripts/check-schema-versions.py assertion 4).
INSERT OR IGNORE INTO schema_migrations (version, filename)
VALUES (111, 'schema-v111-tasks-question.sql');
