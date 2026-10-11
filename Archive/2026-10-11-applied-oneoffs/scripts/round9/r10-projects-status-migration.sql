-- R10-4 — Project status taxonomy migration
-- Run: npx wrangler d1 execute mnccore-lab --remote --file=scripts/round9/r10-projects-status-migration.sql
--
-- Lowercases all project.status values to match the task vocabulary
-- (active / waiting_external / blocked / done). The single observed value
-- in prod is 'Active', but the API also references 'In Review' and
-- 'In Preparation' as legacy values — fold those into 'active' too.

UPDATE projects SET status = 'active'           WHERE status IN ('Active', 'In Review', 'In Preparation');
UPDATE projects SET status = 'done'             WHERE status IN ('Completed', 'Complete', 'Done');
UPDATE projects SET status = 'waiting_external' WHERE status = 'Pending';
UPDATE projects SET status = 'active'           WHERE status IS NULL OR status = '';

-- Verification (should return only the 4 canonical values)
-- SELECT DISTINCT status, COUNT(*) FROM projects GROUP BY status;
