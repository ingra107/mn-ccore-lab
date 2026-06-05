# Hub Workplan — updated 2026-06-04

> Single source of truth for **remaining** work. Completed items are a compact ledger at the
> bottom — do not re-expand them. Supersedes the Apr-28 synthesis, May-5 codex plan,
> design-handoff TICKETS, and hub-future-ideas (all historical now).

---

## ▶▶▶ NEXT SESSION — Nick live-test follow-ups (queued 2026-06-05) — ULTRACODE THIS

After the Round-6 design batch deployed (`0d024aee` on `1bbb2406`), Nick live-tested and surfaced the items below. **The 3 Today row UI bugs are DONE** (committed `9a007fd1`, **runtime-verify + deploy still pending** — see task 5). Everything else is queued here with full context so a fresh session can **ultracode + send off fixers** (parallel where noted). Live deploy at queue time: `0d024aee`; HEAD will be `9a007fd1`+docs.

### ⚠️ DECISION-FIRST — `tasks.project_id` slug↔id (DO NOT just patch — get a dual + Codex opinion FIRST, then supersede the old decisions)

**Symptom (Nick):** "so many projects are not appropriately linked to projects." **Confirmed in prod:** 20 of 22 linked open tasks store `project_id` = the **typed project id** (`proj_*`); only 2 store the **slug**; 0 dangling. The frontend resolves projects by **slug** (`projectsByPid` keyed by `p.slug`, `map.get(task.project_id)`), so those 20 render **unlinked** AND **group wrong** (`getGroupForTask` reads the same slug-keyed map for `category`).

