-- schema-v125-product-home-paths.sql (2026-10-11)
--
-- A product exists wherever the design says it does, by construction.
-- schema-v124 added products and made the wrong SHAPES unconstructible (an
-- off-ladder stage, a product of a product, a non-award funder, a lineage
-- cycle, two live homes). It left the CREATE paths to writer code: "a new
-- project comes with a product" and "a task on a project takes its home
-- product" were Worker rules (plan step 5), and only the task MOVE was ever
-- built (mutations.ts homeProductId). The cold refuter on Backfill A
-- (PB Scratch/2026-10-11-backfill-a-refuter.md) measured the consequence: the
-- backfill's property would decay within a day, because no insert path kept it
-- (prod: 3 tasks created in a day, 4 projects in a week).
--
-- This migration moves those rules into the arbiter itself, so every writer --
-- /api/mutations, the Hub routes that call applyMutation, a wrangler --file run,
-- a future route -- gets them without knowing they exist:
--
--   1. trg_projects_home_product_ins: a new live project is born with its
--      home product (is_home = 1) in the same statement. "Every project has 1+
--      products" (Nick, 2026-10-11) is then true at insert, and v124's
--      keep_one_live triggers keep it true on delete. Level 1 at the arbiter:
--      no INSERT INTO projects completes without it.
--   2. trg_tasks_home_product_ins / _upd: a live task on a project that has a
--      home product carries it whenever it is inserted, moved, restored, or
--      has its product cleared -- unless the writer named a product of that
--      project. Replaces mutations.ts homeProductId (a JS copy of this rule
--      that covered the move only).
--   3. trg_products_home_attach_ins / _upd: when a project gains its home (a
--      Backfill A insert, a new home marked, a tombstoned home replaced), its
--      live product-less tasks join it in the same statement. Backfill A is
--      therefore 105 product inserts; the 1,305 task attaches ride along.
--   4. trg_products_tombstone_repoint: a product's live tasks never point at
--      it after it is tombstoned; they move to the project's home (or clear
--      to NULL when the project has no home and 2+ live products).
--   5. Seed: a 7th kind, honor (Nick, 2026-10-11), data like v124's six.
--
-- THE HOME RULE, written identically in every trigger below (the contract
-- test api/routes/mutations.product-home.test.ts asserts every copy is the
-- same text): the project's live is_home = 1 product, else its ONLY live
-- product, else NULL ("not yet allocated", v124). Tasks with no project stay
-- product-less (Nick, 2026-10-11: "Leave them blank").
--
-- THE NEW PROJECT'S HOME PRODUCT
--   id    = 'prd_' + the project's ULID (proj_<ULID> -> prd_<ULID>). One
--           project has at most one auto-made home, so the id is unique, is a
--           valid prd_<26-char ULID> (PB ids.PK_PREFIXES / invariant I1), and
--           is computable by any writer without a round trip: PB or the Hub UI
--           can patch its kind/stage in the same batch as the project insert.
--   kind  = manuscript, stage = the project's stage when it is on the
--           manuscript ladder (projects.stage is that ladder today, PB
--           PROJECT_STAGE), else 'idea'. This is exactly today's behaviour
--           (one manuscript-ladder stage per project). A writer that means
--           another kind patches the product: kind and stage together, the
--           composite FK refuses an off-ladder pair.
--   stage_entered_at = the project's, so the stage clock does not reset.
--   last_mutation_id stays NULL: the product is not the project's mutation,
--           and PB echo suppression must not read it as one.
--   Not made for a project inserted already deleted.
--
-- WHY TRIGGERS AND NOT mutations.ts: every Hub create path does reach
-- applyInsert today (grep of api/ for INSERT INTO tasks|projects outside tests:
-- none), so a Worker rule would be Level 2, one chokepoint. A trigger is the
-- arbiter's own write: it also covers wrangler --file repairs and backfill
-- scripts (scripts/backfill-*.ts write D1 directly), and nothing can skip it
-- short of DROP TRIGGER.
--
-- WHAT IT COSTS: the trigger UPDATEs bump tasks.seq (trg_tasks_seq_update), so
-- PB pulls an attached task once more. They do not stamp last_mutation_id, so
-- the CAS term and the "landed" witness in mutations.ts commitRowWrite are
-- unchanged. trg_tasks_assignee_joins_upd is UPDATE OF assignee, project_id,
-- deleted_at, so a product_id-only UPDATE does not fire it. The completion
-- triad guard (v98) fires on every tasks UPDATE: an attach over a live task
-- whose triad is already inconsistent aborts the product write that caused
-- it, loudly (prod 2026-10-11: 0 such rows on live projects).
--
-- APPLY (test first, then prod; sanctioned wrapper only; BEFORE the Worker that
-- drops homeProductId deploys -- that Worker relies on trigger 2):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v125-product-home-paths.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v125-product-home-paths.sql
-- ROLLBACK (no data change; products made by trigger 1 stay, they are valid rows):
--   DROP TRIGGER IF EXISTS trg_projects_home_product_ins;
--   DROP TRIGGER IF EXISTS trg_tasks_home_product_ins;
--   DROP TRIGGER IF EXISTS trg_tasks_home_product_upd;
--   DROP TRIGGER IF EXISTS trg_products_home_attach_ins;
--   DROP TRIGGER IF EXISTS trg_products_home_attach_upd;
--   DROP TRIGGER IF EXISTS trg_products_tombstone_repoint;
--   DELETE FROM schema_migrations WHERE version = 125;
--   then redeploy the Worker that still carries homeProductId.
--
-- Decision: PB Context/Decisions/2026-10-11-projects-hold-products.md.

