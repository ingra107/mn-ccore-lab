# WORKPLAN finish roadmap — codex-mapped 2026-05-25

> Codex-generated sequencing of every remaining WORKPLAN item into 11 milestones (M1–M11). `WORKPLAN.md` priorities (P0′/P1/P2/P3/P4) remain authoritative; this is the dependency-aware SEQUENCE to finish them. **The sequencing + the open design decisions (§6) are subject to Nick's steer — NOT yet ratified.** Mapped from `WORKPLAN.md` + the time-sync + activity-timeline specs + the 1A descope plan + `SESSION-HANDOFF.md`.
>
> **TL;DR critical path:** M1 (P1 integrity reconcile) → M2 (Plan 1B display + lint→ERROR) → M3 (P1 drift closure + sync automation) → M4 (P2 task workflow) → M5 (Increment 2 activity/comments). **Recommended immediate next = M1's work→Hub lmm reconcile + root-cause.**

---

**1. DONE Ledger**
- **M2 Plan 1B time-display contract is shipped (2026-05-25):** all 139 R20/R21 date-discipline hits cleared to zero across `src/` + `api/`; new Worker helper `api/lib/time.ts`; lint allowlist extended; CI flipped `TIME_LINT_MODE: warn`→`enforce` and validated green (`workflow_dispatch` run 26423213524). Commits `cce10949`→`9ffa48a4`. Lint now hard-fails on any new raw `new Date().toISOString()` / `.toISOString().split|slice`. `docs/superpowers/plans/2026-05-25-plan-1b-time-display-migration.md`
- Increment 1A forward primitive is shipped: Phase alpha delivered time chokepoints, WARN-mode lint, LMM churn fix, and Task 10 hazards; Phase beta kept Task 6 fail-closed gates, Task 7 UTC `client_ts`, pull-apply `now_instant`, PB writer guard, and Hub `applyPatch` guard. `WORKPLAN.md:40-49`, `SESSION-HANDOFF.md:19-23`
- Do not re-plan the historical timestamp migration: Task 8 900-row migration and Task 9 scaffold deletion / `_CT` to `_UTC` move were intentionally dropped; `last_meaningful_movement` and `completed_at` stay in `_CT_COLUMNS`. `WORKPLAN.md:46-49`, `SESSION-HANDOFF.md:15-17`
- T1 correctness batch is closed: CT date sweep, STATE-1, STATE-2, enum drift, DAT-4 verification, and test-D1 repair shipped. `WORKPLAN.md:60-65`, `WORKPLAN.md:109-132`, `WORKPLAN.md:199`
- Pre-adoption security T0 is closed and deployed, including SEC-T0-1 through SEC-T0-9 plus added attachment, meetings, team pulse, and actor-site fixes. `WORKPLAN.md:77-87`, `WORKPLAN.md:198`
- CT-2, CT-3, and valid CON-2 are closed. `WORKPLAN.md:88-90`
- T3 UX buglets already closed: Today/ProjectDetail query-error states, MeetingDetail attendance rollback/toast, and CreateTaskModal `aria-labelledby`. `WORKPLAN.md:96-99`
- UX-5 search partial failure handling is done. `WORKPLAN.md:154-155`
- INFRA-5 schema-version drift guard is done. `WORKPLAN.md:172-173`
- FAKE-2 Hermes pending UI is done; DH-2 kiosk manifest was dropped as unnecessary. `WORKPLAN.md:139-147`
- P1 sync audit and safe wins already shipped: audit mapped drift, frozen `local_modified` rows were reconciled, TODAY.md freshness guard resurrected, truthy-gate class closed, and LWW timezone front-end work shipped. `WORKPLAN.md:197`

