-- Purge QA test fixtures from prod D1.
--
-- R4-P1-01 (2026-04-22): ~174 fixture rows leaked to Ask the Lab,
-- Decisions, Ideas, Meeting Prep, Mentee Milestones.
-- Extended 2026-05-30: ~52 projects + ~56 tasks from the PB test-write
-- leak (ebf0c992) and Hub test-write leak (46f3ce0a) — both leaks are
-- now patched; this script does the one-time purge of existing residue.
-- Server-side filter (api/lib/fixtures.ts) prevents NEW leakage.
--
-- Run against prod once, in a maintenance window:
--   npx wrangler d1 execute mnccore-lab --remote \
--     --file=scripts/purge-test-fixtures.sql
--
-- D1 runs the whole file as one transaction — failure rolls back
-- cleanly, no partial state. If it succeeds, foreign-key integrity
-- is preserved because we delete children first.
--
-- SAFETY GUARD: every pattern below was verified against live D1
-- before execution. Rows with `deleted_at IS NULL` (live rows) are
-- only targeted when confirmed to be test fixtures by title prefix.
-- Ambiguous smoke-test rows that have no deleted_at are intentionally
-- NOT included (e.g. "A3 work-rigorous-smoke 2026-04-30 12:03:21",
-- "M5 peer-adopt smoke 2026-04-28T19:30", "[SMOKE 3.1b] post-deploy verify").

-- ── Delete child rows whose parent is a fixture ──────────────────────
-- task_comments / task_files / task_handoffs / task_subtasks /
-- task_updates all reference tasks(id). `lab_answers` cascades from
-- lab_questions so handled automatically. action_items + agenda_items
-- reference meetings. milestones + project_documents + comments
-- reference projects.

DELETE FROM task_comments WHERE task_id IN (
  SELECT id FROM tasks WHERE
    LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'deep-audit-%' OR
    LOWER(title) LIKE '%\_\_\_cli\_edit' ESCAPE '\' OR
    LOWER(title) LIKE 'test task%' OR
    LOWER(title) LIKE '%test_delete_%' OR
    LOWER(title) LIKE '%<script%' OR
    LOWER(title) LIKE '%inspection test%'
);
DELETE FROM task_files WHERE task_id IN (
  SELECT id FROM tasks WHERE
    LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'deep-audit-%' OR
    LOWER(title) LIKE '%\_\_\_cli\_edit' ESCAPE '\' OR
    LOWER(title) LIKE 'test task%' OR
    LOWER(title) LIKE '%test_delete_%' OR
    LOWER(title) LIKE '%<script%' OR
    LOWER(title) LIKE '%inspection test%'
);
DELETE FROM task_handoffs WHERE task_id IN (
  SELECT id FROM tasks WHERE
    LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'deep-audit-%' OR
    LOWER(title) LIKE '%\_\_\_cli\_edit' ESCAPE '\' OR
    LOWER(title) LIKE 'test task%' OR
    LOWER(title) LIKE '%test_delete_%' OR
    LOWER(title) LIKE '%<script%' OR
    LOWER(title) LIKE '%inspection test%'
);
DELETE FROM task_subtasks WHERE task_id IN (
  SELECT id FROM tasks WHERE
    LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'deep-audit-%' OR
    LOWER(title) LIKE '%\_\_\_cli\_edit' ESCAPE '\' OR
    LOWER(title) LIKE 'test task%' OR
    LOWER(title) LIKE '%test_delete_%' OR
    LOWER(title) LIKE '%<script%' OR
    LOWER(title) LIKE '%inspection test%'
);
DELETE FROM task_updates WHERE task_id IN (
  SELECT id FROM tasks WHERE
    LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'deep-audit-%' OR
    LOWER(title) LIKE '%\_\_\_cli\_edit' ESCAPE '\' OR
    LOWER(title) LIKE 'test task%' OR
    LOWER(title) LIKE '%test_delete_%' OR
    LOWER(title) LIKE '%<script%' OR
    LOWER(title) LIKE '%inspection test%'
);

