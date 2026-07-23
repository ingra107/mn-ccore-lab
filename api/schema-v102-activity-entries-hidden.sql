-- schema-v102-activity-entries-hidden.sql (2026-07-22)
--
-- Hermes lane unification: a per-thread "dismiss" = hide-from-frontend-but-
-- RETAIN. The Today day-page shows each Hermes ask as its own thread; dismissing
-- one removes it from the UI while the rows persist, so "remember what we talked
-- about this morning" still works (owner requirement 9.1.5 — dismiss is a
-- frontend verb, never "forget").
--
-- TWO nullable columns, NOT a metadata_json key:
--   hidden_at TEXT  -- NULL = visible; a timestamp = dismissed ("hidden 3d ago")
--   hidden_by TEXT  -- who dismissed it
-- Why a real column, not JSON: the hide predicate appears in ~33 reads, many of
-- them aggregates (GROUP BY / NOT EXISTS / COUNT(*) / correlated subqueries).
-- `json_extract(metadata_json,'$.hidden') IS NULL` is unindexable in exactly the
-- shapes that matter, and the project-health rollup (api/routes/projects.ts:440,
-- 444) is a whole-table GROUP BY that was already engineered down from 8.8s p95 —
-- a function call in its WHERE is a regression. A nullable column also supports
-- the partial indexes below (the same pattern v100's root indexes rely on), and
-- gives hidden_at/hidden_by for free. metadata_json is a display bag whose only
-- key is `edited`, and handleEditActivityEntry REWRITES the whole blob — a JSON
-- hidden flag would be one careless writer away from silently unhiding a thread.
--
-- Hidden is a property of the THREAD: the root and every child carry the same
-- hidden_at. postActivityEntry inherits it from the parent on write, and
-- hide/unhide updates root + children in one statement, so every read is a FLAT
-- predicate (`hidden_at IS NULL`) — never a join. The shared primitive is
-- api/lib/activity-entry.ts:activityHiddenClause(); the executable check that no
-- read escapes it or an `activity-hidden-exempt:` marker is
-- scripts/check-activity-reads.mjs.
--
-- The INSERT bind order is NOT touched. Both new columns default NULL, and the
-- reply-inheritance path binds hidden_at as the LAST value (after parent_id), so
-- phase4-correctness.test.ts's positional INSERT assertions stay green.
--
-- Rollback: DROP the two indexes. The columns are additive + nullable, so
-- pre-v102 code ignores them and every existing row is already visible
-- (hidden_at NULL) — the same reversibility v100 relied on.
--
-- Apply:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v102-activity-entries-hidden.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v102-activity-entries-hidden.sql

ALTER TABLE activity_entries ADD COLUMN hidden_at TEXT;
ALTER TABLE activity_entries ADD COLUMN hidden_by TEXT;

-- Mirrors of the v100 root indexes, further narrowed to visible rows: every feed
-- read is (entity | project) x roots x visible, so the partial index covers the
-- exact predicate the retrofit adds.
CREATE INDEX IF NOT EXISTS idx_ae_entity_roots_visible
  ON activity_entries (entity_type, entity_id, created_at DESC, id DESC)
  WHERE parent_id IS NULL AND hidden_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ae_project_roots_visible
  ON activity_entries (project_id, created_at DESC, id DESC)
  WHERE parent_id IS NULL AND hidden_at IS NULL;
