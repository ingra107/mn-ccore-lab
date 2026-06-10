# activity_log → activity_entries backfill report

**Date:** 2026-06-10 · **Executor:** Builder (smart session) · **Scope:** Phase-2 legacy
`activity_log` backfill into the unified `activity_entries` timeline (schema v77).
**DB:** prod `mnccore-lab` (`b8453e9b-7c5f-4029-b07d-dd89c05d00cf`), via the sanctioned
`scripts/wrangler-d1` wrapper. **No code deploy** — pure idempotent data INSERTs.

## TL;DR

- Source `activity_log` = **22,220 rows**. After type-by-type mining + the spec's hard rule
  (do NOT backfill rows for entities that no longer exist in prod) + test-artifact filtering,
  the genuinely importable set was **30 rows**: real task **completions** on tasks that still
  exist in prod.
- Imported **30** `kind='completion'` task entries (29 actor `nick-ingraham`, 1 `anonymous`).
  29 map to live tasks, 1 to a soft-deleted task (still present in prod, surfaces if restored).
- `activity_entries` went **3 → 33**. The pre-existing 3 (Phase-1, `source_table='task_updates'`)
  are untouched.
- Idempotency PROVEN: a second prod run of the exact same batch wrote 0 rows (count stayed 33).
- The vast majority of `activity_log` is unrecoverable or noise: machine field-change logs
  (10,255), telemetry (pb_session/sync/digest 8,427), tombstones of hard-deleted entities
  (task_delete/project_delete 682), body-less comment stubs (201, bodies cascade-wiped), and
  heavy SYNCTEST/INSPECTION/AUDIT/WORKFLOW test contamination throughout.

## Why so few real rows survived

`activity_log` is a 22K-row firehose, but most of its content-bearing rows point at entities
that were **hard-deleted** (their FK-cascade wiped the real bodies in `task_comments`/
`task_updates`), or are **machine-generated** field-change logs, or are **test artifacts**.
The Design-C Phase-1 rule is explicit: orphan timeline rows for nonexistent entities render
nowhere, so they must be skipped. The only durable human history that (a) still attaches to a
live task/project entity AND (b) carries non-test content turned out to be the completion events.

## Per-type IMPORT / SKIP table