-- Meeting-related children
DELETE FROM action_items WHERE meeting_id IN (
  SELECT id FROM meetings WHERE
    LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'deep-audit-%'
);
DELETE FROM agenda_items WHERE meeting_id IN (
  SELECT id FROM meetings WHERE
    LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'deep-audit-%'
);

-- Project-related children. `comments` and `milestones` reference
-- projects; project_documents references projects too.
DELETE FROM comments WHERE project_id IN (
  SELECT id FROM projects WHERE
    LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'deep-audit-%'
);
DELETE FROM milestones WHERE project_id IN (
  SELECT id FROM projects WHERE
    LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'deep-audit-%'
);
DELETE FROM project_documents WHERE project_id IN (
  SELECT id FROM projects WHERE
    LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'deep-audit-%'
);

-- ── Parent deletes ───────────────────────────────────────────────────
-- lab_questions (lab_answers cascades automatically)
DELETE FROM lab_questions WHERE
  LOWER(question) LIKE '\_test\_delete\_%' ESCAPE '\' OR
  LOWER(question) LIKE 'test\_delete\_%' ESCAPE '\' OR
  LOWER(question) LIKE 'deep-audit-%' OR
  LOWER(question) GLOB 'test q*' OR LOWER(question) = 'test' OR
  LOWER(question) LIKE 'test question%' OR
  LOWER(question) = '@claude hi';

DELETE FROM hub_decisions WHERE
  LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'deep-audit-%' OR
  LOWER(title) LIKE 'test decision%';

DELETE FROM ideas WHERE
  LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'deep-audit-%' OR
  LOWER(title) LIKE 'test idea%';

DELETE FROM mentee_milestones WHERE
  LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'deep-audit-%';

DELETE FROM tasks WHERE
  LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'deep-audit-%' OR
  LOWER(title) LIKE '%\_\_\_cli\_edit' ESCAPE '\' OR
  LOWER(title) LIKE 'test task%';

DELETE FROM projects WHERE
  LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'deep-audit-%';

DELETE FROM meetings WHERE
  LOWER(title) LIKE '\_test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'test\_delete\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'deep-audit-%';

DELETE FROM activity_log WHERE
  LOWER(description) LIKE '%\_test\_delete\_%' ESCAPE '\' OR
  LOWER(description) LIKE '%test\_delete\_%' ESCAPE '\' OR
  LOWER(description) LIKE '%deep-audit-%' OR
  LOWER(description) LIKE '%\_\_\_cli\_edit%' ESCAPE '\';

-- ── 2026-05-30 extension: PB/Hub test-write leak residue ─────────────
-- Source: ~52 project rows + ~56 task rows that leaked via the PB
-- outbox during pytest runs (now gated by ebf0c992 + 46f3ce0a).
-- All project rows confirmed soft-deleted (deleted_at IS NOT NULL).
-- All task rows confirmed soft-deleted except explicit `AND deleted_at
-- IS NOT NULL` guards below. No FK children exist for any of these
-- rows (task_comments/files/handoffs/subtasks/updates and
-- project_updates/milestones/comments/project_documents all return 0).
-- processed_mutations rows for these records (~83 task + ~97 project)
-- are purged here too to avoid idempotency-table bloat.

-- Helper CTE-equivalent: the project ID set used in multiple places.
-- D1 doesn't support CTEs in DDL context across statements, so the
-- subquery is repeated in each DELETE below.

-- processed_mutations for test-fixture tasks (purge before task rows)
DELETE FROM processed_mutations WHERE record_id IN (
  SELECT id FROM tasks WHERE
    LOWER(title) LIKE 'zz-%' OR
    LOWER(title) LIKE '\_test\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'f20verify%' OR
    LOWER(title) LIKE 'enum-gate-test%' OR
    LOWER(title) LIKE 'leak test%' OR
    LOWER(title) LIKE '% (delete me)%' OR
    LOWER(title) LIKE '[smoke test %' OR
    LOWER(title) LIKE 'a3 work-side smoke%' OR
    LOWER(title) = 'a1.2 smoke' OR
    LOWER(title) LIKE 'cleanup b%post%smoke%' OR
    (LOWER(title) LIKE 'm5 peer-adopt smoke%' AND deleted_at IS NOT NULL) OR
    (LOWER(title) LIKE 'a3 work-rigorous-smoke%' AND deleted_at IS NOT NULL)
);

