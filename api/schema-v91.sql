-- schema-v91.sql: launch_log opaque-token claim gate (Wave 2 @-tag security rework, 2026-06-26)
-- Hub-D1-ONLY; nullable so existing rows stay non-resolvable (consumed_at IS NULL blocks CLAIM,
-- expires_at IS NOT NULL is also required, so legacy rows with NULL expires_at are always rejected).
ALTER TABLE launch_log ADD COLUMN expires_at TEXT;
ALTER TABLE launch_log ADD COLUMN consumed_at TEXT;
