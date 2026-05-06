-- v48 (2026-05-06 substrate doctrine Stage 3 Phase 1):
-- Add 9 semantic tables to Hub D1 — replaces JSONL exports via memory_sync.py.
--
-- v48 REVISED 2026-05-06 14:00:00Z after home N1 schema-design pushback:
--   - DROPPED `last_modified_ts` (not used by A3 protocol — was my misread).
--   - KEPT `seq INTEGER NOT NULL DEFAULT 0` (the actual A3 sync cursor — see v51-v53).
--   - ADDED v51-v53 trigger pattern: AFTER INSERT (bump if seq=0) +
--     AFTER UPDATE (bump on any column change with WHEN NEW.seq=OLD.seq guard;
--     include-self in MAX per v53 fix).
--   - ADDED `updated_at TEXT DEFAULT (datetime('now'))` to kg_relations (was missing).
--   - agent_knowledge: `valid_from TEXT NOT NULL DEFAULT (datetime('now'))` (PK requires).
--
-- Decision: Context/Decisions/2026-05-06-codex-substrate-review.md
-- Plan: ~/.claude/plans/read-abotu-sessions-too-synthetic-knuth.md (Stage 3)
-- Cross-machine chat: home WORK 14:00:00Z addresses home's N1+N2.
--
-- Schema design rules:
--   1. Single table per logical entity. PK = natural unique key (NOT brain.db rowid).
--   2. machine_id ONLY on per-machine semantic tables (sessions, agent_knowledge,
--      pomodoro, decisions, trajectories). Canonical/deterministic tables omit it.
--   3. A3 sync = seq column + seq triggers per v51-v53 pattern. Cross-machine
--      tiebreaker on same PK = monotonic seq, NOT updated_at. updated_at exists
--      for human audit only.
--
-- Scope: 9 tables (sessions, agent_knowledge, memory_facts, pomodoro_sessions,
-- decisions, kg_entities, kg_relations, kg_relation_type_registry, trajectories).
-- DROPPED telegram_messages + kg_relation_chunks per home Q2 review.
--
-- Pair: api/routes/mutations.ts TABLE_FIELDS extended (same commit).
-- All additive. No row changes (until backfill_to_d1.py runs separately).

-- ============================================================
-- 1. sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  session_id     TEXT PRIMARY KEY,
  started_at     TEXT,
  ended_at       TEXT,
  summary        TEXT,
  context        TEXT,
  projects_touched TEXT,
  skills_used    TEXT,
  token_estimate INTEGER,
  machine_id     TEXT,
  seq            INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_machine    ON sessions(machine_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_seq        ON sessions(seq);

DROP TRIGGER IF EXISTS trg_sessions_seq_insert;
CREATE TRIGGER trg_sessions_seq_insert AFTER INSERT ON sessions
FOR EACH ROW WHEN NEW.seq = 0
BEGIN
  UPDATE sessions
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM sessions WHERE rowid != NEW.rowid)
  WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_sessions_seq_update;
CREATE TRIGGER trg_sessions_seq_update AFTER UPDATE ON sessions
FOR EACH ROW WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE sessions
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM sessions)
  WHERE session_id = NEW.session_id;
END;

-- ============================================================
-- 2. agent_knowledge — PK = (category, topic, valid_from); valid_from NOT NULL
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_knowledge (
  category       TEXT NOT NULL,
  topic          TEXT NOT NULL,
  knowledge      TEXT,
  source         TEXT,
  learned_at     TEXT,
  updated_at     TEXT DEFAULT (datetime('now')),
  confidence     TEXT,
  tags           TEXT,
  valid_from     TEXT NOT NULL DEFAULT (datetime('now')),
  valid_to       TEXT,
  superseded_by  TEXT,
  machine_id     TEXT,
  seq            INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (category, topic, valid_from)
);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_machine  ON agent_knowledge(machine_id);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_topic    ON agent_knowledge(topic);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_valid_to ON agent_knowledge(valid_to);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_seq      ON agent_knowledge(seq);