-- processed_mutations for test-fixture projects (purge before project rows)
DELETE FROM processed_mutations WHERE record_id IN (
  SELECT id FROM projects WHERE
    slug LIKE 'zz-test-proj-class1-charact%' OR
    slug LIKE 'zz-winner-class4-charact%' OR
    slug LIKE 'enum-gate-test-%' OR
    slug LIKE 'f20verify-%' OR
    slug LIKE 'pb-full-verify-%' OR
    slug LIKE 'test-delete-e2e-proj-%' OR
    slug = 'test-delete-workflow-proj-work' OR
    slug LIKE 'test-v2-%' OR
    slug LIKE 'test-v3-%' OR
    slug LIKE 'a1-2-%-smoke' OR
    slug LIKE '_TEST\_DELETE\_proj\_%' ESCAPE '\'
);

-- project_updates (child of projects — present in schema, not in
-- original R4 script; confirmed 0 rows but included for FK correctness)
DELETE FROM project_updates WHERE project_id IN (
  SELECT id FROM projects WHERE
    slug LIKE 'zz-test-proj-class1-charact%' OR
    slug LIKE 'zz-winner-class4-charact%' OR
    slug LIKE 'enum-gate-test-%' OR
    slug LIKE 'f20verify-%' OR
    slug LIKE 'pb-full-verify-%' OR
    slug LIKE 'test-delete-e2e-proj-%' OR
    slug = 'test-delete-workflow-proj-work' OR
    slug LIKE 'test-v2-%' OR
    slug LIKE 'test-v3-%' OR
    slug LIKE 'a1-2-%-smoke' OR
    slug LIKE '_TEST\_DELETE\_proj\_%' ESCAPE '\'
);

