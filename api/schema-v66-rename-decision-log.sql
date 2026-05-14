-- Rename decision_log -> hub_decisions to avoid confusion with the PB-synced
-- 'decisions' table (Lane 3, seq/last_mutation_id). These are distinct tables:
--   hub_decisions  = Hub-native UI-entered decisions (8 rows, id/title/rationale/...)
--   decisions      = PB Lane 3 sync copy (180 rows, context_id/date/content/seq/...)
-- Naming convention refactor Phase 5 Task 5.3 (2026-05-14).
ALTER TABLE decision_log RENAME TO hub_decisions;
