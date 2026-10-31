-- schema-v153-first-step-packets.sql (2026-10-30) -- the prepared first step.
--
-- Nick, 2026-10-29: "instead of me having to do like the process task
-- everyday". He picked "Starting work": opening a task finds its first step
-- prepared atop the drawer. Accepted 2026-10-30: "Accept, build v1 now
-- (Recommended)". Decision: PB Context/Decisions/2026-10-30-first-step-packet.md
-- (v1 contract). Plan: PB Scratch/plans/2026-10-30-first-step-packet-RECONCILED.md
-- (Dual-Plan L1 + MIN, codex third seat).
--
-- Three Hub-only tables. Not activity_entries.metadata_json: schema-v102:14-19
-- calls that a display bag the edit handler rewrites whole. No brain.db mirror
-- (artifacts precedent). Only api/routes/packets.ts writes them.
--
--   task_packets          one row per preparation identity (producer_key);
--                         lifecycle only. At most one LIVE packet per task.
--   task_packet_versions  what was prepared: instruction, preview body, calls,
--                         deliverable, and the input manifest freshness is
--                         derived from. Append-only.
--   task_packet_actions   use / dismiss / redirect / edit receipts. One Use
--                         per packet.
--
-- Freshness (ready / changed / unverified) is never stored: api/lib/packet-freshness.ts
-- derives it on every read from manifest_json.
--
-- WHAT THE SCHEMA MAKES UNREPRESENTABLE (Level 1 at the arbiter):
--   - two live packets on one task: partial UNIQUE idx_task_packets_one_live.
--   - two packets for one preparation: UNIQUE producer_key.
--   - a deliverable that sends: deliverable_kind CHECK has no send member, and
--     deliverable_json's own kind must equal it.
--   - a closed packet with no reason, or a reason on a live one: the pair CHECK.
--   - a second Use: partial UNIQUE idx_task_packet_actions_one_use.
--   - an action on a version that does not exist: the composite FK.
--
-- WHAT STAYS LEVEL 2 (one trigger each; each is a predicate over other rows or
-- over a row's history, which no column constraint can read):
--   - versions are append-only: trg_task_packet_versions_no_update / _no_delete.
--   - a call anchor is a substring of the body: trg_task_packet_versions_anchor
--     (the route answers 400 first; this is the arbiter's copy of the rule).
--   - a closed packet stays closed, and task_id / producer_key never move:
--     trg_task_packets_lifecycle.
--   - a packet holding a version Nick wrote is never superseded by a producer:
--     trg_task_packets_nick_supersede (the route answers 409 first).
--   - no action lands on a closed packet: trg_task_packet_actions_live.
--
-- Visibility: all three tables are Nick-only in api/lib/table-scope.ts (the
-- mail-watch rule, nickOnly): his session with the PI flag and the PB key's
-- raw handle. A second PI does not read Nick's drafts. So the Today list's
-- packet_state subquery reads NULL for every other viewer by construction.
--
-- HAZARD for any future `tasks` table rebuild: task_packets.task_id is an FK
-- to tasks(id) with no ON DELETE action, so the rebuild's implicit DELETE is
-- REFUSED while a packet exists (loud, not silent). Copy task_packets aside,
-- or rebuild with the packets' FK dropped first.
--
-- APPLY (additive; harmless before the Worker that uses it):
--   scripts/wrangler-d1 d1 execute mnccore-lab-test --remote --file=api/schema-v153-first-step-packets.sql
--   scripts/wrangler-d1 d1 execute mnccore-lab      --remote --file=api/schema-v153-first-step-packets.sql
-- ROLLBACK (Worker first; no other table references these):
--   DROP TABLE IF EXISTS task_packet_actions;
--   DROP TABLE IF EXISTS task_packet_versions;
--   DROP TABLE IF EXISTS task_packets;
--   DELETE FROM schema_migrations WHERE version = 153;
--   (dropping a table drops its triggers and indexes)

CREATE TABLE IF NOT EXISTS task_packets (
  id              TEXT PRIMARY KEY,                       -- 'pkt_' + hex
  task_id         TEXT NOT NULL REFERENCES tasks(id),
  producer_key    TEXT NOT NULL UNIQUE CHECK (length(producer_key) BETWEEN 1 AND 200),
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  created_at      TEXT NOT NULL,                          -- ISO UTC
  closed_at       TEXT,
  close_reason    TEXT CHECK (close_reason IN ('superseded', 'dismissed')),
  CHECK ((closed_at IS NULL) = (close_reason IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_packets_one_live ON task_packets (task_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_packets_task ON task_packets (task_id, created_at);

CREATE TABLE IF NOT EXISTS task_packet_versions (
  packet_id        TEXT NOT NULL REFERENCES task_packets(id),
  version          INTEGER NOT NULL CHECK (version >= 1),
  author           TEXT NOT NULL CHECK (author IN ('claude', 'nick')),
  instruction      TEXT NOT NULL CHECK (length(instruction) BETWEEN 1 AND 2000),
  minutes          INTEGER CHECK (minutes IS NULL OR minutes BETWEEN 1 AND 600),
  deliverable_kind TEXT NOT NULL CHECK (deliverable_kind IN ('gmail_draft', 'doc_text', 'answer')),
  deliverable_json TEXT NOT NULL CHECK (json_valid(deliverable_json)
                     AND json_extract(deliverable_json, '$.kind') = deliverable_kind),
  body             TEXT NOT NULL CHECK (length(body) <= 100000),
  calls_json       TEXT NOT NULL CHECK (json_valid(calls_json) AND json_type(calls_json) = 'array'),
  manifest_json    TEXT NOT NULL CHECK (json_valid(manifest_json) AND json_type(manifest_json) = 'array'),
  manifest_hash    TEXT NOT NULL CHECK (length(manifest_hash) = 64),
  created_at       TEXT NOT NULL,                         -- ISO UTC
  PRIMARY KEY (packet_id, version)
);

DROP TRIGGER IF EXISTS trg_task_packet_versions_no_update;
CREATE TRIGGER trg_task_packet_versions_no_update BEFORE UPDATE ON task_packet_versions
BEGIN SELECT RAISE(ABORT, 'task_packet_version_append_only: a packet version is never edited; add a version'); END;

DROP TRIGGER IF EXISTS trg_task_packet_versions_no_delete;
CREATE TRIGGER trg_task_packet_versions_no_delete BEFORE DELETE ON task_packet_versions
BEGIN SELECT RAISE(ABORT, 'task_packet_version_append_only: a packet version is never deleted'); END;

DROP TRIGGER IF EXISTS trg_task_packet_versions_anchor;
CREATE TRIGGER trg_task_packet_versions_anchor BEFORE INSERT ON task_packet_versions
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.calls_json) c
   WHERE json_type(c.value, '$.anchor') IS NOT 'text'
      OR json_extract(c.value, '$.anchor') = ''
      OR instr(NEW.body, json_extract(c.value, '$.anchor')) = 0
)
BEGIN SELECT RAISE(ABORT, 'task_packet_anchor: every call anchor must be a substring of the body'); END;

DROP TRIGGER IF EXISTS trg_task_packets_lifecycle;
CREATE TRIGGER trg_task_packets_lifecycle BEFORE UPDATE ON task_packets
FOR EACH ROW
WHEN OLD.closed_at IS NOT NULL
  OR NEW.task_id IS NOT OLD.task_id
  OR NEW.producer_key IS NOT OLD.producer_key
BEGIN SELECT RAISE(ABORT, 'task_packet_lifecycle: a closed packet stays closed; task_id and producer_key never move'); END;

DROP TRIGGER IF EXISTS trg_task_packets_nick_supersede;
CREATE TRIGGER trg_task_packets_nick_supersede BEFORE UPDATE OF closed_at ON task_packets
FOR EACH ROW
WHEN NEW.close_reason = 'superseded'
 AND EXISTS (SELECT 1 FROM task_packet_versions v WHERE v.packet_id = NEW.id AND v.author = 'nick')
BEGIN SELECT RAISE(ABORT, 'task_packet_nick_authored: Nick edited this packet; a producer may not replace it'); END;

CREATE TABLE IF NOT EXISTS task_packet_actions (
  id         TEXT PRIMARY KEY,                            -- 'pka_' + hex
  packet_id  TEXT NOT NULL REFERENCES task_packets(id),
  version    INTEGER NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('use', 'dismiss', 'redirect', 'edit')),
  -- The external operation's outcome. 'uncertain' is explicit: a crash after an
  -- external write is recorded as such, never blindly retried.
  outcome    TEXT NOT NULL DEFAULT 'ok' CHECK (outcome IN ('ok', 'uncertain', 'failed')),
  detail     TEXT CHECK (detail IS NULL OR length(detail) <= 2000),
  actor      TEXT NOT NULL,
  created_at TEXT NOT NULL,                               -- ISO UTC
  FOREIGN KEY (packet_id, version) REFERENCES task_packet_versions (packet_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_packet_actions_one_use ON task_packet_actions (packet_id) WHERE action = 'use';
CREATE INDEX IF NOT EXISTS idx_task_packet_actions_packet ON task_packet_actions (packet_id, created_at);

DROP TRIGGER IF EXISTS trg_task_packet_actions_live;
CREATE TRIGGER trg_task_packet_actions_live BEFORE INSERT ON task_packet_actions
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM task_packets p WHERE p.id = NEW.packet_id AND p.closed_at IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'task_packet_closed: no action lands on a closed packet'); END;

INSERT OR IGNORE INTO schema_migrations (version, filename) VALUES (153, 'schema-v153-first-step-packets.sql');
