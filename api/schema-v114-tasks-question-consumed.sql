-- schema-v114-tasks-question-consumed.sql (2026-09-24, PB backlog #8842 R4)
--
-- A question is CONSUMED only when its consumer says so, never because its
-- status reads done. PB's question_state used to read an answered question
-- with status done/deleted as "the consumer already acted", on the premise
-- that only the consumer closes a question (PB decision
-- Context/Decisions/2026-09-17-question-task-kind.md). The Hub is a second
-- writer of `status` (Done button, bulk actions), so closing an answered
-- "Build it" approval here made PB's /process skip the build with no trace.
-- An interim refusal of Hub-UI closes went live in e1489090
-- (api/lib/task-question.ts questionConsumerCloseError); this column is the
-- construction that replaces the inference.
--
--   question_consumed_json  NULL = no consumer has acted. Non-null =
--                           {v:1, consumer, at, answer_at, evidence}, written
--                           ONLY by PB's BrainDB.complete_task(...,
--                           question_consumer=...) in the SAME patch as the
--                           close. answer_at = the `at` of the answer acted on.
--
-- Contract (api/lib/task-question.ts questionConsumedError, applyInsert /
-- applyPatch):
--   * a hub_ui: write may not carry the column at all (the Hub UI is never the
--     consumer; it is also absent from TASK_ALLOWED_FIELDS, pb-schema 0.10.0);
--   * a receipt rides only with status='done' on a kind='question' row, parses
--     to an object, and its answer_at equals the effective answer's `at`;
--   * behind hub_validate_question_consumed (seeded OFF below): a question may
--     not ENTER 'done' unless the same write carries a receipt. OFF until both
--     PB machines run the receipt writer; flipping it earlier would refuse
--     every PB question close as permanent_other.
-- Deleting a question stays allowed: retiring is not consuming.
--
-- Nullable, no default, no backfill here: the receipts for the questions PB
-- closed before this column existed are written by PB's
-- scripts/questions/backfill_consumed_receipts.py (a separate, logged step).
--
-- R10 lockstep: this DDL lands on test then prod BEFORE the Worker that
-- validates and reads the column deploys; PB pushes a receipt only after that.

ALTER TABLE tasks ADD COLUMN question_consumed_json TEXT;

INSERT OR IGNORE INTO lab_settings (key, value, updated_at) VALUES (
  'hub_validate_question_consumed',
  '0',
  datetime('now')
);

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (114, 'schema-v114-tasks-question-consumed.sql');
