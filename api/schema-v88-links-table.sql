-- schema-v88-links-table.sql (2026-06-20)
-- Link-normalization Phase 2: typed links become a first-class Hub-synced
-- `links` table with a polymorphic owner (a link belongs to a task OR a project).
-- Replaces the 3 fixed key_link_1/2/3 (+_desc) slots on tasks/projects via an
-- expand/contract cutover -- the slots stay real+writable until a LATER
-- Dual-Plan-gated contract step (NOT this migration; this migration is purely
-- additive).
--
-- Decision doc:
--   Peripheral-Brain/Context/Decisions/2026-06-20-links-table.md
-- Master plan:
--   Peripheral-Brain/Scratch/plans/2026-06-19-link-normalization-master-plan.md Phase 2
-- PB brain.db DDL: migrations/110_links_table.sql (identity-mapped columns)
--
-- Polymorphic owner = ONE table + CHECK(owner_table IN ('tasks','projects')).
-- SQLite/D1 cannot FK a single column to two tables; integrity is enforced by
-- the write-path (mutations.ts ALLOWED_TABLES + PB resolve_entity) + an
-- orphan-cleanup test -- same shape as tasks.project_id (no real FK either).
--
-- Columns mirror brain.db migration 110 EXACTLY (identity-mapped, no renames).
-- PB-local-only bookkeeping columns (sync_status, local_version, synced_at)
-- are omitted from D1 -- those are brain.db-side dirty-tracking only.
-- Hub assigns seq + last_mutation_id for the A3 echo/pull-cursor protocol.
--
-- seq trigger pattern: v53 canonical form (COALESCE(MAX(seq),0)+1 FROM links --
-- includes self in MAX so consecutive UPDATEs to the same row still advance seq).
-- Same form used by tasks/projects (see schema-v53-seq-trigger-include-self.sql).
--
-- Worker acceptance: links enters TABLE_FIELDS via the regenerated pb-schema
-- field-authority.generated.ts (pb-schema 0.7.0, imported by mutations.ts);
-- this CREATE TABLE + the Worker deploy of that regenerated artifact together
-- make Hub ACCEPT the field BEFORE PB pushes (R10 lockstep).
--
-- Rollback: DROP TABLE IF EXISTS links (safe -- additive only; key_link_* slots
-- stay real+writable until the later contract step which is its own Dual-Plan).
--
-- APPLY (test FIRST, probe, then prod) -- sanctioned wrapper ONLY:
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v88-links-table.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v88-links-table.sql

CREATE TABLE IF NOT EXISTS links (
    id            TEXT PRIMARY KEY,              -- link_<ULID>, minted by PB via scripts/db/ids.py
    owner_table   TEXT NOT NULL CHECK (owner_table IN ('tasks','projects')),
    owner_id      TEXT NOT NULL,                 -- PK (task_/proj_<ULID>); re-pointed on merge/dedup
    role          TEXT NOT NULL DEFAULT 'key',   -- v1 only 'key'; column exists for future GROUP BY
    type          TEXT NOT NULL,                 -- LinkType domain (15 values from enums.py)
    canonical_url TEXT NOT NULL,
    short_title   TEXT NOT NULL,                 -- CanonicalLink.short_title (display; never re-classified)
    source_raw    TEXT,                          -- nullable, audit-only, NEVER rendered
    sort_order    INTEGER NOT NULL DEFAULT 0,    -- preserves slot 1/2/3 order through cutover (slot-1)
    deleted_at    TEXT,                          -- soft-delete tombstone (sync-symmetric)
    seq           INTEGER DEFAULT 0,             -- Hub-assigned monotonic; pull cursor advances on it
    last_mutation_id TEXT,                       -- A3 echo suppression
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Natural key: a given canonical_url appears once per (owner, role) among LIVE rows.
-- PARTIAL (WHERE deleted_at IS NULL): a soft-deleted link must NOT block re-adding
-- the same URL later (remove-then-readd is legal). Hub keys on scalar `id`; this
-- UNIQUE guards the live natural key (shared-schema-registry.md composite-PK invariant).
CREATE UNIQUE INDEX IF NOT EXISTS idx_links_owner_role_url
    ON links(owner_table, owner_id, role, canonical_url)
    WHERE deleted_at IS NULL;

-- Fast owner lookup (primary read pattern: all links for a task/project).
CREATE INDEX IF NOT EXISTS idx_links_owner ON links(owner_table, owner_id);

-- Type-based queries (e.g. all google_doc links for this project).
CREATE INDEX IF NOT EXISTS idx_links_type ON links(type);

-- Pull-cursor index: GET /links?seq_after=N uses ORDER BY seq ASC.
CREATE INDEX IF NOT EXISTS idx_links_seq ON links(seq);

-- seq-assignment triggers (v53 canonical pattern -- includes self in MAX so
-- consecutive UPDATEs on the same row still advance seq).

-- INSERT: assign seq on insert. Excludes self from MAX at trigger time
-- (seq=0 at INSERT entry; existing rows provide the correct MAX). WHEN guard
-- ensures the trigger only fires when seq is still the DEFAULT 0 (i.e., not
-- explicitly supplied by the caller).
DROP TRIGGER IF EXISTS trg_links_seq_insert;
CREATE TRIGGER trg_links_seq_insert AFTER INSERT ON links
FOR EACH ROW
WHEN NEW.seq = 0
BEGIN
  UPDATE links
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM links WHERE rowid != NEW.rowid)
  WHERE rowid = NEW.rowid;
END;

-- UPDATE: bump seq on every update. WHEN guard (NEW.seq = OLD.seq) prevents the
-- trigger's own inner UPDATE from firing a second recursive time (inner UPDATE
-- sets seq to a new value, so NEW.seq != OLD.seq on the recursive invocation).
DROP TRIGGER IF EXISTS trg_links_seq_update;
CREATE TRIGGER trg_links_seq_update AFTER UPDATE ON links
FOR EACH ROW
WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE links
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM links)
  WHERE id = NEW.id;
END;
