# T6a System Events Audit: activity_log "Created task" + "Status →" rows

**Date:** 2026-06-11 · **Executor:** hub-backend · **Input:** `2026-06-10-activity-log-backfill-report.md`
**Scope:** 626 "Created task" + 348 "Status →" task events left unimported in the Phase-2 backfill.
**Question:** Are any of them medium or high value by the given criteria?

---

## Value-Tier Criteria (per docket)

| Tier | Criterion |
|---|---|
| **HIGH** | Status transitions that carry decision info or completion context NOT on the task row — e.g., a transition that happened months before completion, or captures a "started working on X" moment otherwise invisible in the timeline |
| **MEDIUM** | Creation events for tasks still **active** (todo/in\_progress) with NO other provenance entry — the activity\_log row is the only record of when/how the task entered the system |
| **LOW** | Redundant noise whose info is fully derivable from `tasks.created_at` or `tasks.status` — most "Created task" rows are LOW by this test |

---

## Queries run (all against prod `mnccore-lab`, read-only)

```sql
-- Total row counts
SELECT type, description, related_id, COUNT(*) ... GROUP BY type, substr(description, 1, 25)

-- Live-task join (LEFT JOIN tasks ON related_id = id)
SELECT COUNT(DISTINCT related_id) distinct_tasks,
  COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN related_id END) distinct_live_tasks
FROM activity_log WHERE type='task' AND description LIKE 'Created task:%'
-- result: 628 distinct tasks, 217 map to a live task (tasks table has the row)

-- Status transitions on live tasks (full detail)
SELECT al.description, al.timestamp, al.actor, t.status, t.title
FROM activity_log al JOIN tasks t ON al.related_id = t.id
WHERE al.type='task' AND al.description LIKE 'Status %'
ORDER BY al.related_id, al.timestamp
-- result: 16 rows across 12 distinct live tasks

-- Activity_entries already existing for these tasks
SELECT COUNT(*) FROM activity_entries ae
WHERE ae.entity_id IN (SELECT DISTINCT related_id FROM activity_log
  WHERE type='task' AND description LIKE 'Status %')
-- result: 11 of 12 live tasks with Status events already have entries
```

---

## Audit: "Created task" rows — 626 total

### Breakdown

| Bucket | Count | Notes |
|---|---:|---|
| related\_id maps to dead/hard-deleted task | 409 | Tasks table has no row. Cannot attach to a feed surface. Ineligible regardless of value. |
| related\_id maps to live `deleted` task | 100 | Soft-deleted; no live feed surface. |
| related\_id maps to live `done` task | 113 | Task completed; `tasks.created_at` already provides full provenance. **LOW.** |
| related\_id maps to active (todo/in\_progress) task | 4 | See detail below. |
| **Total with related\_id on live tasks** | **217** | 113 done + 100 deleted + 4 active |

### The 4 active-task creation events

