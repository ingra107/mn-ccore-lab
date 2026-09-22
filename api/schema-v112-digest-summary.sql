-- schema-v112-digest-summary.sql (2026-09-22)
--
-- #136. Nick: "i thought we were supposed to have quick summaries of the
-- articles like a background, question, conclusion, or something summary from
-- an LLM that i can see and then abstract is progressive disclosure if i want
-- to read more."
--
-- He was right, and the summaries have existed all along. PB's
-- Research/Digest.md writes three LLM fields per paper -- **TLDR:**, **Why
-- This Matters:** and **Relevance to My Research:** -- plus the real PubMed
-- abstract under **Abstract:**. The Hub sync (PB scripts/db/sync_d1_digest.py)
-- parsed two of the five: it dropped "Why This Matters" and the abstract on
-- the floor, and stored the TLDR in the `abstract` column. So the Hub's "Show
-- abstract" disclosure has been hiding the one-line summary behind a label
-- promising the abstract, and the summary Nick expected to SEE was the thing
-- he had to click for. A dead read, not a missing feature.
--
-- Two columns give each field its own name:
--
--   summary       the LLM TLDR -- one or two sentences, what the paper did and
--                 found. Rendered ALWAYS, above the fold.
--   significance  "Why This Matters" -- why this paper is worth Nick's
--                 attention. Rendered always, under the summary.
--
-- `abstract` goes back to meaning the abstract, and becomes the progressive
-- disclosure Nick asked for.
--
-- BACKFILL: every row in this table was written by that one sync path, so
-- every non-null `abstract` in prod today IS a TLDR. Moving it into `summary`
-- and clearing `abstract` is a rename of existing data, not a guess -- and it
-- is what makes the ~1000 papers already here show a summary without waiting
-- for a re-push. The re-push that follows (PB sync_d1_digest.py --all) fills
-- `significance` and the real abstract; it is safe only because the Worker
-- that ships with this migration stopped clobbering `status`/`saved_by` on
-- upsert (INSERT OR REPLACE -> ON CONFLICT DO UPDATE), so Nick's saved and
-- dismissed marks survive it.
--
-- R10 lockstep: this DDL lands on test then prod BEFORE the Worker that reads
-- the columns deploys, and before PB pushes a paper carrying them. The
-- columns are inert to the old Worker (SELECT * carries them; the old UI
-- ignores the keys).
--
-- ROLLBACK: redeploy the previous Worker, then
--   UPDATE research_digest SET abstract = summary WHERE abstract IS NULL AND summary IS NOT NULL;
--   ALTER TABLE research_digest DROP COLUMN significance;
--   ALTER TABLE research_digest DROP COLUMN summary;
--
-- Apply (NOT executed by this commit -- prod D1 DDL needs its own named
-- authorization):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v112-digest-summary.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v112-digest-summary.sql

ALTER TABLE research_digest ADD COLUMN summary TEXT;
ALTER TABLE research_digest ADD COLUMN significance TEXT;

-- Rename the mislabelled data in place. Idempotent: re-running matches
-- nothing, because the first run left `abstract` NULL on every row it moved.
UPDATE research_digest
   SET summary = abstract,
       abstract = NULL
 WHERE summary IS NULL
   AND abstract IS NOT NULL;

-- Self-registration: this row is the proof that schema-v112 itself ran to
-- completion (must stay the LAST statement in this file -- v105's ledger
-- epoch, enforced by scripts/check-schema-versions.py assertion 4).
INSERT OR IGNORE INTO schema_migrations (version, filename)
VALUES (112, 'schema-v112-digest-summary.sql');
