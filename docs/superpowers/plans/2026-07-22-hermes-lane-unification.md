# Hermes Lane Unification — Implementation Plan

**Date:** 2026-07-22
**Status:** PLAN ONLY — nothing implemented
**Goal (owner-decided, not relitigated):** asking Hermes means the same thing everywhere.
Every `@hermes` — task, project, artifact, Today bar — posts a real `activity_entries`
comment on the entity it was typed in, and Hermes answers as a threaded reply on that
entry. `ai_requests` becomes TRANSPORT ONLY: a queue for the external Python listener,
never a rendering surface.

Schema head today: **v101** (`api/schema-v101-public-artifact-canary.sql`). Route count
pinned at **254** (`api/routes/route-contract.generated.test.ts:118`).

---

## 0. ORCHESTRATOR VERIFICATION (added after review — read this first)

This plan was written by a subagent and then checked. Citations were opened, not trusted.

**Verified accurate:** `hermesRouting.ts:5-9` and the `TaskDetailPanel` prefix comment
(quoted correctly); `deriveEntityContext()` returning `null` for a date-key `source_id`, so
`context = NULL` for `day` genuinely matches today's behavior; the `projects.ts` health
rollup, whose own comment documents the **8.8s p95 / N+1** history — which makes §2.1's
"unindexable `json_extract` in an aggregate" argument real rather than theoretical;
`contributions.ts:22` and `contributions-decay.ts:61` filtering `kind` with **no**
`entity_type`. §1.3's claim that the Today-bar ask stays cheap **by construction** is also
correct: `dispatchHermes` only wraps the prompt when `prior.length > 0`, so a fresh root
reaches the model bare.

**LIVE MEASUREMENTS — these close §8 unknown #2, and they re-scope the plan:**

| Fact (prod D1, 2026-07-22) | Value |
|---|---|
| `daily_thought` rows | **16** total — 7 task-keyed, 9 date-keyed |
| …unanswered / orphaned | **0 / 0** |
| `task_comment` / `project_comment` / `backlog_idea` | 9 / 3 / 2 |
| `lab_question` + `lab_answer` rows, all time | **0** |
| `activity_entries` by visibility | 1 `author`, 1656 `team` |

**Consequences for the phase plan:**

1. **Phase 4 is not a migration — it is 16 rows**, all answered, none orphaned. Written as a
   real backfill with a pre-flight probe; the probe has now been run and the answer is
   "trivial". Re-scope accordingly; hand-verifying 16 rows is cheaper than the tooling.
2. **OPEN QUESTION 2 (fold in Ask the Lab) answers itself.** `lab_question`/`lab_answer`
   have **never once fired**. That is not a migration question, it is a retirement
   question — and the session handoff already records Ask the Lab as dead (1 question ever,
   0 answers). Do not build a fold-in for a lane with no rows.
3. **8 phases is heavy for this scale.** The genuinely hard work is the hide predicate
   across ~25 sites and the Phase 5 writer flip. Most of the rest is small.

**§7 Q7 was RIGHT, and it was worse than "fold into Phase 1" — it was a LIVE LEAK.**
`api/routes/search.ts` applied no visibility gate to any of its four `activity_entries`
sources and did not even import `activityVisibilityGate`; `handleGetSearch` never received
the request, so it was structurally unable to filter — the identical shape to the
`ai_requests` leak fixed earlier the same day. `@me` notes were searchable by any
authenticated teammate. **FIXED AND DEPLOYED 2026-07-22 (commit `e7a29e5f`), standalone —
it is NOT part of this wave and Phase 1 should not re-do it.**

**Where the plan needs the owner, not an implementer:** §7 Q1 (default visibility of a
typed `@hermes`) partially conflicts with what the owner asked for — he said he wants
Hermes exchanges visible to teammates and taggable. The reconciliation is probably
"private by DEFAULT, one click to share" rather than "team by default, hide when
unwanted", but that is his call and it BLOCKS Phase 5.

---

## 1. Recovered intent — why the split exists today

### 1.1 The two lanes, as built

**Lane A — the unified lane (mid-text `@hermes` mention).**
`postActivityEntry()` (`api/lib/activity-entry.ts:167`) writes the row, then
`HERMES_DETECT_RE.test(body)` at `api/lib/activity-entry.ts:440` fires
`dispatchHermes()` (`:597`). That:

- derives `source_type` from the entity — `task_comment` / `project_comment` /
  `artifact_comment` (`api/lib/activity-entry.ts:619-624`);
- sets `source_id` = **the activity entry's id**, and
  `context` = `` `${entityType}: ${entityId}` `` (`api/lib/activity-entry.ts:675`);
- assembles a bounded `<activity_thread_context>` transcript into the **`prompt`**
  (`:643-671`, capped by `THREAD_CONTEXT_MAX_MESSAGES=12` /
  `THREAD_CONTEXT_MAX_CHARS=8000` at `:34-35`);
- writes a `Thinking about this… (AI response pending)` placeholder as a **threaded
  reply** (`:682-698`, `parentId: threadRootId`).

The answer returns via `POST /api/ai-requests/:id/response` →
`_postHermesResponse()` (`api/routes/ai-requests.ts:236`), which resolves
`source_id` → the triggering `activity_entries` row (`:250-252`), finds the
thread-scoped placeholder (`:277-296`) and **UPDATEs it in place** (`:302-304`).

**Lane B — the direct lane (typed leading `@hermes` prefix).**
Three composers bypass the timeline entirely and `POST /api/ai-requests` with
`source_type='daily_thought'`:

| Surface | file:line | `source_id` |
|---|---|---|
| Today bar | `src/components/today/MorningThoughtCompose.tsx:105-125` | `todayKey()` — a `YYYY-MM-DD` date key |
| SmartCompose, task mode | `src/components/SmartCompose.tsx:246-262` | the task id |
| TaskDetailPanel quick-add | `src/components/tasks/TaskDetailPanel.tsx:1597-1611` | the task id |

