# Task description-line migration — dry-run report

**Date:** 2026-06-11 · **Status:** PREPARE-ONLY — NOTHING executed against prod.
**Engine:** deterministic parse (port of the proven project pipeline,
`Scratch/desc-migration-2026-06-10/pipeline.py`) + judgment layer.
**Parent migration:** project version ran 2026-06-10 (review doc:
`docs/superpowers/plans/2026-06-11-description-migration-review.md`).

All artifacts live in `Scratch/task-desc-migration-2026-06-11/` (gitignored):
`pipeline_tasks.py`, `raw_task_descriptions.json`, `spine.json`,
`proposed.json`, `apply.d1.sql`, `strip.d1.sql`.
The pipeline **ran NONE of the write SQL**.

---

## What this migration does

PB's BrainDB writes dated breadcrumb lines (`[YYYY-MM-DD] …`) into `tasks.description`
alongside static lead prose. This migration splits them:

- dated log lines → `activity_entries` rows (`entity_type='task'`, unified timeline v77)
- undated static prose (the "lead") stays in `tasks.description`
- `tasks.updated_at` is bumped on every stripped row so PB's next sync pull
  picks up the cleaned text (`tasks.description` is on the A3 mutations wire)

Writers were retargeted 2026-06-10 (P2-B). The 2026-06-10/11 window has
**zero new dated lines** (verified by the project pipeline run), making this
a one-time historical cleanup.

---

## Totals

| metric | count |
|---|---|
| tasks matched by dated-line query (input) | 592 |
| tasks with migrated entries | 576 |
| tasks with zero entries (empty bodies / anomalies) | 16 |
| &nbsp;&nbsp;of which: ANOMALY (double-encoded) — LEFT UNTOUCHED | 2 |
| &nbsp;&nbsp;of which: dated line existed but body was empty after parse | 14 |
| total `activity_entries` rows in `apply.d1.sql` | **903** |
| &nbsp;&nbsp;kind = `update` (update_type = `'progress'`) | 604 |
| &nbsp;&nbsp;of which: AUTO-INGESTED-EMAIL-METADATA (flagged, emitted) | 133 |
| &nbsp;&nbsp;kind = `completion` | 293 |
| &nbsp;&nbsp;kind = `blocker` (update_type = `'blocker'`) | 6 |
| tasks retaining a non-empty lead in `description` | 499 |
| tasks that will be NULL/empty after strip | 77 |

### Flag totals

| flag | count | meaning |
|---|---|---|
| AUTO-INGESTED-EMAIL-METADATA | 133 | System-generated lines (`Sender:`, `Gmail draft created`, `Auto-closed`, `User replied`, `Auto-test artifact`) emitted as `kind='update'` but flagged for Nick's review — see Open Question 1 |
| AT 50-CHAR CAPTURE LIMIT | 6 | Body is exactly 50 chars and ends mid-word (title-capture width). Kept VERBATIM, never completed. |
| DEDUP | 6 | Exact duplicate (same date + same text) collapsed to one entry. |
| SPLIT glued block | 12 | Undated `[Mon DD]` block glued by the continuation-line rule, split into its own dated entry (year inferred from parent date). |
| resolved undated lead | 0 | (none in tasks — no undated `[Mon DD]` blocks in leads that resolved unambiguously) |
| ANOMALY (double-encoded) | 2 | Quote-wrapped descriptions that parse to ZERO entries — LEFT UNTOUCHED. |

---

## Entry field mapping (every row in `apply.d1.sql`)

| field | value |
|---|---|
| `id` | `'bk_taskdescline_<sha1-12 of source_id>'` (deterministic, stable across re-runs) |
| `entity_type` | `'task'` |
| `entity_id` | the task's PK |
| `project_id` | `tasks.project_id` (nullable — tasks without a project get NULL) |
| `kind` | `'completion'` for completion-verb lines; `'blocker'` for waiting/blocked; else `'update'` |
| `update_type` | `'progress'` for updates; `'blocker'` for blockers; NULL for completions |
| `visibility` | `'team'` |
| `actor_slug` | `'nick-ingraham'` |
| `body` | VERBATIM line text minus the `[YYYY-MM-DD]` tag (and pure redundant human date tag if present) |
| `created_at` | `<date> 12:00:00` (civil date, noon-UTC placeholder) |
| `source_table` | `'task_description_line'` |
| `source_id` | `'<task_id>:<sha1-12 of the original line text>'` |

