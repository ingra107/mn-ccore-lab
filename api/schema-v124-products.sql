-- schema-v124-products.sql (2026-10-11)
--
-- Projects hold products. A project is the umbrella; inside it are products
-- (manuscript, abstract/presentation, grant application, award, trial ops,
-- infrastructure). Each product has its own kind, a stage from its kind's
-- ladder, an optional "waiting on <who>", dates, tasks and optional own
-- folder/repo. The kind set and every ladder are DATA (rows below), so adding
-- a kind is an INSERT, not a code change.
--
-- Decision: PB Context/Decisions/2026-10-11-projects-hold-products.md (Nick's
-- rulings, verbatim). Plan: PB Scratch/plans/2026-10-11-projects-products-
-- reconciled.md ("Tiebreak and Nick's round-1 rulings" overrides the rest).
-- Shape: codex tiebreak 2026-10-11-codex-projects-products-tiebreak.md
-- (separate products table owned by projects).
--
-- Purely ADDITIVE. Nothing live reads or writes these tables until the
-- mutations.ts / pb-schema / PB migration steps land (plan steps 3 and 5).
-- tasks.product_id is NULL on every existing row and stays inert until then.
--
-- WHAT THE SCHEMA MAKES UNREPRESENTABLE (Level 1 at the arbiter; brain.db
-- does not enforce FKs and stays a cache):
--   - a stage that is not on its kind's ladder: products(kind, stage) is a
--     composite FK to product_stages(kind, stage);
--   - a product of a product: products.project_id is an FK to projects(id),
--     and a product id is never a project id;
--   - a "funded by" edge to a kind that cannot fund: product_funding carries
--     the funder's kind (FK to products(id, kind)) and a constant 1 that must
--     match product_kinds.can_fund (FK to product_kinds(kind, can_fund));
--   - a grew_from cycle, self-link, or a grew_from across umbrellas: every
--     product has a lineage_rank; grew_from is a composite FK to the parent's
--     (project_id, id, lineage_rank) and CHECK lineage_rank > grew_from_rank.
--     Rank strictly increases along every edge, so no path returns to its
--     start. Unlike "grew_from_id < id" this does not depend on ULID mint
--     order, so a backfilled manuscript minted before its abstract can still
--     record it. A parent's rank cannot change while a child points at it
--     (the FK is NO ACTION), which is also what refuses a cycle-closing edit.
--
-- WHAT STAYS LEVEL 2 (one trigger each; why Level 1 is unreachable):
--   - task/product same project (trg_tasks_product_project_*). Level 1 is a
--     composite FK tasks(project_id, product_id) -> products(project_id, id),
--     which SQLite can add only by rebuilding tasks; the rebuild's implicit
--     DELETE fires ON DELETE CASCADE on task_subtasks/task_handoffs/task_files.
--     scripts/probe-v124-products.ts part (b), local D1 2026-10-11: a plain,
--     defer_foreign_keys, foreign_keys=off or legacy_alter_table rebuild
--     each left 0 of 3 seeded children; copying the children aside and
--     restoring them after a defer_foreign_keys rebuild kept 3 of 3 with the
--     composite FK present. So Level 1 is reachable, but as its own step (the
--     busiest table, its triggers and indexes recreated, proven on test D1),
--     not inside this additive migration. UNIQUE (project_id, id) below is
--     the parent key it will need.
--   - products.project_id immutable (trg_products_project_immutable): a move
--     between umbrellas would strand the product's tasks. A project PK re-key
--     (ON UPDATE CASCADE from projects) is let through: the trigger refuses
--     only while the OLD project row still exists.
--   - a live project keeps >= 1 live product on delete
--     (trg_products_keep_one_live_*). The insert half ("a new project comes
--     with a product") is the mutations.ts chokepoint, plan step 5. Level 1
--     would be a deferred circular FK projects.primary_product_id, which needs
--     a projects rebuild (cascades project_members, meeting_project_grants,
--     project_dependencies) and invents a "primary" Nick did not ask for.
--
-- DEPENDENCY FOR PLAN STEP 5 (not this file): the project soft-delete cascade
-- in mutations.ts and projects.ts sets tasks.project_id = NULL. Once a task
-- carries a product_id, that statement must clear product_id in the same SET,
-- or trg_tasks_product_project_upd refuses the whole project delete.
--
-- NOT HERE: the resolver view (the chain defines no view; api/lib/
-- table-scope.test.ts pins that), mutations.ts acceptance (ALLOWED_TABLES,
-- pb-schema TABLE_FIELDS), PB brain.db migration, prd_ minting (PB ids.py).
--
-- APPLY (test first, then prod; sanctioned wrapper only; DDL BEFORE any
-- Worker or PB push names these columns -- R10 lockstep):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v124-products.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v124-products.sql
-- ROLLBACK (additive; safe while no product rows exist):
--   DROP TRIGGER IF EXISTS trg_tasks_product_project_ins;
--   DROP TRIGGER IF EXISTS trg_tasks_product_project_upd;
--   DROP INDEX IF EXISTS idx_tasks_product;
--   ALTER TABLE tasks DROP COLUMN product_id;
--   DROP TABLE IF EXISTS product_funding;
--   DROP TABLE IF EXISTS products;
--   DROP TABLE IF EXISTS product_stages;
--   DROP TABLE IF EXISTS product_kinds;
--   DELETE FROM schema_migrations WHERE version = 124;
--   (DROP TABLE takes its triggers with it.)

-- ── product_kinds: the kind set (data) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_kinds (
  kind         TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  plural_label TEXT NOT NULL,
  has_page     INTEGER NOT NULL DEFAULT 1 CHECK (has_page IN (0, 1)),
  -- 1 = a product of this kind may be the funder in product_funding.
  can_fund     INTEGER NOT NULL DEFAULT 0 CHECK (can_fund IN (0, 1)),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  deleted_at   TEXT,
  seq          INTEGER NOT NULL DEFAULT 0,
  last_mutation_id TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  -- parent key for product_funding's (funder_kind, funder_can_fund) FK
  UNIQUE (kind, can_fund)
);

-- ── product_stages: each kind's ladder (data) ───────────────────────────────
CREATE TABLE IF NOT EXISTS product_stages (
  kind        TEXT NOT NULL REFERENCES product_kinds(kind) ON UPDATE CASCADE,
  stage       TEXT NOT NULL,
  label       TEXT NOT NULL,
  ordinal     INTEGER NOT NULL,
  is_terminal INTEGER NOT NULL DEFAULT 0 CHECK (is_terminal IN (0, 1)),
  deleted_at  TEXT,
  seq         INTEGER NOT NULL DEFAULT 0,
  last_mutation_id TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, stage),
  UNIQUE (kind, ordinal)
);

