-- schema-v129-project-home-seed.sql (2026-10-12)
--
-- A new project is born with the product its creator named. Until now
-- trg_projects_home_product_ins (schema-v125) made every new project's home a
-- MANUSCRIPT, at projects.stage when that word sat on the manuscript ladder,
-- else 'idea'. A grant application, an abstract, an infrastructure project
-- was born a manuscript and someone had to fix the product by hand. Measured
-- on prod 2026-10-12: 37 of 105 home products disagree with projects.stage
-- (infrastructure 20, grant_application 9, abstract 4, honor 2, award 1,
-- trial_ops 1); every manuscript home agrees. The hard-coded kind is the
-- root cause (contract-phase plan, PB
-- Scratch/plans/2026-10-12-contract-phase-retire-project-stage.md, ruling 2).
--
-- WHAT CHANGES
--   project_home_seed: one row per project being created, naming the home
--     product's kind and stage. The composite FK to product_stages refuses an
--     off-ladder pair, so a create naming one fails whole (the seed and the
--     project insert ride one D1 batch, which is one transaction).
--   trg_projects_home_product_ins: seeds the home from that row when it is
--     there, and consumes it (DELETE) in the same statement. A create with no
--     seed behaves exactly as v125 did (manuscript, projects.stage when on the
--     manuscript ladder, else 'idea'): PB's create_project still sends a
--     projects.stage and no seed until the PB lane (plan step 2) lands.
--   The writer (api/routes/mutations.ts applyInsert, Mutation.home_product)
--     also deletes the seed after the insert in the same batch, so a replayed
--     create that ON CONFLICT skipped leaves no row behind. The table is empty
--     at rest.
--
-- WHY A TABLE, NOT A COLUMN: the trigger sees only NEW.* of projects, and the
-- point of the contract phase is to retire a projects column (stage), not to
-- add one. A seed row lives for one statement.
--
-- WHAT IS NOT HERE (plan step 4, after PB stops writing projects.stage):
-- dropping trg_products_stage_mirror and the NEW.stage arm below. Both still
-- carry PB's projects.stage readers and PB's seedless creates today.
--
-- APPLY (test first, then prod; sanctioned wrapper only; BEFORE the Worker that
-- sends home_product deploys -- that Worker inserts into project_home_seed):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v129-project-home-seed.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v129-project-home-seed.sql
-- ROLLBACK: re-apply api/schema-v125-product-home-paths.sql (restores the v125
--   trigger text), then
--   DROP TABLE IF EXISTS project_home_seed;
--   DELETE FROM schema_migrations WHERE version = 129;
--   and redeploy the prior Worker.
--
-- Decision: PB Context/Decisions/2026-10-11-projects-hold-products.md.

CREATE TABLE IF NOT EXISTS project_home_seed (
  project_id TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  stage      TEXT NOT NULL,
  FOREIGN KEY (kind, stage) REFERENCES product_stages(kind, stage)
);

DROP TRIGGER IF EXISTS trg_projects_home_product_ins;
CREATE TRIGGER trg_projects_home_product_ins AFTER INSERT ON projects
FOR EACH ROW
WHEN NEW.deleted_at IS NULL
 AND NOT EXISTS (SELECT 1 FROM products p WHERE p.project_id = NEW.id AND p.deleted_at IS NULL)
BEGIN
  -- Derived id only while no row holds it (v125's rule, unchanged).
  INSERT INTO products (id, project_id, kind, stage, is_home, stage_entered_at)
  SELECT
    CASE WHEN length(NEW.id) = 31 AND NEW.id LIKE 'proj\_%' ESCAPE '\' AND substr(NEW.id, 6) NOT GLOB '*[^0-9A-HJKMNP-TV-Z]*'
              AND NOT EXISTS (SELECT 1 FROM products x WHERE x.id = 'prd_' || substr(NEW.id, 6))
         THEN 'prd_' || substr(NEW.id, 6) ELSE 'prd_' || lower(hex(randomblob(16))) END,
    NEW.id,
    COALESCE(s.seed_kind, 'manuscript'),
    COALESCE(s.seed_stage, s.ms_stage, 'idea'),
    1,
    CASE WHEN s.seed_stage IS NOT NULL OR s.ms_stage IS NOT NULL
         THEN COALESCE(NEW.stage_entered_at, datetime('now')) ELSE datetime('now') END
  FROM (SELECT
          (SELECT h.kind  FROM project_home_seed h WHERE h.project_id = NEW.id) AS seed_kind,
          (SELECT h.stage FROM project_home_seed h WHERE h.project_id = NEW.id) AS seed_stage,
          (SELECT st.stage FROM product_stages st
            WHERE st.kind = 'manuscript' AND st.stage = NEW.stage AND st.deleted_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM project_home_seed h WHERE h.project_id = NEW.id)) AS ms_stage) s;
  DELETE FROM project_home_seed WHERE project_id = NEW.id;
END;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (129, 'schema-v129-project-home-seed.sql');