DROP TRIGGER IF EXISTS trg_agent_knowledge_seq_insert;
CREATE TRIGGER trg_agent_knowledge_seq_insert AFTER INSERT ON agent_knowledge
FOR EACH ROW WHEN NEW.seq = 0
BEGIN
  UPDATE agent_knowledge
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM agent_knowledge WHERE rowid != NEW.rowid)
  WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_agent_knowledge_seq_update;
CREATE TRIGGER trg_agent_knowledge_seq_update AFTER UPDATE ON agent_knowledge
FOR EACH ROW WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE agent_knowledge
  SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM agent_knowledge)
  WHERE category = NEW.category AND topic = NEW.topic AND valid_from = NEW.valid_from;
END;

-- ============================================================
-- 3. memory_facts
-- ============================================================
CREATE TABLE IF NOT EXISTS memory_facts (
  id             TEXT PRIMARY KEY,
  text           TEXT,
  category       TEXT,
  confidence     TEXT,
  status         TEXT,
  confusion_risk INTEGER,
  is_negative_constraint INTEGER,
  superseded_by  TEXT,
  superseded_at  TEXT,
  supersession_reason TEXT,
  source_type    TEXT,
  source_session_id TEXT,
  access_count   INTEGER DEFAULT 0,
  days_active    INTEGER,
  last_relevance_score REAL,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now')),
  promoted_at    TEXT,
  last_accessed  TEXT,
  source_machine_id TEXT,
  seq            INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_memory_facts_status     ON memory_facts(status);
CREATE INDEX IF NOT EXISTS idx_memory_facts_category   ON memory_facts(category);
CREATE INDEX IF NOT EXISTS idx_memory_facts_source_machine ON memory_facts(source_machine_id);
CREATE INDEX IF NOT EXISTS idx_memory_facts_seq        ON memory_facts(seq);

DROP TRIGGER IF EXISTS trg_memory_facts_seq_insert;
CREATE TRIGGER trg_memory_facts_seq_insert AFTER INSERT ON memory_facts
FOR EACH ROW WHEN NEW.seq = 0
BEGIN
  UPDATE memory_facts SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM memory_facts WHERE rowid != NEW.rowid) WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_memory_facts_seq_update;
CREATE TRIGGER trg_memory_facts_seq_update AFTER UPDATE ON memory_facts
FOR EACH ROW WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE memory_facts SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM memory_facts) WHERE id = NEW.id;
END;

-- ============================================================
-- 4. pomodoro_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  task_id        TEXT,
  project_id     TEXT,
  start_time     TEXT NOT NULL,
  end_time       TEXT,
  duration_min   INTEGER,
  completed      INTEGER,
  notes          TEXT,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now')),
  source         TEXT NOT NULL,
  confidence_score REAL,
  phase          TEXT,
  machine_id     TEXT,
  seq            INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (start_time, source)
);
CREATE INDEX IF NOT EXISTS idx_pomodoro_machine    ON pomodoro_sessions(machine_id);
CREATE INDEX IF NOT EXISTS idx_pomodoro_project    ON pomodoro_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_pomodoro_start_time ON pomodoro_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_pomodoro_seq        ON pomodoro_sessions(seq);

DROP TRIGGER IF EXISTS trg_pomodoro_seq_insert;
CREATE TRIGGER trg_pomodoro_seq_insert AFTER INSERT ON pomodoro_sessions
FOR EACH ROW WHEN NEW.seq = 0
BEGIN
  UPDATE pomodoro_sessions SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM pomodoro_sessions WHERE rowid != NEW.rowid) WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_pomodoro_seq_update;
CREATE TRIGGER trg_pomodoro_seq_update AFTER UPDATE ON pomodoro_sessions
FOR EACH ROW WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE pomodoro_sessions SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM pomodoro_sessions) WHERE start_time = NEW.start_time AND source = NEW.source;
END;

