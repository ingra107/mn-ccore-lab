-- schema-v128-product-award-terms.sql (2026-10-12)
--
-- The Grants page reads products (Nick 2026-10-12: "we can keep grants
-- separate so use the current grants page to build out and make sure it reads
-- the right stuff"; on the fields: "Add to products"). A grant application
-- and an award need dates and money that a manuscript never has:
--
--   period_start  ISO date. grant_application: the PROPOSED start; award: the
--                 project start. Nick: "anything that's on an application is
--                 going to have a proposed start date, no end date."
--   period_end    ISO date, award only, after period_start.
--   amount_usd    whole dollars >= 0, award only. Only an award funds
--                 (v124 product_kinds.can_fund, Nick 2026-10-11), so an
--                 application can never be summed as funding.
--
-- Agency and mechanism stay in products.venue ("NHLBI K23"); the PI is
-- projects.pi. Reconciled from two cold plans (L1, MIN), 2026-10-12.
--
-- Level 1 at the arbiter: each CHECK names the kinds it allows, so a date or
-- an amount on the wrong kind cannot be stored, whatever writes it. The PB
-- cache (mig 146) carries the columns with no CHECK: a cache is never
-- stricter than the arbiter.
--
-- SQLite allows a CHECK on ADD COLUMN and tests it against existing rows; all
-- three columns start NULL, which every CHECK accepts.
--
-- APPLY (test first, then prod; before the Worker whose SYNC_COLS and product
-- route name these columns):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v128-product-award-terms.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v128-product-award-terms.sql
-- Not re-runnable (ADD COLUMN); the schema_migrations row says it landed.
-- ROLLBACK: ALTER TABLE products DROP COLUMN amount_usd / period_end /
-- period_start (in that order: period_end's CHECK names period_start).

ALTER TABLE products ADD COLUMN period_start TEXT
  CONSTRAINT products_period_start_kind CHECK (
    period_start IS NULL
    OR (kind IN ('grant_application', 'award') AND date(period_start) IS NOT NULL AND date(period_start) = period_start)
  );

ALTER TABLE products ADD COLUMN period_end TEXT
  CONSTRAINT products_period_end_kind CHECK (
    period_end IS NULL
    OR (kind = 'award' AND date(period_end) IS NOT NULL AND date(period_end) = period_end
        AND period_start IS NOT NULL AND period_end > period_start)
  );

ALTER TABLE products ADD COLUMN amount_usd INTEGER
  CONSTRAINT products_amount_usd_kind CHECK (
    amount_usd IS NULL
    OR (kind = 'award' AND typeof(amount_usd) = 'integer' AND amount_usd >= 0)
  );

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (128, 'schema-v128-product-award-terms.sql');
