-- 2026-04-19 late: clean Phase 36b slug migration leftovers found by audit.
-- 13 rows that the original rename-team-slugs.sql missed because they used
-- variant slugs (mesfin/ningraha/nathan-mesfin) not in the canonical RENAMES
-- map. Plus migrate display-name commitments to slugs.

-- Real Nick rows still on legacy slug
UPDATE tasks    SET assignee = 'nick-ingraham', updated_at = datetime('now') WHERE assignee = 'nick';
UPDATE projects SET pi       = 'nick-ingraham', updated_at = datetime('now') WHERE pi       = 'nick';

-- Nathan variants found by audit
UPDATE ideas    SET submitted_by    = 'nate-mesfin' WHERE submitted_by    = 'nathan-mesfin';
UPDATE tasks    SET assignee        = 'nate-mesfin', updated_at = datetime('now') WHERE assignee = 'mesfin';
UPDATE tasks    SET assignee        = 'nick-ingraham', updated_at = datetime('now') WHERE assignee = 'ningraha';
UPDATE activity_log SET actor       = 'nate-mesfin' WHERE actor = 'mesfin';
UPDATE notifications SET recipient_slug = 'nate-mesfin' WHERE recipient_slug = 'mesfin';

-- Commitments storing display names instead of slugs
UPDATE commitments SET to_whom = 'dan-shyu'      WHERE to_whom = 'Dan Shyu';
UPDATE commitments SET to_whom = 'emma-bromley'  WHERE to_whom = 'Emma Bromley';
UPDATE commitments SET to_whom = 'adams-dudley'  WHERE to_whom LIKE 'Adams Dudley%';
-- Sarah Kesler: not in team_members. Leave as display name; will surface in audits.