**2. Open-Work Inventory**
P1 — Sync Fidelity & Maintenance Reduction
- Work→Hub LMM reconcile and root cause: **M**, design-touching: no, unblocked by 1A: yes. Work has 64 phantom LMM values while Hub canonical has 3; Hub must be treated as canonical. `WORKPLAN.md:51-54`, `SESSION-HANDOFF.md:25-28`
- Optional gate-harden for legacy naive LMM/completed_at: **M**, design-touching: yes/go-no-go, unblocked by 1A: yes. This is the principled replacement for dropped Tasks 8/9. `WORKPLAN.md:52-53`, `docs/superpowers/plans/2026-05-25-increment-1A-descope-forward-primitive.md:29-31`
- Stale `TABLE_FIELDS` mirror test for `pi_context` / `strategic_context`: **S**, design-touching: no, unblocked by 1A: yes. `WORKPLAN.md:54`
- Remaining sync-drift closure: task done-state TODAY.md verification, v55 fields both ways, `group_override`, legacy-slug canonicalization drift signal, and automation of manual sync steps: **L**, design-touching: partial for automation, unblocked by 1A: yes. `WORKPLAN.md:13-18`
- Plan 1B display migration: **L**, design-touching: no, unblocked by 1A: yes. It must migrate the ~91 Hub raw-date display sites to `time.ts` and only then flip time lint from WARN to ERROR. `WORKPLAN.md:32`, `WORKPLAN.md:56`, `docs/superpowers/specs/2026-05-23-time-sync-timeline-reconciliation-design.md:62-64`

P2 — Today/MyTasks Completeness
- INFRA-7 v55 workflow fields in task UI: **M**, design-touching: light, unblocked by 1A: yes. Fields are `waiting_on`, `promised_to`, `promise_date`, `next_checkin_date`. `WORKPLAN.md:19-22`, `WORKPLAN.md:175`
- Commitments tracker with D9 `commitments.to_slug`: **M**, design-touching: yes, unblocked by 1A: yes; schema must be built with the feature, not before. `WORKPLAN.md:19-21`, `WORKPLAN.md:187-191`
- Today planning UX: persisted meeting notes, Plan button, drag-planning polish: **M**, design-touching: yes, unblocked by 1A: yes. `WORKPLAN.md:19-22`, `WORKPLAN.md:96-99`
- MyTasks ListView `div` grid to `TableContainer`: **M**, design-touching: yes, unblocked by 1A: yes. `WORKPLAN.md:96-99`
- T3 improve items: real `/api/proactive-brief`, MyTasks `?open=`, ProfilePage `/api/team/me`, export `normalizeStage`, Personal root paths to `PATHS`: **S/M**, design-touching: no/light, unblocked by 1A: yes. `WORKPLAN.md:99`
- UX-1/2/3/4/6/7/8/9: brand primitives, token discipline, keyboard nav, standard API envelope, create-flow failure handling, BottomSheet trap, mobile sidebar dialog, breakpoint fix: **S-L**, design-touching: yes for visual/interaction items, unblocked by 1A: yes. `WORKPLAN.md:149-160`
- PAGE-1 through PAGE-7: Today, Profile, AskTheLab, Calendar, Lab Overview, Ideas, MenteeMilestones: **S/M each**, design-touching: yes, unblocked by 1A: yes. `WORKPLAN.md:160-166`
- Increment 2 Activity timeline/comments: **XL**, design-touching: mostly approved but migration steer required, unblocked by 1A: yes because `client_ts` cutover shipped. `WORKPLAN.md:56`, `docs/superpowers/specs/2026-05-23-activity-timeline-comments-design.md:1-9`

P3 — Research SoR Trustworthiness
- Data completeness/accuracy audit for projects/manuscripts: **L**, design-touching: no, unblocked by 1A: yes. `WORKPLAN.md:24-28`
- INFRA-1 ProjectDetail Activity tab read + UI: **L**, design-touching: yes, unblocked by D22 typed emits; should align with Increment 2 to avoid rework. `WORKPLAN.md:168-176`
- INFRA-8 Project staleness adapter fields: **M**, design-touching: light, unblocked by 1A: yes. `WORKPLAN.md:174-176`
- Manuscript/grant pipeline workflows, stage tracking, deadlines, and DH-1 real grant milestones: **L**, design-touching: yes, unblocked by 1A: yes; DH-1 still needs Nick’s real grant IDs/dates before prod seed. `WORKPLAN.md:24-28`, `WORKPLAN.md:142-145`
- FAKE-1 scholarly weekly cron for h-index/citation data: **M**, design-touching: no, unblocked by 1A: yes. Fallback display is already done; cron remains. `WORKPLAN.md:134-138`

