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

### OWNER DECISIONS — 2026-07-22, Phase 5 is UNBLOCKED

1. **§7 Q1 RESOLVED → option (A), `visibility='author'`.** A typed `@hermes` prefix
   defaults to PRIVATE, with an explicit one-click share. Nothing that is private today
   becomes visible. The owner's "I want teammates to see what Hermes said" is satisfied by
   the SHARE action and by mid-text mentions (which stay team-visible), not by the default.
   **Consequence for §7 Q6:** the prefix-vs-mid-text distinction SURVIVES — repurposed. It
   no longer selects a STORE (both write `activity_entries`); it selects the DEFAULT
   AUDIENCE. `src/lib/hermesRouting.ts` keeps its `@hermes` half; update its comment, which
   currently describes the routing meaning.
2. **Scope: the FULL wave**, day entity + hide + backfill included. The orchestrator flagged
   this as possible overbuild given 16 rows; the owner considered that and chose the full
   wave anyway. Do not silently re-scope it down at implementation time.
3. **Timing:** execute in a FRESH session. Nothing is implemented as of this commit.

Still open and NOT blocking Phase 5: §7 Q4 (who may hide/unhide — proposal is any authed
member, `hidden_by` recorded), and §7 Q5 (`day` in `SEEN_TYPES` — recommendation is no).

---

## 0.5 EXECUTION LOG (2026-07-22 PM — updates §2.5, §9.2)

### ✅ PHASE 3 COMPLETE + DEPLOYED (live = `64fa763f`, probe PASS) — 2026-07-22

The `day` entity is live end-to-end. A Today-bar `@hermes` ask now becomes a real
`activity_entries` conversation (entity_type='day') you can reply to (incl. replying to
Hermes) and dismiss — rendered by `DayActivityFeed` through the SAME `ActivityThread` as
task/project feeds. Backend: EntityType+='day' (shape-validated, no `days` table, project_id
always NULL); `dispatchHermes` uses the listener-safe `daily_thought` source_type + `context
= NULL` for day (verified §9.9) and DAY-SCOPED memory (owner 9.1.5 — a day ask sees today's
other threads, requester-scoped + visibility-gated, hidden included); the `ai_requests`
source_type allowlist is DELETED (writeback routes by the triggering entry's own entity_type,
self-gating on source_id-resolves); contributions exclude day. `GET/POST /api/days/:date/
activity` (route contract 255 → **257**). Day threads default **PRIVATE** (owner §0.1),
preserving the pre-wave privacy of morning thoughts (which lived in requester-scoped
ai_requests). Frontend: Route-1 composer flips to the day feed KEEPING the `@hermes` token
(§3.4 inversion); stay-put + invalidate (owner 9.1.3).

Gates: `check-activity-reads` 52/34/18/0; `tsc -b` clean; **`test:api` 1195/1195** (+10 across
day-entity acceptance/validation/dispatch, private-feed gate, and the ai-requests writeback
self-gating positive control); prod probes (PB_API_KEY): GET valid date → 200 + hidden_count,
GET/POST bad date → 400, POST empty → 400. Commits: `9d3c982e` (3a backend) · `64fa763f`
(3b frontend). ⚠️ The `fork()` storm was sustained during this phase — build/commit/deploy
were run via background self-retry loops (one bash startup, internal retry) once windows opened.

**Suggested manual check (needs the home-laptop listener running):** on the Today page type
`@hermes what should I focus on today` — a thread + "Thinking…" should appear inline, resolve
to Hermes's answer, and you should be able to reply to it. Also confirm the morning thought is
private (only you see it).

**Next: Phase 4** (backfill the existing `daily_thought` ai_requests rows into activity_entries
— test DB first, then prod, `scripts/wrangler-d1` only; §4). Then 5 (typed-prefix writer flip,
RISKIEST — codex consult) → 8 (Quick Capture @hermes) → 9 (nav badge) → 10 (older-day retrieval
— codex consult) → 6 (deletions, after 24h dogfood). ⚠️ Still open: Nick's `@workon` confirm
(Wave 1, `650bdf19`); HermesThoughtReplies now orphaned (Phase 6 cleanup); old daily_thought
rows from earlier today live in ai_requests until Phase 4 backfills them.