| activity_log type | rows | decision | reason |
|---|---:|---|---|
| `project_update` | 10,266 | **SKIP** | 10,255 = "Updated project fields: …" machine field-change noise; the 31 "Posted update on …" rows are ALL test artifacts ("INSPECTION update — delete", "WORKFLOW-TEST", "QA test update — delete me"). 0 real human updates. |
| `pb_session` | 7,421 | **SKIP** | Pomodoro/session telemetry. No feed surface. |
| `task` (combined) | 1,953 | **PARTIAL → 30 imported** | Sub-buckets below. |
| &nbsp;&nbsp;↳ `Completed: "…"` | 408 | **IMPORT (30)** | Real completion events → `kind='completion'`. Only **30** map to a task still in prod (29 live + 1 soft-deleted); the other 378 point at hard-deleted tasks → skipped per spec. 1 task had 2 completions (re-completed after reopen) — both kept (distinct events). |
| &nbsp;&nbsp;↳ `Created task: "…"` | 626 | **SKIP** | System creation events; low value, very noisy, and the live-entity ones are already represented by the task itself. Not human messages. |
| &nbsp;&nbsp;↳ `Status → X: "…"` | 348 | **SKIP** | Machine status-transition logs (`kind='system'` candidates) — high noise, no human content, would clutter feeds. |
| &nbsp;&nbsp;↳ `Bulk delete/complete: N tasks` | 524 | **SKIP** | `related_id` is NULL → no entity to attach to. |
| &nbsp;&nbsp;↳ OTHER (PB capture / Acknowledged / Mobile→Hub) | 47 | **SKIP** | 100% test/inspection probes (AUDIT-TEST, INSPECTION TEST, SYNCTEST). |
| `sync` | 960 | **SKIP** | Sync telemetry. |
| `task_delete` | 586 | **SKIP** | Tombstones of hard-deleted tasks. |
| `comment` | 201 | **SKIP** | Body-less stubs ("Commented on task"). Real bodies lived in `task_comments`, cascade-wiped on entity delete → **unrecoverable**. |
| `meeting` | 168 | **SKIP** | `related_type='meeting'`. No task/project feed surface. |
| `agenda` | 115 | **SKIP** | `related_type='meeting'`. No feed surface. |
| `task_update` | 107 | **SKIP** | The 3 rows that map to live tasks are EXACT duplicates (same entity_id + body + timestamp) of the Phase-1 `task_updates`-sourced rows already in `activity_entries` — importing would create visible double notes. The other 104 are dead tasks or test artifacts (INSPECTION/SYNCTEST/SYNC-COMMENTS/JOURNEY-LIFECYCLE). |
| `project_delete` | 96 | **SKIP** | Tombstones of hard-deleted projects. |
| `project` | 62 | **SKIP** | "Created project: …"; **0** map to a project still in prod, and all visible ones are test artifacts (smoke / Deep Audit Sync Probe / BlankCmt / Overlap Trap / Collider). |
| `idea` | 46 | **SKIP** | `related_type='idea'`. No feed surface. |
| `digest` | 46 | **SKIP** | Email digest telemetry. |
| `subtask_created` | 44 | **SKIP** | 0 map to a live task. System events anyway. |
| `decision` | 26 | **SKIP** | `related_type='decision'`. No feed surface; doesn't attach to a live project. Many are "INSPECTION decision — delete". |
| `team_update` | 19 | **SKIP** | `related_type='team_member'`. No feed surface. |
| `pi_change` | 19 | **SKIP** | Only 2 map to live projects, and both are machine slug-canonicalization noise ("PI: nick → nick-ingraham"). No human content. |
| `decision_outcome` | 17 | **SKIP** | "Outcome recorded for decision" stubs; no body; decision entity. |
| `question` | 17 | **SKIP** | `related_type='question'`. No feed surface. |
| `paper_link` | 10 | **SKIP** | `related_type='paper'`. No feed surface. |
| `action_item` | 10 | **SKIP** | `related_type='action_item'`. No feed surface. |
| `dependency_created` | 8 | **SKIP** | 0 map to a live project; system event. |
| `subtask_completed` | 8 | **SKIP** | System event; no live-entity content. |
| `revision` | 7 | **SKIP** | `related_type='revision'`. No feed surface. |
| `task_handoff` | 5 | **SKIP** | 0 map to a live task. |
| `inbox_event` | 5 | **SKIP** | `related_type='inbox_event'`. No feed surface. |
| `answer` | 4 | **SKIP** | `related_type='question'`. No feed surface. |
| `document_link` | 4 | **SKIP** | `related_type='project_document'`. No feed surface. |
| `dispatch` / `stage_change` / `reflection` / `pomodoro` / `plan` | 5 | **SKIP** | Long-tail telemetry / 0 live-entity mappings. |
| **TOTAL** | **22,220** | **30 imported** | |

## Mapping applied to imported rows

- `entity_type='task'`, `entity_id = activity_log.related_id`, `kind='completion'`, `visibility='team'`.
- `project_id` = the live task's stored typed `proj_*` PK (derived via JOIN; NULL where the task has no project) — consistent with the tasks.project_id storage contract.
- `body = 'completed this task'` (renders as "<name> — completed this task" in `CompletionEntry`,
  `src/components/tasks/detail/TaskActivityFeed.tsx`; body is NOT NULL so a value is required).
