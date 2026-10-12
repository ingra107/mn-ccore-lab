-- seed-grant-milestones.sql — DH-1 / B10 (Hub pre-adoption batch, 2026-05-22)
--
-- TEMPLATE ONLY. Do NOT run as-is. The values below are placeholders.
-- Nick supplies the real grant IDs + dates; the orchestrator (or Nick) applies
-- this against prod D1 after substituting real values.
--
-- Why a template (not invented data): fabricated post-award milestone dates
-- are worse than none — they'd surface fake deadlines on the GrantsPage UI and
-- in digests. Per CODEX AMENDMENT AM-8/B10, do not invent grant data.
--
-- Table: grant_milestones (schema-v29). Columns:
--   id            TEXT PRIMARY KEY              -- unique id (e.g. gm_<grant>_<type>_<n>)
--   grant_id      TEXT NOT NULL                 -- FK → grants.id (Nick supplies real id)
--   milestone_type TEXT NOT NULL                -- progress_report | continuing_review |
--                                               --   nce_deadline | budget_period | other
--   title         TEXT NOT NULL                 -- human label
--   due_date      TEXT                          -- YYYY-MM-DD (CT calendar date)
--   completed_at  TEXT                          -- YYYY-MM-DD when done; NULL if pending
--   status        TEXT DEFAULT 'upcoming'       -- upcoming | in_progress | completed | overdue
--   notes         TEXT
--   created_at    TEXT DEFAULT (datetime('now'))
--
-- To apply (after substituting real values), the orchestrator runs:
--   wrangler d1 execute mn-ccore-lab --remote --file scripts/seed-grant-milestones.sql
-- (Agent does NOT run wrangler.)
--
-- ── Example rows (PLACEHOLDERS — replace grant_id/title/due_date) ────────────
-- INSERT carries explicit columns; status defaults to 'upcoming' if omitted.

-- Annual Research Performance Progress Report (RPPR) for a typical NIH R01.
INSERT OR IGNORE INTO grant_milestones
  (id, grant_id, milestone_type, title, due_date, status, notes)
VALUES
  ('gm_PLACEHOLDER_rppr_y1', 'GRANT_ID_PLACEHOLDER', 'progress_report',
   'RPPR — Year 1 progress report', 'YYYY-MM-DD', 'upcoming',
   'Placeholder — replace grant_id + due_date with real values');

-- Continuing review (IRB) checkpoint.
INSERT OR IGNORE INTO grant_milestones
  (id, grant_id, milestone_type, title, due_date, status, notes)
VALUES
  ('gm_PLACEHOLDER_cr_y1', 'GRANT_ID_PLACEHOLDER', 'continuing_review',
   'IRB continuing review', 'YYYY-MM-DD', 'upcoming',
   'Placeholder — replace grant_id + due_date with real values');

-- No-Cost Extension (NCE) deadline.
INSERT OR IGNORE INTO grant_milestones
  (id, grant_id, milestone_type, title, due_date, status, notes)
VALUES
  ('gm_PLACEHOLDER_nce', 'GRANT_ID_PLACEHOLDER', 'nce_deadline',
   'NCE request deadline', 'YYYY-MM-DD', 'upcoming',
   'Placeholder — replace grant_id + due_date with real values');

-- Budget period end.
INSERT OR IGNORE INTO grant_milestones
  (id, grant_id, milestone_type, title, due_date, status, notes)
VALUES
  ('gm_PLACEHOLDER_budget_y1', 'GRANT_ID_PLACEHOLDER', 'budget_period',
   'Budget period 1 end', 'YYYY-MM-DD', 'upcoming',
   'Placeholder — replace grant_id + due_date with real values');