---

### ✅ PHASE 2 COMPLETE + DEPLOYED (live = `e6dc831a`, probe PASS) — 2026-07-22

The WRITE side of the dismiss mechanism is done and live. `POST /api/activity/:id/hide`
`{ hidden: boolean }` (route contract **254 → 255**, author-or-PI, symmetric) hides/restores
a thread ROOT + its replies in one cascade UPDATE; a reply → 400; hidden is RETAINED
(searchable + reachable by Hermes's transcript, per owner 9.1.5). INHERITANCE is wired:
`postActivityEntry` inherits `hidden_at` from the parent (bound LAST, index 14, so §2.3's
positional test stays green), so a reply posted AFTER a dismiss is born hidden — no leak.
The three feeds (task/project/artifact) gained `?include_hidden=1` + a `hidden_count` (marked
exempt) and now SELECT `ae.hidden_at`. Frontend: an eye toggle on each root (single click —
reversible), a dashed muted spine + "dismissed" tag on shown-hidden roots (NOT card opacity —
compound-opacity rule), one shared `ShowHiddenToggle` ("N dismissed — show/hide") across all
three feeds, and `useDismissThread` (invalidation-only, drains the teal ● unseen badge).

Gates: `check-activity-reads` **50 reads / 33 guarded / 17 exempt / 0 unguarded**; `tsc -b`
clean; `typecheck:api` PASS; **`test:api` 1185/1185** (+9 hide/inheritance/cascade/auth tests
through the real endpoint). Prod probes (PB_API_KEY in-place): fake-id hide → 404 (route wired,
auth passed), missing body → 400, project feed returns `hidden_count`. Commits: `955fae12`
(2a backend) · `e6dc831a` (2b UI).

**Next: Phase 3** (the `day` entity + `POST /api/days/:date/activity` + delete the `ai-requests`
`source_type` allowlist, gating on "source_id resolves to an activity_entries row" instead;
`context = NULL` for `day` is the cross-repo-safety line). Then 4 (backfill 16 rows) → 5 (writer
flip, RISKIEST — codex consult) → 8 (Quick Capture) → 9 (nav badge) → 10 (retrieval — codex
consult; §9.11's leak constraints non-negotiable) → 6 (deletions, after 24h dogfood).
⚠️ Still open from before this session: Nick's empirical `@workon` confirm (Wave 1, `650bdf19`).

---

### ✅ PHASE 1 COMPLETE + DEPLOYED (live = `e5d5ba32`, probe PASS)

The entire read side of the dismiss mechanism is done and live. schema v102
applied to **test + prod** D1; **all 46 reads** guarded (33 predicate) or exempt
(13); the gate `node scripts/check-activity-reads.mjs` exits 0 and is wired into
`deploy:pages:gated`; `tsc -b` clean; **`test:api` 1176/1176** (no SQL double
broke). Nothing can leak a dismissed thread once one can be hidden — and until
Phase 2 ships the hide endpoint, every `hidden_at` is NULL so the filters are
currently no-ops (correct: read-side ready before write-side, the safe order).

**Next: Phase 2** (hide/unhide endpoint + inheritance + cascade + the dismiss/
"show hidden" UI). Then 3 (day entity) → 4 (backfill 16 rows) → 5 (writer flip,
RISKIEST — codex consult) → 8 (Quick Capture) → 9 (nav badge) → 10 (retrieval —
codex consult on trigger/shape/bound; §9.11's leak constraints are non-negotiable).

Commits this session: `650bdf19` (Wave 1 workon) · `07b37808`+`43817903` (gate +
13 exempt) · `e37a2ed1` (primitive + schema v102) · `3b12eb55` (this log) ·
`541d5422` (33-read retrofit) · `e5d5ba32` (gate wired + deployed).

---

Landed and pushed, in order:

- **Wave 1 — `@workon` class fix** (`650bdf19`, deployed, probe PASS). §9.6. Awaiting
  Nick's empirical confirm (type `@workon test` in a project Notes composer).
- **The read-gate** `scripts/check-activity-reads.mjs` (`07b37808`, hardened in `43817903`).
  Its build is the proof of §9.2's thesis: my own first checker had **false negatives**
  (comment-apostrophes desynced a quote-scanner, dropping 5 reads) until rewritten as a
  lexer. **AUTHORITATIVE COUNT = 46 read statements** (not the plan's 25, not the survey's
  36). Markers attach to the nearest read and are consumed; a dangling marker fails the gate.
- **13 exempt sites marked + verified** (`43817903`): 5 in activity-entry.ts (parent
  resolution, 3 write-path read-backs, dispatchHermes transcript), 3 in activity.ts
  (delete/edit auth, reply parent-visibility), 5 in ai-requests.ts (response routing, 2
  placeholder finds, 2 redirect lookups). This was the positive control — LEAK→exempt on
  real code.
- **`activityHiddenClause` primitive + schema v102** (`e37a2ed1`): the shared predicate
  (next to `activityVisibilityGate`) and `ALTER TABLE ADD hidden_at/hidden_by` + two partial
  indexes. Both **inert** — the primitive has no callers, the migration is **NOT applied**.

**Gate state: 46 reads = 0 guarded, 13 exempt, 33 UNGUARDED.** The 33 are the retrofit
worklist — get them from `node scripts/check-activity-reads.mjs --list`, never a prose table.

### ⛔ The remaining Phase 1 is gated on two things, deliberately not done unilaterally

1. **A prod (and test) D1 migration.** v102 must be applied to BOTH D1s via
   `scripts/wrangler-d1 … --file=api/schema-v102-…sql` **BEFORE** any predicate code deploys,
   or every feed 500s on an unknown column. This is a change to the team's live DB — Nick's call.
2. **The 33 predicate edits need `test:api`.** Per the SESSION-HANDOFF gotcha, the vitest API
   doubles match SQL by **exact string**, so adding `AND hidden_at IS NULL` / an interpolated
   `activityHiddenClause()` to a read — and adding `hidden_at` to the SELECT cols the feeds
   need to render the dismiss affordance — **will** break doubles that must be updated in
   lockstep. Doing 33 privacy-critical edits without a reliable test run is the exact setup
   that produced the two 2026-07-22 leaks. The `fork()` storm made `test:api` unreliable this
   session.

**Correct next-session order:** apply v102 to test+prod D1 → retrofit the 33 reads (drive off
`--list`, run `test:api` after each file, fix doubles) → gate reaches exit 0 → wire the checker
into `typecheck:api`'s neighbourhood + `deploy:pages:gated` → deploy. Only then Phases 2-10.

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

> 🔴 **THIS TABLE IS INCOMPLETE AND ITS COUNT IS WRONG — see §9.2.** An independent survey
> found two omissions (`api/routes/search.ts:208,217,223,227` and
> `api/routes/activity.ts:148`), and the "22 statements" claim below disagrees with its own
> 25-row table. Do NOT drive the retrofit off this list. Build §2.4's
> `scripts/check-activity-reads.mjs` FIRST and let the checker enumerate the sites — that is
> the whole point of having a checker, and this table is now a worked example of why a
> hand-maintained enumeration cannot be trusted (the same lesson CLAUDE.md already records
> for schema versions and route counts). Corrected total: **30 statements.**

**MUST FILTER (feeds / queues / badges / analytics) — ~~22~~ 30 statements, list below is partial:**

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

---

## 9. ADDENDUM — owner session 2 (2026-07-22 PM)

Adds Quick Capture to the wave, records five new owner decisions, and corrects two
verified errors in §2.5. Where this section conflicts with §7, **this section wins.**

### 9.1 New owner decisions

1. **Thread shape: each ask is its own dismissible thread root** on the day page — not one
   running day-scrollback. Confirms §2.2 ("only roots can be hidden") and the §3.3 plan to
   reuse `ActivityThread` unchanged. A day is a *list of conversations*, not a conversation.
2. **Quick Capture `@hermes` ALWAYS targets the day entity**, from every page, with no
   context sniffing. Explicitly rejected: binding to the task/project currently in view, and
   a second `@hermes:here` token. Owner's words: it should be "agnostic to any project or
   task." One rule, one destination.
3. **Send does NOT navigate.** The user stays where they are and gets a toast.
   ⚠️ **This REVERSES the owner's own opening framing** in the same session ("the ideal
   situation is that after I press send I would be redirected immediately to the today
   page"). He was asked directly to reconcile the two and chose stay-put, so a future reader
   finding the earlier phrasing must not "restore" the redirect as a bug fix.
4. **The Today nav item badges when Hermes answers**, and drains on visiting Today.
   This is the replacement for the redirect — the answer finds you instead of you following it.
5. **Hermes' day-page memory reach = today only, hidden threads INCLUDED.** Rejected a
   rolling multi-day window and a "whatever fits the cap" walk-back, because the latter makes
   recall silently vary with how chatty the day was.
   → This **promotes §2.5's `dispatchHermes` exemption from an implementation detail to an
   owner requirement.** `api/lib/activity-entry.ts:646` must keep seeing hidden rows, or
   "remember what we talked about this morning" breaks the moment a thread is dismissed.
   Dismiss is a *frontend* verb. It must never mean "forget."

### 9.2 CORRECTIONS to §2.5 — two read sites the enumeration MISSES

An independent read-site survey found **36** `activity_entries` read statements against
§2.5's 25. Most of the delta is correctly-excluded MUST-NOT-FILTER sites (auth lookups,
Hermes-internal routing), but **two are real omissions** — both confirmed by reading §2.5's
table directly:

| Missed site | Why it matters |
|---|---|
| `api/routes/search.ts:208, 217, 223, 227` (4 statements) | The four `activity_entries` search legs. **Not in §2.5 at all.** Search would happily return a dismissed thread. Note these received their *visibility* gate on 2026-07-22 (`e7a29e5f`) — **visibility ≠ hidden**; they are orthogonal axes and the new one is unwired. |
| `api/routes/activity.ts:148` (`handleGetActivityReplies`) | Children inherit `hidden_at` (§2.2), so a direct reply fetch against a hidden root returns hidden children unless filtered. |

**§2.5's MUST-FILTER count: 25 → 30 statements.**

**The lesson is the lint, not the two patches.** A hand-maintained enumeration missed two
sites on its first contact with an independent reader; it will miss more under edit.
§2.4's `scripts/check-activity-reads.mjs` would have caught both mechanically.
**Build the lint FIRST in Phase 1, before retrofitting any read** — then let it produce the
site list, rather than trusting this document's table. The table is a hint; the checker is
the source of truth. (Exactly the lesson CLAUDE.md already records for schema versions.)

### 9.3 RE-JUDGED: the Today badge must NOT poll `ai_requests`

A surface survey proposed feeding the badge from
`GET /api/ai-requests?source_type=daily_thought&status=pending`. **Rejected.** That
re-creates the precise coupling this wave exists to delete (§0: `ai_requests` becomes
transport only) and would break the moment Phase 5/6 lands. The badge reads
`activity_entries` through the seen model that already exists: `entity_seen` (v81) +
`GET /api/seen/unseen` (`api/routes/seen.ts:103`).

⚠️ **This reverses §7 Q5**, whose recommendation was *not* to add `day` to `SEEN_TYPES`.
Owner decision 9.1.4 makes `day` a seen type necessarily — there is no other honest way to
render the badge. §7 Q5 is now CLOSED as "yes, `day` joins `SEEN_TYPES`."

### 9.4 Phase 8 — Quick Capture `@hermes` — **(B, after Phase 3)**

**Verified current state:** `GlobalQuickAddModal.handleSubmit` → `parseQuickAddInput(value)`
→ `createTask.mutate()`. `QuickAddTaskInput.tsx:209` is a **raw `<textarea>`**, not
`MentionInput` — so quick capture has no @-mention affordance and no command-tag dropdown.

> 🔴 **ORDERING LANDMINE — verified, not inferred.** `parseQuickAdd.ts:182` runs
> `scan(/@([\w]+)/g, 'assignee')` — a **global** scan that fuzzy-matches team slugs
> (`:221-232`), and `hermes` **is** a registered slug (added to `/api/team/slugs` by N1c).
> So today, `@hermes what's blocking this` in quick capture parses `@hermes` as the
> **assignee**, strips it from the title, and silently creates a task *assigned to Hermes*.
> The `isHermesPrefix()` check MUST run **before** `parseQuickAddInput()`. If it runs after,
> the token is already gone and the feature is unreachable — and it will typecheck and look
> like it works.

Steps:

- **8.1** In `handleSubmit`, before `parseQuickAddInput`, branch on the **shared**
  `isHermesPrefix()` (`src/lib/hermesRouting.ts:29`). Never re-implement the regex — it
  carries the `@hermes-opus` / `@hermes_haiku` model-tag variants (#891) that PB's
  `select_model()` parses.
- **8.2** POST to Phase 3's `POST /api/days/:date/activity` with `todayKey()`, **keeping the
  `@hermes` token in the body** (§3.4's inversion — strip it and Hermes never fires).
- **8.3** Close the modal, toast "Asked Hermes", **do not navigate** (decision 9.1.3).
- **8.4** Hard dependency on Phase 3 — the `day` entity and its route must exist first.

**8.5 — do NOT swap the textarea for `MentionInput` as a convenience.** `MentionInput`
advertises all four command tags unconditionally (`KNOWN_COMMAND_TAGS`), and as of this
session's `SmartCompose` change **advertising a tag obliges routing it** (§9.6). Dropping
`MentionInput` into quick capture would silently promise `@workon` / `@quickchat` /
`@backlog` there too. Either wire all four or keep the plain textarea.
**Recommend: keep the plain textarea**, hint `@hermes` in the placeholder, revisit later.

### 9.5 Phase 9 — the Today nav badge — **(B, after 8)**

- Add `day` to `SEEN_TYPES`; give `GET /api/seen/unseen` (`api/routes/seen.ts:103`) a
  viewer-scoped `day` arm. It must honour the hide predicate (§2.5 row 24) — a dismissed
  thread must not badge.
- Render through the **existing** `navWithBadges` memo in `Sidebar.tsx` that already drives
  the My Tasks and Meetings badges, using `AttentionChip` — **do not mint a new chip**
  (CLAUDE.md Rule 29 / the Attention & Notification Canon).
- **Badge honesty (Rule 73) is the acceptance test, not a nicety:** it must count exactly
  what it claims (Hermes answers you have not seen), **drain** when you open Today, and
  **click through** to the thread. A badge that lights on your own question rather than on
  Hermes's answer is a lie — gate on the *reply*, not the root.
- Drain via `useMarkSeen('day', todayKey())` on `TodayPage`.

### 9.6 Wave 1, shipped separately — the `@workon` class fix

Reported by the owner this session: a typed `@workon <text>` in a **project Notes** composer
did nothing. Root cause was **not** the launch machinery — it was a promise/routing split:

- `MentionInput` advertises `@workon` in **every** composer (`KNOWN_COMMAND_TAGS`), tints
  the token, and renders a "command recognized" badge.
- But `SmartCompose` custom mode intercepted launch tags **only when `launchContext` was
  passed** — opt-IN. Un-opted composers posted the seed as a plain team-visible note,
  launching nothing, and **breaking the seed-isolation contract** in `useLaunchCommands.ts`
  ("`@workon 'remind me where we saved the IRB'` must never surface in team activity").
- `ProjectDetail`'s quick-compose was patched as an **instance** on 2026-07-21;
  `ActivityStream`'s note + comment composers were left broken — which is exactly where it
  was hit again a day later.

Fix (the class, not a third instance): **inverted the default.** Every composer now
intercepts; a surface that routes tags itself opts OUT via `ownLaunchRouting`
(`MorningThoughtCompose` only, which owns `@quickchat`'s `forceHome` override and already
fails `@workon` loud at Route 0.5). `ActivityStream`'s two composers gained a real
`launchContext` carrying `project.primary_folder`. A new composer now fails **loud** rather
than silently posting a command as prose.

⚠️ **Unverified at the time of writing** — an MSYS `fork()` storm blocked `tsc -b`,
`typecheck:api`, commit, and deploy across 12 consecutive attempts. Must be built, tested
and deployed before this is claimed as fixed.

### 9.7 Revised sequencing

| Wave | Contents | Deploy |
|---|---|---|
| **1** | §9.6 `@workon` class fix | its own deploy (small, unrelated, already written) |
| **2** | Phases 0-6 **+ 8 + 9** | one deploy, per the owner's "one combined wave" |

Phase 7 (Ask the Lab / `backlog_idea` disposition) stays deferred — §0 already established
`lab_question`/`lab_answer` have never held a row, making it a retirement question.

### 9.8 `scripts/check-activity-reads.mjs` — buildable spec (Phase 1, FIRST)

§9.2 promoted this from a nice-to-have to the thing the retrofit is driven off. Spec:

**Scan:** `api/**/*.ts`, excluding `*.test.ts`.

**Unit of analysis is the SQL STATEMENT, not the line.** These queries are multi-line
template literals; a line-based grep for `FROM activity_entries` would look at one line and
never see the `WHERE` three lines below. Extract each template literal (or string) that
contains `activity_entries`, flatten whitespace, then test the flattened statement.

**Pass condition —** the flattened statement contains `hidden_at IS NULL`
**or** the statement's source range carries the marker comment
`activity-hidden-exempt: <reason>`.

> ⚠️ Do **not** pass on the mere presence of the substring `hidden_at`. Every feed will
> also SELECT `hidden_at` to render the "hidden" affordance, so a bare-substring check
> would green-light a read that selects the column and never filters on it — a checker that
> reports success while the leak is live is worse than no checker. Match the predicate.

**Known exemptions** (each needs the marker + reason at implementation time, and each is an
owner-visible decision, not a convenience):

| Site | Reason |
|---|---|
| `api/lib/activity-entry.ts:646` (`dispatchHermes` transcript) | **Owner requirement 9.1.5** — Hermes must still see dismissed threads or "remember this morning" breaks. |
| `api/lib/activity-entry.ts:215` (parent resolution on write) | Write-time inheritance; must read the parent's `hidden_at` to copy it. |
| `api/routes/activity.ts:59, 101` | Auth-only lookups; they fetch a row to check who owns it, they do not render it. |
| `api/routes/activity.ts:196` (`handleCreateActivityReply`) | Verifies the caller can see the parent. Replying to a hidden root is legitimate. |
| `api/routes/ai-requests.ts:251, 278, 290, 418, 426` | Hermes response routing + placeholder resolution. Internal plumbing, never rendered. |

**Prove the gate before trusting it.** Do exactly what this repo did for `typecheck:api`
(SESSION-HANDOFF 2026-07-22): introduce a deliberate violation, confirm the checker FAILS,
revert, confirm it PASSES. A gate that has never been observed failing is an assumption, not
a control. Record both outcomes in the Phase 1 commit message.

**Wiring:** its own npm script, run in CI and in `deploy:pages:gated`, alongside
`typecheck:api`.

### 9.9 §8 unknown #1 — **CLOSED by reading the listener source**

`hub_ai_listener.py` lives in Peripheral Brain, which IS mounted as a working directory.
Read at `C:/Users/ingra107/Peripheral-Brain/scripts/scheduled/hub_ai_listener.py`:

- **(a) Does it tolerate `context = NULL`? YES — verified, two independent guards.**
  `_parse_entity_context()` opens with `if not context: return None, None` (`:1199-1200`),
  and `build_prompt`'s fallback arm is `elif context:` (`:456`) — a falsy test. A JSON
  `null` arrives as Python `None`, which is falsy at both. `build_entity_context` then
  returns `""` and no entity block is appended. **No crash, no cross-repo lockstep, no
  listener change needed for the `day` lane.**
- **(b) Does it branch on `source_type` beyond the artifact path? Only in three places,
  none of which affect `daily_thought`.** Full enumeration of `source_type` reads:
  `:436` (`build_prompt`), `:442` (`== 'lab_question'` → conversation history),
  `:1344` (`artifact_comment` revision lane), `:1501` (`backlog_idea` lane), `:1576`
  (dispatch). `daily_thought` takes the default path today and will continue to.
  **§1.3's "keep `source_type='daily_thought'`" is confirmed correct.**

### 9.10 🔴 CONFLICT — owner decision 9.1.5 is NOT delivered by any existing mechanism

**Owner requirement:** ask a fresh question at 4pm and Hermes should recall the separate
9am conversation ("hey remember we were talking this morning… what did you find re: xyz").

**What the code actually does — verified, not inferred:**

- Decision 9.1.1 makes **each ask its own thread root**.
- `dispatchHermes` assembles its transcript with
  `WHERE (id = ?1 OR parent_id = ?1) AND id != ?2` (`api/lib/activity-entry.ts:646-654`) —
  **scoped to a single thread root.** Sibling threads are structurally invisible to it.
- For a brand-new root, `?1` is the entry's own id and `?2` excludes it, so `prior` is
  empty, the `if (prior.length > 0)` wrapper at `:658` never fires, and the model receives
  the bare question.
- For `entity_type='day'`, `context` is NULL by design (§1.3), so the listener adds no
  entity block either (§9.9).

**⇒ A new ask on the day page reaches Hermes with ZERO awareness of every other
conversation that day. The owner's stated requirement fails.**

This also **directly contradicts §1.3's row** *"Today-bar ask is CHEAP — preserved **by
construction** … a fresh root has no prior. **No special case needed.**"* That row was
correct when a day ask had no memory requirement. Decision 9.1.5 makes a special case
mandatory, and the two goals genuinely trade off: day-scoped memory costs prompt tokens on
**every** Today ask, which is precisely the cheapness the owner was recorded as valuing.

**This needs an owner decision — do not silently pick one.** Sketch of the options:

| Option | Mechanism | Cost |
|---|---|---|
| **A — day-scoped context** | For `entity_type='day'` only, widen the transcript query from "this root" to "today's roots + their replies" (still `visibility`- and requester-gated, hidden INCLUDED per 9.1.5). Reuse `THREAD_CONTEXT_MAX_*` caps. | Every Today ask carries the day's transcript. Simple, honest, matches 9.1.5 literally. Kills "cheap by construction". |
| **B — continue-in-thread only** | No cross-thread memory. Continuity comes from replying **inside** an existing thread, which already works. | Free. But 9.1.5 as stated is not met — "remember this morning" fails on a new thread. |
| **C — cheap default + explicit recall** | Bare ask stays cheap; a marker (a toggle, or `@hermes++`) opts that ask into the day transcript. | Preserves both, at the cost of one more thing to know. |

Recommendation: **A**, because 9.1.5 was answered deliberately after being shown the
alternatives, and because C adds a token the owner has to remember at the exact moment he
is least likely to (mid-thought). But the cheapness trade is real and is the owner's call.

**RESOLVED (same session): option A**, plus older-day retrieval scoped INTO this wave
(§9.11). The owner was shown the "this widens an already-large wave" objection and chose
the wider scope deliberately. Do not silently re-scope it down.

### 9.11 Phase 10 — older-day retrieval — **(B, after 8)**

Owner decision: Hermes should be able to reach conversations from *previous* days, not just
today. Today = automatic (§9.10 option A); older = retrieved.

#### 9.11.1 CORRECTION to the cost estimate the owner was shown

The owner was told this needs "a tool through the fence + an auth model." **That was the
naive design and it is probably wrong — the real cost is materially lower.**

`hub_ai_listener.py:408` states it explicitly: *"The parent listener process is **NOT
fenced**, so it resolves the entity here."* The listener already performs authenticated
Hub reads on Hermes's behalf via `_hub_get_json()` (`:316-331`) and pastes the results into
the prompt — that is exactly what `build_entity_context()` does for tasks and projects
today. Older-day retrieval is **the same pattern with a different route.**

Consequently:

- **No fence change.** `HERMES_ALLOWED_TOOLS` (`:86-91`) stays `Read` / `WebSearch` /
  `WebFetch` / `pubmed`. The #433 hardening is untouched.
- **No new auth model.** The listener already holds `PB_API_KEY` and already calls the Hub.
- **No new externally-reachable capability for Hermes itself.** Hermes remains a
  pure read/answer process that cannot pull; the listener keeps doing all pulling.

Prefer this over granting Hermes a retrieval tool. Granting the tool would widen the
broadest externally-reachable headless entry point in the system for no benefit the
listener-side pattern doesn't already provide.

#### 9.11.2 🔴 THE HAZARD — retrieval must be REQUESTER-scoped, and the obvious implementation is a leak

**Day threads default to `visibility='author'` (owner decision §0.1) — i.e. PRIVATE.**

**The listener authenticates with `PB_API_KEY`, and an API-key caller BYPASSES the
visibility gate** — Rule 70: *"PI/API-key sees all"*; Rule 78 documents the identical
carve-out on `ai_requests` precisely so the PB listener can poll it.

⇒ A naive `_hub_get_json(f"/days/{date}/activity")` returns **every user's private day
threads**, and Hermes would answer *any team member's* question using the owner's private
notes. That is not a hypothetical: it is the **exact shape of both privacy leaks fixed on
2026-07-22** — a caller that structurally cannot see who is asking, therefore cannot
filter — reproduced with a brand-new mechanism, on the one endpoint every team member can
fire.

**Non-negotiable design constraints for Phase 10:**

1. Retrieval MUST be scoped to `req['requested_by']` — the human who asked — and **never**
   to Hermes's identity or to the API key's ambient PI powers.
2. Therefore the day-activity route needs an explicit act-as-requester parameter (or a
   dedicated retrieval endpoint taking `requested_by`) that applies
   `activityVisibilityGate` **for that user**, not for the caller. The API key authorises
   the *call*; it must not widen the *audience*.
3. **Fail CLOSED.** Absent or unresolvable `requested_by` ⇒ return nothing. Never fall
   back to unscoped results.
4. Must also honour the hide predicate per §9.1.5's rule: hidden-but-not-forgotten applies
   to **the requester's own** hidden threads, never to anyone else's rows.
5. Add a test that a non-owner requester retrieving a date on which the owner wrote a
   private day thread gets **zero** rows. This is the regression test for the leak class,
   and it should exist before the feature does.

#### 9.11.3 Still to design — needs a codex consult before implementation

Open, and deliberately NOT resolved unilaterally:

- **Trigger.** Always fetch a bounded index of recent days? Detect temporal references
  (fragile)? A two-pass "does Hermes need a prior day?" round-trip (an extra model call)?
- **Shape.** Full transcripts (expensive) vs. an index of dates + first ~100 chars per root
  (cheap, and enough for Hermes to say *"on Tuesday you discussed X"* and let the user click
  through).
- **Bound.** How far back, and what caps — `THREAD_CONTEXT_MAX_*` are per-thread and will
  not translate directly.

This phase should not be implemented until that design pass happens (the shell outage
blocked the codex consult that would otherwise have run alongside this write-up).
