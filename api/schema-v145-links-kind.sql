-- v145: a semantic kind per link, constrained by a vocabulary TABLE (PB backlog #151).
--
-- Nick's list (2026-10-22 project-docs desk, K1 "Use this list"): Aims, IRB / regulatory,
-- Grant application, Manuscript draft, Analysis code, Slide deck, Data dictionary, Dataset,
-- Protocol, Reviewer response, Meeting notes, Submission, Other, Publication. No Folder, Link
-- or Draft: those are formats (links.type, derived by the normalizer), not kinds. A link with
-- no kind (NULL) shows as "Unfiled". Kind is chosen by a person; type is derived; role is
-- key/archive. Three axes, three columns.
--
-- Why a table and not a CHECK or a generated enum (Dual-Plan, 2 of 3 with codex):
--   * The FK holds on EVERY write path: /api/mutations, applyInsert / applyUpdate called
--     directly (the artifact mirror, the link routes), the slot mirror's raw INSERT, and raw
--     SQL. A generated enum check runs only where someone remembers to call it.
--   * The list grows (Nick added Publication on the desk). A new kind is one INSERT into
--     link_kinds: no codegen, no deploy, no table rebuild. Precedent: product_kinds (v124).
--   * The PB cache (brain.db mig 153) carries links.kind with no FK: it holds what the Hub took.
--
-- Decision: PB Context/Decisions/2026-10-22-project-documents-on-links.md.
--
-- APPLY ORDER (prod is orchestrator-only):
--   1. PB mig 153 on BOTH machines first (the links pull names `kind` once this Worker ships).
--   2. Back up + Time Travel bookmark: npx wrangler d1 time-travel info mnccore-lab
--   3. scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v145-links-kind.sql
--      probe: PRAGMA foreign_key_list(links)  -> one row, table link_kinds, from kind, to key
--             UPDATE links SET kind = 'nope' WHERE id = (SELECT id FROM links LIMIT 1) -> FOREIGN KEY constraint failed
--   4. scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v145-links-kind.sql
--   5. THEN deploy the Worker that selects links.kind.
-- ROLLBACK (Worker rolled back first; every kind is lost, so export
--   SELECT id, kind FROM links WHERE kind IS NOT NULL first):
--   ALTER TABLE links DROP COLUMN kind;
--   DROP TABLE IF EXISTS link_kinds;
--   DELETE FROM schema_migrations WHERE version = 145;

CREATE TABLE IF NOT EXISTS link_kinds (
  key        TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Nick's order, Publication after Submission, Other last (build ruling).
INSERT OR IGNORE INTO link_kinds (key, label, sort_order) VALUES
  ('aims',              'Aims',              10),
  ('irb_regulatory',    'IRB / regulatory',  20),
  ('grant_application', 'Grant application', 30),
  ('manuscript_draft',  'Manuscript draft',  40),
  ('analysis_code',     'Analysis code',     50),
  ('slide_deck',        'Slide deck',        60),
  ('data_dictionary',   'Data dictionary',   70),
  ('dataset',           'Dataset',           80),
  ('protocol',          'Protocol',          90),
  ('reviewer_response', 'Reviewer response', 100),
  ('meeting_notes',     'Meeting notes',     110),
  ('submission',        'Submission',        120),
  ('publication',       'Publication',       130),
  ('other',             'Other',             1000);

-- NULL default: SQLite admits an ADD COLUMN with REFERENCES only when the default is NULL.
ALTER TABLE links ADD COLUMN kind TEXT REFERENCES link_kinds(key);

CREATE INDEX IF NOT EXISTS idx_links_kind ON links(kind) WHERE kind IS NOT NULL;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (145, 'schema-v145-links-kind.sql');
