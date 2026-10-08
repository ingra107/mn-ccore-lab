-- schema-v117-launch-log-page-route.sql (2026-10-08)
--
-- Records WHICH Hub page an @quickchat/@workon launch was fired from -- PB
-- backlog #8935.
--
-- WHY: on 2026-10-08 Nick fired "@quickchat can you draft the email to tom that
-- this task needs" from the meeting page of "LHS Ambulatory Discovery - SME
-- Discussion". The launch_log row (lnch_cfec478f...) stored task_id NULL and
-- project_slug NULL, so the claim handed the session the bare seed and it
-- guessed the wrong task. v93 (#485) carried context only for launches fired
-- from a TASK compose surface; every other surface (meeting page, project
-- page, Today bar) launched blind.
--
--   page_route  The browser path (+ query) the launch was fired from, e.g.
--               /portal/meetings/mtg_20261008T150203-teams. The frontend sends
--               it from the one launch executor, so no surface can omit it.
--               The worker parses it at CLAIM time into a typed page (meeting /
--               project / named page) and joins the on-screen entity fresh from
--               D1, the same claim-time composition v93 uses for task_id.
--               NULL = a launch from a frontend older than this change; the
--               claim then composes exactly what it did before.
--
-- ORDER: additive. Apply BEFORE the Worker that inserts the column deploys --
-- the new Worker names page_route in its INSERT, so a new Worker on an old
-- schema fails every launch. The old Worker names its INSERT columns explicitly
-- and ignores this one.
--
-- APPLY (test first, then prod; sanctioned wrapper only):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v117-launch-log-page-route.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v117-launch-log-page-route.sql
--
-- ROLLBACK: redeploy the previous Worker first, then (only if wanted)
--   ALTER TABLE launch_log DROP COLUMN page_route;
-- Hub-D1-ONLY: launch_log has no brain.db mirror and is not in PB's synced
-- table registry.

ALTER TABLE launch_log ADD COLUMN page_route TEXT;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (117, 'schema-v117-launch-log-page-route.sql');
