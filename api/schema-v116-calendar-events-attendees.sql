-- schema-v116-calendar-events-attendees.sql (2026-10-05)
--
-- Caches calendar attendees so Prep can seed meetings.attendees -- PB backlog
-- #2225 (+ #551, the receiver-side normalization; no DDL for that half).
--
-- WHY: the Prep pill on Today creates a Hub meeting from a calendar row, but
-- the meeting got NULL attendees. The iCal feed does publish them (Nick's
-- feed, 2026-10-05: 121,571 ATTENDEE lines over 7,184 VEVENTs, all mailto:),
-- and api/lib/ics-parser.ts read those lines only for the owner-declined
-- filter, then dropped them. The cache (v52/v61/v85) was scoped to the Today
-- timeline, which never needed attendees; nobody decided to exclude them.
--
--   attendees  JSON string[] of invited emails, lower-cased; DECLINED and
--              ROOM/RESOURCE entries removed. The poll always writes it
--              ('[]' when the event has none), so NULL means only "this row
--              was written before v116". Read server-side only, by
--              POST /api/meetings/prep-from-event; the events list endpoint
--              does not return it.
--
-- Pure DDL on purpose. The forced full re-poll that replaces the pre-v116 NULL
-- rows is a SEPARATE post-deploy step, scripts/repoll-2225-calendar-attendees.sql:
-- if it ran here, an hourly cron from the OLD Worker firing between this file
-- and the Worker deploy would use it up (re-poll with old code, write NULL
-- attendees, store fresh etag/last_modified), and the new Worker would then
-- get 304 and never rewrite those rows.
--
-- ORDER: additive. Apply BEFORE the Worker that writes the column deploys
-- (the old Worker names its INSERT columns explicitly and ignores this one).
--
-- APPLY (test first, then prod; sanctioned wrapper only):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v116-calendar-events-attendees.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v116-calendar-events-attendees.sql
--
-- ROLLBACK: none needed. Old code ignores the column; it is a cache that the
-- next poll rewrites. Drop only if wanted:
--   ALTER TABLE user_calendar_events DROP COLUMN attendees;

ALTER TABLE user_calendar_events ADD COLUMN attendees TEXT;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (116, 'schema-v116-calendar-events-attendees.sql');