-- ── products: one deliverable inside a project ──────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id           TEXT PRIMARY KEY CONSTRAINT products_id_prefix CHECK (id LIKE 'prd\_%' ESCAPE '\'),
  project_id   TEXT NOT NULL REFERENCES projects(id) ON UPDATE CASCADE,
  kind         TEXT NOT NULL,
  stage        TEXT NOT NULL,
  title        TEXT,            -- NULL = "the project itself" (single-product default)
  short_name   TEXT,
  waiting_on   TEXT,            -- optional "waiting on <who>" (Nick, round 1)
  venue        TEXT,            -- journal / conference / agency+mechanism
  due_date     TEXT,            -- internal date (two-date rule, as milestones)
  deadline     TEXT,            -- hard date
  folder       TEXT,            -- NULL = inherit from grew_from chain, then project
  repo_url     TEXT,            -- NULL = inherit
  stage_entered_at TEXT,
  stage_notes  TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  -- lineage: grew_from_id is "grew from" (abstract -> manuscript) and
  -- "resubmission of" (A0 -> A1). See the header for why rank, not id order.
  lineage_rank   INTEGER NOT NULL DEFAULT 0,
  grew_from_id   TEXT,
  grew_from_rank INTEGER,
  deleted_at   TEXT,
  seq          INTEGER NOT NULL DEFAULT 0,
  last_mutation_id TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (kind, stage) REFERENCES product_stages(kind, stage) ON UPDATE CASCADE,
  FOREIGN KEY (project_id, grew_from_id, grew_from_rank) REFERENCES products(project_id, id, lineage_rank),
  CONSTRAINT products_lineage CHECK (
    (grew_from_id IS NULL AND grew_from_rank IS NULL)
    OR (grew_from_id IS NOT NULL AND grew_from_rank IS NOT NULL AND lineage_rank > grew_from_rank)
  ),
  UNIQUE (project_id, id, lineage_rank),   -- parent key for the lineage FK
  UNIQUE (project_id, id),                 -- parent key for a future tasks(project_id, product_id) FK
  UNIQUE (id, kind)                        -- parent key for product_funding's funder FK
);

CREATE INDEX IF NOT EXISTS idx_products_project ON products(project_id);
CREATE INDEX IF NOT EXISTS idx_products_kind_stage ON products(kind, stage);
CREATE INDEX IF NOT EXISTS idx_products_grew_from ON products(grew_from_id);
CREATE INDEX IF NOT EXISTS idx_products_seq ON products(seq);