-- ============================================================
-- 5. decisions
-- ============================================================
CREATE TABLE IF NOT EXISTS decisions (
  context_id     TEXT PRIMARY KEY,
  date           TEXT,
  title          TEXT,
  topic          TEXT,
  tags           TEXT,
  content        TEXT,
  file_path      TEXT,
  indexed_at     TEXT,
  outcome        TEXT,
  outcome_date   TEXT,
  machine_id     TEXT,
  seq            INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_decisions_machine ON decisions(machine_id);
CREATE INDEX IF NOT EXISTS idx_decisions_date    ON decisions(date);
CREATE INDEX IF NOT EXISTS idx_decisions_topic   ON decisions(topic);
CREATE INDEX IF NOT EXISTS idx_decisions_seq     ON decisions(seq);

DROP TRIGGER IF EXISTS trg_decisions_seq_insert;
CREATE TRIGGER trg_decisions_seq_insert AFTER INSERT ON decisions
FOR EACH ROW WHEN NEW.seq = 0
BEGIN
  UPDATE decisions SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM decisions WHERE rowid != NEW.rowid) WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_decisions_seq_update;
CREATE TRIGGER trg_decisions_seq_update AFTER UPDATE ON decisions
FOR EACH ROW WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE decisions SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM decisions) WHERE context_id = NEW.context_id;
END;

-- ============================================================
-- 6. kg_entities
-- ============================================================
CREATE TABLE IF NOT EXISTS kg_entities (
  id             TEXT PRIMARY KEY,
  entity_type    TEXT,
  name           TEXT,
  canonical_name TEXT,
  attributes     TEXT,
  description    TEXT,
  importance_score REAL,
  access_count   INTEGER DEFAULT 0,
  last_accessed  TEXT,
  source_type    TEXT,
  source_id      TEXT,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now')),
  valid_from     TEXT,
  valid_until    TEXT,
  seq            INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_kg_entities_type           ON kg_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_kg_entities_canonical_name ON kg_entities(canonical_name);
CREATE INDEX IF NOT EXISTS idx_kg_entities_seq            ON kg_entities(seq);

DROP TRIGGER IF EXISTS trg_kg_entities_seq_insert;
CREATE TRIGGER trg_kg_entities_seq_insert AFTER INSERT ON kg_entities
FOR EACH ROW WHEN NEW.seq = 0
BEGIN
  UPDATE kg_entities SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM kg_entities WHERE rowid != NEW.rowid) WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_kg_entities_seq_update;
CREATE TRIGGER trg_kg_entities_seq_update AFTER UPDATE ON kg_entities
FOR EACH ROW WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE kg_entities SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM kg_entities) WHERE id = NEW.id;
END;

-- ============================================================
-- 7. kg_relations — ADDED `updated_at` per home N1
-- ============================================================
CREATE TABLE IF NOT EXISTS kg_relations (
  source_id      TEXT NOT NULL,
  target_id      TEXT NOT NULL,
  relation_type  TEXT NOT NULL,
  attributes     TEXT,
  confidence     REAL,
  weight         REAL,
  valid_from     TEXT,
  valid_until    TEXT,
  superseded_by  TEXT,
  extraction_source TEXT,
  extraction_ref TEXT,
  extracted_from TEXT,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now')),  -- ADDED 14:00Z (home N1)
  last_validated TEXT,
  seq            INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source_id, target_id, relation_type)
);
CREATE INDEX IF NOT EXISTS idx_kg_relations_source    ON kg_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_kg_relations_target    ON kg_relations(target_id);
CREATE INDEX IF NOT EXISTS idx_kg_relations_type      ON kg_relations(relation_type);
CREATE INDEX IF NOT EXISTS idx_kg_relations_seq       ON kg_relations(seq);

DROP TRIGGER IF EXISTS trg_kg_relations_seq_insert;
CREATE TRIGGER trg_kg_relations_seq_insert AFTER INSERT ON kg_relations
FOR EACH ROW WHEN NEW.seq = 0
BEGIN
  UPDATE kg_relations SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM kg_relations WHERE rowid != NEW.rowid) WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_kg_relations_seq_update;
