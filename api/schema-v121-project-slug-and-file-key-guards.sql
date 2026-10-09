-- schema-v121-project-slug-and-file-key-guards.sql (2026-10-09, #145 fix pass)
--
-- Two values the visibility rule trusts, made unrepresentable in D1 itself.
--
-- 1. A project slug may never spell a project id.
--    The read rule (api/lib/table-scope.ts VISIBLE_PROJECT_REFS) treats a
--    visible project's id AND its slug as references to it. A member who
--    renamed their own project's slug to a hidden project's typed id could
--    read, write and cascade-delete that project's id-keyed rows (cold review,
--    2026-10-09). The API refuses such a slug on every write path
--    (api/lib/project-slug.ts) and the read rule ignores one; these triggers
--    refuse it whoever writes, the PB key and a hand-run statement included:
--      - a slug that starts with 'proj_' (any case: LIKE is case-folded), or
--        equals any project's id;
--      - an id that equals any project's slug (a legacy non-proj_ id).
--    Fires on INSERT and on UPDATE OF slug / id only, so existing rows are
--    untouched; a PB re-send that carries an unchanged slug does not fire
--    UPDATE OF slug unless the slug column is in the SET list (SQLite fires
--    UPDATE OF on the column being SET, even to the same value). Pre-check
--    below finds any row that would refuse its own re-send.
--
-- 2. One R2 object, one attachment row.
--    POST /api/upload/done records an attachment for a client-supplied key.
--    The route now requires the key to sit under the entity it is recorded
--    for, but a second row for an existing key (a member binding a key they
--    learned to an entity they can see, then reading the bytes through it) is
--    a whole-table fact the caller's scoped handle cannot see. A UNIQUE index
--    makes the duplicate unrepresentable; the route turns the violation into
--    a 409.
--
-- PRE-CHECKS (prod, read-only; both must return 0 rows before applying):
--   SELECT id, slug FROM projects WHERE slug LIKE 'proj\_%' ESCAPE '\'
--     OR slug IN (SELECT id FROM projects);
--   SELECT r2_key, COUNT(*) AS n FROM file_attachments GROUP BY r2_key HAVING n > 1;
--   (a duplicate key makes CREATE UNIQUE INDEX fail; resolve it first)
--
-- APPLY (test, then prod; Time-Travel bookmark first):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v121-project-slug-and-file-key-guards.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v121-project-slug-and-file-key-guards.sql
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_projects_slug_not_id_ins;
--   DROP TRIGGER IF EXISTS trg_projects_slug_not_id_upd;
--   DROP INDEX IF EXISTS idx_file_attachments_r2_key_unique;
--   DELETE FROM schema_migrations WHERE version = 121;

CREATE UNIQUE INDEX IF NOT EXISTS idx_file_attachments_r2_key_unique ON file_attachments(r2_key);

CREATE TRIGGER IF NOT EXISTS trg_projects_slug_not_id_ins
BEFORE INSERT ON projects
WHEN (NEW.slug IS NOT NULL AND (NEW.slug LIKE 'proj\_%' ESCAPE '\' OR EXISTS (SELECT 1 FROM projects WHERE id = NEW.slug)))
  OR EXISTS (SELECT 1 FROM projects WHERE slug = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'project slug may not be a project id');
END;

CREATE TRIGGER IF NOT EXISTS trg_projects_slug_not_id_upd
BEFORE UPDATE OF slug, id ON projects
WHEN (NEW.slug IS NOT NULL AND (NEW.slug LIKE 'proj\_%' ESCAPE '\' OR EXISTS (SELECT 1 FROM projects WHERE id = NEW.slug AND id <> OLD.id)))
  OR EXISTS (SELECT 1 FROM projects WHERE slug = NEW.id AND id <> OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'project slug may not be a project id');
END;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (121, 'schema-v121-project-slug-and-file-key-guards.sql');