-- ── product_funding: "funded by" ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_funding (
  id              TEXT PRIMARY KEY,
  product_id      TEXT NOT NULL REFERENCES products(id),
  funder_id       TEXT NOT NULL,
  funder_kind     TEXT NOT NULL,
  funder_can_fund INTEGER NOT NULL DEFAULT 1 CONSTRAINT product_funding_can_fund CHECK (funder_can_fund = 1),
  deleted_at      TEXT,
  seq             INTEGER NOT NULL DEFAULT 0,
  last_mutation_id TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (funder_id, funder_kind) REFERENCES products(id, kind) ON UPDATE CASCADE,
  FOREIGN KEY (funder_kind, funder_can_fund) REFERENCES product_kinds(kind, can_fund) ON UPDATE CASCADE,
  CONSTRAINT product_funding_not_self CHECK (product_id <> funder_id)
);

-- A funded-by pair appears once among LIVE rows; a tombstone does not block re-adding.
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_funding_live_pair
  ON product_funding(product_id, funder_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_product_funding_funder ON product_funding(funder_id);
CREATE INDEX IF NOT EXISTS idx_product_funding_seq ON product_funding(seq);

-- ── tasks.product_id ────────────────────────────────────────────────────────
-- NULL = not yet allocated (every existing row). A task with a product must sit
-- in that product's project (trigger below; Level 2, see header).
ALTER TABLE tasks ADD COLUMN product_id TEXT REFERENCES products(id);
CREATE INDEX IF NOT EXISTS idx_tasks_product ON tasks(product_id);

-- ── Level-2 guards ──────────────────────────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS trg_tasks_product_project_ins BEFORE INSERT ON tasks
FOR EACH ROW
WHEN NEW.product_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.project_id = NEW.project_id)
BEGIN
  SELECT RAISE(ABORT, 'task_product_project_mismatch: a task''s product must belong to the task''s project');
END;

CREATE TRIGGER IF NOT EXISTS trg_tasks_product_project_upd BEFORE UPDATE OF product_id, project_id ON tasks
FOR EACH ROW
WHEN NEW.product_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.project_id = NEW.project_id)
BEGIN
  SELECT RAISE(ABORT, 'task_product_project_mismatch: a task''s product must belong to the task''s project');
END;

CREATE TRIGGER IF NOT EXISTS trg_products_project_immutable BEFORE UPDATE OF project_id ON products
FOR EACH ROW
WHEN NEW.project_id IS NOT OLD.project_id
 AND EXISTS (SELECT 1 FROM projects pr WHERE pr.id = OLD.project_id)
BEGIN
  SELECT RAISE(ABORT, 'product_project_immutable: a product cannot move to another project');
END;

CREATE TRIGGER IF NOT EXISTS trg_products_keep_one_live_upd BEFORE UPDATE OF deleted_at ON products
FOR EACH ROW
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
 AND EXISTS (SELECT 1 FROM projects pr WHERE pr.id = OLD.project_id AND pr.deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM products p WHERE p.project_id = OLD.project_id AND p.id <> OLD.id AND p.deleted_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'product_last_live: a live project keeps at least one live product');
END;

CREATE TRIGGER IF NOT EXISTS trg_products_keep_one_live_del BEFORE DELETE ON products
FOR EACH ROW
WHEN OLD.deleted_at IS NULL
 AND EXISTS (SELECT 1 FROM projects pr WHERE pr.id = OLD.project_id AND pr.deleted_at IS NULL)
 AND NOT EXISTS (SELECT 1 FROM products p WHERE p.project_id = OLD.project_id AND p.id <> OLD.id AND p.deleted_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'product_last_live: a live project keeps at least one live product');
END;

-- ── seq triggers (v53 canonical form, as links/v88) ─────────────────────────
DROP TRIGGER IF EXISTS trg_product_kinds_seq_insert;
CREATE TRIGGER trg_product_kinds_seq_insert AFTER INSERT ON product_kinds
FOR EACH ROW WHEN NEW.seq = 0
BEGIN
  UPDATE product_kinds SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM product_kinds WHERE rowid != NEW.rowid)
  WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_product_kinds_seq_update;
CREATE TRIGGER trg_product_kinds_seq_update AFTER UPDATE ON product_kinds
FOR EACH ROW WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE product_kinds SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM product_kinds) WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_product_stages_seq_insert;
CREATE TRIGGER trg_product_stages_seq_insert AFTER INSERT ON product_stages
FOR EACH ROW WHEN NEW.seq = 0
BEGIN
  UPDATE product_stages SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM product_stages WHERE rowid != NEW.rowid)
  WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_product_stages_seq_update;
