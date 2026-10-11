-- R10-1, R10-2 — Grant status column + reclassification
-- Run: npx wrangler d1 execute mnccore-lab --remote --file=scripts/round9/r10-grants-status-migration.sql
--
-- Adds the status column missing from grants entirely (DI-1).
-- Default = 'planning'. Then bulk-reclassifies per Nick's truth:
-- only K23 provider practice variation in mechanical ventilation is funded;
-- everything else starts at 'in_preparation' (the conservative default for
-- existing rows that had `proposed = 1`).

ALTER TABLE grants ADD COLUMN status TEXT DEFAULT 'planning';

-- Existing rows that were marked proposed=1 → 'in_preparation'
UPDATE grants SET status = 'in_preparation' WHERE proposed = 1;

-- Existing rows that were proposed=0 (active/awarded in spirit) → 'in_preparation' too,
-- because Nick's truth is only ONE grant is actually funded. Everything else needs
-- per-grant review, but 'in_preparation' is a safer holding bucket than 'planning'
-- since the rows clearly have data attached.
UPDATE grants SET status = 'in_preparation' WHERE status IS NULL OR status = 'planning';

-- The one truly funded grant
UPDATE grants
   SET status = 'funded'
 WHERE id = 'k23-provider-practice-variation-in-mechanical-ventilation';
