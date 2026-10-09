-- schema-v119-meetings-owner.sql (2026-10-09, #145 Lane A)
--
-- A meeting has an owner: the member whose session created it.
--
-- WHY: until 2026-10-05 every meeting row was PB's debrief push (Nick), so
-- "whose meeting" never needed a column. The Prep pill (POST
-- /api/meetings/prep-from-event) made any member a writer, and members now
-- sign in. Without an owner, three things break: upsertMeeting deduped on
-- (date, normalized title) across ALL users, so Casey's 1:1 could merge into
-- (and be answered with) Nick's row, notes included; the debrief bell was
-- hard-coded to nick-ingraham; and the creator of a meeting with no attendee
-- list could not see their own meeting once reads are scoped.
--
-- owner_slug is stamped server-side from the session (user.slug; the PB API
-- key maps to nick-ingraham), never read from a request body, and the dedup
-- path never rewrites it. NULL = no known owner: only a PI sees that row.
-- No DEFAULT: a default owner would grant access no one decided.
--
-- THE UNIQUE INDEX MOVES WITH THE KEY. schema-v49 reconciled a prod index
-- UNIQUE(date, title) (efe01274). With dedup keyed per owner, two members'
-- same-titled meetings on one day are two legitimate rows, and that index
-- turns the second INSERT into a 500 (found by api/routes/viewer-sweep.test.ts).
-- It is replaced by UNIQUE(owner_slug, date, title), which also serves the
-- dedup lookup (owner_slug = ? AND date = ?) as its prefix. NULL owners are
-- distinct under a UNIQUE index; after the backfill no row has one, and the
-- Worker stamps every new row (only a credential-less local-dev caller writes
-- NULL).
--
-- The backfill (all rows predate a second writer) is a separate, reviewed
-- step: scripts/backfill-119-meetings-owner.ts generates the UPDATE and its
-- rollback from a pre-image export. Runbook in that file's header.
--
-- ORDER: this DDL BEFORE the deploy whose upsertMeeting names owner_slug
-- (schema-dependent code deploys column-first). The old Worker ignores the
-- column and still dedups by (date, normalized title) in code, so dropping
-- the old UNIQUE index under it only loosens a backstop it does not need.
--
-- PRE-CHECK (read-only): the new index cannot fail on prod data, since every
-- row has owner_slug NULL at apply time and the old index already made
-- (date, title) unique.
--
-- APPLY (test first, then prod; sanctioned wrapper only):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v119-meetings-owner.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v119-meetings-owner.sql
-- ROLLBACK (only while no two owners share a date + title):
--   DROP INDEX idx_meetings_owner_date_title;
--   CREATE UNIQUE INDEX idx_meetings_date_title ON meetings(date, title);
-- The column stays (nullable; the previous Worker never reads it).

ALTER TABLE meetings ADD COLUMN owner_slug TEXT;

DROP INDEX IF EXISTS idx_meetings_date_title;
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_owner_date_title ON meetings(owner_slug, date, title);

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (119, 'schema-v119-meetings-owner.sql');