Read back by `useAiRequestReplies` (`src/hooks/useApiData.ts:1703-1723`) →
`useTaskHermesReplies` / `useDailyThoughtReplies` (`:1727-1737`) →
`TaskHermesReplies.tsx` / `today/HermesThoughtReplies.tsx` → `HermesReplyList.tsx`.
Mounted at `TaskDetailPanel.tsx:613`, `today/TaskDetailDrawer.tsx:199`,
`MyTasks/components/InlineDetail.tsx:238`, `portal/TodayPage.tsx:495`.

### 1.2 Why the split was built — three distinct reasons, only two of which survive

**Reason 1 — "a typed prefix is not team-visible activity." LOAD-BEARING. MUST SURVIVE.**
Stated verbatim in two places:

- `src/lib/hermesRouting.ts:5-9`: *"A typed `@hermes …` PREFIX is a command … A mid-text
  `@hermes` mention (`ask @hermes about X`) is NOT a command and stays a team-visible comment."*
- `src/components/tasks/TaskDetailPanel.tsx:1595-1596`: *"A direct @hermes prefix is a
  Today-bar-style intent; route there instead of letting it fall through to submitComment
  as team-visible activity."*

Rule 78 (`CLAUDE.md:299`) hardened this into a read filter on 2026-07-22:
`GET /api/ai-requests` now scopes to `requested_by` (`api/routes/ai-requests.ts:34-43`).
So **today, a typed `@hermes` on a task is invisible to every teammate.**

> ⚠️ **This is the sharpest hazard in the whole plan.** Unification shipped naively makes
> every typed-prefix ask a team-visible `activity_entries` row. That is a *widening* of
> visibility for content the code currently guarantees is private. The per-thread hide is a
> manual, post-hoc, hidden-for-everyone action — it is **not** a substitute for a private
> default. See OPEN QUESTION 1; my recommendation is that the typed prefix maps to
> `visibility='author'`, which is the axis `activity_entries` **already has** and which is
> already SQL-gated at every read (`activityVisibilityGate`, `api/lib/activity-entry.ts:728`).
> That is a deletion of a lane, not an addition of a mechanism.

**Reason 2 — the Today bar has no entity to comment on. SOLVED BY THE `day` ENTITY.**
`EntityType` is `'task' | 'project' | 'artifact'` (`api/lib/activity-entry.ts:60`) and
`postActivityEntry` rejects anything else at `:188-190`. A date key had nowhere to land, so
`ai_requests` was the only durable home. The owner's `entity_type='day'` decision removes
this reason entirely.

**Reason 3 — "a plain comment only manual /process triage would answer." OBSOLETE.**
`src/components/SmartCompose.tsx:240-242` says the ai_requests lane was chosen because it
gives a real round-trip. That was true before Lane A existed. It is false now:
`dispatchHermes` fires on any `@hermes` in any body, prefix or not
(`api/lib/activity-entry.ts:440`). Lane B buys nothing here anymore.

### 1.3 Properties that MUST survive, with the mechanism that preserves them

| Property | Why it matters | How it survives |
|---|---|---|
| `ai_requests.context` grammar `"task: <id>"` / `"project: <id>"` | The external `hub_ai_listener.py` (DIFFERENT repo) parses it. Changing it = cross-repo lockstep. | `dispatchHermes` must write **`context = NULL`** for `entity_type='day'` — never `"day: 2026-07-22"`. This exactly matches today's behavior: `deriveEntityContext()` (`api/routes/ai-requests.ts:101-105`) returns `null` for a date-key `source_id`. |
| Transcript rides in `prompt`, not `context` | Same no-lockstep reason (`api/lib/activity-entry.ts:630-637`). | Unchanged. Do not touch. |
| Today-bar ask is CHEAP — no QuickChat-style context load | Owner values this explicitly. | Preserved **by construction**, two ways: (a) `context = NULL` → the listener builds no entity block; (b) `dispatchHermes` only wraps the prompt when `prior.length > 0` (`api/lib/activity-entry.ts:658`), and a fresh root has no prior. A bare Today-bar ask reaches the model as the bare question. No special case needed. |
| Listener's `source_type` vocabulary | Unknown values may not route. | Keep `source_type='daily_thought'` for `day` entries — a value the listener already handles. |

---

## 2. The hide mechanism

### 2.1 Where the flag lives — **a real column, not a `metadata_json` key**

**Decision: `activity_entries.hidden_at TEXT` (NULL = visible) + `hidden_by TEXT`.**

Arguments, strongest first:

1. **The predicate must appear in ~22 SQL statements, many of them aggregates**
   (`GROUP BY`, `NOT EXISTS`, `COUNT(*)`, correlated subqueries — §2.4). A JSON key needs
   `json_extract(metadata_json,'$.hidden') IS NULL` at every one of them. That is
   unindexable in the shapes that matter, and the project-health rollup
   (`api/routes/projects.ts:440,444`) is a whole-table `GROUP BY` that was explicitly
   engineered down from 8.8s p95 (`api/routes/projects.ts:418-423`). Do not put a
   function call in its WHERE clause.
2. **A nullable column supports partial indexes; the repo already relies on this pattern.**
   `idx_ae_entity_roots` / `idx_ae_project_roots` are `WHERE parent_id IS NULL`
   (`api/schema-v100-activity-entries-threads.sql:46-52`). `WHERE hidden_at IS NULL` is the
   identical shape, and the two compose.