- `actor_slug`: `ingra107@umn.edu` → `nick-ingraham` (LUT confirmed in `team_members`: that email's
  slug is `nick-ingraham`). 6 rows were already `nick-ingraham`. 1 row was `anonymous` (content
  "Approve: MECHANIC: I46 …"; actor not reliably derivable → kept `anonymous` per the don't-guess rule).
- `created_at`: preserved verbatim from `activity_log.timestamp` (no `datetime('now')`).
- `source_table='activity_log'`, `source_id = activity_log.id`; `id = 'ae_bf_<activity_log.id>'`.

## 5 sample imported entries

| activity_entries.id | entity_id | actor | created_at | original activity_log description |
|---|---|---|---|---|
| `ae_bf_78e887d8a8b6c638f3974777e327b304` | `task_01KT67DHHNDAZB26WCFDE0BE47` | nick-ingraham | 2026-06-10 18:44:59 | Completed: "Provide input to Andrew Olson on Prenosis for STOP-ARDS studies" |
| `ae_bf_8d04d6d971f6afab047466c0cfa712c6` | `task_01KP9FM307KR2AKWYJJEFVH51X` | nick-ingraham | 2026-06-10 18:44:42 | Completed: "Check microorganism table populated with no-growth; re-ETL if needed" |
| `ae_bf_7c7d0994f42dab2710acaf969164463e` | `task_01KTNNT14FEZ03AD3FBK21ZVSW` | nick-ingraham | 2026-06-10 18:44:05 | Completed: "Provide vacation/academic time for Stop Sepsis IOD schedule (July-Dec)" |
| `ae_bf_37cc4f0206ff8c3edba6c57d43d6621f` | `task_01KTRWFVRQQ3FE99PGT919VQ5A` | nick-ingraham | 2026-06-10 18:43:16 | Completed: "Rerun Sepsis Definitions" |
| `ae_bf_f43cb59204f01a864ce2261f5e9d6882` | `task_01KTRXWY5YWHXWHYJK7HEMK221` | nick-ingraham | 2026-06-10 18:43:10 | Completed: "Take VA HIPPA TMS Training" |

## Verification

1. **Rehearsed on `mnccore-lab-test` first** — ran the 30-statement batch: run 1 inserted 30,
   run 2 inserted 0 (idempotency), verified the inserted row shape, then deleted the 30 test rows.
2. **Prod counts:** before = 3 total / 0 activity_log-sourced → after run 1 = 33 / 30 →
   after run 2 (re-run) = 33 / 30. **Idempotency proven in prod** (second run wrote 0).
3. **Pre-existing untouched:** the 3 `source_table='task_updates'` rows (Phase-1) still present
   with original bodies after both runs.
4. **Live API render** (`curl` with `PB_API_KEY`):
   - `GET /api/tasks/task_01KT67DHHNDAZB26WCFDE0BE47/activity` → returns the backfilled completion.
   - `GET /api/tasks/task_01KP9FM307KR2AKWYJJEFVH51X/activity` → returns the backfilled completion.
   - `GET /api/tasks/task_01KTNNT14FEZ03AD3FBK21ZVSW/activity` → returns the backfilled completion.
   - `GET /api/projects/cci-in-ards/activity` → derived task-completion rollup includes the
     backfilled row (proves the project-feed derived rollup works for backfilled task rows).

## Rollback

```sql
DELETE FROM activity_entries WHERE source_table='activity_log';
```

This removes ALL 30 backfilled rows and nothing else (the Phase-1 rows are `source_table='task_updates'`).

## Snapshot / reversibility

Pre-backfill full snapshot of `activity_entries` (the 3 Phase-1 rows) exported to
`Scratch/activity_entries_snapshot_pre.json` (gitignored). The backfill is reversible via the
DELETE above; the snapshot covers anything that pre-existed.

## Ambiguous / deliberately-NOT-imported — for Nick to decide

These are real-ish data but I chose NOT to import them. Flagging so you can override:

1. **378 `Completed:` rows on hard-deleted tasks** — real completions, but the tasks are gone, so
   the entries would render nowhere (spec forbids orphan rows). Not recoverable to a surface.
2. **626 `Created task:` + 348 `Status → X:` task system events** — these COULD become
   `kind='system'` rows on the ~30 live tasks, but they're machine events, not human messages, and
   would add noise (e.g. "Created task / Status → in_progress / Completed" triplets) to feeds that
   currently show only the completion. I judged the signal not worth the clutter. Say the word if you
   want the system events on live tasks too — it's a one-query addition keyed the same way.
3. **3 `task_update` notes that map to live tasks** — NOT imported because they are byte-identical
   duplicates of the 3 Phase-1 rows already in the timeline (same entity, body, timestamp). Importing
   would double them. (This is the right call, not a gap.)
4. **201 `comment` stubs** — bodies were cascade-wiped on entity delete and are genuinely
   unrecoverable from `activity_log` (it only stored "Commented on task", never the text). Nothing to import.
5. **decisions / ideas / questions / meetings / papers** — carry real text but their entities have
   no task/project feed surface in the UI, and they don't honestly attach to a live project, so per
   the spec they were skipped. If a future phase adds those feed surfaces, they could be revisited.
