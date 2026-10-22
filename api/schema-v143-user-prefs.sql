-- schema-v143-user-prefs.sql (2026-10-21)
--
-- A person's Hub view preferences, stored on the server so the same view
-- follows them to every device (PB backlog #911). Nick, 2026-07-23: signed in
-- should mean an identical view on both laptops; a project pin set on the work
-- laptop did not show on the home laptop. Pins moved to the server on
-- 2026-10-09 (api/routes/pins.ts); this table carries the rest: Lab
-- preferences (staleness thresholds), saved views, the Today default view and
-- due window, table sort/width/order, and the Lab overview cards, pinned
-- cards, tab and grid layouts.
--
-- One row per (person, key). value_json is the whole value, so a write is the
-- whole value too. Which keys may exist is NOT this table's business: the one
-- list is shared/userPrefKeys.ts, read by the route (an unlisted key answers
-- 400) and by the UI hook (an unlisted key does not compile). Device-local
-- settings (theme, density, sidebar, fold state) are absent from that list on
-- purpose and never reach this table.
--
-- Visible only to its owner: api/lib/table-scope.ts user_prefs, the
-- digest_paper_state rule (v136). No PI arm. Never pulled to brain.db.
--
-- Purely additive: no backfill (each browser seeds its own old localStorage
-- values on first load, src/hooks/useUserPref.ts), old code ignores it.
--
-- APPLY (test first, then prod; sanctioned wrapper only; back up prod first):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v143-user-prefs.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v143-user-prefs.sql
-- ROLLBACK (deploy the previous Worker + Pages first, or the route 500s):
--   DROP TABLE IF EXISTS user_prefs;
--   DELETE FROM schema_migrations WHERE version = 143;

CREATE TABLE IF NOT EXISTS user_prefs (
  member_slug TEXT NOT NULL REFERENCES team_members(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  key         TEXT NOT NULL,
  value_json  TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (member_slug, key)
);

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (143, 'schema-v143-user-prefs.sql');