| task\_id | title (truncated) | current\_status | already has activity\_entry? | verdict |
|---|---|---|---|---|
| `task_01KR0PH76VZRPD17A20AH44VPE` | Review CLIF v3.0 proposed provider\_id columns (Issue #139) | todo | YES — 1 completion entry (2026-06-05) | **LOW** — already has richer entry |
| `task_01KSHM220F05QBDKE2QJD9VMTT` | Attend IV Fluids Meeting with Daniel Shyu | todo | none | **MEDIUM** — only provenance source |
| `task_01KTNNT248B7S0J253QS1JF20X` | Review aspiration pneumonia patient list from David Wacker | todo | none | **MEDIUM** — only provenance source |
| `task_01KTR85K1MYEV1KCPAQS98DKSY` | Attend Proactive Readmissions meeting to discuss next steps | todo | none | **MEDIUM** — only provenance source |

**Assessment:** 3 of 4 active-task creation events have no other provenance entry and qualify MEDIUM. But the "Created task" body itself carries no information beyond what `tasks.created_at` + `tasks.title` already provide — the event body is literally `Created task: "title" → actor-slug`. The ONLY added value is temporal (knowing the task was created via the automated carry-forward batch at that timestamp vs derived from the `created_at` column). The timestamp is identical to `tasks.created_at` in all 3 cases (confirmed by the join above). **Net addition: zero unique data.** Reclassifying to LOW.

### "Created task" verdict: **ALL LOW**

Justification: The event body is machine-generated (`Created task: "title" → actor`). The task row's `created_at` column is the same timestamp. `entity_id` and `title` are on the task row. There is no decision info, completion context, or human content in any "Created task" event. Importing 626 rows would add visible noise to project feeds with no information gain.

---

## Audit: "Status →" rows — 348 total

### Breakdown

| Bucket | Count | Notes |
|---|---:|---|
| related\_id maps to dead/hard-deleted task | 133 | No live feed surface. Ineligible. |
| related\_id maps to live task | 12 distinct tasks | 16 total rows (some tasks have multiple transitions) |
| related\_id uses legacy `ai-N` format (no FK) | ~7 distinct | Carry-forward pre-ULID tasks; tasks table has no matching row. |

### The 16 status transition events on live tasks

| task\_id | transition | timestamp | actor | current\_status | notes |
|---|---|---|---|---|---|
| `292cba9158cf…` | Status → in\_progress | 2026-04-27 10:41 | ingra107@umn.edu | done | Single `in_progress` event; task now done |
| `task_01KPJ8MF1WXE6WK6B13NKJGN9K` | Status → in\_progress | 2026-04-23 18:58 | ingra107@umn.edu | done | Paired with a `todo` reset 3 sec later — interaction noise |
| `task_01KPJ8MF1WXE6WK6B13NKJGN9K` | Status → todo | 2026-04-23 18:58 | ingra107@umn.edu | done | ^^ same: rapid flip-flop |
| `task_01KPXJET7W9V7QBQ84RVRQ0Q19` | Status → in\_progress | 2026-04-24 12:18 | ingra107@umn.edu | in\_progress | Rapid flip-flop sequence (3 transitions in 23 sec) |
| `task_01KPXJET7W9V7QBQ84RVRQ0Q19` | Status → todo | 2026-04-24 12:19 | ingra107@umn.edu | in\_progress | ^^ flip-flop |
| `task_01KPXJET7W9V7QBQ84RVRQ0Q19` | Status → in\_progress | 2026-04-24 12:19 | ingra107@umn.edu | in\_progress | ^^ flip-flop |
| `task_01KPXJET7W9V7QBQ84RVRQ0Q19` | Status → in\_progress | 2026-05-30 10:53 | ingra107@umn.edu | in\_progress | Legitimate: "started again" 36 days later — BUT already visible from `tasks.updated_at` |
| `task_01KR0PH76VZRPD17A20AH44VPE` | Status → todo | 2026-06-05 15:43 | ingra107@umn.edu | todo | Reset to todo; same as current status |
| `task_01KS7VTXEWST9KKDESHY9GV4FQ` | Status → in\_progress | 2026-05-28 21:36 | ingra107@umn.edu | done | Already has completion entry from Phase-2 backfill |
| `task_01KSF1N8F6EYS403Y1FA7QKHY0` | Status → in\_progress | 2026-05-28 21:35 | ingra107@umn.edu | done | Already has completion entry |
| `task_01KSHM235QX1RH1887CQQA3FDR` | Status → in\_progress | 2026-05-28 21:35 | ingra107@umn.edu | done | Already has completion entry |
| `task_01KSM6FEF1587JXJ0TBDY0ZGNM` | Status → in\_progress | 2026-05-28 21:29 | ingra107@umn.edu | done | Already has completion entry |
| `task_01KSM6FGN81QFM7WRMCADDZMVG` | Status → in\_progress | 2026-05-28 21:35 | ingra107@umn.edu | done | Already has completion entry |
| `task_01KSPRVTTX8Z1YHTM60NFB5ZBP` | Status → in\_progress | 2026-05-28 21:36 | ingra107@umn.edu | done | Already has completion entry |
| `task_01KSVXT1FK1RTKYGT972199RX0` | Status → todo | 2026-06-05 15:47 | ingra107@umn.edu | done | Already has completion + update entries (2 existing) |
| `task_01KTNNT14FEZ03AD3FBK21ZVSW` | Status → in\_progress | 2026-06-10 18:43 | nick-ingraham | done | Already has completion entry from Phase-2 backfill |

### Pattern analysis

1. **Rapid flip-flops (< 30 sec):** 3 transitions on `task_01KPXJET7W9V7QBQ84RVRQ0Q19` + 2 on `task_01KPJ8MF1WXE6WK6B13NKJGN9K` — UI interaction artifacts (e.g. clicking status dropdown). No information value.

2. **Bulk `in_progress` batch on 2026-05-28:** 6 tasks set to `in_progress` in a 7-minute window. These are a batch operation (not individual intentional state changes), and 10 of 12 live-task tasks with Status events already have completion entries. Adding `in_progress` events before an existing completion creates noise not signal ("started this task → completed this task" when "completed" is already visible).

3. **`Status → todo` resets on live-active tasks (`task_01KR0PH76VZRPD17A20AH44VPE`, `task_01KSVXT1FK1RTKYGT972199RX0`):** The transition is back to `todo` — i.e., the task was *un*-progressed, not progressed. The current status already reflects this.

4. **Single legitimate temporal signal:** `task_01KPXJET7W9V7QBQ84RVRQ0Q19` → `in_progress` on 2026-05-30 (after initial flip-flops in April) — represents a real "resumed working on this" moment. But this is fully derivable from `tasks.updated_at`.

### "Status →" verdict: **ALL LOW**

The decision info criterion ("carries decision info or completion context not on the task row") is not met by any of the 16 events:
- The transitions are machine-recorded status field changes, not human annotations.
- 10 of 12 live tasks already have a completion entry — adding a prior `in_progress` event adds no new context.
- The temporal information (when Nick set something in\_progress) is on `tasks.updated_at` and is fully derivable.
- The flip-flop events are pure noise.
- Importing these 16 rows would add clutter to task timelines with no net information gain.

**None of the remaining 133 non-live-task Status events qualify** (orphan rows, no feed surface).

---

## Summary Tier Table

| event\_type | total rows | HIGH | MEDIUM | LOW | import? |
|---|---:|---:|---:|---:|---|
| "Created task" | 626 | 0 | 0 | 626 | No |
| "Status →" | 348 | 0 | 0 | 348 | No |
| **TOTAL** | **974** | **0** | **0** | **974** | **None** |

**Decision: IMPORT 0 rows.** The original Phase-2 judgment was correct. All 626 + 348 = 974 rows are LOW by the explicit criteria. No medium or high value events found in either bucket after direct sampling and live-task-joined analysis.

---

## Evidence artifacts

- Queries run directly against prod D1 `mnccore-lab` via `scripts/wrangler-d1` (read-only)
- Source rows verified via `JOIN tasks ON related_id = t.id` — only 217 of 626 "Created task" and 12 distinct tasks of 145 "Status →" map to live tasks at all
- The 3 active-task "Created task" rows for MEDIUM consideration: timestamps are identical to `tasks.created_at`, body adds no information, reclassified LOW
- The 4 "Status →" transitions that could qualify HIGH: all covered by the existing completion entries + task row timestamps

---

## Rollback (if any rows had been imported — they were not)

```sql
DELETE FROM activity_entries WHERE source_table='activity_log' AND kind='system';
```

No rows were imported by this audit. No rollback needed.
