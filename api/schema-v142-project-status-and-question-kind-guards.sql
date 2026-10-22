-- schema-v142-project-status-and-question-kind-guards.sql (2026-10-21)
--
-- Two store-level refusals, each paired with a refusal in words at the one
-- write path (api/routes/mutations.ts), the v130 pairing. Plus the retirement
-- of a lab_settings flag whose rule is now unconditional.
--
-- WHAT CHANGES
--   trg_projects_status_named_ins (#8939): a project insert must name its
--     status. projects.status still DEFAULTs to the legacy 'Active'
--     (bootstrap-schema.sql), and nothing refused an insert that left status
--     out, so such a row would land 'Active', a value outside the canonical
--     set (active | waiting_external | blocked | done). All three live create
--     lanes send a status (api/routes/projects.ts create + upsert, PB
--     create_project), so this has never fired; it closes the path for raw
--     SQL and for any future caller. BEFORE INSERT sees the applied column
--     DEFAULT, so one WHEN refuses both an omitted status and an explicit
--     'Active' (pinned by api/routes/projects.status-default.test.ts).
--     /api/mutations refuses a missing status first, in words
--     (envelope_invalid); an explicit 'Active' through /api/mutations is
--     rewritten to 'active' by the enum gate when hub_validate_enums is ON
--     (the dead-letter-wave guard), so this trigger only sees one when that
--     flag read failed.
--   trg_tasks_question_kind_immutable (#8842): a task row may not move into
--     or out of kind='question' after insert. questionConsumedError judges a
--     close by the row's effective kind, so flipping a question to a task
--     (one write or two) and then closing it would skip the receipt rule.
--     applyPatch refuses the flip in words (question_kind_immutable,
--     api/lib/task-question.ts questionPatchError); this refuses it for every
--     writer that bypasses applyPatch (a raw D1 write, the path the
--     2026-09-24 decision names as unguarded). task <-> milestone stays legal.
--   lab_settings hub_validate_question_consumed: DELETED. It gated the
--     question_unconsumed rule, and getValidationFlags falls back to all-OFF
--     on a read failure, so a config hiccup let a Hub-UI Done close a
--     question with no receipt. The rule is unconditional in the Worker that
--     ships with this file, and nothing reads the row any more.
--
-- Checked before writing: no Hub UI write sends kind on an update (only
-- src/components/GlobalQuickAddModal.tsx, on create); no PB writer sends a
-- kind that changes question-ness on an existing row.
--
-- Level 2 for both. Level 1 for #8939 is the DEFAULT itself reading 'active':
-- SQLite cannot ALTER a column default, so that needs either an in-place
-- sqlite_master edit (PRAGMA writable_schema, which D1 is expected to refuse;
-- unprobed) or a full projects table rebuild (create-copy-drop-rename across
-- 4 triggers, 1 view and 9 child foreign keys), priced as its own Dual-Plan.
--
-- APPLY (test first, then prod; sanctioned wrapper only). On prod, AFTER the
-- Worker without the hub_validate_question_consumed flag is live, and after a
-- read-only check that no prod project row holds status 'Active' or NULL
-- (SELECT COUNT(*) FROM projects WHERE status IS NULL OR status = 'Active'):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v142-project-status-and-question-kind-guards.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v142-project-status-and-question-kind-guards.sql
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_projects_status_named_ins;
--   DROP TRIGGER IF EXISTS trg_tasks_question_kind_immutable;
--   INSERT OR IGNORE INTO lab_settings (key, value, updated_at) VALUES ('hub_validate_question_consumed', '1', datetime('now'));
--   DELETE FROM schema_migrations WHERE version = 142;
--   (the row is inert to a Worker that no longer reads it; re-seed it only
--   when rolling the Worker back too)
--
-- Decision: PB Context/Decisions/2026-09-24-question-consumer-receipt.md.

DROP TRIGGER IF EXISTS trg_projects_status_named_ins;
CREATE TRIGGER trg_projects_status_named_ins BEFORE INSERT ON projects
FOR EACH ROW
WHEN NEW.status IS NULL OR NEW.status = 'Active'
BEGIN
  SELECT RAISE(ABORT, 'project_status_missing: a project insert names its status (active | waiting_external | blocked | done)');
END;

DROP TRIGGER IF EXISTS trg_tasks_question_kind_immutable;
CREATE TRIGGER trg_tasks_question_kind_immutable BEFORE UPDATE OF kind ON tasks
FOR EACH ROW
WHEN (COALESCE(OLD.kind, 'task') = 'question') <> (COALESCE(NEW.kind, 'task') = 'question')
BEGIN
  SELECT RAISE(ABORT, 'question_kind_immutable: a task''s question-ness is fixed when it is created; retire it (op=delete) and mint a new row');
END;

DELETE FROM lab_settings WHERE key = 'hub_validate_question_consumed';

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (142, 'schema-v142-project-status-and-question-kind-guards.sql');
