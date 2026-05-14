-- Purge QA test fixtures from prod D1 (R4-P1-01).
--
-- Motivation: ~174 fixture rows across 6 tables leaked to real UIs
-- (Ask the Lab, Decisions, Ideas, Meeting Prep, Mentee Milestones) on
-- 2026-04-22 — full findings in docs/design-handoff-2026-04-23/.
-- Server-side filter (api/lib/fixtures.ts) prevents NEW leakage; this
-- script does the one-time cleanup of existing rows.
--
-- Run against prod once, in a maintenance window:
--   npx wrangler d1 execute mnccore-lab --remote \
--     --file=scripts/purge-test-fixtures.sql
--
-- D1 runs the whole file as one transaction — failure rolls back
-- cleanly, no partial state. If it succeeds, foreign-key integrity
-- is preserved because we delete children first.

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
