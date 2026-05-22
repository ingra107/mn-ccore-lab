# Hub Workplan — updated 2026-05-22

> Single source of truth for **remaining** work. Completed items are a compact ledger at the
> bottom — do not re-expand them. Supersedes the Apr-28 synthesis, May-5 codex plan,
> design-handoff TICKETS, and hub-future-ideas (all historical now).

## ▶ DONE 2026-05-22 PM — the T1 correctness directive + Codex gate executed

Shipped `5f5f597d` (T1 batch) + `909c6e8b` (Codex-gate fixes) + `cf85cfa0` (deploy docs), deployed
`af3189f0` (live on `909c6e8`). CT date sweep, STATE-1, STATE-2 done; enum-drift + DAT-4 verified
clean (no change); test-D1 fully reconciled to prod via hub-schema-sync. Codex audit (`Scratch/codex-t1-verify-2026-05-22/`)
returned Block→2 critical+5 minor, all verified + fixed. Detail in SESSION-HANDOFF.md "Latest — 2026-05-22 PM".

**Next:** T1 leftovers (FAKE-1/2, DH-1/2) below + the `stale_active_since` brain.db pull-back follow-up + T2 polish.

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

- **FAKE-1** *(S fallback / L cron)* — Lab Overview `totalCitations` hardcoded; `useCitations()`
  hook already exists. Show `—` until the PB scholarly weekly cron (home laptop) populates
  per-member h-index/citation data, then wire it. (decision: build the cron)
- **FAKE-2** *(M)* — Hermes "Thinking about this..." literal → `<HermesPending>` component (pulse
  card + elapsed timer, clears via realtimeBus). `questions.ts:40`. (decision: pulse card + timer)

## T1 — Design-handoff leftovers

- **DH-1** *(S once data)* — Post-Award Milestones populated state; needs `grant_milestones` seed
  rows (data task, not engineering). `Grants.tsx:898`.
- **DH-2** *(S — verify/drop)* — PWA manifest for Pulse kiosk; may already be shipped (Phase 32) —
  verify, likely drop.

## T2 — UX & polish (during adoption; not blockers)

- **UX-1** Brand primitives adoption (HermesMark on AskTheLab/MeetingDetail/notifications; HeartbeatDivider; EmptyStateArt). *(M)*
- **UX-2** Token discipline (`#fff`→`--ink-bright`; `--gold-on-emphasis` gaps; inline `<style>` on TodayPage). *(M)*
- **UX-3** Keyboard nav (TodayPage J/K/D/Space/F; AskTheLab J/K; SearchPage `/` focus). *(M)*
- **UX-4** Standard API error envelope `{error:{code,message}}` (uploads/pi-dashboard ad-hoc). *(L)*
- **UX-5** Search source isolation — try/catch per table so one D1 timeout doesn't break all 14. *(M)*
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
- **INFRA-5** *(S — codex: pull up)* Schema-drift CI hardening (assert ordered version list, detect dup prefixes, snapshot hash).
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

- **2026-05-22 PM — T1 correctness batch + Codex gate + ship** (`5f5f597d`/`909c6e8b`/`cf85cfa0`, deploy `af3189f0` live on `909c6e8`): CT date helper sweep (`api/lib/ct-date.ts`, 10 anchors + paired bounds across 6 routes) · STATE-1 TodayPage done-from-cache (reconciliation + onError rollback + isToday) · STATE-2 ProfilePage useQuery refetch · enum-drift + DAT-4 verified clean (no change) · Codex gate fixed pb-sector meeting-TZ + digest date labels + helper hardening + localDoneIds dedup + ProfilePage auth-gate · test-D1 reconciled to prod (hub-schema-sync, 27 tables + cols, now 76 exact match) · librarian fixed 3 stale "Pages auto-deploys on push" agent_knowledge entries · CLAUDE.md deploy docs corrected (manual-only + token).
- **2026-05-22 — audit-fix batch** (`6a69cfb2`, deploy `4681a29c`): advanceProjectMovement id-OR-slug match (was silently missing slug-backed tasks) · `stage_entered_at` on project insert (new-project hole in D7) · batch-assign `assignee_change` event · Manuscripts status enum aligned to server (both dropdowns) · QuickCapture stable event id (SEC-5 double-submit).
- **2026-05-22 — verify-first batch** (`3bd5d419`/`8990acb7`/`9eb9b192`/`1c40fa2a`, deploy `2c217abf`): SEC-4 timezone DST · SEC-6 project resolver · DAT-3 batch response · DAT-6 meeting 404 · DAT-8 regulatory batch · D7 `stage_entered_at` · D22 typed events · advanceProjectMovement (builder). Verified ALREADY-FIXED (no work): SEC-5(initial call, later corrected)/DAT-1/DAT-2/DAT-5/DAT-7.
- **2026-05-15** (`3bd5d419`..): SEC-1/2/3 (digest XSS, admin endpoints, upload integrity) · GET API auth lockdown · PB POST PI-gating · ProjectDetail archive · Manuscripts categories (3-bucket) · search comment join · transcript honesty (FAKE-3) · folder-link drive letters · INFRA-4 status normalization · FAKE-4.
- **Earlier (Phases 35–39):** see `CHANGELOG.md` + git history.
