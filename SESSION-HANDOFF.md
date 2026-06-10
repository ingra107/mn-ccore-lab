# Session Handoff — 2026-06-09 (evening)

## ✅ ALL THREE WORKSTREAMS (A+B+C) SHIPPED + DEPLOYED — deploy `8c5b8950` on `0f3d09a8`, HEAD `fd5182da`

**One session executed the whole queue: 52 commits, 5 agent waves, 751/751 API tests, deployed + smoke-verified. Schema is v75.** Full record: `CHANGELOG.md` top entry. The work:
- **A (design polish):** all 30 `docs/design-audits/2026-06-09-polish/TICKETS.md` tickets + all 21 cold-audit `SUPPLEMENTAL-TICKETS.md` tickets (S1–S21). The cold audit ran FIRST (4 lenses, 40 fresh prod screenshots at `review/claude-design-20260609T-audit/`), then merged with Claude Design's round per Nick. Headline fixes: deep-link consumers (`useOpenParam` — search→task/⌘K/copy-link now actually open the task), Manuscripts = **stage ≥ writing** (was a filter tautology rendering all 78 projects), fake snooze-undo fixed, ProjectDetail category silent-revert fixed, Activity "anonymous" actors canonicalized at the `logActivity` chokepoint, anchored-column width tokens (`--col-main: 960px`) + `DataPage` shell, first-click date popover, honest sync clock, one staleness truth (Settings sliders), global compact density (per-view toggles REMOVED), capture shortcut **`q`** (Cmd+N was browser-reserved, never fired), `useIsMobile` **768→1024** (UX-9: 768–1023 iPad-portrait = mobile-nav).
- **B (Today driver):** Nick decided **Today = THE cockpit; plan = synced task columns** `planned_for`/`plan_slot`/`plan_rank` (D1 v75 prod+test, brain.db mig 100/101, pb-schema 0.3.3, generic pull-back = zero new sync code). `useTodayState` re-backed via `src/lib/todayPlan.ts` (same API, one-time LS migration, `right_now` singleton). TODAY.md pins planned tasks (`📌▶`/`📌`). Meeting-capture on Today now persists to `meetings.notes` (debounced; `cal-*` iCal events honestly disabled). Decision: PB `Context/Decisions/2026-06-09-today-plan-task-columns.md`.
- **C (ENG backlog):** dead handler deleted, Narratives contract fixed (+ canonical `stageLabel()`/`stageColor()`), UnifiedMyTasks shim gone, PersonalPage→PATHS. Query-Resource primitive = proposal only (65 swallow-sites; needs paired error-UI; phased plan in the C agent report).

### ▶ NEXT (queued, none urgent)
1. **Nick eyeballs the live round** — esp. Today (plan now synced — plan a task, reload, check another browser), My Tasks overdue-first + `OverdueBanner`, Manuscripts (now a real subset), the new date popover, iPad-portrait nav. Post-deploy smoke all green but design is taste.
2. **B follow-up (its own session, plan written):** `docs/superpowers/plans/2026-06-09-today-cockpit-ia-consolidation-plan.md` — PB Sector planner retirement/migration (`daily_plans`), Personal strip removal, the stale `lab_settings.today_md` view verdict, pomodoro/intention disposition.
3. **Deferred with rationale:** JS-hover→CSS conversion (218 sites/57 files — dedicated pass); spacing token long-tail (342-site WARN baseline via new `scripts/check-token-snap.mjs`); ~25 borderline 0.75-opacity slate sites (codemod candidate); legacy `/portal/my-tasks-legacy` page retire (`/substrate-swap`-gated); Query-Resource phased pass; local-seed schema drift (`scripts/local-db-seed.ts` missing `waiting_since` etc. — blocks local journey tests; hub-backend candidate); a 768px journey spec to lock in UX-9.
4. **CLAUDE.md rules were updated this session** (v75, plan columns, `q` shortcut, useIsMobile 1024, Manuscripts identity, global density) — trust CLAUDE.md over older handoff sections below.

---

# Session Handoff — 2026-06-09 (morning, historical)

## ▶ (DONE — see above) Design polish round was teed up (3 parallel workstreams; see WORKPLAN.md top)

The post-deploy work split into three **parallel-capable** workstreams (`WORKPLAN.md` → "PARALLEL WORKSTREAMS 2026-06-09"):
- **A (ACTIVE) — Claude Design polish round.** Brief + prompt are on `main`: `docs/design-briefs/2026-06-09-next-design-audit-{brief,PROMPT}.md` (+ Codex audit `…-codex-hub-simplify-audit.md`). Scope = visual polish + workflow efficiency + "no dead ends" + delight; **width consistency = Tier-1**; the date-picker "first click pops the calendar grid AND the +1d/+1wk presets together" is the click-efficiency archetype to hunt. ⚠️ **Today / the daily-cockpit / the operating-day plan are OUT** (→ Workstream B). **Next action: Nick re-snapshots the repo in Claude Design → pastes the PROMPT → Design returns TICKETS.md → we implement.**
- **B (QUEUED — its own session) — "Today driver."** The operating-day plan split-brain (Today `localStorage` / MyTasks / PB Sector D1) + the one-cockpit IA + meeting-capture persistence. ⛔ Deferred from A; do NOT touch Today in the polish round.
- **C (QUEUED — parallelizable) — ENG-only backlog.** Dead `handleUpsertTodayMd`, Narratives data-contract break, query-resource primitive, stage model, legacy MyTasks, Personal `PATHS`.

Below: what shipped this session (the Slice C/D/E deploy that closed the B-5 skew).

---

## ✅ Slice C/D/E DEPLOYED to pages.dev — B-5 skew CLOSED (2026-06-09)

**Live = deploy `90626636` on commit `7bb1ccef` (HEAD) — Production/main.** Was stuck on B-5 (`dbf9cf97`/`1cd193f2`) for 2 days. `/api/version` 200 production; `/api/dependencies` 401 (clean auth-gate, no longer the column-error 500). Identity deploy-gate `npm run predeploy:identity` → **PASS**.

### Why this deploy was needed — the wrong-surface root cause (LESSON)
The PB sessions that "shipped" **Slice C** (`18680afa`, wire-flip Hub code) and **Slice D** (`7bb1ccef`, `project_dependencies` typed-PK migration) deployed the Hub Worker via **`wrangler deploy` → the unused `mn-ccore-lab-api.workers.dev`**, and smoke-tested against *that* surface (it has the new code + sees the migrated D1, so it passed). **But the team's real surface is `pages.dev`, which only updates via `wrangler pages deploy`** — it stayed on B-5. Meanwhile Slice D's **prod-D1 migration WAS applied** (D1 is shared across both Workers). Net live state until today: B-5 code (queries `from_slug`/`to_slug`) against a D1 table re-keyed to `from_project_id`/`to_project_id` → **`/api/dependencies` + `/api/narratives` 500'd in prod**, unnoticed because the smoke tests hit workers.dev. The Slice-D rollback runbook itself uses `npx wrangler deploy` — the tell. **Rule: a Hub deploy is `npm run deploy:pages:gated` (= `wrangler pages deploy`). `wrangler deploy` does NOT touch the team's site.** (This is the 2nd recurrence; see CLAUDE.md Quick Reference deploy row.)

### Slice-E gate gap fixed (was blocking the deploy)
Slice D added `project_dependencies.from_project_id`/`to_project_id` (typed FK) but **never registered them in the Project-Identity gate SSOT** → `predeploy:identity` fail-closed on `introspection_fail_closed`. Fixed: added both columns (`policy: typed_required`) to **both** byte-equal SSOT copies — PB canonical `scripts/db/project_identity_surfaces.json` + Hub copy `scripts/project-identity-surfaces.json`. Gate now PASS (both columns verified 0 non-typed; the L1 kg dangling-rel stays a tracked WARN). **These two edits + the 4 doc updates below are committed this session.**