**Origin (this is the crux — the next session must KNOW all of it):**
- **P2 commit `aa85c71b` (2026-06-02) "store typed project PK not slug on FK columns (drop-slug)"** changed `projectRefToCanonical` + `resolveAndGuardProject` to return `proj.id`. It touched **only the WRITE path** (`api/helpers.ts`, `api/index.ts`, `api/routes/mutations.ts`). Commit body: *"Pairs with the D1 project-PK re-key (data already migrated to canonical proj_*). NOT yet deployed — ships after Hub test-suite validation."*
- **The original designed contract was SLUG:** `Context/Decisions/2026-04-21-sync-extraction-phase-0-plus-harness.md:46` — *"`project_id` brain.db PK (`proj_01KP…`) → Hub **slug** via live Hub project lookup."*
- **Two consumers were FORGOTTEN by P2 and BOTH still expect slug:** (a) the **frontend** (~12 slug-keyed sites, listed below); (b) the **PB→Hub sync** — `Peripheral-Brain/scripts/db/sync/drivers/hub.py:2212` reads the Hub field as **`d1_project_slug`**, so the sync is **also silently broken** (it pulls `/api/tasks?seq_after=`, now receives the id, treats it as a slug).
- `/api/tasks` returns **raw `t.project_id`** (no resolution). The full **P2 prod-D1 rekey is itself GATED/un-run** (see the OPEN THREAD in SESSION-HANDOFF: `scripts/p2_hub_rekey_apply.py`; gates: HISTORICAL-table policy, `project_dependencies` slug-keying, Nick's go + soft-freeze).

**The three candidate directions (Nick wants dual-model + Codex opinion before picking):**
1. **API boundary resolver (the cold-plan recommendation):** `/api/tasks` (and other task-returning reads) resolve typed-id → slug on read (`LEFT JOIN projects pr ON pr.id = t.project_id`, return `COALESCE(pr.slug, t.project_id) AS project_id`; companion: resolve the `?project=` filter param slug→id). ONE place; fixes frontend AND sync (both regain the slug they expect); keeps P2's typed-id storage. Restores the 2026-04-21 contract. **But it contradicts the drop-slug *direction*.**
2. **Complete forward to id (the drop-slug end-state):** migrate the frontend + sync to resolve by typed id. Bigger, cross-repo, and entangled with the gated P2 prod rekey.
3. **Revert P2 write + backfill** the 20 id-rows → slug. Simplest mentally; reverts an intentional change.

**Directive for the next session:**
- Be **absolutely sure** it understands the original P2 rekey intent (read `aa85c71b`, the 2026-04-21 decision, the gated `p2_hub_rekey_apply.py`, and `Context/Topics/shared-schema-registry.md`).
- Get a **dual opinion (home dual-plan) + a Codex opinion** on direction (1 vs 2 vs 3) BEFORE writing code.
- **Whichever direction wins, write a NEW decision doc that SUPERSEDES the now-conflicting prior decisions** (the 2026-04-21 "Hub presents slug" contract, the P2 drop-slug intent, and any sibling slug/PK decisions) — append-only with explicit **SUPERSEDED-BY / supersedes** banners + forward-pointers, and update `Context/Topics/shared-schema-registry.md` so the canonical `tasks.project_id` contract is unambiguous. (Decision docs are never rewritten — supersede, don't edit.)
- **Blast radius if going frontend-side** (so a fixer knows every site): `TodayPage.tsx` (`projectsByPid`) + `today/constants.ts:108 getGroupForTask`; `MyTasks/index.tsx:116` + `MyTasks/constants.ts:95 getGroupForTask`; `PersonalPage.tsx:838,873` (find-by-slug); `TaskCard.tsx:38`, `TaskGridView.tsx:232`, `TaskStandUpView.tsx:34`, `TaskTimelineView.tsx:44` (slug-keyed `projectMap`); `DeadlinesPage.tsx:65`, `DecisionsPage.tsx:780`, `ProjectActivity.tsx:28`. (A 12-site id-or-slug frontend patch was started this session then **reverted** — it's the wrong-layer band-aid and leaves the sync broken; don't just redo it.)

### Queued fixer tasks (each carries enough context to dispatch a fixer)

1. **edit-more — the design-promised inline editing (Nick: "edit more based on the Claude design front").** The design (`review/MN-CCORE Lab Hub Design System (5)/design/consistency-mockup/rows.jsx > InlineDetail`, lines 73–85/109–112) specified the inline row expansion as a **quick-editor**: click-to-edit **Status / Priority / Due / Project** chips + a **"+ Link"** button + an **"Open full editor →"** button — on Today AND My Tasks. **Live gap:** `src/components/today/TaskDetailDrawer.tsx` (Today) and `src/pages/MyTasks/components/InlineDetail.tsx` (Columns/Lanes) have **none** of these — they're action bars + read-only context, and there is **no path to the full editor (`TaskDetailPanel`) from Today at all.** `TaskDetailPanel` itself IS well-aligned (has Status/Assignee/Priority/Due/Project/KeyLinks/Description/Subtasks editors). **Fixer:** add the quick-edit chips (reuse `StatusSelect`/`PrioritySelect`/`InlineDatePicker`/project picker from `src/components/tasks/detail/FieldControls.tsx`) + an "Open full editor →" that mounts `TaskDetailPanel`, to `TaskDetailDrawer` + `InlineDetail`. Presentation-only.
2. **DH-5 — Key Links visual verify (now possible on live).** Only **3** prod projects have key_links: `adhere-lpv-trial`, `oncology-risk-tools-lyons`, `ats-early-career-working-group`. `KeyLinksEditor` renders them fine (filters to populated slots; no bug). **Fixer/Nick:** eyeball one of the 3 on live + the editor Due-date box. *(Nick's "I don't see key links" = he opened a project without any.)*
3. **key_links PB→Hub sync gap (investigation, parallelizable).** Only 3 Hub projects have key_links; if brain.db has many more, key_links aren't syncing PB→Hub. Investigate `Peripheral-Brain/scripts/db/sync/` key_link field handling + whether key_links are in the push field-set. Report; likely a sync-fidelity fix (P1 theme).
4. **Deferred P6 responsive-redesign items** (need real responsive work + interactive mobile testing, not additive CSS): `CreateTaskModal`→`BottomSheet` on mobile (+ UX-7: add a focus trap to `BottomSheet.tsx` first); `MyTasks/views/ListView.tsx` fixed 9-col grid (~781px, unusable <768px); `MenteeMilestonesPage`/`DeadlinesPage` grid overflow (PAGE-7); UX-9 tablet breakpoint split-brain (`useIsMobile` 768 vs sidebar `lg:hidden` 1024).
5. **Runtime-verify + deploy the 3 done Today UI fixes (`9a007fd1`).** Committed but **NOT runtime-verified + NOT deployed.** Extend `tests/local/journeys/drag-to-plan.spec.ts`: assert (a) completing a task shows the undo toast (`[data-testid="undo-toast"]`) + undo reopens it; (b) a planned-strip row has a `[aria-label="Mark done"]` DoneBox + a `[draggable="true"]` grip; (c) a "Completed today" item unchecks. Then deploy via `npm run deploy:pages:gated` (bundle with the above).

**Parallelizable via ultracode:** tasks 1 (edit-more build), 3 (sync investigation), 4 (each deferred item), and 5's test-writing can fan out concurrently; the slug DECISION (dual+Codex) must land before its implementation but its investigation can run in parallel with the others.

---

## ▶▶ TASK-UI CONTINUATION — ✅ COMPLETE 2026-06-04 (drag fixed + P3–P6 done)

**Round-6 Task-UI design audit is DONE + DEPLOYED: Today drag bug FIXED + P3–P6 ALL SHIPPED** (`a231fea7`…`663043e5` + docs `1bbb2406`; build + `tsc --noEmit` green throughout; drag verified 3/3 on the local journeys stack and re-verified green after P3–P6). **Deployed `0d024aee` on `1bbb2406` (2026-06-05) — live bundle hash verified == local build, `/api/version` 200.** Source handoff (kept for reference): `review/MN-CCORE Lab Hub Design System (5)/design/Handoff — Task UI Consistency Pass.md`. Guardrails honored (presentation-only; no routes/API/hooks/schema; additive surface-by-surface). **Remaining:** DH-5 visual verify (needs eyes on a live project with key_links — local seed has none) + the deferred P6 responsive-redesign items.

### ✅ FIXED — Today drag-to-plan (`a231fea7`; was Nick-reported broken 2026-06-04)
**Root cause** (multi-agent runtime diagnosis): post-P0 the grip was `opacity:0` until row hover, so users grabbed the non-draggable row *body* → no `dragstart` ever fired; AND all timeline drop zones render *above* the task list while the page scrolls on `<body>`, and native HTML5 DnD has no auto-scroll → below-fold tasks could never reach a drop zone. **Fix** (`src/components/tasks/TaskRow.tsx`, `today/TaskRow.tsx`, new `hooks/useDragAutoScroll.ts`, `TodayPage.tsx`): grip always faintly visible (`opacity 0.3 → 0.6` hover) + larger hit target; new additive `onTogglePlan` prop renders a **📌 plan button** (the planned chip becomes the unplan control) — a reliable no-drag path that ALSO works on touch (`@media (hover:none)` reveals it); `useDragAutoScroll` window auto-scroll near viewport edges during a drag. **Proof:** `tests/local/journeys/drag-to-plan.spec.ts` — 3/3 green (📌 plan→strip→unplan, DnD-dispatch plan, cross-surface contract), re-verified after P3–P6. Rule 58 intact (drag ⋮⋮ = plan-slot · 📌 = plan-no-drag · body = expand · ▶ = promote).

### Round-6 design audit — phase status (ALL DONE 2026-06-04)
- **P0 ✅** (prior) shared `<TaskRow>` on Today / My Tasks (Columns + Lanes) / My Hub. (List view excluded — protected power grid, Rule 60.)
- **P1 ✅** (prior) editor date-box `noContainer`, compact Key Links chips, one date control, `<DueLabel>` + `isOverdue()` sweep. **⬜ DH-5 still open:** post-deploy visual verify of ProjectDetail Key Links chips + editor Due-date box (do once the batch is deployed).
- **P2 ✅** (prior) status-as-truth (§4), §5 click-affordance, page empty-states (DH-6).
- **P3 ✅** (`c4fbb3ec`) due-date rendering consolidated onto `<DueLabel>` in `ActionBoardCard`/`MyItemsCard`/`TaskCard`/`EveningTaskSlot`/`FocusTaskSlot`. Deliberately **NOT** full-row-into-cards — that violates the dashboard=cards taxonomy (Critical Rule 17); the 3 P0 adapters stay the only full-row surfaces. (EveningTaskSlot/FocusTaskSlot now actually render the due date — was in the data, never shown.)
- **P4 ✅** (`958d835f`) global **Table-density** control in Settings→Appearance (reuses the shared `hub-table-density` key = default every table inherits); 📌 button touch-reachable; skeleton timing reconciled (1.5s→1.8s) + AskTheLab `<TextSkeleton>`. Per-view toggles **KEPT** (additive, in-context); desktop 44px **NOT** forced (Critical Rule 9 precise-click) — mobile already floors buttons to 44px.
- **P5 ✅** (`4a21efce`) new `src/components/ui/` **{Button, Chip, Field, Modal}** codifying the dominant existing patterns + tokens; one proof adoption each (CreateTaskModal footer / Today workflow badges / CreateProjectModal fields / BugReportModal — last also removed a Rule-45 backdrop blur). Adoption is incremental; token-snapping rides along via primitive adoption. Gold-primary (project create) left a deliberate one-off.
- **P6 ✅** (`663043e5`) mobile pass — iOS focus-zoom guard (16px inputs <768px), `[data-hover-actions]` touch-reveal, RightNowCard overflow fix, IdeasPage mobile Edit/Archive (PAGE-6), sidebar `aria-modal` (UX-8). **Deferred (need responsive redesign / interactive mobile testing, not additive CSS):** CreateTaskModal→BottomSheet (+ UX-7 BottomSheet focus trap first), MyTasks ListView fixed-grid, MenteeMilestones/Deadlines grid overflow (PAGE-7), UX-9 tablet breakpoint split-brain.
- **Remaining from the audit:** DH-5 visual verify (post-deploy) + the deferred P6 responsive-redesign items above. Guardrails were honored throughout (presentation-only; both themes; additive surface-by-surface).

### Also-open (not Round-6, but the live next-decision): P2 Hub re-key prod-D1 migration
P2 drop-slug **code is deployed**; the **prod-D1 data rekey is un-run + GATED.** Tool `scripts/p2_hub_rekey_apply.py` (dry-run default, fail-closed), template `scratch/p2-hub-rekey.sql` (gitignored). Gates: ⬜ HISTORICAL-table per-table policy · ⬜ `project_dependencies` slug-keyed decision · ⬜ Nick's go + both machines up + soft-freeze. Full detail in `SESSION-HANDOFF.md` → OPEN THREAD.

---

## ★ MISSION-ALIGNED PRIORITIES — north star (2026-05-22, from Nick's priorities interview)

**Posture:** build it solid FIRST, no rush to invite the team. Hub is for **all audiences equally** (PI / team / mentees). The two surfaces that matter: **Today/MyTasks** (daily driver) + **Projects/Manuscripts/Grants** (system-of-record). Weighting: balanced (polish + capability + reliability + lower-maintenance). Execute roughly in this order. **Design-touching items are STEER-FIRST** — confirm direction with Nick before building.

**P1 — Sync fidelity & maintenance reduction (TOP — serves daily-driver TRUST *and* cuts Nick's #1 manual pain).**
The brain.db ↔ Hub ↔ TODAY.md "data-sync dance" is the thing most likely to silently drift and the heaviest upkeep. Goal: bulletproof, zero-drift, fewer manual steps.
- **Sync-drift AUDIT first** — map every drift source across brain.db ↔ D1 ↔ TODAY.md (investigate-skill / builder), then close them.
- Carry-overs: `next_artifact` symmetry (S1 done; `last_meaningful_movement` MAX-wins intentional); task done-state reconciliation (Hub side done — verify TODAY.md side); v55 fields both ways; `group_override`; legacy-slug canonicalization drift signal.
- Automate the manual sync steps (shrink the dance).

**P2 — Today/MyTasks completeness (daily driver — Nick picked ALL sub-aspects).**
- Task capability in UI: surface v55 workflow fields (INFRA-7: `waiting_on`/`promised_to`/`promise_date`/`next_checkin`) + commitments tracker (D9 `commitments.to_slug`).
- Planning UX (T3' remaining): Plan button, Today meeting-notes persistence, drag-planning polish.
- Then polish: PAGE-1 (TodayPage T2), keyboard nav (UX-3), tokens (UX-2).

**P3 — Research SoR trustworthiness (Projects/Manuscripts/Grants — data + history + pipeline; NOT analytics).**
- Data completeness/accuracy audit (are all projects/manuscripts in + correct? — the real trust blocker).
- History + movement: INFRA-1 (ProjectDetail Activity tab read+UI; D22 emits exist) + INFRA-8 (surface state/next_artifact/last_movement/stale_active_since).
- Pipeline workflows: manuscript/grant stage tracking + deadlines + DH-1 (real grant milestones).

**P4 — Smarter Hermes / Co-Scientist (strategic capability bet — longer-horizon, BRAINSTORM-FIRST).**
- Deeper AI assistance on research tasks (lit synthesis, analysis help, drafting) beyond Q&A. T4 #41 Co-Scientist. Architecture + design effort; steer-first.

**P0′ — Canonical time discipline (FOUNDATIONAL — design before/with the P1 LWW flip).** Single read/write/display chokepoint for ALL dates/times: two types (`Instant`=UTC / `CivilDate`=date-only+zone), ONE `nowUtc()` writer, ONE display fn (browser-local on Hub = **traveler-aware**; configurable server "my timezone" for TODAY.md/cron), + a **pre-commit/CI lint banning raw `new Date().toISOString()`/`datetime.now()`/`datetime('now')`** outside the helpers (executable contract — same pattern as this session's schema-version + sync-antipattern hooks). **Why it's P0′:** disciplined writes make the LWW read-side zone-guessing (the fragile part codex flagged) UNNECESSARY going forward → it SIMPLIFIES P1. **NOW DESIGNED + Phase α SHIPPED** (2026-05-23) — reconciled with P1 (LWW) + P2 (timeline) into **Increment 1A** (below); the lint + `timez.py`/`time.ts` chokepoints + the Hub LMM churn-fix landed live this session. **Phase β resolved as the FORWARD PRIMITIVE (gates + UTC writers + guards), SHIPPED 2026-05-25; the historical-rewrite half DESCOPED** (it proved over-engineered — codex's prediction that disciplined forward writes make the read-side migration unnecessary was borne out). See Increment 1A below.

**Deprioritized (still tracked below, just not now):** deeper analytics / PI-velocity dashboards; Meetings, AskTheLab, Calendar polish; external-facing OG/marketing; non-priority PAGE-* design; dead-table simplify (do opportunistically via justify-it). The tier list (T2/T3/T4) below is the MENU; THIS section is the ORDER.

## ▶ INCREMENT 1A — Time/Sync/Timeline reconciliation (P0′+P1, leads to P2) — Phase α + FORWARD PRIMITIVE SHIPPED; Phase β (historical migration) DESCOPED 2026-05-25

P0′ (time-discipline) + P1 (LWW sync-fidelity) + P2 (timeline) were reconciled into ONE plan after a 6-review wave (3 Opus + 2 Codex plan-audits + 1 Codex pre-execution review that BLOCKED→amended the plan). Design: `docs/superpowers/specs/2026-05-23-time-sync-timeline-reconciliation-design.md`. Plan: `docs/superpowers/plans/2026-05-23-increment-1A-time-sync-foundation.md`. Principle: store every instant UTC, display viewer-local (browser zone on Hub = traveler-aware; rendering-machine OS zone server-side; `completed_at` is UTC-store/display-local, not a CT exception).

**Phase α — SHIPPED + LIVE** (deploy `17d7cdd1` on `68b8d861`, `/api/health` clean):
- **Task 4 — killed the live LMM churn bug** (`advanceProjectMovement` UTC-normalized atomic CASE compare); the deploy batched the `tasks.notes` redaction (`66e5c9d0`) → live.
- Tasks 1/2 — canonical time chokepoints: PB `timez.py` + `now_instant`/`now_instant_wire` (`569a604a`); Hub `src/lib/time.ts` (`be2eb1d4`).
- Task 3 — time-discipline lint R20-R23, WARN mode, both repos (`43b9eb68` PB + `40058df6` Hub); ERROR-flip wired for Task 9.
- Task 10 — hazards: `operations.py:920` Bug-2 fix + backfill `--allow-post-utc-cutover` quarantine + zone contract in `shared-schema-registry.md` (`c00db519`).

**Phase β — RESOLVED as FORWARD PRIMITIVE (SHIPPED 2026-05-25), historical-rewrite half DESCOPED.** The β build (Tasks 5-9 + the 088 migration) was built + audited 4× (3 work-codex rounds + home dual, 6+ real bugs caught) — then a Step-0 live audit + a 3-way strategic eval (work codex + home dual + COO converged) found the historical rewrite over-engineered: brain.db had ~900 naive candidates/machine (not the 2-3 the hand-classify model assumed), `last_meaningful_movement` was a phantom on work (64 local-backfill rows marked `synced` vs Hub canonical's 3), and `completed_at` (~800) is bulk-import artifacts not in the LWW gates.
- **SHIPPED** (the bleed-stop forward primitive): PB main `3d5c0be5` — Task 6 fail-closed LWW gates (`hub.py:1278/1861/2002`) + Task 7 `client_ts`→explicit-UTC + pull-apply `now_instant` fix + PB `update_project` writer guard; two-pass suite green (799/2). Hub deployed `e7ce7daf` (version `ae16ba74`) — `applyPatch` LMM forward guard. Task 4 (churn fix) + Tasks 1/2/3/10 already live from Phase α. Cross-machine verified (home pulled + confirmed).
- **DROPPED:** Task 8 (the 900-row `088_normalize_timestamps_utc.py` migration) + Task 9 AS-BUILT (scaffold delete + `_CT`→`_UTC` move). `last_meaningful_movement`/`completed_at` STAY in `_CT_COLUMNS` (status quo). Dropping 8 while shipping 9 was corrupt-by-design (scaffold-delete makes legacy naive parse-as-UTC).
- **Go-forward plan:** `docs/superpowers/plans/2026-05-25-increment-1A-descope-forward-primitive.md`. Built-but-dropped branch `feature/inc1a-beta-pb`@`1748da73` kept as the record. The 900-row migration we did NOT run is the win.

**Phase β FOLLOW-UPS (the real "what's next" — P1-aligned):**
1. **work→Hub lmm reconcile + root-cause** (P1, live sync-integrity bug): work brain.db has 64 phantom lmm (`sync_status='synced'` but never pushed) + is behind on pulls (80<93 projects). Root-cause WHY the `backfill_last_meaningful_movement.py` writes never reached Hub (raw-SQL outbox bypass? lmm not on push field-set?) — likely a class bug. Reconcile treating HUB as canonical (home is ~3d stale, NOT authoritative; home converges AFTER Hub settles). `sync_status='synced'` ≠ field-level Hub parity.
2. **Optional gate-harden:** make `to_utc_dt`/the LWW gate fail-closed (reject) on legacy non-canonical naive LMM/completed_at — the principled way to eventually retire the zone-guessing scaffold WITHOUT a migration (replaces dropped Tasks 8/9).
3. **Stale `TABLE_FIELDS` mirror test** (`test_a3_outbox_field_translation::test_hub_table_fields_mirror_matches_source`) — Hub added `pi_context`/`strategic_context`; mirror test stale (hub-schema-sync; logged to agent_knowledge).

**Follow-ons:** **Plan 1B** = the ~91-site Hub frontend display-migration to viewer-local (UNWRITTEN; write after β — consumes `time.ts`; lint flips to ERROR once it clears the raw-date sites). **Increment 2** = Activity-timeline/comments (P2; specced + amended: `docs/superpowers/specs/2026-05-23-activity-timeline-comments-design.md`; MUST follow β's `client_ts` cutover — shared files; extend `activity_log` visibility-gated, remove ALL `notes`→`description` paths incl. create-path leaks `query.py:736/900`, add a Hub Activity write transport).

**✅ RESOLVED 2026-05-24 — was: "16 pre-existing `tests/sync/` failures, triage before Phase β".** Triaged (actually **18 deterministic + 1 flaky**, all **STALE-TEST debt** asserting deliberately-deleted behavior — JSON cursor dual-write `e29c30fd`, pull-symmetry checker `9528f79c`, pre-mig-073 `key_link` schema, pre-`abeebc51` enum casing; **zero real regressions**, none in timezone/LWW logic — the β-path runtime is exercised by the passing siblings; Fix-Gate evidence in `agent_knowledge` `builder/preexisting-state-test-failures*`) + **cleaned** (PB commit `4427a808`: suite now **328 passed / 0 failures**; coverage-worth-keeping tests updated to current SQL/enum/schema, dead JSON-dual-write + orphan symmetry meta-tests retired). **β-GO from the test precondition.** ⚠️ **β watch-window caveat:** the pull-symmetry auto-guard (`.githooks/check_pull_symmetry.py`) was deleted `9528f79c` and β edits exactly the 3 pull-gates it used to check (`hub.py:1278/1861/2002`) — so **add MANUAL symmetric-gate verification to β's watch window** (no automation catches an asymmetric gate change now).

## ▶ DONE 2026-05-22 PM — the T1 correctness directive + Codex gate executed

Shipped `5f5f597d` (T1 batch) + `909c6e8b` (Codex-gate fixes) + `cf85cfa0` (deploy docs), deployed
`af3189f0` (live on `909c6e8`). CT date sweep, STATE-1, STATE-2 done; enum-drift + DAT-4 verified
clean (no change); test-D1 fully reconciled to prod via hub-schema-sync. Codex audit (`Scratch/codex-t1-verify-2026-05-22/`)
returned Block→2 critical+5 minor, all verified + fixed. Detail in SESSION-HANDOFF.md "Latest — 2026-05-22 PM".

**Next:** T1 leftovers (FAKE-1/2, DH-1/2) below + the `stale_active_since` brain.db pull-back follow-up + T2 polish.

---

## ▶ CODEX 5-pass "simplify + improve" review (2026-05-22) — graduated items

Full tagged synthesis: `docs/reviews/2026-05-22-codex-simplify/SYNTHESIS.md` (+ 5 per-pass syntheses
alongside it). 5 passes, WORKPLAN-blind, ~8 findings spot-checked accurate. High-leverage NET-NEW items
below; OVERLAP items are noted against existing T2/T4 entries (codex added concrete file:line sites).

**T0 — SECURITY / pre-adoption — ✅ ALL DONE + DEPLOYED 2026-05-22 evening** (`0a612459`, deploy `b9e31ca8`; smoke-verified live). Plan + amendments: `docs/superpowers/plans/2026-05-22-hub-pre-adoption-batch.md`. Codex plan-audit expanded the original 9 → +attachment-visibility gate +`/api/meetings` +`/api/team/pulse` +4 actor sites, and corrected B1 (3 write paths) / B3-B4 (signature changes) / B5 (both task endpoints). Kept below for the record:
- **SEC-T0-1** Over-exposed public GETs: `isPublicGet` allows `/api/activity`, `/api/projects/health` (leaks PB project titles, no category filter), `/api/team` (`SELECT *` → email/auto_created). Redact/gate. *(M)*
- **SEC-T0-2** Search bypasses PB-category visibility — any authed member can search Nick-only PB projects/notes (`search.ts:127-155`). Add shared visibleProjects filter. *(M)*
- **SEC-T0-3** Digest gen/send has no owner-or-PI authz (`digest-email.ts:319-416`) — anyone can send another's digest anywhere. *(S)*
- **SEC-T0-4** `tasks.notes` private boundary breached by `SELECT t.*` (`tasks.ts:44`); "notes" UI label is team-visible. Redact or reconcile. *(M)*
- **SEC-T0-5** Protected-field NULLs via `/api/mutations` — allowlist gates keys not values; status/priority/assignee/stage/category can be nulled (`mutations.ts:116-137,332,785`). Reject null for protected fields. *(S — highest risk per pass 5)*
- **SEC-T0-6** Identity-canonicalization bypass — 9 raw actor writes (handoffs `to_slug`→assignee worst; questions/ideas/project-documents/dependencies/tasks-note author; projects.ts:181 + uploads.ts:88 `email.split`). Canonicalize via `actorSlug`. *(M)*
- **SEC-T0-7** Delete/cascade gaps — PB-origin mutation delete clears only record_id (dangling slug-linked tasks); project delete misses newer child tables (docs/deps/submissions/conferences). *(M)*
- **SEC-T0-8** JWT fail-open hardening *(LOW — verified CF_ACCESS vars ARE set in prod, so not active)* — make `verifyCfAccessJwt` fail CLOSED when REQUIRE_AUTH=1. *(S)*
- **SEC-T0-9** X-API-Key contract mismatch (middleware Bearer-only vs documented X-API-Key). *(S)*

**T1' — Correctness NET-NEW — ✅ CT-2 + CON-2 DONE 2026-05-22 evening** (`0a612459`/`45911e6d`):
- **CT-2** ✅ DONE — server (projects/index/pb-sector/regulatory/submissions/conferences → `ctToday()`) + frontend (`localDateKey()` helper; Calendar/PBSector/TodayView/ConferencePrep/SubmissionTimeline/meeting-classifier). NOTE corrected sites: `pb-sector.ts:142` LEFT (prev-date arithmetic, not a today anchor). **CT-3** ✅ DONE 2026-05-22 evening (`a8bd7a9e`, deploy `cd30f61e`) — the 12 remaining frontend UTC-today sites (CommandPalette/Dashboard/Layout/useOnboarding/UpcomingCard/NotificationBell/ProjectDetail/GrantsPage/ActivityPage/UpcomingMeetingBanner/TaskTimelineView/TaskGridView) routed through `localDateKey()`. Timezone-correctness sweep (CT-2+CT-3) COMPLETE.
- **CON-2** ✅ DONE (valid parts) — emailSlug LUT 3→21 lockstep; `fetchManuscriptsAttention` res.ok guard; TaskRow v55 op-field types. `key_link_*`/`rowToProject` claim was INVALID (no rowToProject; SELECT * retains them).

**T2' — SIMPLIFY (NET-NEW deletes/consolidations; verified):**
- **DEL** `handleUpsertTodayMd` (dead) + tracked `.pyc` (delete now); legacy MyTasks + UnifiedMyTasks/AuthContext shims; stale seed path (seed-d1.ts/seed.sql/npm seed*); dead tables decision_log/`*_new`/watchlist + `narrative_projects`/`research_narratives` (row-count check; KEEP publication/citation tables per Nick). *(S each)*
- **CONS** consolidate ~36 raw-fetch → typed api/hooks; attachment-upload ×3 → `useAttachmentUpload`; task-grouping fork → `taskGrouping`; stage taxonomy ×5 → one module; people pickers → `useTeam()`. (inline-date consolidation folds into CT-2.) *(M)*

**T3' — UX NET-NEW (rest OVERLAP T2/PAGE-* — see synthesis):**
- ✅ DONE 2026-05-22 evening (`7a4599a0`, deploy `8c8188ac`): Today/ProjectDetail query-error states (EmptyStateArt + retry; ProjectDetail distinguishes loading vs missing-slug); MeetingDetail attendance save-fail (rollback + toast); CreateTaskModal dangling `aria-labelledby` (added matching label id).
- REMAINING: Today meeting notes not persisted; Today planning drag-only (add Plan button); MyTasks ListView div-grid → TableContainer (design-restructuring — defer to a design pass). *(S-M each)*
- **IMPROVE:** wire real `/api/proactive-brief` into Today (adjacent FAKE-2); MyTasks `?open=` deep links; ProfilePage → `/api/team/me`; export `normalizeStage`; Personal root paths → `PATHS`.

**CONTRADICTS — RESOLVED by Nick 2026-05-22:**
- PI-analytics subendpoints (`/api/analytics/{mentee-velocity,response-time,team-engagement}`): **KEEP** until PAGE-5 (PI Analytics) is designed — do NOT fold into pi-dashboard yet.
- Narrative/citation tables: **drop `narrative_projects` + `research_narratives` only** (computed, not read — added to T2' DEL above); **KEEP `project_publications` / `open_science_resources` / `pubmed_sync_log`** as FAKE-1 citation substrate.

**OVERLAP-WP (codex refined existing entries):** create-flow-keep-open=UX-6 · focus-traps=UX-7/8 · mobile-split-brain=UX-9 · token/compound-opacity=UX-2 · brand-primitives(CategoryIcon/EmptyStateArt)=UX-1 · Ideas kanban/opacity=PAGE-6 · Projects/Manuscripts board=T4 DnD · search try/catch (UX-5) is DIFFERENT from SEC-T0-2 (visibility).

---

## T1 — Correctness — ✅ ALL DONE 2026-05-22 PM (kept below for the record; see done ledger)

- **CT date helper sweep** *(S/M)* — ~30 `new Date().toISOString().split('T')[0]` "today/now"
  derivations in `api/` are UTC → wrong in CT evening (shows tomorrow after ~6pm). Build a shared
  `America/Chicago` date helper in `api/lib/` and replace the **"today/now"** sites — PER-SITE
  JUDGMENT, leave legit UTC range-bounds alone. Key sites: `pb-sector.ts:7`, `digest-email.ts:45/195/463`,
  `meetings.ts:6/118/169`, `tasks.ts:9`, `proactive-brief.ts:7`, `projects.ts:87/307`, `activity.ts:33`. (codex 2026-05-22)
- **Entity status-enum drift audit** *(S)* — Manuscripts shipped UI status options the server
  rejected → silent optimistic revert (fixed 2026-05-22, both dropdowns). Same risk elsewhere:
  verify UI options vs the server enum in `RevisionTracker.tsx:50`, `DecisionsPage.tsx:46`,
  `GrantsPage.tsx:60`, `MenteeMilestonesPage.tsx:35`. These are **different** enums — fix only
  genuine mismatches. (codex 2026-05-22)
- **STATE-1** *(M)* — TodayPage `state.done` (localStorage) ignores cross-surface status changes;
  derive from the cache. `TodayPage.tsx:223`.
- **STATE-2** *(S)* — ProfilePage `team-raw`/`rawRow` query has no `queryFn` → `invalidateQueries`
  is a no-op, profile saves don't refetch. `ProfilePage.tsx:56/65/107`.
- **DAT-4** *(S — VERIFY FIRST)* — realtimeBus `'all'` vs `'data'` channel mismatch may break some
  UI refresh. Trace subscriber filters before patching; `realtimeBus.ts` shows no channel concept
  beyond room/party, so this may be stale. (codex T12)
- **test-D1 repair** *(S)* — `mnccore-lab-test` is missing schema-v55 columns; bring it current
  with prod (janitor / hub-schema-sync). Surfaced when a v68 backfill referenced a v55 column.
- **SEC-5 server defense** *(optional, low)* — client double-submit now dedups via a stable per-draft
  id + `ON CONFLICT(id)` (fixed 2026-05-22). Optional defense-in-depth: server dedup on
  `(source, raw_hash)`. Not required for the stated bug.

## T1 — Fake / broken data

- **FAKE-1** ✅ fallback DONE (was already correct — `StatsCard.tsx:118-119` renders `—` when no
  citation data; NOT hardcoded). Remaining: PB scholarly weekly cron (home laptop) to populate
  per-member h-index/citation data — then it displays live automatically. (decision: build the cron)
- **FAKE-2** ✅ DONE 2026-05-22 evening (`45911e6d`) — `<HermesPending>` (pulse card + elapsed timer,
  clears via realtimeBus) in Ask the Lab + project comments.

## T1 — Design-handoff leftovers

- **DH-1** ⏳ seed TEMPLATE shipped (`scripts/seed-grant-milestones.sql`, `7c222e65`); table + UI
  already exist. Remaining: Nick supplies real grant IDs/dates, then apply the SQL to prod D1.
- **DH-2** ✅ DROPPED 2026-05-22 — verified generic `public/manifest.webmanifest` exists; no Pulse-
  specific kiosk manifest needed.

### Round 6 — Task-UI consistency follow-ups (P0–P2 shipped `4ed8e657`/`b1f10a04`/`aa15f556`; DH sweep done 2026-06-04 `b5f38d10`/`b733c424`/`fc91ccd9`. See the TASK-UI CONTINUATION block at the top for the full P3–P6 status + the Today drag bug.)

- **DH-3** ✅ **DONE 2026-06-04** (`b733c424`) — §4 status-as-truth sweep: replaced dual-checks with `isTaskDone()`.
- **DH-4** ✅ **DONE 2026-06-04** (`b5f38d10`) — extracted one `dueLabelText()`; the three divergent helpers now delegate.
- **DH-5** ⏳ *(S)* **Post-deploy visual verification** of two P1 things not screenshot-able on the local seed: ProjectDetail **Key Links compact chips** + the editor **Due-date `noContainer` box**. Now confirmable on the live deploy (`59b02aa8`). **Only remaining DH item.**
- **DH-6** ✅ **DONE 2026-06-04** (`fc91ccd9`) — page-level empty-states routed through `<EmptyState>`.

## T2 — UX & polish (during adoption; not blockers)

- **UX-1** Brand primitives adoption (HermesMark on AskTheLab/MeetingDetail/notifications; HeartbeatDivider; EmptyStateArt). *(M)*
- **UX-2** Token discipline (`#fff`→`--ink-bright`; `--gold-on-emphasis` gaps; inline `<style>` on TodayPage). *(M)*
- **UX-3** Keyboard nav (TodayPage J/K/D/Space/F; AskTheLab J/K; SearchPage `/` focus). *(M)*
- **UX-4** Standard API error envelope `{error:{code,message}}` (uploads/pi-dashboard ad-hoc). *(L)*
- **UX-5** ✅ DONE 2026-05-22 evening (`bb2db3c3`, deploy `8c8188ac`) — `handleGetSearch` uses `Promise.allSettled`; a failed source returns `[]` + additive `{partial, failedSources}`. Auth/PB-visibility unchanged. +5 tests (api 204).
- **UX-6** Create flows keep form open + inline error on failure (CreateDecisionModal, Ideas, AskTheLab, RelayCard). *(M)*
- **UX-7** BottomSheet focus trap + larger close target. *(S)*
- **UX-8** Mobile sidebar overlay = real dialog (focus trap, `aria-modal`). *(M)*
- **UX-9** Mobile breakpoint split-brain (`useIsMobile` 768 vs MobileTabBar 1024 → tablet nav breaks). *(S)*
- **PAGE-1** TodayPage T2 (meeting-notes piggyback data loss, CategoryIcon on task tags, tokens). *(M)*
- **PAGE-2** ProfilePage T1 (▾ affordance, R2 photo upload, optimistic+undo, feed-delete confirm). *(M)*
- **PAGE-3** AskTheLab (Hermes pending + realtimeBus subscription + polish). *(M)*
- **PAGE-4** Calendar T1 (iCal events on CalendarPage [user-only/private], clickable tasks/milestones, view persistence). *(M)*
- **PAGE-5** Lab Overview T2 (ActionBoard scope filter; role-based defaults — PI sees all, team sees lab-wide + own; TeamPulse+Insights). *(M)*
- **PAGE-6** Ideas page (Edit button has no handler; archive hover-only; no mobile controls). *(S)*
- **PAGE-7** MenteeMilestones — mobile can't change milestone status (no InlineSelect on mobile rows). *(S)*

## T3 — Infrastructure

- **INFRA-1** *(L)* ProjectDetail Activity tab — typed `activity_log` emits now exist (D22); wire the read + UI.
- **INFRA-2** *(M)* `/api/health/deep` (mutation stats, calendar-feed errors, R2 orphans, open bug reports, cron status).
- **INFRA-3** *(M)* realtimeBus wiring sweep (AskTheLab 60s poll, MyItems 30s, Insights 5min, Calendar 15min → WS).
- **INFRA-5** ✅ DONE 2026-05-22 evening (`2e3ca57c`) — `scripts/check-schema-versions.py` + `schema-version-snapshot.json` in the nightly drift workflow: asserts ordered version list (new-gap detection vs snapshot), no new duplicate vNN prefixes, SHA-256 snapshot hash. Tested pass + synthetic-fail. CI-only.
- **INFRA-6** *(XL)* Personal 3-tab merge (MyItems INTO Personal: Workspace|Inbox|Cards). Substrate-swap protocol required.
- **INFRA-7** *(M)* Surface v55 task workflow fields (`waiting_on`, `promised_to`, `promise_date`, `next_checkin_date`) in `TaskRow` + UI.
- **INFRA-8** *(M — codex: pull up)* Project staleness adapter — `state`/`next_artifact`/`last_meaningful_movement`/`stale_active_since` dropped in `rowToProject`.

## T4 — Parking lot

- **AI:** Co-Scientist (#41), PubMed/academic search (#46), RePORTER grant intel (#42), multi-tenant (#60).
- **Comms:** Weekly digest email (#31), pre/post-meeting email (#86/#87).
- **UX depth:** SmartCompose remaining surfaces, Saved views v2 (D1-backed), FTS5 search, drag-to-reclassify, Manuscripts pipeline DnD, Calendar time-aware week view (needs D28), inline edit on Columns/Lanes, PersonSearch as 15th entity, Hermes-augmented search.
- **FAKE-3 transcript backend:** Hermes-via-ai-requests `/api/meetings/process-transcript` (button is honest now; not a blocker).
- **PB Sector:** TODAY.md web rendering depth; nav visibility (hidden per design).
- **Kiosk:** Lab-TV data slides; Apple Watch complication (native).

## Schema queue

- **DONE:** D7 `projects.stage_entered_at` (schema-v68, Hub-only, 2026-05-22) · D22 `activity_log` typed emits (no schema, 2026-05-22).
- **DEFERRED — build WITH the feature, not before (dead columns otherwise):** D8 `lab_questions.tags` (AskTheLab filters) · D9 `commitments.to_slug` (MyItems commitments) · D28 `meetings.start_time/end_time` (time-aware Calendar).
- **Process for any schema change:** decision doc in PB `Context/Decisions/` + `enums.py` + `shared-schema-registry.md` + lockstep brain.db/D1. (D7 needed none of this — Hub-only.)

---

## Done ledger (do not re-expand)

- **2026-05-22 night — P1 sync-fidelity: audit + safe wins + root-cause front-end shipped, shadow running.** Builder read-only audit mapped brain.db↔Hub↔TODAY.md drift (`Scratch/sync-fidelity-audit-2026-05-22/findings.md` + agent_knowledge). **Track A safe wins SHIPPED** (PB `86d12331`): P2 reconciled all 405 frozen `local_modified` rows (pending readout 342/63→0/0, trust-tax gone) + fixed the source (`health.py --fix` raw-SQL freeze) + recurrence guard; P3 resurrected the dead TODAY.md freshness guard; P5 truthy-gate sweep (class fully closed). P4 doc-drift fixed in Hub CLAUDE.md (`f9b9684a`) — d1 mirror correction + **`notes`↔`description` sync flagged UNDER REVIEW (possible privacy regression — Nick's call pending)**. **P0/P1 root-cause** (CT↔UTC LWW split): v1 doc (`843cab8d`) **codex-BLOCKED** (its space-sep⇒UTC heuristic is wrong — `updated_at`=UTC but `last_meaningful_movement`=CT, same format); **v2 column-aware-contract doc authored** (`fdcf31bb`, LMM→UTC sync-state). **Safe front-end EXECUTED** (`61c53d78`, 51 tests green): `to_utc_dt` origin/column-aware helper + push-side freshness-guard + `_lww_merge` zone fixes + **provenance shadow-log live on the 3 pull-gates (48h window started ~2026-05-23 03:00 UTC)** — NO writer/gate-winner changed. **PENDING the shadow review (~2026-05-25):** if `data/logs/lww_zone_shadow.jsonl` shows 0 "new-decision-wrong" rows → flip pull-gates to origin-aware (Task 4 enforce) + Task 5 (LMM writer→UTC) + Task 6 (`client_ts` explicit-Z + Hub `advanceProjectMovement` cutover — cross-repo w/ hub-backend) + Task 7 (43-row migration). See `Context/Decisions/2026-05-22-sync-lww-timezone-unification-v2.md`.
- **2026-05-22 evening — Pre-adoption SECURITY tier (T0) + correctness, 3-agent orchestrated batch** (`0a612459` api / `45911e6d` frontend / `7c222e65` data; deploy `b9e31ca8`; PB sync `148138e3`): plan→codex-audit(BLOCK→amend)→3 parallel Opus agents→integrate. SEC-T0-1..9 + NEW attachment-visibility gate + `/api/meetings`/`/api/team/pulse` redaction (codex-found) · CT-2 server+frontend · FAKE-2 `<HermesPending>` · CON-2 (LUT 3→21, res.ok, TaskRow types) · DH-1 seed template · PB sync NULL-clear symmetry (key-presence gates; MAX-wins preserved). api 199/199, smoke-verified live. FAKE-1 + DH-2 dropped (already satisfied). Plan: `docs/superpowers/plans/2026-05-22-hub-pre-adoption-batch.md`.
- **2026-05-22 PM — T1 correctness batch + Codex gate + ship** (`5f5f597d`/`909c6e8b`/`cf85cfa0`, deploy `af3189f0` live on `909c6e8`): CT date helper sweep (`api/lib/ct-date.ts`, 10 anchors + paired bounds across 6 routes) · STATE-1 TodayPage done-from-cache (reconciliation + onError rollback + isToday) · STATE-2 ProfilePage useQuery refetch · enum-drift + DAT-4 verified clean (no change) · Codex gate fixed pb-sector meeting-TZ + digest date labels + helper hardening + localDoneIds dedup + ProfilePage auth-gate · test-D1 reconciled to prod (hub-schema-sync, 27 tables + cols, now 76 exact match) · librarian fixed 3 stale "Pages auto-deploys on push" agent_knowledge entries · CLAUDE.md deploy docs corrected (manual-only + token).
- **2026-05-22 — audit-fix batch** (`6a69cfb2`, deploy `4681a29c`): advanceProjectMovement id-OR-slug match (was silently missing slug-backed tasks) · `stage_entered_at` on project insert (new-project hole in D7) · batch-assign `assignee_change` event · Manuscripts status enum aligned to server (both dropdowns) · QuickCapture stable event id (SEC-5 double-submit).
- **2026-05-22 — verify-first batch** (`3bd5d419`/`8990acb7`/`9eb9b192`/`1c40fa2a`, deploy `2c217abf`): SEC-4 timezone DST · SEC-6 project resolver · DAT-3 batch response · DAT-6 meeting 404 · DAT-8 regulatory batch · D7 `stage_entered_at` · D22 typed events · advanceProjectMovement (builder). Verified ALREADY-FIXED (no work): SEC-5(initial call, later corrected)/DAT-1/DAT-2/DAT-5/DAT-7.
- **2026-05-15** (`3bd5d419`..): SEC-1/2/3 (digest XSS, admin endpoints, upload integrity) · GET API auth lockdown · PB POST PI-gating · ProjectDetail archive · Manuscripts categories (3-bucket) · search comment join · transcript honesty (FAKE-3) · folder-link drive letters · INFRA-4 status normalization · FAKE-4.
- **Earlier (Phases 35–39):** see `CHANGELOG.md` + git history.
