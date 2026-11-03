-- schema-v156-checkin-title-from-kind.sql (2026-11-03)
--
-- A check-in's title no longer carries "Check in: ". The row's kind is the one
-- fact, and every surface renders the label from it. Nick, 2026-11-03: "Do you
-- think we need to add check in at the beginning of the title? If we clearly
-- denote it by the display, I'm not sure we actually need to change the or have
-- check in as the title, right? It is a check in entity and we explain that
-- through visual ways." Ruling: "Drop the stored prefix (Recommended)"; text-
-- only surfaces label milestones the same way. Decision: PB
-- Context/Decisions/2026-11-03-today-sections-and-checkin-prefix.md. Plan: PB
-- Scratch/plans/2026-11-03-checkin-prefix-RECONCILED.md (seats A + B).
--
-- WHY v152 STORED IT (schema-v152:47-49): "Telegram cards, the Gmail Apps
-- Script and search render `title` with no kind-aware code." The intent (a
-- check-in reads as one everywhere) stands; the stored copy was a second fact
-- that already drifted. The label now comes from kind: Hub
-- shared/taskKinds.ts withKindLabel, PB short_title.task_label.
--
-- THE PREFIX WAS ALSO A DEDUP NAMESPACE. The I18 name identity
-- (idx_tasks_title_norm_owner_active, v138) is (title, project, owner) with no
-- kind. "Check in: X" could never collide with a task "X"; a bare "X" check-in
-- can. Without a kind in the key, a check-in "X" in a project holding an open
-- task "X" would be ADOPTED by that task: no check-in, no error. So this file
-- widens the key by COALESCE(kind, 'task') (api/lib/task-dedup-sql.ts
-- TASK_KIND_KEY_SQL; the dedup SELECT binds the same value, and
-- api/routes/mutations.dedup-key-contract.test.ts reads this file and checks).
-- kind is NOT NULL DEFAULT 'task' (v109); the COALESCE matches the SELECT's
-- expression and costs nothing.
--
-- WHY A NEW NAME. `CREATE UNIQUE INDEX IF NOT EXISTS` matches on the NAME, so
-- re-declaring idx_tasks_title_norm_owner_active with a new key would be a
-- silent no-op (v107, v113, v138 all record it). Hence `_owner_kind_`.
--
-- ORDER (the v138 reasoning). The new index is LOOSER than the old one: every
-- pair it refuses, the old one refused too. So the CREATE cannot fail on live
-- data, and it is created BEFORE the old one is dropped, so no moment has no
-- index. The OLD Worker against the NEW index is stricter code than the index
-- (its SELECT ignores kind, so it adopts; it cannot manufacture a violator) and
-- still sends prefixed check-in titles, which stay legal with the triggers
-- gone. The NEW Worker against the OLD schema would skip a cross-kind adoption,
-- hit the old UNIQUE refusal, and dead-letter the create; and an unprefixed
-- check-in is refused by the old triggers. So: APPLY THIS FILE, READ IT BACK,
-- THEN DEPLOY THE WORKER. Never the reverse.
--
-- KIND FLIP. Switching a row's kind now changes its identity key; a flip onto
-- a (title, owner, kind) another open row holds hits this index on the UPDATE,
-- exactly as a rename onto a taken title always has.
--
-- PRE-CHECK: none needed (looser than an index that already holds).
--
-- APPLY (NOT executed by this commit; prod D1 DDL needs its own named go, and
-- the test database first):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v156-checkin-title-from-kind.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v156-checkin-title-from-kind.sql
--
-- VERIFY after apply (read-only):
--   1. Exactly the new index; no row for the old name:
--        SELECT name, sql FROM sqlite_master WHERE type='index'
--         AND name IN ('idx_tasks_title_norm_owner_kind_active',
--                      'idx_tasks_title_norm_owner_active');
--   2. Both triggers gone (must return 0 rows):
--        SELECT name FROM sqlite_master WHERE type='trigger'
--         AND name IN ('trg_tasks_checkin_title_ins', 'trg_tasks_checkin_title_upd');
--   3. The ledger row:
--        SELECT version, filename FROM schema_migrations WHERE version = 156;
--
-- ROLLBACK -- loosen the CODE first, then the DDL (never the reverse). Valid
-- as written only BEFORE the check-in title repair: the v152 UPD trigger fires
-- on UPDATE OF kind, title, so an unprefixed check-in would refuse every later
-- title edit.
--   1. Redeploy the previous Worker.
--   2. Check no cross-kind pair was admitted meanwhile (must return 0 rows,
--      else the old index's CREATE fails; resolve each pair by hand first):
--        SELECT lower(trim(title)), COALESCE(project_id, ''),
--               CASE WHEN project_id IS NULL THEN COALESCE(assignee, '') ELSE '' END,
--               COUNT(*) c
--          FROM tasks
--         WHERE deleted_at IS NULL AND status != 'done'
--           AND (source IS NULL OR source != 'meeting_approval')
--           AND instr(lower(title), '(recurring)') = 0
--           AND instr(lower(title), '_recurring') = 0
--           AND instr(lower(title), 'recurring:') = 0
--         GROUP BY 1, 2, 3 HAVING c > 1;
--   3. Recreate the old index, then drop the new one:
--        CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_title_norm_owner_active
--          ON tasks(lower(trim(title)), COALESCE(project_id, ''), CASE WHEN project_id IS NULL THEN COALESCE(assignee, '') ELSE '' END)
--          WHERE deleted_at IS NULL AND status != 'done'
--            AND (source IS NULL OR source != 'meeting_approval')
--            AND instr(lower(title), '(recurring)') = 0
--            AND instr(lower(title), '_recurring') = 0
--            AND instr(lower(title), 'recurring:') = 0;
--        DROP INDEX IF EXISTS idx_tasks_title_norm_owner_kind_active;
--   4. Recreate trg_tasks_checkin_title_ins / _upd from schema-v152:200-215
--      (any check-in whose title lacks the prefix must be restored first, or
--      the UPD trigger refuses its next edit).
--   5. DELETE FROM schema_migrations WHERE version = 156;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_title_norm_owner_kind_active
  ON tasks(lower(trim(title)), COALESCE(project_id, ''), CASE WHEN project_id IS NULL THEN COALESCE(assignee, '') ELSE '' END, COALESCE(kind, 'task'))
  WHERE deleted_at IS NULL
    AND status != 'done'
    AND (source IS NULL OR source != 'meeting_approval')
    AND instr(lower(title), '(recurring)') = 0
    AND instr(lower(title), '_recurring') = 0
    AND instr(lower(title), 'recurring:') = 0;

DROP INDEX IF EXISTS idx_tasks_title_norm_owner_active;

DROP TRIGGER IF EXISTS trg_tasks_checkin_title_ins;
DROP TRIGGER IF EXISTS trg_tasks_checkin_title_upd;

-- Self-registration: this row is the proof that schema-v156 itself ran to
-- completion (must stay the LAST statement in this file -- v105's ledger
-- epoch, enforced by scripts/check-schema-versions.py assertion 4).
INSERT OR IGNORE INTO schema_migrations (version, filename)
VALUES (156, 'schema-v156-checkin-title-from-kind.sql');