P4 — Smarter Hermes / Co-Scientist
- Co-Scientist #41 and deeper AI assistance: **XL**, design-touching: yes/brainstorm-first, unblocked by 1A but not priority until P1-P3 stabilize. `WORKPLAN.md:29-34`, `WORKPLAN.md:178-183`
- PubMed/academic search #46, RePORTER grant intel #42, multi-tenant #60: **L/XL**, design-touching: yes. `WORKPLAN.md:178-183`
- Weekly digest email #31 and pre/post-meeting email #86/#87: **M/L**, design-touching: yes. `WORKPLAN.md:180-182`
- UX-depth parking lot: SmartCompose remaining surfaces, saved views v2, FTS5 search, drag-to-reclassify, manuscript DnD, Calendar time-aware week view, inline edit on Columns/Lanes, PersonSearch, Hermes search: **M/XL**, design-touching: yes. `WORKPLAN.md:181-182`
- FAKE-3 transcript backend, PB Sector web rendering/nav, Lab-TV slides, Apple Watch complication: **M/L**, design-touching: yes. `WORKPLAN.md:183-185`

Cross-Cutting / Maintenance
- T2′ deletes: dead `handleUpsertTodayMd`, tracked `.pyc`, legacy shims, stale seed path, dead tables with row-count proof, keeping citation substrate tables: **S/M**, design-touching: no, unblocked by 1A: yes. `WORKPLAN.md:92-94`, `docs/superpowers/plans/2026-05-22-hub-pre-adoption-batch.md:247-250`
- T2′ consolidations: raw fetch to typed hooks, attachment upload, task grouping, stage taxonomy, people pickers: **M/L**, design-touching: no/light. `WORKPLAN.md:92-94`
- INFRA-2 deep health, INFRA-3 realtimeBus sweep, INFRA-6 Personal 3-tab merge: **M, M, XL**, design-touching: INFRA-6 yes. `WORKPLAN.md:168-176`
- Schema queue: D8 `lab_questions.tags`, D9 `commitments.to_slug`, D28 `meetings.start_time/end_time`, each built with its owning feature and lockstep process. `WORKPLAN.md:187-191`

**3. Dependency Graph**
- Increment 1A forward primitive unblocks Plan 1B and Increment 2: `time.ts` exists, UTC `client_ts` is shipped, and Hub/PB forward guards are live. `WORKPLAN.md:47`, `WORKPLAN.md:56`, `SESSION-HANDOFF.md:19-23`
- Plan 1B must precede the time lint ERROR flip; the lint remains WARN until the raw-date display sites clear. `WORKPLAN.md:32`, `WORKPLAN.md:56`
- Increment 2 must follow the `client_ts` cutover and must not overlap with time/sync edits because it touches shared `outbox.py`, `hub.py`, and `mutations.ts`. `WORKPLAN.md:56`, `docs/superpowers/specs/2026-05-23-time-sync-timeline-reconciliation-design.md:66-75`, `docs/superpowers/specs/2026-05-23-time-sync-timeline-reconciliation-design.md:81-82`
- Work→Hub LMM reconcile should precede optional gate-harden; otherwise the gate-hardening behavior is tested against known local phantom state. `SESSION-HANDOFF.md:25-28`, `docs/superpowers/plans/2026-05-25-increment-1A-descope-forward-primitive.md:29-31`
- P2 Today meeting-notes persistence should wait for the Activity timeline model decision; otherwise it may persist into the text surface Increment 2 is about to split. `docs/superpowers/specs/2026-05-23-activity-timeline-comments-design.md:13-23`, `docs/superpowers/specs/2026-05-23-activity-timeline-comments-design.md:76-80`
- INFRA-1 ProjectDetail Activity tab should be folded into Increment 2, not built as a separate soon-to-be-reworked activity view. D22 emits exist, but Increment 2 changes the activity substrate and UI contract. `WORKPLAN.md:168-176`, `docs/superpowers/specs/2026-05-23-activity-timeline-comments-design.md:50-58`
- D9, D8, and D28 should not be pre-created as dead columns; the schema queue explicitly says to build them with their feature. `WORKPLAN.md:187-191`
- Calendar time-aware week view depends on D28. `WORKPLAN.md:181-182`, `WORKPLAN.md:187-191`
- T2 table drops are not casual cleanup; risky drops require `justify-it`, row-count proof, and substrate-swap/tombstone discipline. `docs/superpowers/plans/2026-05-22-hub-pre-adoption-batch.md:247-250`

**4. Sequenced Milestones To Finish**
M1 — P1 Integrity Reconcile
- Closes: work→Hub LMM reconcile/root cause, stale `TABLE_FIELDS` mirror test, gate-harden decision.
- Prereqs: 1A forward primitive shipped, met. `WORKPLAN.md:47`, `WORKPLAN.md:51-54`
- Size: **M**. Steer-first: only for optional gate-harden.