CREATE TRIGGER trg_product_stages_seq_update AFTER UPDATE ON product_stages
FOR EACH ROW WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE product_stages SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM product_stages) WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_products_seq_insert;
CREATE TRIGGER trg_products_seq_insert AFTER INSERT ON products
FOR EACH ROW WHEN NEW.seq = 0
BEGIN
  UPDATE products SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM products WHERE rowid != NEW.rowid)
  WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_products_seq_update;
CREATE TRIGGER trg_products_seq_update AFTER UPDATE ON products
FOR EACH ROW WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE products SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM products) WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_product_funding_seq_insert;
CREATE TRIGGER trg_product_funding_seq_insert AFTER INSERT ON product_funding
FOR EACH ROW WHEN NEW.seq = 0
BEGIN
  UPDATE product_funding SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM product_funding WHERE rowid != NEW.rowid)
  WHERE rowid = NEW.rowid;
END;
DROP TRIGGER IF EXISTS trg_product_funding_seq_update;
CREATE TRIGGER trg_product_funding_seq_update AFTER UPDATE ON product_funding
FOR EACH ROW WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE product_funding SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM product_funding) WHERE rowid = NEW.rowid;
END;

-- ── seed: kinds and ladders (Nick's rulings 2026-10-11; editable data) ──────
-- manuscript: today's 8 project stages (PB schema_dsl.py PROJECT_STAGE); a
--   journal rejection returns the stage to revisions, same product.
-- abstract: the Hub's existing conference_submissions lifecycle
--   (api/routes/conferences.ts VALID_STATUSES), so the later fold maps 1:1.
-- grant_application: preparing -> submitted -> scored -> funded / not funded
--   (Nick); each submission (A0, A1, new A0) is its own product.
-- award: holds the RPPRs after an award. Ladder words are a placeholder for
--   Nick to confirm (he named the kind, not its stages).
-- trial_ops: start-up -> enrolling -> follow-up -> closeout (Nick).
-- infrastructure: planning -> building -> running -> retired (Nick).
INSERT OR IGNORE INTO product_kinds (kind, label, plural_label, has_page, can_fund, sort_order) VALUES
  ('manuscript',        'Manuscript',              'Manuscripts',        1, 0, 10),
  ('abstract',          'Abstract / presentation', 'Abstracts',          1, 0, 20),
  ('grant_application', 'Grant application',       'Grant applications', 1, 0, 30),
  ('award',             'Award',                   'Awards',             1, 1, 40),
  ('trial_ops',         'Trial ops',               'Trial ops',          0, 0, 50),
  ('infrastructure',    'Infrastructure',          'Infrastructure',     0, 0, 60);

INSERT OR IGNORE INTO product_stages (kind, stage, label, ordinal, is_terminal) VALUES
  ('manuscript', 'idea',            'Idea',            10, 0),
  ('manuscript', 'data_collection', 'Data collection', 20, 0),
  ('manuscript', 'data_analysis',   'Data analysis',   30, 0),
  ('manuscript', 'writing',         'Writing',         40, 0),
  ('manuscript', 'submitted',       'Submitted',       50, 0),
  ('manuscript', 'revisions',       'Revisions',       60, 0),
  ('manuscript', 'accepted',        'Accepted',        70, 0),
  ('manuscript', 'published',       'Published',       80, 1),

  ('abstract', 'planning',  'Planning',  10, 0),
  ('abstract', 'submitted', 'Submitted', 20, 0),
  ('abstract', 'accepted',  'Accepted',  30, 0),
  ('abstract', 'preparing', 'Preparing', 40, 0),
  ('abstract', 'presented', 'Presented', 50, 1),
  ('abstract', 'rejected',  'Rejected',  60, 1),

  ('grant_application', 'preparing',  'Preparing',  10, 0),
  ('grant_application', 'submitted',  'Submitted',  20, 0),
  ('grant_application', 'scored',     'Scored',     30, 0),
  ('grant_application', 'funded',     'Funded',     40, 1),
  ('grant_application', 'not_funded', 'Not funded', 50, 1),

  ('award', 'active',   'Active',   10, 0),
  ('award', 'closeout', 'Closeout', 20, 0),
  ('award', 'closed',   'Closed',   30, 1),

  ('trial_ops', 'start_up',  'Start-up',  10, 0),
  ('trial_ops', 'enrolling', 'Enrolling', 20, 0),
  ('trial_ops', 'follow_up', 'Follow-up', 30, 0),
  ('trial_ops', 'closeout',  'Closeout',  40, 0),

  ('infrastructure', 'planning', 'Planning', 10, 0),
  ('infrastructure', 'building', 'Building', 20, 0),
  ('infrastructure', 'running',  'Running',  30, 0),
  ('infrastructure', 'retired',  'Retired',  40, 1);

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (124, 'schema-v124-products.sql');