### Project-identity convergence — now fully LIVE (storage + wire + display all converged)
The PB-side arc (Slices A–E) is closed AND now actually deployed to pages.dev:
- **Schema is v74** (was documented v70): v71 project fields, v72 meeting tags, v73 `projects.type`, v74 `waiting_since`/`email_link`; + Slice-D `project_dependencies` DROP+recreate (unnumbered DDL).
- **`tasks.project_id` 3-axis contract (CORRECTED):** storage = typed `proj_*` · **sync wire = typed `proj_*` (Slice C, 2026-06-09)** · browser `/api/tasks` display = slug (COALESCE in `task-cols.ts`). The old CLAUDE.md "wire = slug / PB pull reads slug" was true only of the browser read; the **sync** wire is now typed.
- **kg converged + detached:** Slice A re-keyed Hub + work kg to typed `proj_*` (the old "Hub kg still slug-format / never propagated" is FALSE now). Hub kg is a **detached store post-P4** (no steady-state PB→Hub kg path; cross-machine kg rides the brain event log) → the gate's 5 Hub-kg checks are WARN-only.
- **`waiting_since`/`email_link`** promoted PB-only → Hub-canonical (v74, synced, in `/api/tasks`).
- **pb-schema:** sole-emitter manifest (VERSION 0.3.2); Hub CI runs `python -m pb_schema.verify`. One non-urgent pointer bump to `70c7196` still pending PB-side.

### Sync is SAFE across any deploy boundary (verified in code)
PB pull requests `?wire=typed` but tolerates a slug response (B-5 ignored the param); `_resolve_task_project_fk` (PB `hub.py:375`) resolves slug OR typed, **fails closed** on unresolvable refs, and never clobbers a link to NULL. PB push (`hub_payload.py:334`) sends typed `proj_*`; B-5 `applyInsert` canonicalizes idempotently. No silent loss occurred during the 2-day skew.

---

# Session Handoff — 2026-06-07

## ✅ Slice B B-5 DEPLOYED to pages.dev (2026-06-07)

**Deploy `dbf9cf97` on commit `1cd193f2` — Production/main, LIVE.** `waiting_since` + `email_link` promoted from PB-only to Hub-canonical on tasks. Round-trip verified on `https://mn-ccore-lab.pages.dev/api/mutations` → `status: accepted`, `result_seq: 6120`; GET returned both fields; cleanup confirmed (seq: 6121).

**Note:** The prior session ran `wrangler deploy` (standalone Worker) which updated `mn-ccore-lab-api.workers.dev` only. pages.dev deploys via `npm run build && wrangler pages deploy dist --project-name mn-ccore-lab --branch main` (MANUAL, no CI auto-deploy on push). This B-5 deploy used that mechanism.

# Session Handoff — 2026-06-05

## ⏸️ PAUSED pending the PB P3-cut (2026-06-05). Project-identity is ORTHOGONAL + on hold.