-- ── 1. a new project is born with its home product ─────────────────────────
DROP TRIGGER IF EXISTS trg_projects_home_product_ins;
CREATE TRIGGER trg_projects_home_product_ins AFTER INSERT ON projects
FOR EACH ROW
WHEN NEW.deleted_at IS NULL
 AND NOT EXISTS (SELECT 1 FROM products p WHERE p.project_id = NEW.id AND p.deleted_at IS NULL)
BEGIN
  INSERT INTO products (id, project_id, kind, stage, is_home, stage_entered_at)
  SELECT
    'prd_' || CASE WHEN NEW.id LIKE 'proj\_%' ESCAPE '\' THEN substr(NEW.id, 6) ELSE NEW.id END,
    NEW.id,
    'manuscript',
    CASE WHEN s.stage IS NOT NULL THEN s.stage ELSE 'idea' END,
    1,
    CASE WHEN s.stage IS NOT NULL THEN COALESCE(NEW.stage_entered_at, datetime('now')) ELSE datetime('now') END
  FROM (SELECT (SELECT st.stage FROM product_stages st
                 WHERE st.kind = 'manuscript' AND st.stage = NEW.stage AND st.deleted_at IS NULL) AS stage) s;
END;

-- ── 2. a live task on a project carries the project's home product ─────────
DROP TRIGGER IF EXISTS trg_tasks_home_product_ins;
CREATE TRIGGER trg_tasks_home_product_ins AFTER INSERT ON tasks
FOR EACH ROW
WHEN NEW.product_id IS NULL AND NEW.project_id IS NOT NULL AND NEW.deleted_at IS NULL
BEGIN
  UPDATE tasks
     SET product_id = COALESCE((SELECT h.id FROM products h WHERE h.project_id = NEW.project_id AND h.is_home = 1 AND h.deleted_at IS NULL), (SELECT MIN(o.id) FROM products o WHERE o.project_id = NEW.project_id AND o.deleted_at IS NULL HAVING COUNT(*) = 1))
   WHERE id = NEW.id
     AND COALESCE((SELECT h.id FROM products h WHERE h.project_id = NEW.project_id AND h.is_home = 1 AND h.deleted_at IS NULL), (SELECT MIN(o.id) FROM products o WHERE o.project_id = NEW.project_id AND o.deleted_at IS NULL HAVING COUNT(*) = 1)) IS NOT NULL;
END;

-- Fires on a move (project_id), a restore (deleted_at) and a cleared product
-- (product_id). Its own UPDATE writes a non-NULL product_id, so the WHEN is
-- false if it re-enters.
DROP TRIGGER IF EXISTS trg_tasks_home_product_upd;
CREATE TRIGGER trg_tasks_home_product_upd AFTER UPDATE OF project_id, product_id, deleted_at ON tasks
FOR EACH ROW
WHEN NEW.product_id IS NULL AND NEW.project_id IS NOT NULL AND NEW.deleted_at IS NULL
BEGIN
  UPDATE tasks
     SET product_id = COALESCE((SELECT h.id FROM products h WHERE h.project_id = NEW.project_id AND h.is_home = 1 AND h.deleted_at IS NULL), (SELECT MIN(o.id) FROM products o WHERE o.project_id = NEW.project_id AND o.deleted_at IS NULL HAVING COUNT(*) = 1))
   WHERE id = NEW.id
     AND COALESCE((SELECT h.id FROM products h WHERE h.project_id = NEW.project_id AND h.is_home = 1 AND h.deleted_at IS NULL), (SELECT MIN(o.id) FROM products o WHERE o.project_id = NEW.project_id AND o.deleted_at IS NULL HAVING COUNT(*) = 1)) IS NOT NULL;