3. **`metadata_json` is a display bag; this is a gate.** Its only current key is
   `edited: true` (`api/routes/activity.ts:119`). Worse:
   `handleEditActivityEntry` **rewrites the whole blob** (parse → mutate → stringify,
   `api/routes/activity.ts:113-123`). It happens to preserve unknown keys today, but any
   future writer that constructs a fresh object silently unhides a thread. That is the
   invisible-corrupt-state failure the v100 header already rejected when it refused
   `thread_root_id + depth` (`api/schema-v100-activity-entries-threads.sql:8-13`). Same
   argument, same answer.
4. **A column gives `hidden_at` (audit timestamp, "hidden 3d ago") and `hidden_by`
   (who) for free.** A boolean JSON key gives neither.
5. **Cost is one `ALTER TABLE` and it does NOT touch the INSERT.** See §2.3.

Migration `api/schema-v102-activity-entries-hidden.sql`:

```sql
ALTER TABLE activity_entries ADD COLUMN hidden_at TEXT;
ALTER TABLE activity_entries ADD COLUMN hidden_by TEXT;

-- Mirrors of the v100 root indexes, further narrowed to visible rows: every
-- feed read is (entity | project) x roots x visible.
CREATE INDEX IF NOT EXISTS idx_ae_entity_roots_visible
  ON activity_entries (entity_type, entity_id, created_at DESC, id DESC)
  WHERE parent_id IS NULL AND hidden_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ae_project_roots_visible
  ON activity_entries (project_id, created_at DESC, id DESC)
  WHERE parent_id IS NULL AND hidden_at IS NULL;
```

Rollback: `DROP` the two indexes. The columns are additive + nullable, so pre-v102 code
ignores them and every existing row is already visible — the same reversibility argument
v100 made (`api/schema-v100-activity-entries-threads.sql:30-31`).

### 2.2 How it cascades to replies — **stored on root AND children, inherited on write**

Two rejected alternatives first:

- *Store on the root only, derive for replies via a join.* Rejected: every aggregate reader
  (health, insights, contributions, team-pulse, meeting-cadence, seen) would need a
  self-join it does not have today. `api/routes/insights.ts:321` is already a
  `NOT EXISTS` inside a per-project scan; adding a join there is a performance regression
  for a feature nobody asked for.
- *Store on children at hide time only.* Rejected: a reply posted **after** the hide is born
  visible and leaks the thread back into the feed.

**Chosen: write `hidden_at` to the root and all current children in one statement, and make
`postActivityEntry` INHERIT `hidden_at` from the parent — exactly the way it already
inherits `visibility`.**

- Hide/unhide: `UPDATE activity_entries SET hidden_at = ?, hidden_by = ? WHERE id = ? OR parent_id = ?`
  (single statement, symmetric for unhide with `NULL, NULL`).
- Inheritance: the parent-resolution SELECT at `api/lib/activity-entry.ts:215-217` gains
  `hidden_at`, and the INSERT binds it for replies. This mirrors the visibility
  inheritance at `:239` + `:246` — *same primitive, same shape*, which is the whole
  argument for doing it this way.

Only **roots** can be hidden. Hiding a reply returns 400, mirroring
"replying to a reply is a 400" (`api/lib/activity-entry.ts:228-230`,
CLAUDE.md Rule 77). `parent_id IS NULL` stays the reliable root test.

### 2.3 The bind-order landmine

Do **not** add `hidden_at` to the INSERT column list at `api/lib/activity-entry.ts:292-293`
for the ROOT path — it defaults NULL. Reason: `api/routes/phase4-correctness.test.ts:320-326`
asserts the activity_entries INSERT **bind positions by index**
(`ph[1]` = entity_type, `ph[2]` = entity_id, `ph[4]` = kind, `ph[6]` = actor_slug).
Reordering silently breaks it.

The reply path DOES need the inherited value. Cleanest: append `hidden_at` as the **last**
bind (after `parent_id`, before the `datetime('now')` literal) so indices 0-13 are
unchanged. Then `phase4-correctness.test.ts` stays green with no edit and the
new column is still bound.

### 2.4 ONE shared predicate — and a lint, because a missed site is silent

A missed site leaks hidden content into the PB `/process` queue or a health score with no
error anywhere. Rules do not prevent that class; a primitive plus an executable check does
(codex ethos #4 — the repo already does this for time discipline via
`scripts/check-time-discipline.mjs`, CLAUDE.md "Shared Utilities").

**Primitive** — add next to `activityVisibilityGate` in `api/lib/activity-entry.ts`:

```ts
/**
 * The hidden-thread gate. AND this into EVERY read of activity_entries that
 * feeds a timeline, a queue, a badge, or a score. `include` is the "Show
 * hidden" affordance and is honoured ONLY by the three per-entity feeds.
 * Hidden is a property of the THREAD (root + children carry the same value),
 * so this is a flat predicate — never a join.
 */
export function activityHiddenClause(alias = '', include = false): string {
  if (include) return '1=1';
  return `${alias ? alias + '.' : ''}hidden_at IS NULL`;
}
```

**Executable check** — `scripts/check-activity-reads.mjs`, wired into
`npm run typecheck:api`'s neighbourhood (its own npm script, run in CI + pre-deploy):
scan `api/**/*.ts` (excluding `*.test.ts`) for statements containing `FROM activity_entries`
and fail unless the statement also contains `hidden_at` **or** the line carries the marker
comment `activity-hidden-exempt: <reason>`. Same escape-hatch shape the wrangler pre-commit
hook uses (`wrangler-d1-allowed`, CLAUDE.md "Wrangler / D1 auth").

### 2.5 EVERY site that must honour it — enumerated

**MUST FILTER (feeds / queues / badges / analytics) — 22 statements:**

