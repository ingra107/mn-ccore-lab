# Hub Workplan — updated 2026-05-22

> Single source of truth for **remaining** work. Completed items are a compact ledger at the
> bottom — do not re-expand them. Supersedes the Apr-28 synthesis, May-5 codex plan,
> design-handoff TICKETS, and hub-future-ideas (all historical now).

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

**Deprioritized (still tracked below, just not now):** deeper analytics / PI-velocity dashboards; Meetings, AskTheLab, Calendar polish; external-facing OG/marketing; non-priority PAGE-* design; dead-table simplify (do opportunistically via justify-it). The tier list (T2/T3/T4) below is the MENU; THIS section is the ORDER.

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