-- task child rows for the new task patterns (confirmed 0 rows;
-- included for FK correctness in case any were added after the audit)
DELETE FROM task_comments WHERE task_id IN (
  SELECT id FROM tasks WHERE
    LOWER(title) LIKE 'zz-%' OR
    LOWER(title) LIKE '\_test\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'f20verify%' OR
    LOWER(title) LIKE 'enum-gate-test%' OR
    LOWER(title) LIKE 'leak test%' OR
    LOWER(title) LIKE '% (delete me)%' OR
    LOWER(title) LIKE '[smoke test %' OR
    LOWER(title) LIKE 'a3 work-side smoke%' OR
    LOWER(title) = 'a1.2 smoke' OR
    LOWER(title) LIKE 'cleanup b%post%smoke%' OR
    (LOWER(title) LIKE 'm5 peer-adopt smoke%' AND deleted_at IS NOT NULL) OR
    (LOWER(title) LIKE 'a3 work-rigorous-smoke%' AND deleted_at IS NOT NULL)
);
DELETE FROM task_files WHERE task_id IN (
  SELECT id FROM tasks WHERE
    LOWER(title) LIKE 'zz-%' OR
    LOWER(title) LIKE '\_test\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'f20verify%' OR
    LOWER(title) LIKE 'enum-gate-test%' OR
    LOWER(title) LIKE 'leak test%' OR
    LOWER(title) LIKE '% (delete me)%' OR
    LOWER(title) LIKE '[smoke test %' OR
    LOWER(title) LIKE 'a3 work-side smoke%' OR
    LOWER(title) = 'a1.2 smoke' OR
    LOWER(title) LIKE 'cleanup b%post%smoke%' OR
    (LOWER(title) LIKE 'm5 peer-adopt smoke%' AND deleted_at IS NOT NULL) OR
    (LOWER(title) LIKE 'a3 work-rigorous-smoke%' AND deleted_at IS NOT NULL)
);
DELETE FROM task_handoffs WHERE task_id IN (
  SELECT id FROM tasks WHERE
    LOWER(title) LIKE 'zz-%' OR
    LOWER(title) LIKE '\_test\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'f20verify%' OR
    LOWER(title) LIKE 'enum-gate-test%' OR
    LOWER(title) LIKE 'leak test%' OR
    LOWER(title) LIKE '% (delete me)%' OR
    LOWER(title) LIKE '[smoke test %' OR
    LOWER(title) LIKE 'a3 work-side smoke%' OR
    LOWER(title) = 'a1.2 smoke' OR
    LOWER(title) LIKE 'cleanup b%post%smoke%' OR
    (LOWER(title) LIKE 'm5 peer-adopt smoke%' AND deleted_at IS NOT NULL) OR
    (LOWER(title) LIKE 'a3 work-rigorous-smoke%' AND deleted_at IS NOT NULL)
);
DELETE FROM task_subtasks WHERE task_id IN (
  SELECT id FROM tasks WHERE
    LOWER(title) LIKE 'zz-%' OR
    LOWER(title) LIKE '\_test\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'f20verify%' OR
    LOWER(title) LIKE 'enum-gate-test%' OR
    LOWER(title) LIKE 'leak test%' OR
    LOWER(title) LIKE '% (delete me)%' OR
    LOWER(title) LIKE '[smoke test %' OR
    LOWER(title) LIKE 'a3 work-side smoke%' OR
    LOWER(title) = 'a1.2 smoke' OR
    LOWER(title) LIKE 'cleanup b%post%smoke%' OR
    (LOWER(title) LIKE 'm5 peer-adopt smoke%' AND deleted_at IS NOT NULL) OR
    (LOWER(title) LIKE 'a3 work-rigorous-smoke%' AND deleted_at IS NOT NULL)
);
DELETE FROM task_updates WHERE task_id IN (
  SELECT id FROM tasks WHERE
    LOWER(title) LIKE 'zz-%' OR
    LOWER(title) LIKE '\_test\_%' ESCAPE '\' OR
    LOWER(title) LIKE 'f20verify%' OR
    LOWER(title) LIKE 'enum-gate-test%' OR
    LOWER(title) LIKE 'leak test%' OR
    LOWER(title) LIKE '% (delete me)%' OR
    LOWER(title) LIKE '[smoke test %' OR
    LOWER(title) LIKE 'a3 work-side smoke%' OR
    LOWER(title) = 'a1.2 smoke' OR
    LOWER(title) LIKE 'cleanup b%post%smoke%' OR
    (LOWER(title) LIKE 'm5 peer-adopt smoke%' AND deleted_at IS NOT NULL) OR
    (LOWER(title) LIKE 'a3 work-rigorous-smoke%' AND deleted_at IS NOT NULL)
);

-- Parent task deletes (2026-05-30 residue set)
DELETE FROM tasks WHERE
  LOWER(title) LIKE 'zz-%' OR
  LOWER(title) LIKE '\_test\_%' ESCAPE '\' OR
  LOWER(title) LIKE 'f20verify%' OR
  LOWER(title) LIKE 'enum-gate-test%' OR
  LOWER(title) LIKE 'leak test%' OR
  LOWER(title) LIKE '% (delete me)%' OR
  LOWER(title) LIKE '[smoke test %' OR
  LOWER(title) LIKE 'a3 work-side smoke%' OR
  LOWER(title) = 'a1.2 smoke' OR
  LOWER(title) LIKE 'cleanup b%post%smoke%' OR
  (LOWER(title) LIKE 'm5 peer-adopt smoke%' AND deleted_at IS NOT NULL) OR
  (LOWER(title) LIKE 'a3 work-rigorous-smoke%' AND deleted_at IS NOT NULL);

-- Parent project deletes (2026-05-30 residue set, all confirmed soft-deleted)
DELETE FROM projects WHERE
  slug LIKE 'zz-test-proj-class1-charact%' OR
  slug LIKE 'zz-winner-class4-charact%' OR
  slug LIKE 'enum-gate-test-%' OR
  slug LIKE 'f20verify-%' OR
  slug LIKE 'pb-full-verify-%' OR
  slug LIKE 'test-delete-e2e-proj-%' OR
  slug = 'test-delete-workflow-proj-work' OR
  slug LIKE 'test-v2-%' OR
  slug LIKE 'test-v3-%' OR
  slug LIKE 'a1-2-%-smoke' OR
  slug LIKE '_TEST\_DELETE\_proj\_%' ESCAPE '\';