CREATE TRIGGER trg_kg_relations_seq_update AFTER UPDATE ON kg_relations
FOR EACH ROW WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE kg_relations SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM kg_relations) WHERE source_id = NEW.source_id AND target_id = NEW.target_id AND relation_type = NEW.relation_type;
END;

-- ============================================================
-- 8. kg_relation_type_registry
-- ============================================================
CREATE TABLE IF NOT EXISTS kg_relation_type_registry (
  relation_type  TEXT PRIMARY KEY,
  inverse_name   TEXT,
  is_transitive  INTEGER,
  is_temporal    INTEGER,
  default_weight REAL,
  category       TEXT,
  description    TEXT,
  staleness_days INTEGER,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now')),
  seq            INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_kg_relation_type_registry_seq ON kg_relation_type_registry(seq);

DROP TRIGGER IF EXISTS trg_kg_relation_type_registry_seq_insert;
CREATE TRIGGER trg_kg_relation_type_registry_seq_insert AFTER INSERT ON kg_relation_type_registry
FOR EACH ROW WHEN NEW.seq = 0
BEGIN
  UPDATE kg_relation_type_registry SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM kg_relation_type_registry WHERE rowid != NEW.rowid) WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_kg_relation_type_registry_seq_update;
CREATE TRIGGER trg_kg_relation_type_registry_seq_update AFTER UPDATE ON kg_relation_type_registry
FOR EACH ROW WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE kg_relation_type_registry SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM kg_relation_type_registry) WHERE relation_type = NEW.relation_type;
END;

-- ============================================================
-- 9. trajectories
-- ============================================================
CREATE TABLE IF NOT EXISTS trajectories (
  task           TEXT NOT NULL,
  steps          TEXT,
  outcome        TEXT,
  insight        TEXT,
  project_id     TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT DEFAULT (datetime('now')),
  access_count   INTEGER DEFAULT 0,
  last_accessed  TEXT,
  machine_id     TEXT,
  seq            INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (task, created_at)
);
CREATE INDEX IF NOT EXISTS idx_trajectories_machine    ON trajectories(machine_id);
CREATE INDEX IF NOT EXISTS idx_trajectories_project    ON trajectories(project_id);
CREATE INDEX IF NOT EXISTS idx_trajectories_outcome    ON trajectories(outcome);
CREATE INDEX IF NOT EXISTS idx_trajectories_seq        ON trajectories(seq);

DROP TRIGGER IF EXISTS trg_trajectories_seq_insert;
CREATE TRIGGER trg_trajectories_seq_insert AFTER INSERT ON trajectories
FOR EACH ROW WHEN NEW.seq = 0
BEGIN
  UPDATE trajectories SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM trajectories WHERE rowid != NEW.rowid) WHERE rowid = NEW.rowid;
END;

DROP TRIGGER IF EXISTS trg_trajectories_seq_update;
CREATE TRIGGER trg_trajectories_seq_update AFTER UPDATE ON trajectories
FOR EACH ROW WHEN NEW.seq = OLD.seq
BEGIN
  UPDATE trajectories SET seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM trajectories) WHERE task = NEW.task AND created_at = NEW.created_at;
END;

-- ============================================================
-- Verification queries (run post-deploy via wrangler d1 execute)
-- ============================================================
-- 1. All 9 tables exist
-- SELECT name FROM sqlite_master WHERE type='table' AND name IN
--   ('sessions','agent_knowledge','memory_facts','pomodoro_sessions','decisions',
--    'kg_entities','kg_relations','kg_relation_type_registry','trajectories');
-- (Should return 9.)
--
-- 2. seq triggers exist (should be 18 — 9 INSERT + 9 UPDATE)
-- SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_%_seq_%';
--
-- 3. machine_id columns where required
-- PRAGMA table_info(sessions);  -- expect machine_id
-- PRAGMA table_info(kg_entities);  -- expect NO machine_id
