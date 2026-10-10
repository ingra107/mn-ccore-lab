-- One-time backfill: set grants.proposed from status so the legacy flag and
-- GET ordering match the status-derived bucket. Rows with no status keep their flag.
UPDATE grants SET proposed = 1 WHERE status IN ('planning','in_preparation','submitted','resubmission');
UPDATE grants SET proposed = 0 WHERE status IN ('funded','declined','closed');