Idempotency: `INSERT OR IGNORE` against partial UNIQUE index `idx_ae_source(source_table, source_id)`.
A re-run produces exactly 903 rows on the first pass; subsequent passes add zero rows.

### Kind classification rules (tasks differ from projects — no ✓ / `[check]` markers)

- **`completion`** — body's first verb (after date/tag stripping) matches the completion token
  set: `Completed`, `Done`, `Reviewed`, `Sent`, `Archived`, `Replied`, `Emailed`,
  `Discussed`, `Verified`, `Finalized`, `Submitted`, `Shared`, `Published`, `Responded`,
  `Confirmed`, `Filed`, `Merged`, `Closed`, `Resolved`, `Deployed`, `Delivered`,
  `Posted`, `Uploaded` (case-insensitive).
- **`blocker`** — body starts with: `Waiting`, `Blocked`, `On hold`, `Pending` (case-insensitive).
  `update_type = 'blocker'`.
- **`update`** — everything else. `update_type = 'progress'`.
- Email-metadata lines (`Sender:`, `Gmail draft created`, `Auto-closed`, `User replied`,
  `Auto-test artifact`) → emitted as `kind='update'` but carry `"email_metadata": true`
  in `proposed.json` and are flagged in `flags[]` for Nick's review.

---

## The two anomalies (LEFT UNTOUCHED — manual handling needed)

Both task descriptions are double-encoded (quote-wrapped with literal `\n`/`\u` escape sequences).
The deterministic parser correctly sees zero entries at a line start. Auto-unescaping could corrupt.
Pipeline leaves these tasks UNTOUCHED (not in `apply.d1.sql` or `strip.d1.sql`):

- `task_01KTPR26V9R8XH8NK1QYEYFYB` — "R03: rebuild opening narrative per CLIF committee (lead with…)"
- `task_01KTPR27QTB7WRRRTNKF45AHD` — "R03: strengthen dependence-dimension justification (highest-…)"

Recommended: hand-fix the encoding (un-stringify), then re-run `pipeline_tasks.py` — both will
fold into `apply.d1.sql` / `strip.d1.sql` on the next pass automatically.

---

## Open questions for Nick

1. **Email-metadata lines (133 entries, 108 tasks):** Lines like `[2026-04-27] Gmail draft created — review and send`, `[2026-03-20] Sender: Steven Arriaza. Steven provided…`, `[2026-05-13] Auto-closed 2026-05-13 (Nick auth): …` are system-generated by the Gmail ingestion pipeline and Hub automations — not Nick's hand-written breadcrumbs. They are emitted into `activity_entries` as `kind='update'` (correct data class), but they may clutter the task activity timeline view. **Options:**
   - (a) Emit as-is into `activity_entries` (done in current `apply.d1.sql`).
   - (b) Suppress from the timeline view via a `metadata_json` flag or a separate `visibility` level.
   - (c) Collapse: replace all `Sender:` lines for a task with a single system entry "N email threads ingested [dates]".
   - Current `apply.d1.sql` implements option (a); options (b)/(c) require a pipeline re-run.
   Recommend: (a) first, then revisit in the Hub activity feed UI if they feel noisy.

2. **`kind='blocker'` (6 entries):** The 6 lines classified as `blocker` (`update_type='blocker'`) all start with "Waiting for…" or "Waiting on…". The `activity_entries` schema accepts `update_type='blocker'` per schema-v77. This is a new kind for task activity that doesn't exist in the project pipeline output. Confirm this is the right classification or collapse to `update` + `progress`.