M2 — Plan 1B Time Display Contract
- Closes: unwritten Plan 1B, ~91 display-site migration, lint WARN→ERROR readiness.
- Prereqs: 1A forward primitive shipped, met; M1 recommended first so live divergence is not confused with display migration fallout. `WORKPLAN.md:32`, `WORKPLAN.md:56`
- Size: **L**. Steer-first: no.

M3 — P1 Drift Closure + Sync Automation
- Closes: TODAY.md done-state verification, v55 both ways, `group_override`, legacy-slug drift signal, remaining manual sync dance automation.
- Prereqs: M1; M2 helpful for time-contract clarity.
- Size: **L**. Steer-first: yes for workflow automation scope. `WORKPLAN.md:13-18`

M4 — P2 Task Workflow Surface
- Closes: INFRA-7 v55 workflow UI, D9 commitments tracker, task capability in UI.
- Prereqs: M3 v55 sync confidence; D9 built with feature.
- Size: **M/L**. Steer-first: yes for commitments semantics. `WORKPLAN.md:19-22`, `WORKPLAN.md:175`, `WORKPLAN.md:187-191`

M5 — Increment 2 Activity Timeline + Comments
- Closes: notes→description privacy/correctness model, unified Activity timeline, comment composer, mentions/NotificationBell, Activity write transport, ProjectDetail Activity tab if scoped in.
- Prereqs: client_ts cutover met; Plan 1B and sync drift milestones should be done to avoid shared-file collision and rollback confusion.
- Size: **XL**. Steer-first: yes for migration decisions, despite approved concept. `WORKPLAN.md:56`, `docs/superpowers/specs/2026-05-23-activity-timeline-comments-design.md:106-115`

M6 — P2 Planning UX
- Closes: Today meeting-notes persistence, Plan button, drag-planning polish, MyTasks TableContainer, MyTasks `?open=`, real proactive brief, Profile `/api/team/me`, `normalizeStage`, Personal `PATHS`.
- Prereqs: M5 for notes persistence substrate; M4 for task workflow fields.
- Size: **M/L**. Steer-first: yes. `WORKPLAN.md:96-99`

M7 — P2 Polish + Page Pass
- Closes: UX-1/2/3/4/6/7/8/9 and PAGE-1 through PAGE-7, plus D8 AskTheLab tags if filters are pulled into PAGE-3.
- Prereqs: M4-M6; D8 only with AskTheLab filter feature.
- Size: **L**. Steer-first: yes. `WORKPLAN.md:149-166`, `WORKPLAN.md:187-191`

M8 — P3 Research SoR Trust
- Closes: projects/manuscripts data audit, INFRA-8 project staleness fields, FAKE-1 scholarly cron, DH-1 real grant milestones, manuscript/grant pipeline stages/deadlines.
- Prereqs: M5 if Activity history is used as SoR history; Nick must provide grant IDs/dates for DH-1.
- Size: **L/XL**. Steer-first: yes for pipeline design and grant data. `WORKPLAN.md:24-28`, `WORKPLAN.md:136-145`, `WORKPLAN.md:174-176`

M9 — T3 Infra + Maintenance Simplification
- Closes: INFRA-2 deep health, INFRA-3 realtimeBus sweep, INFRA-6 Personal 3-tab merge, T2′ deletes, T2′ consolidations.
- Prereqs: feature-heavy P2/P3 surfaces stable; destructive deletes require `justify-it`.
- Size: **XL**. Steer-first: yes for INFRA-6. `WORKPLAN.md:92-94`, `WORKPLAN.md:168-176`

M10 — Schema Queue Completion
- Closes: any remaining D8/D9/D28 schema work not absorbed earlier, with decision docs, registry, and lockstep brain.db/D1 process.
- Prereqs: owning feature specs decided.
- Size: **M**. Steer-first: feature-dependent. `WORKPLAN.md:187-191`

M11 — P4 Strategic Capability Wave
- Closes: Co-Scientist, PubMed/academic search, RePORTER, multi-tenant, comms emails, UX-depth parking lot, transcript backend, PB Sector depth, kiosk/watch work.
- Prereqs: P1-P3 stable enough that AI/comms features have trustworthy task/project/activity substrate.
- Size: **XL+**. Steer-first: yes/brainstorm-first. `WORKPLAN.md:29-34`, `WORKPLAN.md:178-185`