> The brain-sync **P3 cut is mid-soak**; finishing it takes priority. **Next-session START HERE:**
> `~/Peripheral-Brain/Scratch/plans/2026-06-06-NEXT-SESSION-finish-p3-cut-and-decide.md` (home active → can close the cut).
> Project-identity status below: **Slice A DONE (Hub+work kg), gate (Slice E) shipped; 5 KEEP + home-kg + Slice C pending.**
> Do NOT resume Slice C or kg-data work until the P3 cut is closed (it's the lane Slice C rides). Don't conflate the two.

## ▶▶▶ AUTO MODE (post-compact) — EXECUTE: Project-Identity Convergence

**START HERE. Approved + prioritized by Nick (2026-06-05).** Read + execute the ticket queue in
`docs/superpowers/plans/2026-06-05-project-identity-convergence.md` IN ORDER — do not re-triage,
do not re-investigate (verified facts are in the plan). Decision: PB
`Context/Decisions/2026-06-05-project-identity-single-machine-identity.md`. Reconciled design:
`Scratch/project-id-decision-2026-06-05/SYNTHESIS-project-identity-northstar.md`.

**Decision:** ONE machine identity = typed `proj_*` everywhere internal (storage / FK / kg / sync
wire); slug = a one-way human projection (URL + display) only — a LEAF, never a hub. Ends the
recurring "slug load-bearing on an internal machine path" class (tasks, kg, propagation gaps).

**Order:** ~~Slice A~~ **DONE 2026-06-05** → build the symmetric **completeness GATE** (the
primitive — SSOT surface list + schema-introspection + runtime guards + round-trip test +
both-store/HOME dry-run) → **Slice C** (replication wire → typed PK via a dedicated typed contract;
browser `/api/tasks` STAYS slug; cross-repo, gated on the gate + HOME verification + snapshots,
fail-closed alias-resolving) → **Slice D** (project_dependencies / HISTORICAL disposition).
**Slice B** (5 straggler rows → typed) already DONE.

**✅ SLICE A COMPLETE (2026-06-05) — Hub + work brain.db converged to typed-only kg.** Record:
`~/Peripheral-Brain/Scratch/slice-a-kg-2026-06-05/SLICE-A-COMPLETE.md`. Tool:
`~/Peripheral-Brain/scripts/db/slice_a_kg_typed_rekey.py` (dual-planned + 4-agent adversarially
verified). Hub: 105 typed-orphan entities + 35 orphan rels re-keyed/merged to canonical `proj_*`,
174+451 `deleted_at`-only tombstones healed, GAP-4 (`tasks.project_id='multidiseasepred-xie'`
slug→typed + dead-source edge). brain.db converged via kg-only pull + local TEST/children cleanup.
Both stores verified 0 typed-orphan / 0 orphan-rel / 0 orphan-edges; 5 KEEP slug nodes by design.
**⚠️ MAJOR FINDING:** `PB_BRAIN_EVENT_LOGS=on` gates the Lane-3 pull (`hub.py:1253`) → the audit's
"live bleed via pull" was NOT active (kg pull skipped; brain.db wasn't being re-poisoned). Hub was
the dirty store; now clean. **OPEN:** (1) HOME brain.db kg still stale (flag-gated pull) — converge
via kg-only flag-off pull; (2) the flag / stuck event-log lane / outbox-retirement transition
(2026-06-03 handoff) is the systemic blocker to automatic cross-machine kg sync — Nick's
architectural call; (3) 5 KEEP slug nodes = B2 "create-new-project" candidates (deferred).

**HEADs:** Hub `main` `5921ce18` (live deploy `8cc00130` / `7653955d`); PB `main` `b3ef97e5`.
**Guardrails:** don't run `p2_hub_rekey_apply.py` as-is (projects.id already converged; doesn't
cover kg right); don't blind-rewrite `project:*` (dual-use namespace — tier it); don't flip the
wire before the gate + HOME verify; don't let `COALESCE(...,raw)` tolerance leak into internal channels.

---

## ▶▶ (2026-06-05, DONE this session) project_id read-boundary fix + edit-more + P6 + 9a007fd1 ALL DEPLOYED

**Live = deploy `7653955d` on commit `8cc00130` (2026-06-05) · both repos pushed · /api/version 200 production.** Ultracode session cleared the entire WORKPLAN "▶▶▶ NEXT SESSION" queue. Build + `tsc` green; **API suite 732/732**; journeys **6/6**; resolver verified against live prod data.

**1. `tasks.project_id` slug↔id — FIXED (the DECISION-FIRST item).** Decided **Direction 1 (store typed `proj_*` PK, present the SLUG at the read boundary)** via dual cold-plan + Codex + live-prod ground truth. Resolution is ONE chokepoint — a `COALESCE((SELECT p.slug FROM projects p WHERE p.id=t.project_id), t.project_id) AS project_id` subquery in `TASK_SELECT_COLS` (`api/lib/task-cols.ts`) — fixes the slug-keyed frontend AND the PB→Hub pull (same `/api/tasks` seq-cursor handler). `?project=` resolves slug→id; `meetings.ts` aliased `tasks t` (dropped the fragile `.replace`). Commit `e7d00d04`. **5 slug-straggler task rows backfilled → typed PK in prod D1** (Nick-authorized; verified 0 remain; needed for the id-only internal mutation paths). Decision doc + registry + plan-banner: PB `63367967`. CLAUDE.md rule added. ⚠️ **Do NOT re-key the frontend to `p.id`, do NOT run `p2_hub_rekey_apply.py`** — `projects.id` rekey already converged on work+Hub (76/76 + 73/73 typed). Slug is the wire form per the documented layering (master plan: "slugs are display/routing fields") + every read consumer is slug-keyed + cross-store typed-PK convergence is fragile (Hub D1 `kg_*` still hold slug-format project keys). (Self-audit correction: an earlier draft's "peripheral-brain-system PK divergence" was an alias, not a live divergence — work+Hub converged.)
- **2. `9a007fd1` Today fixes — runtime-verified + DEPLOYED.** journeys spec extended (undo-on-complete, planned-strip DoneBox+grip, Completed-today uncheck) — 6/6. Commit `897d5d81`.
- **3. edit-more — SHIPPED** (`73977e43`): shared `TaskQuickEditChips` (Status/Priority/Due/Project + "Open full editor →") on Today's `TaskDetailDrawer` + MyTasks `InlineDetail`, reusing FieldControls; full panel mounts locally.
- **4. P6 responsive — SHIPPED** (`8cc00130`): BottomSheet focus trap (UX-7), CreateTaskModal→BottomSheet on mobile, MyTasks ListView mobile grid (desktop power-grid untouched). PAGE-7 already present. **UX-9 tablet breakpoint DEFERRED** (global layout change; flagged).
- **5. key_links PB→Hub — NOT a bug.** Both sides have the same 3 projects with key_links; plumbing fully wired; it's a data-entry gap.

**▶ Remaining (small):** (a) **DH-5** — Nick's eyes on live Key Links (CF Access gated; data + component verified, can't automate). (b) **edit-more / P6 post-deploy visual** confirm (presentation-only; not journey-covered). (c) optional follow-up: reconcile the PB-project per-store typed-PK divergence (non-urgent; sync bridges on slug). (d) **UX-9** tablet breakpoint (deferred). The P2 prod rekey is now **moot** (parent table already typed) — its consolidated plan is banner-superseded.

**Session investigation artifacts (gitignored):** `Scratch/project-id-decision-2026-06-05/` (A1 ground-truth, A2 dual-cold-plan, codex synthesis + blind-spots, B3 key_links, S1 edit-more/P6 scope).

---

## ▶▶ (HISTORY 2026-06-04) Round-6 design batch DEPLOYED + LIVE (drag fix + P3–P6)

**Live = deploy `0d024aee` on `1bbb2406` (2026-06-05) · origin/main pushed.** The Round-6 design batch (`a231fea7`…`663043e5` + docs `1bbb2406`) is **DEPLOYED + LIVE** — live frontend bundle hash verified **== local build** (`index-Dt-iZcHv.js`), `/api/version` 200 production. Build + `tsc --noEmit` green; drag fix verified **3/3** on the local journeys stack (re-verified green after P3–P6). Don't re-triage a deploy decision.

**The deployed Round-6 batch (detail: `CHANGELOG.md` top + `WORKPLAN.md` → TASK-UI CONTINUATION):**
- **`a231fea7` — Today drag-to-plan FIXED** (Nick-reported). Root cause: grip was `opacity:0`-until-hover (users grabbed the non-draggable row body → no `dragstart`) + all timeline drop zones render above the task list with no HTML5 auto-scroll (below-fold tasks unreachable). Fix: always-visible grip + a **📌 no-drag plan button** (works on touch via `@media hover:none`) + `useDragAutoScroll`. Proof: `tests/local/journeys/drag-to-plan.spec.ts` (3/3). Rule 58 intact.
- **`c4fbb3ec` P3** `<DueLabel>` consolidation (5 surfaces; NOT full-row-into-cards — taxonomy) · **`958d835f` P4** global Settings density + skeleton/touch fixes · **`4a21efce` P5** new `src/components/ui/` {Button,Chip,Field,Modal} + adoptions · **`663043e5` P6** mobile pass (iOS focus-zoom, touch-reveal, overflow, PAGE-6, UX-8).

**⚠️ Committed but NOT deployed / NOT runtime-verified — `9a007fd1` (2026-06-05):** three more Today row bugs Nick hit live — undo-on-complete (`markDone` now fires the 5s undo toast + restores the prior plan slot), the planned-strip row swaps its raw checkbox for the shared `DoneBox` (mark-done tooltip) + gains a drag grip, and "Completed today" items are clickable to uncomplete. Build + tsc green; **runtime-verify (extend the journeys spec) + deploy still pending** — WORKPLAN → NEXT SESSION task 5.

**Shipped since 2026-06-01 (all deployed):**
- **`4d17036f` (06-04) — Hub renders `short_title`.** The shared `TaskRow` now displays `short_title || title` (full title on hover via native `title=` + still full in the detail drawer). The brain.db/D1 `short_title` field always synced to the Hub and was returned by `/api/tasks` (it's in `TASK_SELECT_COLS`), but the frontend read it **nowhere** — so 219–365-char RO3 titles dominated Today/MyTasks after Round-6 removed truncation (Rule 68). **Pure display gap; the short titles already existed in D1.** Backlog reconciled to 0 (1 straggler generated via `BrainDB.update_task`). Generation stays automated via **`generate-today` Phase 1b (daily, home)** — NOT a cron; no new schedule added. CLAUDE.md Rule 68 updated.
- **`12036dc5` B-8** (mutations/projects allowlist-lag), **`fc91ccd9` DH-6** (page empty-states via `<EmptyState>`), **`b733c424` DH-3** (`isTaskDone` sweep), **`b5f38d10` DH-4** (`dueLabelText`) — 06-04.
- **`33293abe` F1** (pb-schema submodule import, CONTRACT_VERSION 0.2.0), **`aa85c71b` P2 drop-slug** (store typed project PK not slug on FK cols) + test updates — 06-02.

**▶ OPEN THREAD — P2 Hub re-key prod-D1 migration (un-run, GATED).** The P2 *code* (typed project PK on FK columns) is deployed, but the **prod-D1 data rekey has not run**. Tool: `scripts/p2_hub_rekey_apply.py` (committed `4d... tidy`; dry-run default, fail-closed assertions). Template: `scratch/p2-hub-rekey.sql` (gitignored, regenerated from brain.db). Gates: ✅ F1 codegen · ✅ 4 ex-no-anchor projects · ✅ sentinel — ⬜ **HISTORICAL-table per-table policy** · ⬜ **`project_dependencies` slug-keyed decision** · ⬜ **Nick's go + both machines up + soft-freeze.** ⚠️ **UPDATE 2026-06-05 — this IS a confirmed LIVE mismatch, not safe cleanup:** 20/22 open linked tasks store `project_id` = the typed id, but the frontend resolves by slug AND the sync expects slug (`hub.py:2212 d1_project_slug`) → tasks render unlinked + group wrong, and the sync is silently broken too. The P2 write flip (`aa85c71b`) forgot both consumers. **Fix direction is UNDECIDED — needs a dual + Codex opinion first; see `WORKPLAN.md` → "▶▶▶ NEXT SESSION" → "DECISION-FIRST" block.** Do NOT run the rekey tool until that lands (and whichever direction wins must SUPERSEDE the conflicting old slug decisions).

**▶ NEXT — see `WORKPLAN.md` → "▶▶▶ NEXT SESSION" block (the queued, ultracode-ready pickup with full context for fixers):**
- **DECISION-FIRST: the `tasks.project_id` slug↔id mismatch** — get a dual + Codex opinion on direction, decide, **supersede the conflicting old slug decisions**, then fix (frontend + sync + maybe the rekey). Full origin/options in WORKPLAN.
- **edit-more** (design-promised inline quick-edit + "Open full editor →" on the Today/MyTasks drawers — currently no field editing or path to the full editor from those surfaces); **DH-5** Key Links eyeball (only 3 prod projects have any: `adhere-lpv-trial`, `oncology-risk-tools-lyons`, `ats-early-career-working-group`); **key_links PB→Hub sync gap**; **deferred P6** responsive items; **runtime-verify + deploy the `9a007fd1` Today UI fixes**.
- Parallelizable via ultracode (see WORKPLAN) — the slug *decision* gates only its own implementation.

**Loose working-tree files (after 06-04 tidy):** `dist-dryrun/` deleted + gitignored. `review/audit-results.json` stays tracked-but-gitignore-intended (machine-generated; shows as `M` — harmless, just never commit it; a clean untrack needs a bare index commit that Rule 13 bans, so left as-is). Still untracked by design: `review/MN-CCORE Lab Hub Design System (5)/` (the Round-6 design-tool source — like prior handoffs, zip+commit it if you want it preserved in git; otherwise local-only).

---

## ▶▶ (HISTORY 2026-06-01) Task-UI consistency refactor (P0–P2) MERGED + pushed to main

Executed the `review/MN-CCORE Lab Hub Design System (5)/design/` handoff (Round 6 task-UI consistency pass), P0→P2. **tsc + build green; P0 surfaces visually verified (dark + light) on the local stack.** All on `main` + **pushed** (author ingra107, no Claude attribution):

- `4ed8e657` — **P0 + P1 + P1.5**
- `b1f10a04` — **P2 §4** (status-as-truth)
- `aa15f556` — `/simplify` session-close cleanup
- `a19a7aa0` — local test-harness fix

**P0 — one shared row.** New `src/components/tasks/TaskRow.tsx` is the single canonical row: square = complete (never select/promote), body-click = expand, shift-click / long-press = select, full non-truncating titles on one fixed left edge, reserved priority dot, theme-aware `--task-*` tokens. Surfaces now use **thin adapters** that preserve all prior behavior — `today/TaskRow.tsx` (drag-to-plan, Right Now, workflow badges, drawer), `MyTasksRow` in `MyTasks/views/ColumnsView.tsx` (+ reused by `LanesView`), `HubTaskRow` in `portal/PersonalPage.tsx`. **Don't fork the row — extend its props.** **My Tasks List view is deliberately left as the protected power grid** (j/k/e/x nav + inline-edit columns; CLAUDE.md Rule 60).

**P1 — editor + due-date consistency.** Due-date field made uniform (`noContainer`); Key Links → compact inline chips in `KeyLinksEditor.tsx` (auto-applies to ProjectDetail); one date control (`DateInput` delegates to `InlineDatePicker`); new `src/components/DueLabel.tsx` + a sweep replacing hand-rolled `new Date(due+'T23:59:59') < new Date()` with `dateUtils.isOverdue()` across dashboard cards / Analytics / Deadlines / Grants / task views / Pulse / etc.

**P2 §4 — status-as-truth.** New `lib/taskGrouping.isTaskDone(t)` (= `t.status === 'done'`) adopted on the core surfaces; `completed`/`completed_at` still written through mutations. **§5 (no-double-bg + click-affordance) verified ALREADY-COMPLIANT** via screenshots + code inspection — no changes (the double-bg problem was the My Tasks/Today one P0 already fixed; TaskGridView already does body=open / checkbox=select).

**Harness:** `scripts/local-db-bootstrap.ts` now skips the superseded monolithic `schema-v48.sql` (it collided with v20's `pomodoro_sessions`, aborting the migration chain so `tasks.blocked_by` never landed → `/api/tasks` 500). `npm run test:local:setup` works again.

### ⚠️ Incident + lesson (shared-worktree concurrency)
Mid-session a `git stash` (signature: `WIP→reset: moving to HEAD` at 07:02) — most likely a `git pull --autostash` triggered by the **concurrent second Claude session in this same working tree** — swept ~17 uncommitted files. Recovered by hand re-application + commit (no work lost; the dangling stash `1903677f` is redundant/safe to drop). **Lesson:** running two Claude sessions on one checkout shares one index/worktree — uncommitted edits are fragile. Mitigation: commit-per-chunk, or give the second session its own `git worktree`.

### ▶ NEXT — tracked in WORKPLAN.md (NOT "optional" — see `## T1 — Design-handoff leftovers` → Round 6, items DH-3…DH-6)
- **DH-4** *(do this one)* consolidate the due-label text helper (TaskRow `DueChip` / `DueLabel` / MyTasks `dueLabel` → one `dueLabelText`).
- **DH-5** post-deploy visual verify of ProjectDetail Key Links chips + editor Due-date box (couldn't verify on local seed).
- **DH-3** finish the §4 `isTaskDone` sweep across the ~85 remaining dual-check sites (hygiene, not a bug — lowest urgency).
- **DH-6** page-level empty-state consistency pass.
- **Deploy:** nothing deployed this session — task-UI is on `main` only. Check live-vs-main + decide (see the 2026-05-28 section below for the still-pending hub-hardening deploy + its validator activation).

---

## ▶▶ (2026-05-28 — still-relevant deploy context) Hub hardening + primitive-enforcement MERGED to main; deploy pending

**Hub HEAD on main:** post-merge; the branch `hub-hardening-2026-05-27` was merged `--no-ff` with **68 commits** (34 hardening + 21 primitive sweep + 6 codex-pass-5 BLOCK fixes + 7 misc). **691/691 API tests, build green.** **PB main HEAD:** post-merge; the branch `primitive-write-result-2026-05-28` was merged with 3 commits (WriteResult typed return). All four codex review passes recorded (`Scratch/audit-2026-05-27/codex/{synthesis,pass2-synthesis,pass3-final/synthesis,pass4-primitives/synthesis,pass5-final/...}.md`).

**The 11 codex-pass-4-recommended class-of-bug eliminator primitives (the "slope-changing" structural work, all shipped):**
1. `defineRoute()` DSL at `api/lib/route-dsl.ts` — 236 routes migrated in `api/index.ts`; metadata explicit not path-derived
2. Generated route contract test at `api/routes/route-contract.generated.test.ts` — auto-emits PB-403 assertion per registered route
3. Typed branded Request at `api/lib/typed-request.ts` (`AuthedRequest`/`PIRequest`/`ProjectVisibleRequest`) + `request?:` lint. **Adoption deferred** (~200 handlers still take raw Request) — codex pass-5 said "either adopt or narrow claim to lint-only"; we shipped the lint, deferred adoption to a follow-on branch.
4. Runtime entity guard wrappers at `api/lib/route-guards.ts` (`withProjectWrite`/`withTaskProject`/`withExistingRowProject`) — 4 hand-rolled create-sites + 5 hand-rolled update-sites migrated
5. `TABLE_PRIVATE_COLS` expansion — email_drafts/inbox_events/regulatory_items/file_attachments (+gmail_draft_url, +r2_key added in Wave 4)
6. `FK_SLUG_FIELDS` expansion + `ALLOWED_TABLES` unblocking (Wave 4 fix — registry was dead until ALLOWED_TABLES caught up) + canonicalize at 6 direct-write routes that bypass `/api/mutations`
7. `SELECT *` lint at `scripts/check-select-star.mjs` — table-aware; 8-site baseline burned to 0 (W3-A); `--enforce` mode wired in package.json (W4-C)
8. `hiddenResource()` helper at `api/lib/hidden-resource.ts` — applied at the revision oracle path (W4-BE; the Phase 10 "fix" was incomplete)
9. `idempotentDelete()` wrapper at `api/lib/idempotent-delete.ts` — mode soft/hard; 9 sites migrated (3 in Wave 2 + 6 sibling sweep in Wave 4); 2 exemption-documented (deadline-cascade double-project gate; uploads R2 side-effect)
10. PB `WriteResult` typed return — silent `if result:` bypass is a TypeError; 11 writers + 22 callers + 13 tests; status semantics: `accepted`/`merged_clean`/`conflict` have `.ok=True` (Hub-wins convergence is rest state, not failure)
11. `cleanupWrapper.runCleanup()` at `scripts/cleanup-wrapper.mjs` — requires verified `_final_summary.json`

**Defensive lints (warn-on-new in dev, `--enforce` in package.json composite for CI):** color-concat (339-site baseline; recommends `withAlpha()`), `SELECT *` (empty baseline post W3-A), `request?:` (3 grandfathered cron-dual-invoke baselined → future Z1.7 to split cron from HTTP).

**Plan (primitive-enforcement):** `docs/superpowers/plans/2026-05-28-primitive-enforcement-plan.md`. 7 phases (Z1-Z7), 25 tasks, executed by 17 parallel subagent dispatches across 4 waves.

## ▶ NEXT — deploy decision

The only remaining decision: deploy. `npm run deploy:pages:gated` ACTIVATES the 4 Phase-A1 validators in `lab_settings` (flag-on since 2026-05-26; code ships with this branch). Phase 5 cleanup removed every prod row that would trip a validator → activation should be a no-op for the team. Post-deploy smoke plan (≥330s wait for the 5-min validator-flag cache, then probe each validator in order: `hub_validate_enums` → `completion_tombstone` → `conflict_hash` → `dedup_adoptable`).

Deferred items NOT in this merge: full typed-Request adoption (~200 handlers), generated-contract-test behavior matrix (currently shape-only), Z1.7 cron-vs-HTTP split for the 3 grandfathered `request?:` sites.

## ▶▶ (HISTORY) Hub hardening branch READY for review/merge/deploy

**Branch:** `hub-hardening-2026-05-27` (34 commits since the plan; not yet merged to `main`, not yet deployed). **Hub: 602/602 API tests passing, build green, working tree clean.** **PB main: 3 new commits** (Phase 3 retry/fail-loud + skill-doc corrections + push canonicalization). All Codex critical findings closed across three review passes (`Scratch/audit-2026-05-27/codex/{synthesis,pass2-synthesis,pass3-final/synthesis}.md`).

**What landed (full plan: `docs/superpowers/plans/2026-05-27-hub-hardening-plan.md`):**
- **Phase 0** local test env repaired to v69 + canonical seed + PI/non-PI fixtures + `TEST_MODE_KEY`.
- **Phase 1a** 4 shared ACL/visibility primitives (`actorSlugFromRequest`, `assertProjectVisible`, `projectRefToCanonical`, `safeTaskRow`).
- **Phase 1b** full ACL + PB-visibility sweep across **~50 endpoints** — READS + WRITES + cross-project FEEDS + meeting sub-routes. Notifications scoped to authed user; task-files attach/list/delete gated; sessions/lane3/inbox-events PI-gated; PB content blocked for non-PI on every project-linked CRUD + every feed. API-key passthrough preserved (PB-sync/hub_ai_listener still work).
- **Phase 2** `notes` privacy leak closed (tasks.ts/meetings.ts `SELECT *` + `/api/mutations` canonical_payload).
- **Phase 3 (PB)** Hub-first writes no longer silently lose updates — soft-failures durably INSERT a retry envelope (drain processes it; dead-letter after 3) + fail-loud caller doctrine. `/process` cannot strike a task off TODAY.md on a False return.
- **Phase 4** Hermes slug→id, upsert enum guard, delete idempotency-before-cascade (projects + tasks routes), single-project conflict→409, regulatory enum drift, `projectRefToCanonical` sweep, `/api/mutations` insert-path project_id resolver.
- **Phase 5** prod-data cleanup: **27 zz-test/fixture projects soft-deleted**, enum drift normalized, **78 orphan tasks reconciled** (69 + 9 drift), schema **v70** (`idx_projects_slug_active` UNIQUE partial index). PB push canonicalize (`hub_payload.py`) closes the orphan-class at the producer.
- **Phase 6** UX — dead controls wired/removed, fake dashboard data fixed (mentee velocity quoted-LIKE, grants relabeled "active", Day Score rename resolves dual-Lab-Health), shared `<QueryState>` distinguishes loading/auth-error/empty.
- **Phase 7** design ethos semantic tokens — `--task-*` CSS vars (light + dark, axe-AA-pinned); JS palette swapped to vars (`withAlpha()` helper); Today + MyTasks no longer dark-locked (light mode works); `section-ink` always-dark preserved; opacity-floor lint (WARN); monospace removed from pb-sector; Hermes Sparkles → HermesMark; sub-24px tap targets bumped.
- **Phase 8** WebSocket invalidation one-liner (was a silent no-op); Manuscripts redundant stage dots removed; Grants milestone panel consolidated to Post-Award.
- **Phase 9** doc drift — REFERENCE routing table, PB skill docs (sync push is a no-op for tasks/projects), hub-schema-sync agent.md DB name + wrapper.
- **Phase 10** coverage gaps — global error sanitization in prod (request_id + log-only details); PB-visibility contract test (15 reads + 18 writes + 8 feeds with body inspection + drift guard); delete-semantics standardized (idempotent 200); rate-limit gap documented (no middleware exists; `RATE_LIMIT_ENABLED` flag recommendation).

## ▶ NEXT SESSION — three decisions

1. **Review the branch.** Diff against `main`: 34 commits, scoped, path-explicit, ingra107-authored, no Claude attribution. Tests + build green.
2. **Merge + deploy decision.** Deploy ACTIVATES the 4 Phase-A1 validators — they were already flag-ON in `lab_settings` (set 2026-05-26) but the validator CODE doesn't ship in the current live deploy `a3ff900` (which predates `fc7c08f9`). Post-deploy plan: wait ≥330s for the 5-min validator-flag cache → smoke-test the 4 in order (`hub_validate_enums` → `completion_tombstone` → `conflict_hash` → `dedup_adoptable`) by writing a deliberately-invalid task per validator + verifying rejection. Phase 5 cleanup already removed every prod row that would trip a validator, so activation should be a no-op for the team.
3. **Schema v70** doc bumps landed in CLAUDE.md/REFERENCE.md/PROJECT.md.

**Artifacts:** audit bundle at `Scratch/audit-2026-05-27/` (FINAL-PLAN.md, COLLATED-PLAN.md, GROUND-TRUTH.md, findings/01-10, codex/{synthesis, pass2-synthesis, pass3-final/synthesis}). Phase 5 drift log at `~/Peripheral-Brain/Scratch/phase5-cleanup/_drift_cleanup_2026-05-28.json`.

> ⚠️ **SUPERSEDED — do NOT action.** Everything below referencing "Phase β", the `lww_zone_shadow.jsonl` review gate, "P1 SYNC-FIDELITY", and the "DEDICATED COORDINATED SESSION" is done or moot. Phase β shipped as a forward primitive 2026-05-25 (Tasks 8/9 descoped); the shadow-log window is moot post-enforce. Kept below as history only.

## ▶▶ (HISTORY) NEXT SESSION — Phase β of Increment 1A (COORDINATED, both machines)

**The full reviews-before-code → brainstorm → writing-plans → executing-plans pipeline RAN this session. Increment 1A Phase α is SHIPPED + DEPLOYED + LIVE. Phase β (the live-data cross-machine migration) was DEFERRED by Nick to a dedicated coordinated session — that is your next action. Do NOT re-run the review/design/plan work; it's done + committed.**

**DONE this session (2026-05-23):**
- **6-review wave** (3 Opus specialist + 2 Codex plan-audits) on the 3 interrelated plans → reconciled into ONE Nick-approved design: `docs/superpowers/specs/2026-05-23-time-sync-timeline-reconciliation-design.md`. Reviews persisted in `Scratch/reviews-2026-05-23/`. Key verified finding: wrong LWW overwrites are **UNRECOVERABLE in place** (`audit_log`=hash only `query.py:314`; CRDT=hash+latest-only `crdt.py:247-255`) → a snapshot is mandatory for β. `completed_at` resolved to UTC-store/display-local (not a CT exception); server-side display = rendering-machine OS zone.
- **Increment 1A plan** (`docs/superpowers/plans/2026-05-23-increment-1A-time-sync-foundation.md`, `d2de8ee2` → Codex-blocked → amended `217989c3` → spot-checked). Split into Phase α (done) + Phase β (next). **Plan 1B** (the ~91-site Hub display-migration to viewer-local) is still UNWRITTEN — write it after β, since it consumes `time.ts`.
- **Phase α SHIPPED + LIVE** (deploy `17d7cdd1`, `/api/health` ok, smoke-clean): Task 1 PB `timez.py`+`now_instant` (`569a604a`); Task 2 Hub `time.ts` (`be2eb1d4`); Task 3 lint R20-R23 WARN both repos (`43b9eb68`+`40058df6`); **Task 4 — KILLED the live LMM churn bug** via UTC-normalized atomic compare in `advanceProjectMovement` (`d9398a83`+`68b8d861`); Task 10 hazards — `operations.py:920` Bug-2 fix + backfill `--allow-post-utc-cutover` quarantine + zone-contract registry (`c00db519`). Deploy also batched the **`tasks.notes` redaction** (`66e5c9d0`) → LIVE.

**▶ NEXT: Phase β = Increment 1A Tasks 5-9 — DEDICATED COORDINATED SESSION.** snapshot both repos → fail-closed LWW enforce flip (3 pull-gates `hub.py:1278/1861/2002`) → `client_ts` cutover (cross-repo lockstep, Hub handoff spec first) → ONE stopped-world legacy UTC migration (`088_normalize_timestamps_utc.py`, frozen-CT converter) → delete `to_utc_dt` zone-guessing scaffold + lint WARN→ERROR. **HARD PRECONDITIONS — do NOT start β without ALL:**
   1. **Home laptop quiescent** (or Syncthing paused) the whole β window — β rewrites the Syncthing-synced `brain.db` AND changes how BOTH machines arbitrate vs the shared Hub D1. Running it while home is live → divergent `brain.db` + Syncthing conflict = the exact silent corruption β prevents.
   2. ✅ **DONE 2026-05-24 — `tests/sync` triaged + cleaned.** Were 18 deterministic failures (+1 flaky), ALL stale-test debt asserting deliberately-deleted behavior (JSON dual-write `e29c30fd`, symmetry checker `9528f79c`, pre-mig-073 key_link, pre-`abeebc51` enum casing) — **zero real regressions**, none timezone/LWW. Retired/updated in PB commit `4427a808`; suite now **328 passed / 0 failures**. ⚠️ **Carry into the watch window (#4):** the pull-symmetry auto-guard (`.githooks/check_pull_symmetry.py`) was deleted `9528f79c` and β edits exactly those 3 gates (`hub.py:1278/1861/2002`) → do MANUAL symmetric-gate verification; no automation catches an asymmetric change now.
   3. **Snapshot FIRST** (rollback artifact; overwrites are unrecoverable). Plan Task 5 has the exact commands. Valid ~hours → snapshot→flip→watch→restore-or-discard.
   4. Run **fail-closed** + the plan's 2-hour watch window (exact diff queries, count=0, restore trigger). `_ISO_T_SHIFT_ELIGIBLE_IDS` (Task 8) ships EMPTY (fail-closed) → hand-audit + populate from real naive-ISO-T candidates, rehearse on a copied brain.db, before applying.

> **Increment 2** (Activity-timeline/comments, P2) stays specced + amended (`docs/superpowers/specs/2026-05-23-activity-timeline-comments-design.md` + the opus/codex timeline reviews) but UNPLANNED-for-build. It MUST follow β's `client_ts` cutover (shared files). Extend `activity_log` (visibility-gate the public endpoints); remove ALL notes→description paths incl. the create-path leaks (`query.py:736/900`); add a Hub Activity write transport.
> **Going-forward rule** (global CLAUDE.md): any architectural/substrate change gets reviews-before-code → brainstorm → writing-plans → executing-plans. Phase β execution is already grounded by all four — it just needs the coordinated window.

---

## Current State

| Item | Value |
|------|-------|
| HEAD | Hub `fc4069bf` on main, pushed (2026-06-04 — session-close docs/simplify atop short_title fix `4d17036f`; preceded by B-8/DH-6/DH-3/DH-4 `12036dc5`…`b5f38d10` on 06-04, F1+P2-drop-slug `33293abe`/`aa85c71b` on 06-02). Live deploy is on `4d17036f` — the close commits are behavior-identical. |
| Deploy | `59b02aa8.mn-ccore-lab.pages.dev` (2026-06-04) — Production/main, LIVE on `4d17036f`. Verify: `wrangler pages deployment list --project-name mn-ccore-lab`. |
| Build | GREEN (0 TS errors, `npm run build` 2026-06-04) |
| API tests | Hub API suite green as of the 2026-05-28 hub-hardening merge (**691/691**); not re-run this session (frontend-only change). PB `tests/sync/`: 328 passed / 2 skip / 0 failures (2026-05-24). |
| Schema | **v70** prod D1 (`idx_projects_slug_active` partial UNIQUE, Phase 5 2026-05-28). brain.db migration high-water **093**. |
| API auth | GET endpoints locked down (unchanged from 2026-05-15) |
| Team adoption | Not yet broadly directed. |

## Latest — 2026-05-22 evening: Pre-adoption SECURITY tier (T0) shipped — orchestrated 3-agent batch

Full pipeline executed: plan (`docs/superpowers/plans/2026-05-22-hub-pre-adoption-batch.md`) → codex plan-audit (gpt-5.5, **BLOCK→ship-after-amend**, 217K tokens, every finding verified) → amendments folded in → **3 parallel Opus agents** (BACKEND `api/`, FRONTEND `src/`, SYNC PB — disjoint file domains, edits-only, orchestrator committed) → build/test/commit/deploy/smoke.

**Shipped (`0a612459`/`45911e6d`/`7c222e65`; deploy `b9e31ca8`; PB `148138e3`):** SEC-T0-1..9 (auth-aware public-GET projections incl. NEW `/api/meetings` + `/api/team/pulse`; search PB-visibility; digest authz; tasks.notes redaction on BOTH endpoints; shared protected-field null-reject across 3 write paths; ~11-site actor-identity policy; cascade gaps; **NEW codex-found attachment visibility gate**; JWT fail-closed + X-API-Key) · CT-2 server+frontend (`ctToday`/`localDateKey`) · FAKE-2 `<HermesPending>` · CON-2 (emailSlug LUT 3→21, res.ok guard, TaskRow types) · DH-1 seed template · PB sync NULL-clear symmetry. **api tests 199/199**, build GREEN.

**Codex caught (all fixed before dispatch):** B1 missed `/api/tasks/:id` + mutation inserts; B3/B4 needed handler signature changes (no auth param) + `photo_url` not `photo`; B5 missed the single-task `SELECT t.*`; the SECURITY-vs-CORRECTNESS commit split was fiction (collide in projects.ts/index.ts → one BACKEND commit); `pb-sector.ts:142` is NOT a today anchor (don't touch); 6 NEW holes (meetings, team/pulse, 4 actor sites, attachment visibility).

**Follow-ups (not blockers):** ~13 more frontend UTC-today sites outside AM-7 (CalendarPage extras, CommandPalette, Dashboard, ProjectDetail, etc. — date *display*); dead `isPublicGet` regex for non-existent `GET /api/team/:slug`; the "/api/team/:slug leak" the backend agent flagged was a **false positive** (no GET handler exists — only POST update). DH-1 needs real grant data to apply the seed.

## Latest — 2026-05-22 PM: T1 correctness batch (the WORKPLAN directive, DONE)

Executed the full "▶ NEXT SESSION" directive (fixes first → fresh Codex audit as the gate).

**`5f5f597d` — T1 batch:** CT date helper (`api/lib/ct-date.ts` `ctToday(offsetDays)`) replacing 10 UTC "today" anchors + paired window-bounds across tasks/meetings/pb-sector/proactive-brief/projects/digest-email (rolled to tomorrow after ~6pm CT). STATE-2 (ProfilePage `['team-raw']` → real useQuery so save-invalidate refetches). STATE-1 (TodayPage done-from-cache: reconciliation effect prunes optimistic flag on cache-confirm + markDone onError rollback + isToday() instead of UTC slice). Enum-drift audit + DAT-4 realtimeBus: verified clean, no change.

**`909c6e8b` — Codex-gate fixes:** `/codex-cli` audit (synthesis `Scratch/codex-t1-verify-2026-05-22/`) returned Block with 2 critical + 5 minor, all verified + fixed: pb-sector meetings query used SQLite `date('now')` UTC vs CT `today` (dropped today's meeting after 6pm CT); digest date LABELS used `toLocaleDateString` w/o timeZone; reverted over-migrated `fourteenDaysAgo` to UTC; `ctToday` hardened with formatToParts; TodayPage `localDoneIds` dedup; ProfilePage query auth-gated.

**`cf85cfa0` — docs:** corrected CLAUDE.md deploy rows (manual-only; token from secrets.ps1; push≠deploy; pages.dev=prod vs unused workers.dev).

**Also:** deployed `af3189f0` (verified live on 909c6e8); test D1 reconciled to prod (hub-schema-sync — was missing 27 tables + cols, now 76 exact match); librarian corrected 3 stale brain.db agent_knowledge entries that falsely claimed "Pages auto-deploys on push via GitHub Actions."

**`8cb953df` + `8ebb490e` — 5-pass Codex "simplify + improve" review** (WORKPLAN-blind, exclusion-chained, ~8 findings spot-checked accurate): graduated into `WORKPLAN.md` "Codex 5-pass review" section + `docs/reviews/2026-05-22-codex-simplify/`. **Top output = a pre-adoption SECURITY tier (T0)** — all NET-NEW, none active yet (team adoption not started): over-exposed public GETs (PB titles + emails), search ignoring PB-category visibility, `/api/mutations` nulling protected fields, 9 identity-canonicalization bypasses, cascade gaps. The "fail-open JWT" was verified a NON-issue (CF_ACCESS_TEAM_DOMAIN/AUD set in prod). Also: ~12 more CT/UTC sites the api-only sweep missed (PB Sector/regulatory/submissions/conferences/frontend Calendar).

### ⚠️ Deploy + auth — learned this session (see CLAUDE.md Quick Reference)
Deploy is **MANUAL ONLY** — `npm run deploy:pages:gated`; pushing to origin/main does NOT deploy. Auth via **`CLOUDFLARE_API_TOKEN`** (PB `scripts/scheduled/secrets.ps1`), NOT interactive `wrangler login`. Verify live commit: `wrangler pages deployment list --project-name mn-ccore-lab`.

## What shipped earlier 2026-05-22 (AM) — verify-first batch

Nick: "do Batch 1 + Batch 2 + schema migrations, but verify each is still needed first." Verification killed 4 of 9 backend items as already-fixed and deferred 3 of 5 schema items as dead columns. Net 8 real changes shipped + deployed.

**`3bd5d419` — 5 backend correctness fixes (Batch 1+2):**
- SEC-4 timezone DST (`pb-sector.ts` + `digest-email.ts` → `Intl.DateTimeFormat('America/Chicago', h23')`)
- SEC-6 project FK resolver on pb-sector capture
- DAT-3 `/api/tasks/batch` returns `{ok,count,applied,failed}` (additive)
- DAT-6 meeting-notes 404 on missing meeting
- DAT-8 regulatory renew wrapped in `env.DB.batch()`

**`9eb9b192` + `5483d30b` — D7 (`projects.stage_entered_at`, fixes FAKE-5):** schema-v68 (Hub-only) + frontend surface + `daysInStage` fix. The write engine (co-flip in `applyPatch`, fires on any stage transition) lives in `8990acb7` — see heads-up below.

**`1c40fa2a` — D22 (typed activity_log events):** stage_change, pi_change, project_rename, assignee_change, role_assignment. No schema needed (table existed).

**Verified ALREADY-FIXED / deferred (no work):** DAT-1 (PK_COLUMN map), DAT-2 (ALLOWED_TABLES), DAT-5 (404/400 guards). D8/D9/D28 deferred — dead columns until their features are built. `meeting_cancel` N/A — no cancel handler.

**Then: Codex audit + audit-fix batch.** Ran a `/codex-cli` state audit (synthesis: `Scratch/codex-state-audit-2026-05-22/synthesis.md`). It caught real misses, all verified + fixed in **`6a69cfb2`** (deploy `4681a29c`):
- **advanceProjectMovement** matched `WHERE id=?` only, but tasks store project *slug* → silently never advanced `last_meaningful_movement` (regression in `8990acb7`). Now `id=? OR slug=?`.
- **D7 new-project hole** — `handleCreateProject` didn't set `stage_entered_at` → new projects NULL → bug recurred. Now set on insert.
- **SEC-5 was wrongly dismissed** — random UUID per submit meant double-click made duplicate inbox rows. Now a stable per-draft id reused across retries (server `ON CONFLICT(id)` dedups).
- **Manuscripts status enum** — UI sent `pending`/`completed` the server rejects → silent revert. Aligned to `active/waiting_external/blocked/done` (both dropdowns).
- **D22 batch-assign** now emits `assignee_change` (was single-task only).

## ⚠️ Heads-up for next session

1. **A background `builder` agent committed AND pushed to this repo concurrently** (`8990acb7` advanceProjectMovement, 09:49). Its commit wasn't path-explicit, so it **swept this session's D7 `applyPatch` co-flip into it** — that's why the stage_entered_at write engine is in a commit labeled "advance project movement." Code is correct, `ingra107`-authored, no Claude attribution. But: if a builder agent is running, coordinate / expect concurrent commits. (The slug/id bug `8990acb7` introduced in advanceProjectMovement was caught by the Codex audit + fixed in `6a69cfb2`.) Still-open follow-up from that commit: `stale_active_since` NULL doesn't pull back to brain.db (hub.py `_w1col` truthy gate skips NULL) — companion fix needed for full symmetry.
2. **Test D1 (`mnccore-lab-test`) is drifted** — missing schema-v55 columns (`last_meaningful_movement` et al.). Surfaced when v68's original backfill referenced one. Pre-existing; worth a janitor/schema-sync pass to bring test D1 current with prod.

## Prior session — 2026-05-15 (13 commits)

Security (digest XSS/escapeHtml, GET API auth lockdown, admin endpoints deleted, PB POST PI-gating, upload R2 integrity), data/naming fixes (ProjectDetail archive, Manuscripts categories → 3-bucket, digest enums, search comment join, v66 `hub_decisions` rename), UX (folder-link drive letters, mnccore-handler, transcript honesty), and the CLAUDE.md diet + WORKPLAN creation. Full detail in `CHANGELOG.md` + git history. **NOT fixed (intentional):** project delete cascade swallow-and-continue (documented design decision, `projects.cascade.test.ts` B-CRIT-05).

---

## Next Session Playbook

> ⚠️ **SUPERSEDED 2026-05-27.** The P1 SYNC-FIDELITY / shadow-log / notes↔description-protocol items below are DONE or superseded by the Hub-first simplification + the M5 plan. See the CURRENT banner at the top + `Scratch/audit-2026-05-27/GROUND-TRUTH.md`. Kept as history.

**▶ P1 SYNC-FIDELITY is the active priority (mission north-star #1).** State: Track A safe wins SHIPPED (frozen-row trust-tax gone), P0/P1 root-cause front-end SHIPPED (PB `61c53d78`, 51 tests) with a **provenance shadow-log running on the 3 pull-gates — 48h window started ~2026-05-23 03:00 UTC**. **⏰ NEXT ACTION (~2026-05-25, after the window): review `~/Peripheral-Brain/data/logs/lww_zone_shadow.jsonl`** — if 0 "new-decision-wrong" rows, proceed with the gated tasks (flip pull-gates to origin-aware; Task 5 LMM writer→UTC; Task 6 `client_ts` explicit-Z + Hub `advanceProjectMovement` cutover, CROSS-REPO with hub-backend; Task 7 43-row migration). Plan: `~/Peripheral-Brain/Context/Decisions/2026-05-22-sync-lww-timezone-unification-v2.md`. **▶ NEW DESIGN DECIDED (P2) — Activity Timeline + Comments.** The `notes`↔`description` question is RESOLVED → **Model A** (consolidate the 4 overlapping text fields → clean **Description** + unified **Activity timeline** with a one-line `MentionInput` comment composer + `@`→`NotificationBell`; **`notes` becomes brain.db-local-only**). Spec (detailed, with exhaustive read/write map + migration questions): **`docs/superpowers/specs/2026-05-23-activity-timeline-comments-design.md`**. Core problem it fixes: Hub `description` is wrongly an *append-target* for brain.db notes. **Next-session protocol (Nick's explicit instruction):** (1) review whole WORKPLAN + this spec; (2) `/codex-cli` review of JUST this part; (3) Codex must output explicit step-by-step instructions to **(a) alter the plan** and **(b) carry out the notes+comments migration**; (4) then implement under P2. Out-of-scope per Nick: comment auto-changing a structured field. Independent quick win: redact the residual `SELECT *` `tasks.notes` leak (`tasks.ts:149/339/466/934` + `proactive-brief.ts:18/25`). Then P2 (Today/MyTasks completeness) → P3 (research SoR) → P4 (Co-Scientist) per WORKPLAN north-star.

---

**The TIER-0 SECURITY batch is DONE + DEPLOYED** (2026-05-22 evening, `b9e31ca8`) — SEC-T0-1..9 + attachment visibility + CT-2 + FAKE-2 + CON-2 + PB sync symmetry all shipped & smoke-verified (see "Latest — 2026-05-22 evening" above). The pre-adoption security gate is closed; **team adoption is now unblocked** (Manual Item #3). Remaining work, pick a tier from `WORKPLAN.md`:

- **CT-3** ✅ DONE 2026-05-22 evening (`a8bd7a9e`, deploy `cd30f61e`) — 12 frontend UTC-today sites → `localDateKey()` (CommandPalette, Dashboard, Layout, useOnboarding, UpcomingCard, NotificationBell, ProjectDetail, GrantsPage, ActivityPage, UpcomingMeetingBanner, TaskTimelineView, TaskGridView). The timezone-correctness sweep (CT-2 + CT-3) is now complete.
- **`isPublicGet` regex for `GET /api/team/:slug`:** assessed — LEFT IN PLACE (no GET handler exists, but the branch likely forward-provisions a public marketing profile endpoint; per justify-it, not removed as "dead").
- **DH-1:** apply `scripts/seed-grant-milestones.sql` once real grant IDs/dates are supplied.
- Otherwise pick a tier from `WORKPLAN.md`:

- **T1 leftovers:** FAKE-1 (Lab Overview `totalCitations` hardcoded — show `—` until PB scholarly cron), FAKE-2 (Hermes "Thinking…" → `<HermesPending>`), DH-1 (grant_milestones seed data), DH-2 (verify/drop Pulse PWA manifest).
- **CT-2 (from Codex review):** ~12 more UTC "today" sites the api-only sweep missed (server: projects/index/pb-sector/regulatory/submissions/conferences; frontend Calendar/PBSector → a `localDateKey()` helper).
- **Open follow-up from the morning batch:** `stale_active_since` NULL doesn't pull back to brain.db (`hub.py` `_w1col` truthy gate skips NULL) — companion fix for full symmetry.
- **T2 polish** (during adoption): see WORKPLAN T2 (brand primitives, token discipline, keyboard nav, search source isolation, mobile breakpoint split-brain).

### Schema Queue

| ID | What | Status |
|----|------|--------|
| D7 | `projects.stage_entered_at` | ✅ DONE 2026-05-22 (schema-v68, Hub-only) |
| D22 | `activity_log` typed emits | ✅ DONE 2026-05-22 (no schema; 5 typed events) |
| D8 | `lab_questions.tags` | DEFERRED — build with AskTheLab tag-filter feature |
| D9 | `commitments.to_slug` | DEFERRED — build with MyItems commitment tracker |
| D28 | `meetings.start_time/end_time` | DEFERRED — build with time-aware Calendar |

### Manual Items (Nick-owned)

1. **Register mnccore:// on home machine** — `regedit /s "C:\Users\ingra\mn-ccore-lab\scripts\setup-mnccore-protocol.reg"` (note: home user is `ingra`, work is `ingra107` — check the .reg path matches)
2. **CF Access cleanup** — remove preset Google IdP from CF Access app (Generic OIDC `Google UMN` is canonical)
3. **Team adoption push** — security fixes are deployed. Tell the team when ready.
4. **Kill AskHermes coach ref** — remove mention from CLAUDE.md if still there (per decision 5)

---

## Key Files

| File | Purpose |
|------|---------|
| `WORKPLAN.md` | Single source of truth for remaining work (open items first; done in a compact ledger) |
| `Scratch/codex-state-audit-2026-05-22/synthesis.md` | Latest Codex audit (2026-05-22; all findings verified) |
| `CLAUDE.md` | Operational guide (~8K tokens) |
| `docs/design-system.md` | Extracted design reference (palette, spacing, animations) |
| `docs/archived/CLAUDE.md-history-2026-05-15.md` | Archived CLAUDE.md content |
