-- R9-8 — D1 cleanup for Round 9 Nick-Review Polish
-- Run against: mnccore-lab (PROD), id b8453e9b-7c5f-4029-b07d-dd89c05d00cf
-- How to run: npx wrangler d1 execute mnccore-lab --remote --file=scripts/round9/r9-d1-cleanup.sql
--
-- Rationale in review/round8-d1-data-integrity.md sections DI-3 and DI-8.

-- 1. Delete 2 test_delete_ grants stuck in production (DI-3)
DELETE FROM grants WHERE id = 'test_delete_grant_k23_ihca';
DELETE FROM grants WHERE id = 'test_delete_grant_r01_ml_icu';

-- 2. Repair 20 active tasks with NULL status (DI-8)
-- These came in through the sync-bulk path which bypassed the API NOT NULL guard.
-- Safest default is 'todo' — user can reclassify. The 20 are all rec*/local_* IDs imported from brain.db.
UPDATE tasks
   SET status = 'todo',
       updated_at = datetime('now')
 WHERE deleted_at IS NULL
   AND status IS NULL;

-- 3. Verification queries — these should return 0
-- SELECT COUNT(*) FROM grants WHERE id LIKE 'test_delete_%';
-- SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL AND status IS NULL;
