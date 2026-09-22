-- #136 repair: restore research_digest.digest_date from created_at.
--
-- The 2026-09-22 corrective re-push wrote `digest_date = excluded.digest_date`
-- on conflict. PB's Digest.md is a ROLLING document whose frontmatter carries
-- only the date it was last generated (it regenerated that morning at 09:28),
-- so every re-pushed paper took 2026-09-22 and the date selector's history
-- collapsed onto one day: 1065 rows on a single date.
--
-- `created_at` was never in the DO UPDATE clause, so every row still carries
-- the timestamp of the push that first inserted it -- and a paper is pushed on
-- the day it appears in the digest. That makes created_at the best surviving
-- evidence of the original digest_date. It is evidence, not the original
-- value: a paper pushed the day after its digest, or across a UTC midnight,
-- lands one day off.
--
-- Rows whose created_at IS 2026-09-22 are genuinely today's and are left alone.
--
-- The Worker shipped alongside this stopped writing digest_date on conflict
-- (COALESCE(research_digest.digest_date, excluded.digest_date)), so this
-- cannot recur.
UPDATE research_digest
   SET digest_date = date(created_at)
 WHERE digest_date = '2026-09-22'
   AND created_at IS NOT NULL
   AND date(created_at) <> '2026-09-22';
