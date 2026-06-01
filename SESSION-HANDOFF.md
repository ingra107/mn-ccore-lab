# Session Handoff — 2026-06-01

## ▶▶ CURRENT — Task-UI consistency refactor (P0–P2) MERGED + pushed to main

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
| HEAD | Hub `68b8d861` on main, pushed (Increment 1A Phase α — Hub: `be2eb1d4`/`40058df6`/`d9398a83`/`68b8d861`; spec `5715e6eb`/`799ee275`; plan `d2de8ee2`/`217989c3`; redaction `66e5c9d0`). PB α commits local + Syncthing-propagating: `569a604a`/`43b9eb68`/`c00db519` (PB HEAD `c00db519`). |
| Deploy | `17d7cdd1.mn-ccore-lab.pages.dev` (2026-05-23, Increment 1A Phase α) — LIVE on `68b8d861`. `/api/health` ok (tasks 759/projects 93/team 19, 0 failures). Shipped: Task 4 LMM churn-fix + `tasks.notes` redaction (`66e5c9d0`) + `time.ts` + lint CI. |
| Build | GREEN (0 TS errors) |
| API tests | **208/208** passing (Hub). PB `tests/sync/`: ✅ **328 passed / 2 skip / 0 failures** (was 18 stale-test failures — triaged + retired as test debt, PB commit `4427a808`, 2026-05-24). |
| Schema | **v69** prod D1 (commitments.to_slug). brain.db migration high-water **093** (sync_status neutralized/inert; mig-088 = `blocked_by` legacy-ID backfill, NOT timestamp-normalize — that migration was descoped). |
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