**5. Critical Path + Recommended Next 3 Milestones**
Critical path: **M1 → M2 → M3 → M4 → M5**. That gets the system from “forward primitive shipped” to stable sync/time foundations, then into the highest-value P2 capability work without colliding with shared sync files.

Recommended next 3:
1. **M1 P1 Integrity Reconcile**: immediate next action is compare work brain.db against Hub D1, reconcile LMM with Hub canonical, and root-cause why the backfill never pushed. `WORKPLAN.md:51-54`, `SESSION-HANDOFF.md:25-28`
2. **M2 Plan 1B Time Display Contract**: write and execute the ~91-site display migration plan, then flip lint when clear. `WORKPLAN.md:32`, `WORKPLAN.md:56`
3. **M3 P1 Drift Closure + Sync Automation**: close remaining drift classes and shrink the manual sync dance. `WORKPLAN.md:13-18`

**6. Open Design Decisions Needing Nick’s Steer**
- Should optional gate-harden ship, and should legacy non-canonical naive LMM/completed_at be rejected hard or skipped with diagnostics? `WORKPLAN.md:52-53`
- Which manual sync steps should be automated first, and what level of operator confirmation should remain? `WORKPLAN.md:13-18`
- For commitments: what is the exact product meaning of `waiting_on`, `promised_to`, `promise_date`, `next_checkin_date`, and `commitments.to_slug` in Today/MyTasks? `WORKPLAN.md:19-22`, `WORKPLAN.md:187-191`
- Increment 2 migration choice: keep old conflated descriptions as-is, manually clean active rows, or parse/split a limited set? `docs/superpowers/specs/2026-05-23-activity-timeline-comments-design.md:106-115`
- Increment 2 body model: canonical rich body in `description_json`, plain `description`, or generated sync between both? `docs/superpowers/specs/2026-05-23-time-sync-timeline-reconciliation-design.md:71-72`
- Today planning UX: exact Plan button behavior, drag-planning rules, and where meeting notes persist after Activity exists. `WORKPLAN.md:96-99`
- MyTasks TableContainer redesign density and interaction model. `WORKPLAN.md:96-99`
- Lab Overview role defaults and ActionBoard scope filter behavior. `WORKPLAN.md:163-164`
- Personal 3-tab merge: final Workspace/Inbox/Cards substrate and migration protocol. `WORKPLAN.md:172-174`
- P3 SoR audit acceptance: what source proves every project/manuscript/grant is complete and correct? `WORKPLAN.md:24-28`
- DH-1: real grant IDs/dates for prod milestone seeding. `WORKPLAN.md:142-145`
- P4 Co-Scientist: brainstorm-first scope boundary for lit synthesis, analysis help, drafting, search, and grant intel. `WORKPLAN.md:29-34`, `WORKPLAN.md:178-183`

**7. Risks / Sequencing Traps**
1. Trap: treating `sync_status='synced'` as field-level Hub parity. Mitigation: compare per field against Hub D1 and treat Hub as canonical for the LMM reconcile. `SESSION-HANDOFF.md:25-34`
2. Trap: shipping gate-harden before reconciling known work-machine phantom LMM state. Mitigation: M1 reconcile first, then gate-harden with explicit reject/skip behavior. `docs/superpowers/plans/2026-05-25-increment-1A-descope-forward-primitive.md:29-31`
3. Trap: Plan 1B looks like “date display cleanup” but is the lint-enforcement blocker across ~91 sites. Mitigation: write Plan 1B as its own migration with helper adoption, tests, and lint flip only after zero raw-date sites remain. `WORKPLAN.md:56`, `docs/superpowers/specs/2026-05-23-time-sync-timeline-reconciliation-design.md:62-64`
4. Trap: Increment 2 can leak private notes or lose conflated description content if treated as a normal UI feature. Mitigation: Codex migration plan first, archive-first/manual cleanup bias, no global parse-split, separate snapshot/window. `docs/superpowers/specs/2026-05-23-activity-timeline-comments-design.md:13-23`, `docs/superpowers/specs/2026-05-23-activity-timeline-comments-design.md:106-115`
5. Trap: shared-file collisions between Increment 2 and sync/time work. Mitigation: finish Plan 1B/P1 sync edits first, then do Increment 2 in its own cross-repo lockstep window. `WORKPLAN.md:56`, `docs/superpowers/specs/2026-05-23-time-sync-timeline-reconciliation-design.md:81-84`