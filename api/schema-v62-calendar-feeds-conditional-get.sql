-- v62: Add ETag + Last-Modified columns to user_calendar_feeds for HTTP
-- conditional GET. Most cron polls will hit 304 Not Modified after this lands,
-- which is ~200 bytes vs the full ~500KB iCal export.

ALTER TABLE user_calendar_feeds ADD COLUMN etag TEXT;
ALTER TABLE user_calendar_feeds ADD COLUMN last_modified TEXT;