END;

-- ── 3. a project that gains a home attaches its product-less live tasks ────
DROP TRIGGER IF EXISTS trg_products_home_attach_ins;
CREATE TRIGGER trg_products_home_attach_ins AFTER INSERT ON products
FOR EACH ROW
WHEN NEW.deleted_at IS NULL
BEGIN
  UPDATE tasks
     SET product_id = COALESCE((SELECT h.id FROM products h WHERE h.project_id = NEW.project_id AND h.is_home = 1 AND h.deleted_at IS NULL), (SELECT MIN(o.id) FROM products o WHERE o.project_id = NEW.project_id AND o.deleted_at IS NULL HAVING COUNT(*) = 1))
   WHERE project_id = NEW.project_id AND product_id IS NULL AND deleted_at IS NULL
     AND COALESCE((SELECT h.id FROM products h WHERE h.project_id = NEW.project_id AND h.is_home = 1 AND h.deleted_at IS NULL), (SELECT MIN(o.id) FROM products o WHERE o.project_id = NEW.project_id AND o.deleted_at IS NULL HAVING COUNT(*) = 1)) IS NOT NULL;
END;

DROP TRIGGER IF EXISTS trg_products_home_attach_upd;
CREATE TRIGGER trg_products_home_attach_upd AFTER UPDATE OF is_home, deleted_at ON products
FOR EACH ROW
WHEN NEW.deleted_at IS NULL AND NEW.is_home = 1 AND NOT (OLD.is_home = 1 AND OLD.deleted_at IS NULL)
BEGIN
  UPDATE tasks
     SET product_id = COALESCE((SELECT h.id FROM products h WHERE h.project_id = NEW.project_id AND h.is_home = 1 AND h.deleted_at IS NULL), (SELECT MIN(o.id) FROM products o WHERE o.project_id = NEW.project_id AND o.deleted_at IS NULL HAVING COUNT(*) = 1))
   WHERE project_id = NEW.project_id AND product_id IS NULL AND deleted_at IS NULL
     AND COALESCE((SELECT h.id FROM products h WHERE h.project_id = NEW.project_id AND h.is_home = 1 AND h.deleted_at IS NULL), (SELECT MIN(o.id) FROM products o WHERE o.project_id = NEW.project_id AND o.deleted_at IS NULL HAVING COUNT(*) = 1)) IS NOT NULL;
END;

-- ── 4. a tombstoned product hands its live tasks to the home ───────────────
-- The tombstoned row is excluded by deleted_at IS NULL in the home rule, so
-- the result is the remaining home, the remaining only product, or NULL.
DROP TRIGGER IF EXISTS trg_products_tombstone_repoint;
CREATE TRIGGER trg_products_tombstone_repoint AFTER UPDATE OF deleted_at ON products
FOR EACH ROW
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  UPDATE tasks
     SET product_id = COALESCE((SELECT h.id FROM products h WHERE h.project_id = NEW.project_id AND h.is_home = 1 AND h.deleted_at IS NULL), (SELECT MIN(o.id) FROM products o WHERE o.project_id = NEW.project_id AND o.deleted_at IS NULL HAVING COUNT(*) = 1))
   WHERE product_id = NEW.id AND deleted_at IS NULL;
END;

-- ── 5. a 7th kind: honor (Nick, 2026-10-11) ────────────────────────────────
-- "Award / honor application": a nomination or prize application (ASCI YPSA,
-- an ESI award), not a funding application. Funding is unchanged: only an
-- `award` product can fund (can_fund = 0 here); a received honor that carries
-- money gets its own award product.
INSERT OR IGNORE INTO product_kinds (kind, label, plural_label, has_page, can_fund, sort_order) VALUES
  ('honor', 'Award / honor application', 'Honors', 1, 0, 45);
INSERT OR IGNORE INTO product_stages (kind, stage, label, ordinal, is_terminal) VALUES
  ('honor', 'preparing',    'Preparing',    10, 0),
  ('honor', 'submitted',    'Submitted',    20, 0),
  ('honor', 'received',     'Received',     30, 1),
  ('honor', 'not_received', 'Not received', 40, 1);

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (125, 'schema-v125-product-home-paths.sql');