| # | file:line | What |
|---|---|---|
| 1 | `api/routes/tasks.ts:556` | `handleGetTaskComments` — legacy `/comments` projection |
| 2 | `api/routes/tasks.ts:638` | `handleGetTaskActivity` — unified task feed (roots) |
| 3 | `api/routes/tasks.ts:636` | …its correlated `reply_count` subquery (alias `r`) |
| 4 | `api/routes/tasks.ts:671` | `handleGetTaskDetail` fan-out (`updates` arm) |
| 5 | `api/routes/tasks.ts:1247` | `handleGetRecentTaskUpdates` — **PB brain.db mirror** |
| 6 | `api/routes/tasks.ts:1303` | `handleGetRecentTaskComments`, `since` cursor arm — **PB `/process` queue** |
| 7 | `api/routes/tasks.ts:1312` | …same handler, no-`since` arm |
| 8 | `api/routes/tasks.ts:1332` | `handleGetTaskUpdates` — legacy `/updates` projection |
| 9 | `api/routes/projects.ts:298` | `last_activity` rollup on the browser projects read |
| 10 | `api/routes/projects.ts:339` | `handleGetComments` — legacy project `/comments` |
| 11 | `api/routes/projects.ts:363` | `handleGetProjectUpdates` — legacy project `/updates` |
| 12 | `api/routes/projects.ts:404` | `handleGetProjectActivity` — whole-picture project feed |
| 13 | `api/routes/projects.ts:402` | …its `reply_count` subquery (alias `r`) |
| 14 | `api/routes/projects.ts:440` | `handleProjectHealth` — updates recency aggregate (**score**) |
| 15 | `api/routes/projects.ts:444` | `handleProjectHealth` — comments recency aggregate (**score**) |
| 16 | `api/routes/projects.ts:570` | `handleGetRecentProjectUpdates` — PB `d1_project_updates` mirror |
| 17 | `api/routes/artifacts.ts:342` | `handleGetArtifactActivity` |
| 18 | `api/routes/insights.ts:321` / `:331` / `:490` | stalled-project `NOT EXISTS` probes (3 statements) |
| 19 | `api/routes/contributions.ts:17` / `:22` | per-person update + comment lists |
| 20 | `api/routes/contributions-decay.ts:56` / `:61` | decay timestamps |
| 21 | `api/routes/team-pulse.ts:19` | per-actor update counts |
| 22 | `api/routes/meeting-cadence.ts:34` | update count since date |
| 23 | `api/routes/meetings.ts:353` | meeting-prep "recent project updates" section |
| 24 | `api/routes/seen.ts:103` | unseen JOIN — **the teal ● badge** |
| 25 | `api/index.ts:2999` | daily digest "recent team activity" |

**MUST NOT FILTER (content is never lost; hidden stays retrievable + searchable) —
mark each with the exempt comment:**

| file:line | Why exempt |
|---|---|
| `api/routes/search.ts:190`, `:199`, `:205`, `:209` | Owner requirement: hidden threads stay **searchable**. |
| `api/routes/activity.ts:151` | `handleGetActivityReplies` — you must be able to read a revealed thread's replies. |
| `api/routes/activity.ts:197` | reply-parent visibility probe (write path). |
| `api/lib/activity-entry.ts:216`, `:322`, `:325`, `:360` | write-path reads. |
| `api/lib/activity-entry.ts:647` | `dispatchHermes` transcript — the thread's own content; a hidden thread you are still talking in must keep its context. |
| `api/routes/activity.ts:59`, `:76`, `:101` | delete/edit auth probes + reply cascade. |
| `api/routes/mutations.ts:998`, `:1035`; `api/routes/tasks.ts:1010`; `api/routes/projects.ts:861`; `api/routes/artifacts.ts:323` | entity-delete cascades — hidden rows must still be deleted with their entity. |

**"Show hidden" affordance:** `?include_hidden=1` on **exactly three** endpoints —
`GET /api/tasks/:id/activity`, `GET /api/projects/:idOrSlug/activity`,
`GET /api/artifacts/:id/activity` (+ the `day` feed from §3). Never on the PB `/recent`
feeds, never on analytics, never on `/api/seen/unseen`. Each of those three additionally
returns `hidden_count` so the UI can render `3 hidden — show` without a second request.

**Endpoint:** `POST /api/activity/:id/hide` with body `{ hidden: boolean }` — ONE route
(+1 → **255**), not a hide/unhide pair. A pair would imply asymmetric permissions;
the owner's model is symmetric and reversible.

---

## 3. The `day` entity

### 3.1 `EntityType` and entity existence

- `api/lib/activity-entry.ts:60` → `export type EntityType = 'task' | 'project' | 'artifact' | 'day';`
- `api/lib/activity-entry.ts:188-190` → extend the validation branch.

**There is no `days` table, and we will not create one.** Verified: the only `daily_*`
tables are `daily_plans` / `daily_reflections` (`api/schema-v20.sql:5,35`), both
**RETIRED** (IA-1, 2026-06-10; CLAUDE.md Rule 63b).

**Decision: validate the SHAPE, not a row.** In the entity-existence block
(`api/lib/activity-entry.ts:256-284`) add a `day` branch:

```ts
} else if (entityType === 'day') {
  // No `days` table, deliberately: a day row would have a PK and nothing else.
  // A civil date key IS its own existence proof, so the shape check IS the
  // existence check. Fail closed on anything else so a client can't invent an
  // entity namespace by writing entity_type='day', entity_id='whatever'.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entityId)) {
    return { ok: false, error: 'day entity_id must be a YYYY-MM-DD civil date', status: 400 };
  }
  projectId = null;
}
```

### 3.2 `project_id` semantics — **always NULL**, and one place that breaks

`project_id = NULL` means day entries are structurally excluded from every project-keyed
reader: `api/routes/projects.ts:298-300` (`WHERE project_id IS NOT NULL`), `:404`
(`WHERE ae.project_id = ?`), `:440`, `:444`, `api/routes/insights.ts:322`. That is a
**feature** — a Today-bar ask must not move a project's health score.