3. **Strip bumps `updated_at`:** `strip.d1.sql` sets `updated_at = datetime('now')` on every stripped task. This means 576 tasks will appear as "recently updated" to PB's sync pull — which is intentional (picks up the clean description) but produces a large sync batch. If PB sync has a per-run row limit, consider running strip in batches of ~100 tasks.

4. **Null vs empty string on strip:** Tasks whose entire description was dated lines (77 tasks) get `description = NULL` after strip (not `''`). The PB mutations wire and Hub task renderers should handle NULL description gracefully — verify before executing.

---

## Execution runbook (next session)

> **Pre-condition:** Writers retargeted 2026-06-10 (P2-B) — zero new dated lines expected since.
> Re-verify by re-running the snapshot query and diffing against `raw_task_descriptions.json`
> before executing. If new lines appeared, re-run `pipeline_tasks.py` to regenerate the SQL.

### Step 1 — Snapshot (read-only backup)

```
./scripts/wrangler-d1 d1 execute mnccore-lab --remote --json \
  --command "SELECT id, title, description, updated_at FROM tasks \
    WHERE deleted_at IS NULL \
    AND (description LIKE '%[2026-%' OR description LIKE '%[2025-%' \
         OR description LIKE '%[2024-%') ORDER BY id" \
  > Scratch/task-desc-migration-2026-06-11/snapshot_pre_strip.json
```

D1 Time-Travel (30 days) is the second backstop. Restore = one
`UPDATE tasks SET description = <snapshot.description>, updated_at = <snapshot.updated_at> WHERE id = <id>;`
per row.

### Step 2 — (Optional) Re-run pipeline delta

If any time has passed since this dry run, re-pull `raw_task_descriptions.json` (same SELECT
as the fetch step above, save over the existing file) and re-run:

```
python Scratch/task-desc-migration-2026-06-11/pipeline_tasks.py
```

This regenerates `apply.d1.sql` and `strip.d1.sql` covering any new dated lines.
Idempotency guarantee: re-running `apply.d1.sql` against a D1 that already has some
entries adds only the new rows (INSERT OR IGNORE on `source_table + source_id`).

### Step 3 — Apply entries (test first, then prod)

```
scripts/wrangler-d1 d1 execute mnccore-lab-test --remote \
  --file=Scratch/task-desc-migration-2026-06-11/apply.d1.sql

scripts/wrangler-d1 d1 execute mnccore-lab --remote \
  --file=Scratch/task-desc-migration-2026-06-11/apply.d1.sql
```

Verify spot-check on prod:

```
scripts/wrangler-d1 d1 execute mnccore-lab --remote --json \
  --command "SELECT COUNT(*) FROM activity_entries WHERE source_table = 'task_description_line'"
```

Expected: 903 (or higher if new lines were added since dry run).

### Step 4 — Nick eyeballs the activity feed

Check 3–5 tasks in the Hub UI (`/api/tasks/:id/activity` or the task detail panel)
— confirm the timeline reads correctly for a mix of: (a) a task with email-metadata lines,
(b) a task with completion entries, (c) a task with a retained non-empty lead.

**Do NOT proceed to Step 5 until Nick signs off.**

### Step 5 — Strip descriptions (prod last)

```
scripts/wrangler-d1 d1 execute mnccore-lab-test --remote \
  --file=Scratch/task-desc-migration-2026-06-11/strip.d1.sql

scripts/wrangler-d1 d1 execute mnccore-lab --remote \
  --file=Scratch/task-desc-migration-2026-06-11/strip.d1.sql
```

Post-strip verification:

```
scripts/wrangler-d1 d1 execute mnccore-lab --remote --json \
  --command "SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL \
    AND (description LIKE '%[2026-%' OR description LIKE '%[2025-%' \
         OR description LIKE '%[2024-%')"
```

Expected: 0 (or 2 if the two anomaly tasks still have their double-encoded descriptions,
which is correct — they are intentionally left untouched).

### Step 6 — PB sync pull

After strip, run `python scripts/db/sync.py pull` on PB to pick up the cleaned
task descriptions. The 576 bumped `updated_at` timestamps will trigger cache refreshes.

