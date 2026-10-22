-- v144: drop the Lane-3 `trajectories` table (PB backlog #1552).
--
-- Nothing on PB has written it since 2026-04-09 (19 rows, max seq 21 on prod when the plan was
-- written). Its readers left PB in June and August; its PB module, migration and rail entries go
-- in PB P1. The Hub code half (mutations.ts, lane3.ts) is H1. This file is H2: it drops the
-- table with its 4 v48 indexes, the v63 and v67 partial indexes, and the 2 v48 seq triggers.
-- Nothing else in the chain references the table (no view, trigger or FK names it).
--
-- APPLY ONLY AFTER ALL of these are true, in this order:
--   1. H1 is deployed (the Worker no longer lists the table in ALLOWED_TABLES or LANE3_PULL_TABLES).
--      The pre-H1 Worker answers GET /api/lane3/trajectories with a query on a missing table.
--   2. PB P1 is on both machines (no brain.db pull or push names the table).
--   3. The pb-schema pin is bumped past the commit that drops `trajectories` from the field
--      set. Until then scripts/audit-schema-contract.ts reports table_in_TABLE_FIELDS_not_in_schema.
--   4. Back up first, in-session: python scripts/d1_table_backup.py trajectories
--      and record a Time Travel bookmark: npx wrangler d1 time-travel info mnccore-lab
--      Capture prod's own DDL for the rollback below:
--        SELECT type, name, sql FROM sqlite_master
--         WHERE tbl_name = 'trajectories' OR name LIKE 'trg_trajectories%';
--      and diff it against the ROLLBACK text. The ROLLBACK here is built from the v48, v63 and
--      v67 files, not from prod.
--
-- Commit this file together with api/lib/table-scope.ts and scripts/schema-version-snapshot.json
-- at apply time: the nightly schema-drift job diffs prod's schema_migrations ledger against the
-- committed file list, and table-scope.test.ts ties HUB_TABLES to the migration chain.
--
-- APPLY:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v144-drop-trajectories.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v144-drop-trajectories.sql
-- ROLLBACK (then re-INSERT the rows from the backup; the seq values in the backup are kept, and
-- the insert trigger only fires for seq = 0):
--   CREATE TABLE IF NOT EXISTS trajectories (
--     task           TEXT NOT NULL,
--     steps          TEXT,
--     outcome        TEXT,
--     insight        TEXT,
--     project_id     TEXT,
--     created_at     TEXT NOT NULL,
--     updated_at     TEXT DEFAULT (datetime('now')),
--     access_count   INTEGER DEFAULT 0,
--     last_accessed  TEXT,
--     machine_id     TEXT,
--     seq            INTEGER NOT NULL DEFAULT 0,
--     last_mutation_id TEXT,
--     deleted_at     TEXT,
--     PRIMARY KEY (task, created_at)
--   );
--   CREATE INDEX IF NOT EXISTS idx_trajectories_machine    ON trajectories(machine_id);
--   CREATE INDEX IF NOT EXISTS idx_trajectories_project    ON trajectories(project_id);
--   CREATE INDEX IF NOT EXISTS idx_trajectories_outcome    ON trajectories(outcome);
--   CREATE INDEX IF NOT EXISTS idx_trajectories_seq        ON trajectories(seq);
--   CREATE INDEX IF NOT EXISTS idx_trajectories_last_mutation
--     ON trajectories(last_mutation_id) WHERE last_mutation_id IS NOT NULL;
--   CREATE INDEX IF NOT EXISTS idx_trajectories_deleted_at
--     ON trajectories(deleted_at) WHERE deleted_at IS NOT NULL;
--   CREATE TRIGGER trg_trajectories_seq_insert AFTER INSERT ON trajectories
--   FOR EACH ROW WHEN NEW.seq = 0
--   BEGIN
--     UPDATE trajectories SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM trajectories WHERE rowid != NEW.rowid) WHERE rowid = NEW.rowid;
--   END;
--   CREATE TRIGGER trg_trajectories_seq_update AFTER UPDATE ON trajectories
--   FOR EACH ROW WHEN NEW.seq = OLD.seq
--   BEGIN
--     UPDATE trajectories SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM trajectories) WHERE task = NEW.task AND created_at = NEW.created_at;
--   END;
--   DELETE FROM schema_migrations WHERE version = 144;

DROP TRIGGER IF EXISTS trg_trajectories_seq_insert;
DROP TRIGGER IF EXISTS trg_trajectories_seq_update;
DROP INDEX IF EXISTS idx_trajectories_machine;
DROP INDEX IF EXISTS idx_trajectories_project;
DROP INDEX IF EXISTS idx_trajectories_outcome;
DROP INDEX IF EXISTS idx_trajectories_seq;
DROP INDEX IF EXISTS idx_trajectories_last_mutation;
DROP INDEX IF EXISTS idx_trajectories_deleted_at;
DROP TABLE IF EXISTS trajectories;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (144, 'schema-v144-drop-trajectories.sql');
