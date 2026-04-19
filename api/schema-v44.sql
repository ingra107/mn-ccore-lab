-- v44: Move PI_EMAILS from hardcoded `Set` into lab_settings for runtime config.
-- Run: POST /api/admin/migrate with {"version": 44}
--
-- Before this migration, PI_EMAILS lived as a `new Set(...)` in api/helpers.ts.
-- Changing it required a code deploy. Moving it into lab_settings lets a PI
-- add/remove their own alias emails without redeploying. The helper
-- `getPiEmails(env)` reads this row, caches ~5 min, and falls back to the
-- hardcoded constant if the row is missing (no lockout risk).

INSERT OR IGNORE INTO lab_settings (key, value, updated_at) VALUES (
  'pi_emails',
  '["ningraha@umn.edu","sandb029@umn.edu","nicholas.ingraham@gmail.com"]',
  datetime('now')
);