---

## Rollback

If anything goes wrong:

1. **Undo apply** (before strip): `DELETE FROM activity_entries WHERE source_table = 'task_description_line';`
   (safe — no FK references; D1 Time-Travel as backstop).
2. **Undo strip** (after strip): restore each row from `snapshot_pre_strip.json`:
   one `UPDATE tasks SET description = <original>, updated_at = <original_updated_at> WHERE id = <id>;` per row.
   Script that with the snapshot JSON to generate a restore SQL file.

---

## ✅ EXECUTION RECORD — 2026-06-11 (run by Claude, Nick-approved gate answers)

**Gate answers (Nick, 2026-06-11):** ① email-metadata lines EMIT AS-IS (option a);
② blocker classification KEPT; ③ batching NOT NEEDED (verified: PB pull paginates at
2,000 rows/page — 576 bumped tasks fit one page, `hub.py:1605`); ④ NULL descriptions
verified safe (all `(title || description)` sites guarded by title; prod has 0
null/empty titles; PB pull has explicit `is not None` guard at `hub.py:2255`).

**Execution (all via `scripts/wrangler-d1`, test → prod):**

1. **Delta check:** re-pull was byte-identical to the dry-run snapshot (592 rows,
   0 added/removed/changed) — source confirmed dead; no pipeline re-run needed.
2. **Pre-strip snapshot:** `snapshot_pre_strip.json` (592 rows incl. `updated_at`).
3. **Apply:** 903 entries inserted (transaction wrapper stripped → `apply.d1.notx.sql`;
   D1 rejects `BEGIN TRANSACTION`, `--file` is atomic anyway).
4. **Blocker normalization:** the 6 blocker rows were emitted as stored `kind='blocker'`
   — OFF-ENUM (Rule 70 / `shared/activityKinds.ts` STORED_KINDS). Normalized to the
   contract-correct shape `kind='update', update_type='blocker'` in test+prod — the
   classification is fully retained in `update_type` (its documented home).
5. **API spot-check (live):** `/api/tasks/:id/activity` verified on email-metadata,
   completion, and blocker tasks — correct kinds, actor `nick-ingraham`, dated noon-UTC
   timestamps.
6. **Strip:** 576 UPDATEs applied. Residual sweep found 18 muddied tasks the pipeline
   missed, in 3 classes (`residual_cleanup.py` → `residual.sql`, same id/source_id
   conventions): **A** (14) trailing empty dated stubs `[YYYY-MM-DD] ` — stripped, 3
   stub-only tasks → NULL; **B** (3) double-encoded JSON-string descriptions (the
   anomaly class — note: the 2 tasks flagged in this report were ALREADY clean in prod;
   their wikilink `[[2026-06-09_…]]` merely matches the LIKE filter; the REAL
   double-encoded tasks were these 3 `"Sender:…"` ones) — decoded, 1 real entry each
   migrated, lead kept; **C** (1) tagged dated line `[2026-03-26 mechanic]` the
   `^\[YYYY-MM-DD\]` regex missed — migrated + stripped.
7. **Final counts (prod):** `activity_entries` source_table='task_description_line'
   = **907** (604 update/progress + 6 update/blocker + 293 completion + 4 residual);
   line-start dated descriptions = **0**; LIKE matches = **2** (the wikilink
   false-positives, intentionally untouched).
8. **PB pull:** 591 received / 590 applied / 1 dedup. brain.db `notes` residue: the
   pull's `is not None` guard skips NULL descriptions, so 79 stripped-to-NULL tasks
   kept old dated text in local `notes` — cleared via targeted local UPDATE gated on
   `notes == pre-strip description` (notes is PB-local since the 0.4.0 wire-alias
   retirement; content preserved in activity_entries + snapshots). 7 pre-existing
   PB-local dated notes (tasks outside this migration) left as-is.

**Rollback unchanged:** `DELETE FROM activity_entries WHERE source_table='task_description_line'`
+ per-row restore from `snapshot_pre_strip.json`.
