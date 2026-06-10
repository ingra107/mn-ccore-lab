# Activity Entries — Unified Timeline (Design C, schema-v77)

**Date:** 2026-06-10 · **Status:** APPROVED (Nick, brainstorm 2026-06-10) · **Supersedes the target-store
choice of:** `Scratch-handoff/2026-06-10-task-message-surfaces-handoff.md` (Design A `task_messages`)
and `docs/superpowers/plans/2026-05-26-m5-timeline-build-plan.md` Task A2 "extend activity_log"
(Design B). Everything else in those docs (capability census, consumer lists, leak-removal phases,
snapshot doctrine, cross-repo lockstep) survives and is referenced, not duplicated.

**Inputs:** `Scratch-handoff/2026-06-10-HUB-SESSION-BRIEF.md` §1 (Nick's binding requirements) + §2
(codex referee ruling, spot-verified); brainstorm answers 2026-06-10 (all four open questions).

## Ground truth (live prod D1, 2026-06-10 this session)

- Schema high-water **v76** (`bug_reports` present; no `activity_entries`).
- Row counts: `task_comments` 0 · `task_updates` 3 (all nick-ingraham, `progress`) · `comments` 2 ·
  `project_updates` 0 · `activity_log` 22,220.
- **160-vs-3 discrepancy RESOLVED:** PB mirror `d1_task_updates` has 163 rows across 154 tasks
  (2026-04-08→06-10); only 3 of those tasks still exist in prod (0 soft-deleted). The other 151 were
  hard-deleted and `task_updates`' `ON DELETE CASCADE` FK wiped their updates. The mirror is
  append-only history of dead tasks. **Backfill scope = the 3 live prod rows.** Mirror disposition =
  Phase 2 (do not backfill rows for nonexistent tasks).

## Decisions (brainstorm, 2026-06-10)

1. **Kind enum — referee spelling.** Stored `kind`: `comment | update | completion | system`,
   defined once in `shared/activityKinds.ts` (API + UI import the one file). Project feeds render
   **derived** kinds `task-comment | task-update | task-completion | task-system` computed from
   `entity_type='task'` — never stored. `update_type` sub-kinds for `kind='update'`:
   `progress | blocker | result | question | session` (matches current UI labels).
2. **@me — prefix + UI toggle.** Body starting `@me ` (or `@me` at end) → `visibility='author'`,
   prefix stripped from stored body. Composer also gets an explicit visibility toggle setting the
   same column. Reads are SQL-gated at every chokepoint: `visibility='team' OR actor_slug = <current>`.
   Never client-side-only hiding. This retires the M5 privacy-split argument (column policy, no table).
3. **Rollups — derived, all kinds.** Task entries store `project_id` at write time. Project feed =
   one query: `(entity_type='project' AND entity_id=?) OR (entity_type='task' AND project_id=?)`,
   newest-first, filter pills. ALL task activity shows by default (Nick's "whole picture").
   Materialized rollup rows only if derived rendering is measurably slow (Phase 2+, not now).
4. **Title-click → full editor** (UI quick-fix, independent of the store): clicking a task TITLE on
   My Tasks (all 3 views) opens the full task editor modal. Body-click elsewhere keeps the existing
   expand/drawer semantics; status circle still completes (Rule 58/68 click semantics extended, not
   replaced). Today audited for the same gesture.

## Schema (api/schema-v77.sql)

```sql
CREATE TABLE activity_entries (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,          -- 'task' | 'project' (extensible)
  entity_id TEXT NOT NULL,
  project_id TEXT,                    -- derived at write for task rows; = entity_id for project rows
  kind TEXT NOT NULL,                 -- comment | update | completion | system (activityKinds.ts)
  visibility TEXT NOT NULL DEFAULT 'team',  -- team | author
  actor_slug TEXT NOT NULL,
  body TEXT NOT NULL,
  mentions_json TEXT,
  update_type TEXT,                   -- sub-kind when kind='update'
  metadata_json TEXT,
  source_table TEXT,                  -- backfill idempotency
  source_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ae_entity ON activity_entries(entity_type, entity_id, created_at DESC, id DESC);
CREATE INDEX idx_ae_project ON activity_entries(project_id, created_at DESC, id DESC);
CREATE INDEX idx_ae_recent ON activity_entries(created_at DESC, id DESC);
CREATE UNIQUE INDEX idx_ae_source ON activity_entries(source_table, source_id)
  WHERE source_table IS NOT NULL;
```

UTC stored (`datetime('now')`), rendered viewer-local via `time.ts` chokepoints
(`parseDbUtc`/`formatDbLocal`). Cursor = compound `(created_at, id)` — fixes the timestamp-only
skip class codex flagged.

## Write path — ONE primitive

`postActivityEntry()` (api/lib/activity-entry.ts) owns: auth/actor resolution, project visibility
guard, `@me` policy, mentions parse + notifications, Hermes (`@hermes|@claude`) dispatch +
placeholder, `project_id` derivation for task rows, `source_table/source_id` idempotency, link-chip
body passthrough (rendering keeps `LinkifiedText`/`classifyUrl` — Nick loves the chips).
Direct `INSERT INTO task_updates / task_comments` dies (tasks.ts:1204-1206 region;
pb-sector.ts:615-618 Hermes writer → `postActivityEntry(kind='comment', actor_slug='claude-ai')`).

## Read path — projections, not client migrations

`/api/tasks/:id/comments`, `/api/tasks/:id/updates`, `/api/task-comments/recent`,
`/api/task-updates/recent` become projections over `activity_entries` (preserve response shapes;
`/recent` feeds gain the compound cursor while honoring the old `since` param). PB's
`process_hub_comments.py` keeps working unmodified until the PB session repoints it.
`TaskActivityFeed`'s 3-way client merge is DELETED → one activity query.
`activity_log` (22,220 rows) stays alive as legacy compat read ONLY — never extended, never the
target. Legacy backfill = Phase 2.

## Phase boundaries

**Phase 1 (this session):** v77 table + `shared/activityKinds.ts` + `postActivityEntry()` +
projections + Hermes retarget + backfill (3 rows, snapshot-gated per M5 A1 doctrine: export +
restore drill) + task feed unification + project feed derived rollup + notes wire-alias ride-along.
**Phase 2+ (deferred):** legacy `activity_log` backfill; `comments`(2)+`project_updates`(0)
backfill + project composer retarget; nightly Haiku `[YYYY-MM-DD]` description-line migration
(then DELETE `descriptionLog.ts`); PB lockstep leak removal (M5 C/D — PB session owns);
mirror-table disposition; physical drops after alias traffic confirms unused.

## Description doctrine (unchanged from M5/addendum)

Description = static one-time summary; dated log lines are mislabeled activity, migrated nightly
(Phase 2), never big-bang. Plain `description` stays canonical.