⚠️ **But two readers filter on `kind` only, with no `entity_type` predicate at all:**

- `api/routes/contributions.ts:22` — `WHERE kind='comment' AND actor_slug LIKE ?`
- `api/routes/contributions-decay.ts:61` — same shape

Day comments **would** be counted as contributions there. Add `AND entity_type != 'day'`
to both, or accept the inflation. Recommend adding it (a private morning thought is not
a lab contribution).

### 3.3 Routes and rendering

- `GET /api/days/:date/activity` and `POST /api/days/:date/activity` (+2 → **257** total
  with §2.5's hide route). Shape-identical to the task/artifact feeds so the frontend
  reuses `ActivityThread` / `ActivityEntryItem` (`src/components/activity/`) with no new
  renderer. `:date` re-validated server-side against the same regex.
- `src/pages/portal/TodayPage.tsx:495` — replace `<HermesThoughtReplies dateKey={todayKey()} />`
  with `<DayActivityFeed dateKey={todayKey()} />`, a thin wrapper over the existing
  `ActivityThread` list.

### 3.4 The Today-bar composer change — and the inversion that is easy to miss

`src/components/today/MorningThoughtCompose.tsx:104-125` (Route 1) becomes a
`POST /api/days/:date/activity` with `{ content }`.

⚠️ **The body must KEEP the `@hermes` token.** Today the composer calls
`stripHermesPrefix(content)` (`:106`) and sends the stripped prompt. Under unification the
stored comment body is what `HERMES_DETECT_RE` is tested against
(`api/lib/activity-entry.ts:440`) — strip it and Hermes never fires. This is a behavioral
inversion in a one-line change; it will pass typecheck and silently do nothing.

Routes 0 (`@quickchat`), 0.5 (`@workon`), 2 (`@backlog`), 3 (`note:`) and 4 (default task
create) at `:86-201` are **untouched**.

---

## 4. Migration / backfill of existing `daily_thought` rows

Existing rows: `ai_requests WHERE source_type='daily_thought'`, with `source_id` either a
`task_<ulid>` or a `YYYY-MM-DD` date key (the deliberate overload noted at
`api/routes/ai-requests.ts:96-99`). They carry `prompt`, `response`, `requested_by`,
`created_at`, `responded_at`.

**Backfill each into TWO `activity_entries` rows** — a question root and an answer reply:

| Row | `source_table` | `source_id` | `actor_slug` | `body` | `created_at` | `parent_id` |
|---|---|---|---|---|---|---|
| root | `ai_requests` | the `ai_requests.id` | `actorSlug(requested_by)` | `'@hermes ' \|\| ar.prompt` | `ar.created_at` | NULL |
| reply | `ai_requests_response` | the `ai_requests.id` | `claude-ai` | `ar.response` | `ar.responded_at` | root id |

`entity_type` / `entity_id`: `'task'` + `source_id` when `source_id LIKE 'task\_%'`;
`'day'` + `source_id` when it matches the date shape. Skip everything else.
Skip rows whose task is deleted (`tasks.deleted_at IS NOT NULL`) — the entity is gone.
Skip the reply row when `response IS NULL` (still pending).

> 🔴 **`visibility = 'author'` on BOTH rows. Non-negotiable.**
> Those exchanges are requester-scoped **today** (Rule 78,
> `api/routes/ai-requests.ts:34-43`). Backfilling them as `team` retroactively publishes
> every private Hermes exchange in the table to the whole lab, in one statement, with no
> undo short of D1 Time-Travel. This single word is the highest-consequence line in the plan.

**Idempotency is free**: `postActivityEntry` already supports `sourceTable`/`sourceId`
(`api/lib/activity-entry.ts:313-327`) backed by the partial UNIQUE index `idx_ae_source`
(`api/schema-v77-activity-entries.sql:63-65`).

**But the backfill must be raw SQL, not the primitive**, because `created_at` is hardcoded
to `datetime('now')` in the INSERT (`api/lib/activity-entry.ts:293`) and history must keep
its real timestamps. Precedent: `api/backfill-v77-task-messages.sql` (`INSERT OR IGNORE`,
explicit column list). Write `api/backfill-v102-daily-thought.sql` in that shape.

**Rollback:** `DELETE FROM activity_entries WHERE source_table IN ('ai_requests','ai_requests_response');`
— identical to the v77 rollback line (`api/backfill-v77-task-messages.sql:13`).

**The `ai_requests` rows are NOT deleted.** They stay as transport log + token accounting
(the `SUM(input_tokens)` rollup at `api/routes/ai-requests.ts:71-73`).

History is preserved and visible: the owner's old asks now render in the task's / day's
timeline through the same card as everything else.

---

## 5. Phased task list

Shipping tags: **(A)** independent, ships on green · **(B)** sequenced after a named phase ·
**(C)** needs a flag, with the failure mechanism named.

---

### Phase 0 — `seen.ts` kind filter (pre-existing bug) — **(A)**

`api/routes/seen.ts:103-107` joins `activity_entries` with **no `kind` predicate**, so
`system` and `completion` rows already inflate the teal ● "new activity" count. That
violates badge honesty (Rule 73). Fold it in here rather than deferring — it is one
predicate, and the hide work touches this exact statement in Phase 1 anyway.

- **Files:** `api/routes/seen.ts:103` (add `AND ae.kind IN ('comment','update')`).
- **Risk:** LOW. Counts go down, never up.
- **Rollback:** revert one line.

### Phase 1 — schema v102 + the shared predicate + retrofit every read — **(B, after 0)**

- **Files:** new `api/schema-v102-activity-entries-hidden.sql`;
  `api/lib/activity-entry.ts` (+`activityHiddenClause`); the 25 MUST-FILTER statements
  in §2.5; the ~18 MUST-NOT-FILTER statements get the exempt marker;
  new `scripts/check-activity-reads.mjs` + a `package.json` script.
- **Ships as a strict no-op**: nothing writes `hidden_at` yet, so every
  `hidden_at IS NULL` is universally true. That is the point — the risky
  multi-site retrofit lands with zero behavior change and is provable by the
  existing suite staying green.
- **Test-double step (REQUIRED):** the vitest doubles match SQL by exact column list and
  return `null` on a miss. Any statement whose SELECT list changes must have its matcher
  updated in the same commit — `api/lib/activity-entry.test.ts:201-240` (the per-statement
  `SELECT … FROM activity_entries WHERE id = ?` branches) and its `all:` branches at
  `:246-300`; `api/routes/phase4-correctness.test.ts:151`, `:276`, `:339`. Adding a
  `WHERE` predicate is usually safe (the doubles regex on fragments); changing a SELECT
  **column list** is not.
- **Risk:** MEDIUM — 25 sites, silent on miss. Mitigated by the no-op property + the lint.
- **Rollback:** revert the code; leave the columns (additive, ignored).

### Phase 2 — hide/unhide endpoint + inheritance + cascade + UI — **(B, after 1)**

- **Files:** `api/routes/activity.ts` (new `handleSetActivityHidden`);
  `api/index.ts` (+1 `defineRoute`); `api/routes/route-contract.generated.test.ts:118`
  (254 → 255, with a comment line in the running log at `:66-117`);
  `api/lib/activity-entry.ts:215-217` (+`hidden_at` in the parent SELECT) and `:292-309`
  (append the inherited bind LAST — §2.3); `src/components/activity/ActivityThread.tsx`
  and `activityRender.tsx` (hide affordance on the root's action row);
  the three feed hooks (+`?include_hidden`).
- **Test-double step:** `api/lib/activity-entry.test.ts:210` and
  `api/routes/phase4-correctness.test.ts:151` both regex the exact string
  `SELECT id, parent_id, entity_type, entity_id, kind, visibility FROM activity_entries WHERE id = ?`.
  Adding `hidden_at` to that SELECT breaks BOTH — update them in the same commit or every
  reply write 404s ("Parent activity entry not found").
- **Risk:** MEDIUM. First phase where hidden content can actually exist, so a Phase-1 miss
  becomes visible here.
- **Rollback:** revert the route + a one-shot `UPDATE activity_entries SET hidden_at = NULL, hidden_by = NULL`.

### Phase 3 — the `day` entity — **(A)**

Independent of the hide work; touches only new surface.

- **Files:** `api/lib/activity-entry.ts:60`, `:188-190`, `:256-284` (new branch);
  `api/lib/activity-entry.ts:619-624` + `:675` (`source_type='daily_thought'`,
  **`context = NULL`** for `day` — §1.3); `api/routes/ai-requests.ts:210-217`
  (**delete the `source_type` allowlist**; gate on "`source_id` resolves to an
  `activity_entries` row" — that check already exists at `:250-252`);
  new `api/routes/days.ts`; `api/index.ts` (+2 routes → **257**);
  `api/routes/route-contract.generated.test.ts:118`; `api/routes/contributions.ts:22` +
  `api/routes/contributions-decay.ts:61` (`AND entity_type != 'day'`);
  new `src/components/today/DayActivityFeed.tsx`.
- **Risk:** LOW-MEDIUM. The `context = NULL` rule is the cross-repo-safety line; get it
  wrong and the listener receives a `"day: …"` token it has never parsed.
- **Rollback:** unregister the two routes; day rows become orphaned-but-harmless
  (no reader queries `entity_type='day'` except the deleted feed).

### Phase 4 — backfill `daily_thought` → `activity_entries` — **(B, after 3)**

- **Files:** new `api/backfill-v102-daily-thought.sql`.
- **Procedure:** apply to `mnccore-lab-test` FIRST, probe row counts and a spot-check of
  `visibility`, then prod — via `scripts/wrangler-d1` only (never raw `npx wrangler d1`;
  the pre-commit hook blocks it).
- **Pre-flight probe (run it, don't assume):**
  `SELECT source_type, COUNT(*), SUM(source_id LIKE 'task\_%' ESCAPE '\'), SUM(response IS NULL) FROM ai_requests GROUP BY source_type;`
- **Risk:** HIGH consequence / LOW likelihood. The consequence is the `visibility` word
  (§4). Mitigated by: test DB first, `INSERT OR IGNORE` idempotency, a one-line rollback,
  and D1 Time-Travel (30d).
- **Rollback:** `DELETE FROM activity_entries WHERE source_table IN ('ai_requests','ai_requests_response');`

### Phase 5 — flip the three typed-prefix writers — **(B, after 4)** — RISKIEST

- **Files:** `src/components/today/MorningThoughtCompose.tsx:104-125`;
  `src/components/SmartCompose.tsx:246-262`;
  `src/components/tasks/TaskDetailPanel.tsx:1597-1611`;
  `src/lib/hermesRouting.ts` (the `@hermes` half becomes unused — see Phase 6).
- **Each becomes:** post the body **verbatim, `@hermes` token intact** to the entity's
  comment endpoint (`POST /api/tasks/:id/comments`, `POST /api/days/:date/activity`) with
  the visibility resolved per OPEN QUESTION 1. `postActivityEntry` does the rest.
- **No flag.** Named degradation path: if `_postHermesResponse` cannot find the
  placeholder, it falls back to a fresh `postActivityEntry` insert
  (`api/routes/ai-requests.ts:305-328`) — the answer appears as a normal reply rather
  than replacing "Thinking…". Degraded, never lost. That is not a burn-in-worthy
  failure mechanism, so ship now (CLAUDE.md: burn-in requires a named mechanism).
- **Risk:** HIGH — this is the phase that changes what teammates can SEE. If OPEN
  QUESTION 1 resolves to team-visible, every typed ask becomes public the moment this
  deploys, and there is no un-ship for content already read.
- **Rollback:** revert the three composers; in-flight rows already in
  `activity_entries` stay there and render fine.

### Phase 6 — deletions — **(B, after 5 + a 24h dogfood window)**

This is a substrate swap. Load `/substrate-swap` before the commit (twin-file grep,
state-transition matrix, tombstone decision doc).

Delete outright:

- `src/components/tasks/TaskHermesReplies.tsx` (whole file)
- `src/components/today/HermesThoughtReplies.tsx` (whole file)
- `src/components/HermesReplyList.tsx` (whole file — both consumers gone)
- `src/hooks/useApiData.ts:1688-1737` — `DailyThoughtReply`, `useAiRequestReplies`,
  `useDailyThoughtReplies`, `useTaskHermesReplies`
- the four mount sites: `TaskDetailPanel.tsx:613`, `today/TaskDetailDrawer.tsx:199`,
  `MyTasks/components/InlineDetail.tsx:238`, `portal/TodayPage.tsx:495`
- `api/routes/seen.ts:46` (`HERMES_UNSEEN_CAP_DAYS`), `:91` (`viewerEmail`),
  `:140-179` (the whole Hermes arm) and the now-moot merge-collapse logic at `:185-209`.
  **Rule 78's premise dies here**: "the typed `@hermes` prefix writes `ai_requests`, NOT
  `activity_entries`, so the seen system cannot see it any other way" ceases to be true —
  a Hermes answer is now an `activity_entries` row by `claude-ai` ≠ viewer, which the
  plain task/project arm at `:94-115` already badges.
- `src/lib/hermesRouting.ts:25` (`HERMES_PREFIX_RE`), `:29-31` (`isHermesPrefix`),
  `:41-44` (`stripHermesPrefix`). **KEEP** the `@backlog` half (`:26`, `:47-57`) —
  `@backlog` is out of scope and still routes to `ai_requests`.

Doc updates in the same commit: CLAUDE.md Rules 70, 73, 77, **78** (78 is largely
retired), the Hermes section, and the schema-version line in Quick Reference.

- **Risk:** MEDIUM. Deleting a reader is only safe once nothing writes to its lane; the
  24h window exists to catch an in-flight `ai_request` whose response lands after Phase 5
  deployed but whose row predates the backfill.
- **Rollback:** `git revert` — these are pure deletions with no data component.

### Phase 7 — Ask the Lab + `backlog_idea` disposition — **(deferred; see OPEN QUESTIONS 2 & 3)**

Not scoped here. Listed so the wave has an explicit edge.

---

## 6. Breakage inventory — everything that assumes the current shape

**Tests**

- `api/routes/route-contract.generated.test.ts:118` — `toHaveLength(254)`. Phases 2 and 3
  add 3 routes → 257. Update the count **and** append to the running log at `:66-117`
  (the file demands explicit acknowledgment for surface changes).
- `api/lib/activity-entry.test.ts` — exact-column SQL doubles at `:201-240`; `all:`
  branches at `:246-300`. `:210` matches the parent-resolution SELECT byte-for-byte.
- `api/routes/phase4-correctness.test.ts:151`, `:276`, `:339` — same parent SELECT;
  `:320-326` asserts INSERT **bind positions by index**.
- `api/routes/ai-requests.test.ts:295-410`, `:522-580` — `daily_thought` notification
  links (`/today`, `?openTask=`) and `deriveEntityContext` behavior. Phase 3's allowlist
  deletion and Phase 5's writer flip both land here.

**Cross-repo (Peripheral Brain — NOT in this repo)**

- `hub_ai_listener.py` — polls `GET /api/ai-requests?status=pending`, parses `context`,
  POSTs `/api/ai-requests/:id/response`. **No lockstep required** if `context` stays
  `NULL | "task: <id>" | "project: <id>"` and `source_type` stays in the existing
  vocabulary. Phase 3 is where that promise is kept or broken.
- `scripts/process_hub_comments.py` — reads `GET /api/task-comments/recent?since=`
  (ASC compound cursor, CLAUDE.md Rule 69). Phase 1 adds `hidden_at IS NULL` to
  `api/routes/tasks.ts:1303`/`:1312`. Wire shape unchanged; the row set shrinks. That is
  the owner's requirement, not a regression — but PB's `SyncCursor` will simply never
  see hidden rows, including ones hidden *after* it already ingested them. **Hiding does
  not retract what `/process` already collected.** State that plainly.
- `pull_project_updates` / `d1_project_updates`, `d1_task_updates` mirrors — fed by
  `api/routes/projects.ts:570` and `api/routes/tasks.ts:1247`. Same shrink property.

**Runtime assumptions**

- `HERMES_PENDING_BODY` (`api/lib/activity-entry.ts:29`) is one literal with **three**
  consumers (the primitive, `api/routes/ai-requests.ts:280`/`:292`,
  `src/components/hermesPendingUtil.ts`). Do not reword it in any phase.
- `api/routes/artifacts.ts:336-347` — the artifact feed selects **no** `parent_id` and
  has **no** `parent_id IS NULL` filter, unlike the task/project feeds
  (`tasks.ts:639`, `projects.ts:407`). It therefore renders Hermes replies as loose roots
  today. Pre-existing #98 gap; Phase 1 touches this statement, so fix it there.
- `api/routes/search.ts:190`,`:199`,`:205`,`:209` — **no visibility gate at all.** Every
  `@me` author-only note is searchable by anyone today. Pre-existing privacy bug,
  independent of this work, and it interacts badly with §4 (backfilled `author` rows
  become searchable by the team). See OPEN QUESTION 7.
- `src/components/activity/ActivityThread.tsx:113-129` deliberately uses SmartCompose in
  **custom** mode precisely because task mode diverts a leading `@hermes`
  (`:118-123`). After Phase 5 that comment is obsolete and the workaround can be
  simplified — a small deletion Phase 6 should sweep.
- `useAiRequestReplies` polls every 10s while pending (`src/hooks/useApiData.ts:1716-1720`).
  The activity feeds have their own invalidation; confirm the "Thinking… → answer"
  transition still refreshes promptly on the Today surface after Phase 5, since that
  surface loses its dedicated poller.

**What this lets us DELETE (the point of the exercise)**

3 whole component files, 4 hook exports + 1 type, 4 mount sites, one entire arm of
`/api/seen/unseen` (~45 lines incl. its constant and the merge-collapse logic it forced),
3 functions in `hermesRouting.ts`, one `source_type` allowlist, and the premise of
CLAUDE.md Rule 78.

---

## 7. OPEN QUESTIONS for the owner

1. **(BLOCKING — decide before Phase 5.) What is the default visibility of a typed
   `@hermes` ask?** Today it is effectively private (Rule 78 requester-scoping).
   - **(A) `visibility='author'` — my recommendation.** Preserves today's privacy exactly,
     using a mechanism that already exists and is already gated at every read. "Same
     thing everywhere" still holds: same store, same thread, same renderer, same
     `postActivityEntry`. Only the default audience differs, and the composer's `@me`
     lock already expresses that axis.
   - **(B) `visibility='team'`, use hide when unwanted.** Simpler mental model, but it
     retroactively publishes a class of content the code currently guarantees is private,
     and the remedy (hide) is manual, after-the-fact, and cannot un-read.
2. **Should Ask the Lab fold in?** `lab_questions` + `lab_answers`
   (`api/routes/questions.ts:41`, `:76`, `:101`, `:142`, `:165`, `:198`) are a **fourth**
   message store with the same problem — and `:161` already writes an `ai_requests` row
   with `source_type='lab_question'` plus a `lab_answers` placeholder at `:165`, which is
   the exact placeholder-in-a-second-table pattern this wave deletes elsewhere.
   Folding it means a `question` entity (or project-scoped roots). **Recommend: yes,
   eventually; NOT in this wave** — it is a separate page, separate schema, separate
   backfill, and bundling it doubles the blast radius of Phase 5.
3. **What happens to `backlog_idea`?** It writes to `ai_requests` from two surfaces
   (`MorningThoughtCompose.tsx:128-148`, `TaskDetailPanel.tsx:1615-1629`) and, per grep,
   has **no rendering surface in the Hub at all** — it is a write-only queue consumed
   somewhere in PB. Options: (a) leave it alone (it is genuinely transport, which is what
   `ai_requests` is becoming); (b) give it a real home. **Recommend (a)** — it is the one
   `ai_requests` user that is honestly a queue.
4. **Who may hide / unhide?** Owner said hidden-for-everyone, anyone can unhide.
   Symmetric proposal: any authed member can toggle, `hidden_by` recorded. The
   alternative (root-author-or-PI to hide, anyone to unhide) is asymmetric and harder to
   explain. Confirm.
5. **Should `entity_type='day'` join `SEEN_TYPES` (`api/routes/seen.ts:40`)?** Today the
   date-keyed Today-bar ask has no unseen signal at all (the Rule-78 Hermes arm
   `JOIN tasks t ON t.id = ar.source_id` at `:163` covers only task-keyed rows).
   **Recommend no** — you look at Today every day; a badge there is noise.
6. **Does the prefix-vs-mid-text distinction survive at all?** After Phase 5 both write
   the same row. The only thing a prefix could still mean is the visibility default
   (Q1-A). If Q1 resolves to (B), the distinction is fully dead and
   `src/lib/hermesRouting.ts` loses its `@hermes` half entirely.
7. **Search's missing visibility gate** (`api/routes/search.ts:190,199,205,209`) —
   fold the `activityVisibilityGate` in as part of Phase 1, or file separately? It becomes
   more consequential after §4 backfills `author`-visibility history. **Recommend: fold
   in** — it is four statements in a file Phase 1 already edits, and shipping the backfill
   over a known search leak is the wrong order.

---

## 8. What I could NOT verify

1. **`hub_ai_listener.py`'s actual branching.** It lives in the Peripheral Brain repo, not
   here. I could not confirm (a) that it tolerates `context = NULL` (strongly implied —
   `deriveEntityContext` already returns `null` for date-key `source_id`s,
   `api/routes/ai-requests.ts:104`, and the Today bar has always produced those), or
   (b) whether it branches on `source_type` beyond the `artifact_comment` revision path.
   **Verify before Phase 3 ships**, by reading the listener source, not by inference.
2. **Live D1 row counts.** I did not run `scripts/wrangler-d1` against prod. How many
   `daily_thought` rows exist, the task-keyed vs date-keyed split, how many have
   `response IS NULL`, and how many reference deleted tasks are all unknown. Phase 4's
   pre-flight probe is written to answer exactly this and must be run before the backfill.
3. **Whether `entity_seen` has any `'artifact'` rows** — the schema comment
   (`api/schema-v81-entity-seen.sql:12`) says "artifacts can join later"; I did not query.
4. **Whether PB's `process_hub_comments.py` filters by `kind`.** Different repo.
5. **Schema-number contention.** v102 assumes nothing else is mid-flight on another
   branch. Confirm at implementation time via `Glob api/schema-v*.sql`.
6. **The 149-error `typecheck:api` baseline** (`scripts/check-api-types.mjs:13`) — I read
   the mechanism but did not run `npm run typecheck:api`, so I cannot state which of the
   files this plan touches already carry baselined errors.
