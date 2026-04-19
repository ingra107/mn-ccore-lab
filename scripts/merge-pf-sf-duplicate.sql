-- 2026-04-19 DI-4 cleanup: merge duplicate "CLIF: PF-v-SF Oxygenation Severity" project.
-- Canonical row: id='pf-v-sf-oxygenation-severity' (readable slug).
-- Duplicate row: id='bc8e7ea601168a403679a13ea5c5db62', slug='clif-pf-sf'.
-- Pre-check (2026-04-19 19:13 UTC): 1 task + 1 comment pointed at the dup.
-- project_updates / milestones / project_publications / others = 0.

UPDATE tasks
SET project_id = 'pf-v-sf-oxygenation-severity', updated_at = datetime('now')
WHERE project_id IN ('clif-pf-sf', 'bc8e7ea601168a403679a13ea5c5db62');

UPDATE comments
SET project_id = 'pf-v-sf-oxygenation-severity'
WHERE project_id IN ('clif-pf-sf', 'bc8e7ea601168a403679a13ea5c5db62');

UPDATE project_documents
SET project_id = 'pf-v-sf-oxygenation-severity'
WHERE project_id IN ('clif-pf-sf', 'bc8e7ea601168a403679a13ea5c5db62');

DELETE FROM projects WHERE id = 'bc8e7ea601168a403679a13ea5c5db62';
