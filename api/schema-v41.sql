-- v41: Name display system — formal/preferred fields for 4-tier display.
-- Run: POST /api/admin/migrate with {"version": 41}
--
-- Adds two columns to team_members so the Hub can derive the 4 display tiers:
--   formal    = full_name + ", " + credentials    -> "Nicholas Ingraham, MD"
--   display   = preferred_name + " " + last_name  -> "Nick Ingraham"
--   short     = preferred_name + " " + initial.   -> "Nick I."
--   initials  = first(preferred) + first(last)    -> "NI"
--
-- Existing `name` column stays — it is the current display-tier label and
-- `getPersonInfo(slug).name` still reads it until the migration to
-- displayName(slug, tier) is complete. `credentials` column is unchanged.

ALTER TABLE team_members ADD COLUMN full_name TEXT;
ALTER TABLE team_members ADD COLUMN preferred_name TEXT;
