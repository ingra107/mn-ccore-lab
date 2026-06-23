# Audit Progress Log (append-only)

> **Format**: latest entry on top. Each entry: date, session, findings touched, verification evidence, action, commit. See `VERIFICATION-PROTOCOL.md` § "Verification log format."

---

## 2026-04-28 — Verification sweep across all 12 pages

**Phase**: Verification (no fixes shipped). 12 parallel agents re-checked every P0+P1 finding against current source.

### Headline result

**Almost nothing has been fixed since the audit was generated.** The audit ran 2026-04-28; the verification ran the same day. `git log --since=2026-04-28` against every audited file returns near-empty (only 4 ancillary commits: Pages ExecutionContext fix, calendar batching, docs). No P0+P1 finding has been independently closed by other work.

### Counts

- **Total P0+P1 verified**: 161 findings (across 12 pages)
- **STILL BROKEN, ready to fix immediately (no Nick decision needed)**: ~110 findings
- **NEEDS NICK DECISION before fixing**: ~35 findings (substrate / schema / Hermes / scope choices)
- **AMBIGUOUS / file moved**: 3 findings (M-06, M-16, MI-12) — need more local investigation
- **ALREADY FIXED**: 1 finding (MTG-09 — audit was wrong: search DOES include notes via `SELECT *`)
- **PARTIAL / mixed**: 1 finding (P-06 — CommandPalette half clean, sidebar-avatar half is intentional per Rule 24)

### Per-page verification results

| Page | Agent ID | Total verified | Ready to fix | Needs decision | Already fixed | Ambiguous |
|------|----------|---------------|--------------|----------------|---------------|-----------|
| 01 — TodayPage | `aeac7db106be4f34f` | 19 | 5 | 11 | 0 | 0 (light decision: TP-10, TP-11) |
| 02 — UnifiedMyTasks | `a3d0970fed8c389b5` | 19 | 19 | 0 (architectural Q on TaskDetailPanel composition) | 0 | 0 |
| 03 — ProjectDetail | `a0ec695fe6759b04c` | 18 | 15 | 3 (PD-3, PD-5, PD-6) | 0 | 0 |
| 04 — ProfilePage | `a87b2ccc94a5182ee` | 13 | 12 | 0 (P-06 PARTIAL — half ready, half intentional) | 0 | 1 (P-06) |
| 05 — Lab Overview | `a9a98273c732c8dac` | 10 | 7 | 2 (LO-6, LO-8) | 0 | 0 |
| 06 — Manuscripts | `a9f7ec9a7fb6d5557` | 18 | 15 | 4 (M-03, M-12, M-13, M-14) | 0 | 2 (M-06, M-16) |
| 07 — MyItems/Personal | `a40fe199f954e9bf4` | 24 | 23 | 4 (MI-01, MI-05, MI-06, MI-07) | 0 | 1 (MI-12) |
| 08 — Meetings | `a361368eecde90760` | 9 | 7 | 1 (MTG-01) | 1 (MTG-09) | 0 |
| 09 — SearchPage | `ac91c5e52c1316a9e` | 16 | 16 | 0 | 0 | 0 |
| 10 — AskTheLab | `a833de7b388bd08e3` | 11 | 10 | 1 (ATL-06) | 0 | 0 |
| 11 — CalendarPage | `a89268049d0a136f3` | 7 | 4 | 3 (C-03, C-06, C-07) | 0 | 0 |
| 12 — InsightsPage | `acb2cb6cb85277520` | 10 | 10 | 0 (INS-04, INS-10 carry latent product Q) | 0 | 0 |

### Notable surprises

1. **MTG-09 audit claim was wrong** — search DOES include notes via `SELECT *` from `meetings` (`api/routes/meetings.ts:15-17`). The "silent miss" theory is incorrect. Mark as ALREADY FIXED (or rather: never broken). The performance concern (full notes blob over the wire) is still latent but not P1.

2. **P-06 is two stitched-together claims**. CommandPalette has no `Cmd+K → "Edit my profile"` — that's a clean miss. Sidebar avatar routing to MyItems is INTENTIONAL per Rule 24 footnote ("Nick expected his own working page"). Don't fix the sidebar; do fix CommandPalette.

3. **`useInsightConnections.ts` doesn't exist as a standalone file** — the symbol lives in `useApiData.ts`. Only the audit's metadata header was wrong; no INS finding cites the path, so no impact.

4. **All 12 reports cite line numbers that still match current source.** Audit is FRESH and trustworthy. Verification protocol's "trust nothing" stance was prudent, but in practice almost every citation resolved on first check.

### Decision queue (see `DECISION-QUEUE.md` for the full list)

Nick needs to answer ~12-15 questions before the next batch of fix agents can launch. Most are 1-line decisions. See the dedicated `DECISION-QUEUE.md` file in this directory for the complete list, organized by impact and bundling potential.

### Next session

After Nick answers the decision queue:
1. Dispatch fix agents on STILL BROKEN findings that have decisions resolved
2. Bundle related findings into single PRs (cross-cutting sweeps per `synthesis-plan.md` § "Cross-Cutting Themes")
3. Each PR commit references finding IDs
4. Append per-finding verification log entry as fixes ship

---

<!-- Future entries below this line. Latest on top. -->

## 2026-04-28 — DEPLOYED 🚀

**Phase**: Deploy. Schema v54 migrated, Pages deploy shipped, post-deploy verification green.

### Deploy URL
`https://86c3445e.mn-ccore-lab.pages.dev`

### Steps run
1. ✅ Schema v54 migration (`api/schema-v54-team-citations.sql`) applied to prod D1 — 3 columns added to `team_members` (`citation_count`, `h_index`, `last_scholar_refresh`)
2. ✅ `npm run build` clean (TypeScript + Vite)
3. ✅ `npx wrangler pages deploy dist --project-name mn-ccore-lab` — 100 new files uploaded, 79 already cached

### Post-deploy verification ✅
- `GET /api/health` → 200, 652 tasks / 71 projects / 19 team_members, 42ms duration
- `GET /api/citations` → 200, zero-state correct (schema v54 active; awaits PB scholarly cron)
- `GET /api/insights/dashboard` → 403 PI-only (gate enforced)
- `GET /api/submissions/active` → empty data shape correct (Bundle N M-12 endpoint live)
- `GET /api/search?q=test` → first hit ships new `?openTask=` URL (Bundle O S-07 project-context deeplink working)
- `npm run test:smoke` → 15/27 pass (12 portal `/portal/*` fails are CF Access auth gating; identical to pre-deploy baseline; **no regression**)

### Pending manual step (Nick)
- PB scholarly weekly cron — implement per `scripts/citations-scholar-stub.md` on home laptop. Until then, StatsCard.totalCitations renders `—`.

---

## 2026-04-28 — WAVE 4 SHIPPED ✅

**Phase**: Fix (complete). 4 audit PRs merged to main. Build green, TypeScript clean, API tests 24/24.

### PR roll-up

| PR | Bundle | Findings closed |
|----|--------|----------------|
| #62 | O — SearchPage UX foundations | S-01 through S-16 (16) |
| #63 | M — InsightsPage feature pass | INS-01, INS-02, INS-03, INS-04, INS-05, INS-06, INS-08, INS-09, INS-10 (9) + INS-12, INS-18 incidental |
| #64 | R — TodayPage Tier-1 | TP-09, TP-10, TP-11, TP-12, TP-14, TP-16, TP-17, TP-18, TP-19 (9) |
| #65 | N — Manuscripts polish | M-04, M-05, M-06, M-07, M-08, M-09, M-10, M-11, M-12, M-13, M-14, M-17, M-18 (12) |

**Wave 4 total**: 46 findings closed.

**Cumulative (waves 1-4)**: ~100 P0+P1 findings closed of 161 verified (~62%) across 11 PRs.

### Quality gate ✅
- `npm run build`: clean
- `npx tsc --noEmit`: 0 errors
- `npm run test:api`: 24/24 passing

### Remaining backlog (~60 findings)
- TodayPage Tier-2 (TP-04 + TP-06 state.done arch, TP-05 meeting-notes piggyback, TP-13 token sweep, TP-15 CategoryIcon vocabulary)
- ProfilePage tier-1 (P-02, P-03, P-05, P-08, P-11, P-12, P-13)
- AskTheLab Tier-1 (ATL-03 Hermes pending, ATL-04 realtimeBus, plus ~8 small)
- MyItems / Personal D4+D5 merge (the Personal 3-tab rebuild)
- Lab Overview tier-2 (LO-5, LO-7, LO-9, LO-10)
- CalendarPage tier-1 (C-01 iCal merge, C-02 clickable, C-04 +N more, C-05 view persist)
- Schema-blocked: M-02 (backend), M-03 (D7 cross-repo), MTG-01 (Hermes endpoint), PD-3 (D22 activity_log emit)
- Cross-repo schema migrations queued: D7, D8, D9, D28 (need decision docs + brain.db lockstep)

### Deploy readiness
- Schema v54 SQL ready at `api/schema-v54-team-citations.sql` (Bundle G — needs `wrangler d1 execute`) <!-- wrangler-d1-allowed -->
- Pages deploy ready (no auto-deploy per Rule 9)
- Single-command flow at `scripts/deploy-audit-wave.sh`

---

## 2026-04-28 — WAVE 1 + 2 + 3 SHIPPED ✅

**Phase**: Fix (complete). 7 audit PRs merged to main. Build green, TypeScript clean, API tests 24/24.

### PR roll-up

| PR | Bundle | Findings closed | Lines net |
|----|--------|----------------|-----------|
| #55 | A — P0 quick wins | ATL-01, ATL-02, TP-03, MT-03, MTG-05, M-01 (6) | small |
| #56 | D — Brand + token sweep | ATL-07, ATL-09, ATL-11, PD-8, PD-9, M-15, INS-07, MI-08 (8) | small |
| #57 | B — Lab Overview wires | LO-2, LO-3, LO-4 (3) | +329 / -266 |
| #58 | G — Citations infrastructure | LO-1 + schema v54 + endpoint + PB cron stub (1) | +new files |
| #59 | H — UnifiedMyTasks rebuild | MT-01, MT-02, MT-04, MT-05, MT-06, MT-07, MT-10, MT-11, MT-12, MT-15, MT-16, MT-17, MT-19, MT-26, MT-29, MT-33 (16) | +338 / -276 |
| #60 | F — ProjectDetail polish | PD-1, PD-2, PD-4, PD-5, PD-7, PD-10, PD-11, PD-12, PD-13, PD-14, PD-15, PD-16, PD-17, PD-18 (14) | +588 / -240 |
| #61 | C — SmartCompose universal | PD-6, MTG-02, MTG-03, ATL-05, TP-01, TP-02 + ProjectUpdateFeed + ProjectComments + RightNowCard (~6 finding-equiv) | +651 / -510 |

**Total findings closed**: ~54 P0+P1 (out of 161 verified — 33% closed in one day).

### Quality gate ✅

- `npm run build`: clean
- `npx tsc --noEmit`: 0 errors
- `npm run test:api`: 24/24 passing
- 7 sequential merges, all rebased to clean linear history

### Schema migration pending (Nick deploys)

Bundle G shipped `api/schema-v54-team-citations.sql`:
```
ALTER TABLE team_members ADD COLUMN citation_count INTEGER DEFAULT NULL;
ALTER TABLE team_members ADD COLUMN h_index INTEGER DEFAULT NULL;
ALTER TABLE team_members ADD COLUMN last_scholar_refresh TIMESTAMP DEFAULT NULL;
```
Deploy: `npx wrangler d1 execute mnccore-lab --remote --file=api/schema-v54-team-citations.sql` <!-- wrangler-d1-allowed -->

Until applied, `/api/citations` returns zeros and StatsCard shows `—`.

### PB scholarly cron pending (Nick implements)

Spec at `scripts/citations-scholar-stub.md`. Weekly cron on home laptop iterates `team_members WHERE scholar_id IS NOT NULL`, scrapes scholar.google.com via `scholarly` library, writes back via `PUT /api/team/:slug` with X-API-Key (handler now accepts `CITATION_FIELDS` via API-key auth path).

### Findings remaining (~107 P0+P1 in audit, mostly P1/P2)

- TodayPage Tier-2 (TP-04 through TP-19, mostly P1) — state.done architecture, virtualization, now-line, token sweep, etc.
- UnifiedMyTasks deferred (MT-08 drag, MT-09 swipe, MT-18 grid resize, MT-13/MT-14 saved views)
- ProjectDetail PD-3 (Activity audit log) — blocked on D22 schema work
- Manuscripts (M-02 through M-18 except M-15)
- Meetings (MTG-01 transcript pipeline build, MTG-04+)
- AskTheLab (ATL-03 Hermes pending state, ATL-04 realtimeBus, ATL-06 tags, ATL-08+)
- CalendarPage (C-01 iCal merge, C-02 clickable, C-03 time-aware, C-07 + New)
- InsightsPage (INS-01 SQL fix, INS-02 InlineDatePicker, INS-03+)
- MyItems/Personal (MI-02 mark-all-read undo, MI-03 per-row actions, MI-04 filter chips, MI-05 retire Personal)
- Lab Overview LO-5 through LO-10 (action filter, role defaults, header chrome)
- ProfilePage (P-01 query fix, P-02 affordance, P-03 photo upload, etc.)
- SearchPage (S-01 highlighting, S-02 mixed list, S-03 snippets, etc.)

### Schema migrations queued (cross-repo coordination per Rule R10)

1. `projects.stage_entered_at` (D7 — for M-03)
2. `lab_questions.tags` (D8 — for ATL-06)
3. `commitments.to_slug` (D9 — for MI-07)
4. `meetings.start_time` + `meetings.end_time` (D28 — for C-03 Calendar time-aware)
5. (Possibly) `regulatory_items.responsible_slug` (D10 — pending audit)
6. activity_log emit on 6 transitions (D22 — for PD-3)

These need decision docs in `~/Peripheral-Brain/Context/Decisions/` + `enums.py` + `shared-schema-registry.md` + lockstep deploy.

### Worktree cleanup

Wave 1+2+3 worktree dirs (Bundle A/B/D/G/H/F/C agents) still exist at `.claude/worktrees/agent-*`. Branches deleted on remote post-merge. Local cleanup recommended:
```bash
git worktree list  # see all
git worktree remove --force .claude/worktrees/agent-{ID}  # per worktree
```

---

## 2026-04-28 (later 2) — Bundle A P0/P1 quick wins

**Phase**: Fix. Worktree branch `worktree-agent-a1bbaa8b2e645dd2d`. 5 findings shipped per Bundle A in `DECISIONS-RESOLVED.md`. `npm run build` clean after each commit.

### ATL-01 + ATL-02 — AskTheLab accept-answer auth (P0)
- **File:line confirmed**: yes (UI `src/pages/portal/AskTheLab.tsx:366`, server `api/routes/questions.ts:209`, route `api/index.ts:753`)
- **git log since audit**: none
- **Reproduction**: UI gate hardcoded `userSlug === 'ningraha'` (no isPi check, also wrong slug). Server `handleAcceptAnswer` did NO authorization at all — any authed user could accept any answer.
- **Status**: STILL BROKEN → FIXED
- **Action**: UI gate now `(user?.isPi || userSlug === detail.asked_by)`. Server fetches `lab_questions.asked_by`, computes `actorSlug(user.email)`, calls async `isPiRequest(request, env)` and 403s when neither match. Route registration passes `R(c)` so the request is forwarded.
- **Decision**: D1 (Stack Overflow asker-can-accept-too).
- **Commit**: pending (worktree, see hash list below)

### TP-03 — Today TaskDetailDrawer subtask checkbox decorative (P0)
- **File:line confirmed**: yes (`src/components/today/TaskDetailDrawer.tsx:114`)
- **git log since audit**: none
- **Reproduction**: `<input type="checkbox" defaultChecked={s.completed === 1} ... />` — no `onChange`. Click does nothing.
- **Status**: STILL BROKEN → FIXED
- **Action**: Wired `useToggleSubtask(task.id)` mutation. `onChange` calls `.mutate(s.id)`. Also invalidates `['task-detail', taskId]` cache so the drawer re-renders with updated subtask state (the useTaskDetail query feeds the drawer, not the `['subtasks', taskId]` cache that the hook already invalidates).
- **Commit**: pending (worktree, see hash list below)

### MT-03 — UnifiedMyTasks TaskDrawer subtask checkbox decorative (P0)
- **File:line confirmed**: yes (`src/pages/MyTasks/components/TaskDrawer.tsx:150`)
- **git log since audit**: none
- **Reproduction**: Same as TP-03 — `defaultChecked` no `onChange`.
- **Status**: STILL BROKEN → FIXED
- **Action**: Same — wired `useToggleSubtask(task.id)` + invalidate `['task-detail', taskId]`.
- **Commit**: pending (worktree, see hash list below)

### MTG-05 — MeetingPrep email-prefix-as-slug violates Rule 34 (P1)
- **File:line confirmed**: yes (`src/pages/MeetingPrep.tsx:281`)
- **git log since audit**: none
- **Reproduction**: `getPersonInfo(act.actor?.split('@')[0] || '')` — Rule 34 explicitly bans email-prefix slugging.
- **Status**: STILL BROKEN → FIXED
- **Action**: Replaced with `emailToSlug(act.actor || '')`. Imported `emailToSlug` from `../lib/emailSlug`.
- **Commit**: pending (worktree, see hash list below)

### M-01 — Manuscripts Status + Stage InlineSelect cells lack stopPropagation (P1)
- **File:line confirmed**: yes (`src/pages/portal/Manuscripts.tsx:501-509` desktop status, `:512-516` desktop stage, `:587-595` mobile status, `:596-600` mobile stage)
- **git log since audit**: none
- **Reproduction**: Inner card is wrapped in a `<Link>`. Clicking Status / Stage InlineSelect can navigate parent instead of opening the dropdown. PI cell at `:520` and Category cells at `:533` and `:602` already wrap with `stopPropagation`.
- **Status**: STILL BROKEN → FIXED
- **Action**: Wrapped each of the 4 InlineSelect sites in `<div onClick={(e) => e.stopPropagation()}>`, matching the existing PI/Category pattern.
- **Commit**: pending (worktree, see hash list below)

### Bundle A commit hashes (worktree branch `worktree-agent-a1bbaa8b2e645dd2d`)
- `b34823e3` — fix(askthelab): asker-can-accept-too auth (ATL-01, ATL-02)
- `f9ac4850` — fix(today): wire subtask checkbox onChange (TP-03)
- `aab65e64` — fix(my-tasks): wire subtask checkbox onChange (MT-03)
- `a5868d7c` — fix(meeting-prep): emailToSlug instead of split('@')[0] (MTG-05)
- `2fe26a4c` — fix(manuscripts): stopPropagation on Status + Stage cells (M-01)

## 2026-04-28 (Bundle B) — Lab Overview lies wired to real APIs (3 of 4)

**Phase**: Fix. Bundle B = Lab Overview cards LO-2 / LO-3 / LO-4. LO-1
(citations) explicitly blocked on Bundle G — not touched here.

**Branch**: `worktree-agent-a45ff95d207b05eb0` (worktree, not pushed —
Nick to merge manually).

### LO-2 — UpcomingCard deadlines hardcoded (P0)

- **File:line confirmed**: yes — `src/components/dashboard/UpcomingCard.tsx:17-53` matched `generateDeadlines()` with the cited 5 fake R01/K23/CCI items.
- **git log since audit**: none touching the file since 2026-04-28 verification sweep.
- **Reproduction**: read source — literal hardcoded array still rendering.
- **Status**: STILL BROKEN → FIXED.
- **Action**: Replaced `generateDeadlines()` with `useTasks()` (open tasks with `due_date`) + `useGrantTimeline()` (milestones via `target_date` + grant submission targets via `end_date`). Cap to 5 most-urgent: overdue first (most-overdue first), then ascending by days-until-due. Added empty state.
- **Hook discovery**: `useDeadlines()` does NOT exist as a standalone hook. The Deadlines page derives its DeadlineItem list from `useTasks()` + `useGrantTimeline()` directly. Used the same pattern.
- **Commit**: `ee5c6b37`.

### LO-3 — GrantTimelineCard discards real data (P0)

- **File:line confirmed**: yes — `src/components/dashboard/GrantTimelineCard.tsx:7-13` had hardcoded `grantTimelines` array; line 30 fetched `useGrants()` only for subtitle counts; line 39 iterated the hardcoded array.
- **git log since audit**: none.
- **Reproduction**: read source — hardcoded array still rendered.
- **Status**: STILL BROKEN → FIXED.
- **Action**: Switched from `useGrants()` to `useGrantTimeline()` because the former's `rowToGrant()` mapper discards `start_date`/`end_date` (the very fields needed). Bars now derive from real start_date/end_date (year extracted via regex). Filtered to `startYear <= CURRENT_YEAR + 5` (no speculation past 5 years per spec). Sorted by start year ASC. min/max year computed dynamically. Funded → solid; in_preparation/submitted/planning OR proposed=1 → dashed. Empty state added.
- **Data shape surprise**: `useGrants()` returns a `Grant` type with NO date fields — `rowToGrant()` strips `start_date`/`end_date` from the API row. `useGrantTimeline()` (separate `/api/grants/timeline` endpoint) returns the full row including dates and milestones. Used the timeline hook so dates are preserved.
- **Hook discovery**: `useGrantTimeline()` already existed in `src/hooks/useGrantTimeline.ts` — no new hook needed.
- **Commit**: `d5ab1f25`.

### LO-4 — ActivityFeedCard hardcoded marketing copy (P0)

- **File:line confirmed**: yes — `src/components/dashboard/ActivityFeedCard.tsx:80-87` had the literal `'CLIF Consortium expanding to 13+ sites nationwide'` push.
- **git log since audit**: none.
- **Reproduction**: read source — hardcoded marketing block still pushed onto every render.
- **Status**: STILL BROKEN → FIXED.
- **Action**: Replaced the entire body (hardcoded marketing + synthetic publications/projects/in-review summary) with `useActivity(20)`, filtered via `isProductionVisibleActivity` to skip `_TEST_DELETE_*` + `test_delete_*` fixtures, sliced to 5. Each row: type-coded dot, actor name (resolved via `getPersonInfo(activity.actor)`), description text, relative timestamp via `formatRelativeTime`. Empty state added. "View all" footer link routed to `PATHS.activity` (was hardcoded `/publications`).
- **Hook discovery**: `useActivity()` already existed in `src/hooks/useApiData.ts:271` — no new hook needed.
- **Commit**: `7119d183`.

### Build status

`npm run build` clean after each commit. TypeScript clean (`tsc --noEmit -p tsconfig.app.json`).

### Skipped findings

- **LO-1 (StatsCard.totalCitations = 2626)**: explicitly NOT TOUCHED. Blocked on Bundle G (`/api/citations` endpoint per D2-followup → per-author Google Scholar via `scholarly` Python library). Will ship with Bundle G.

### Notes

- All 3 cards now consume real data; no fixtures/marketing copy reach the team-facing Lab Overview surface (modulo LO-1 which is correctly deferred).
- No new hooks were created — every needed hook already existed in `src/hooks/useApiData.ts` or `src/hooks/useGrantTimeline.ts`. The brief's "if `useActivityLog` doesn't exist, create it" path was unnecessary; the existing `useActivity()` is the canonical hook.
- LO-2 spec mentioned filtering past-date items, but the verbatim instruction also said "overdue first (negative days), then ascending by days-until-due" — kept overdue items in the list per the explicit sort spec, since "what's overdue" is exactly what the user needs to see on Lab Overview.
- Branch merged via PR #57. Per CLAUDE.md Rule 9 "NEVER deploy from a worktree" — the worktree branch was rebased onto main + pushed, then merged via gh pr merge.

---

## 2026-04-28 (later) — Decision queue walked, all 31 decisions resolved

**Phase**: Decision (no code changed). Walked the full decision queue with Nick via AskUserQuestion in 7 batches.

### Headline result

All ~35 decision-blocked findings unblocked. See `DECISIONS-RESOLVED.md` for full answers + dispatch plan.

### Notable decisions (deviations from my recommendations)

- **D1**: Asker-can-accept-too (Stack Overflow), not PI-only. UI + server both gate on `isPiRequest() OR userSlug === question.asked_by`.
- **D2**: Wire ALL 4 fake-data cards to real APIs (not kill any). Triggers `/api/citations` endpoint build.
- **D4**: Merge MyItems INTO Personal as a tab (not retire Personal).
- **D5**: Move personal cards to Personal page (not Today).
- **D16**: Migrate Today to design tokens fully (not extend hex-pinned palette).
- **D18**: Extend CategoryIcon vocabulary (not lucide stroke icons).
- **D19**: Wire focusMin to existing PB session data (`usePBSessionStats`) — combine, don't drop.
- **D28**: Ship Calendar time-aware NOW (Phase B), not defer to Phase C.
- **D30**: Ship full Insights archive UI + Connections panel now, not deferred.

### New scope created by decisions

1. Schema migrations queued: 5+ (stage_entered_at, lab_questions.tags, commitments.to_slug, meetings.start_time/end_time, possibly regulatory_items.responsible_slug)
2. Server endpoints to build: 4 (`/api/citations`, `/api/meetings/process-transcript`, `/api/manuscripts/submissions`, extend `/api/insights/dashboard?week=`)
3. Major UI rebuilds: 5 (Personal 3-tab layout, Lab Overview wire+prune, Calendar time-aware, Insights feature pass, TodayPage cleanup)
4. Phase A foundations: SmartCompose universal sweep + activity_log emit + token discipline + brand-primitives sweep + CategoryIcon vocabulary

### Next session

Dispatch order recommended in `DECISIONS-RESOLVED.md` § "Dispatch plan." Wave 1 = Bundles A + B + C + D + F (independent, parallel-safe, ~5 agents in parallel). Wave 2 = Bundles E + G. Wave 3+ depends on coordinated schema work.

**Files updated this session**:
- `DECISIONS-RESOLVED.md` (new) — single source of truth for fix phase
- `progress-log.md` (this entry)
- `DECISION-QUEUE.md` — superseded by DECISIONS-RESOLVED.md, kept for reference

---

## 2026-04-28 (Bundle C) — SmartCompose universal sweep (D14, 9 sites)

**Phase**: Fix. Worktree branch `worktree-agent-a0a6127405e0436b7`.
Bundle C from `DECISIONS-RESOLVED.md` § Dispatch plan. 9 sites covered;
SmartCompose extended to support non-task surfaces. `npm run build` +
`tsc --noEmit` clean after each commit.

### Foundation: extend SmartCompose to be flexible

- **File:line confirmed**: yes — only 3 prior callers (TaskDetailDrawer,
  MyTasks InlineDetail/TaskDrawer), all task-mode.
- **Action**: Added optional `onSubmit`, `value`/`onChange`, `submitting`,
  `uploadContext`, `theme='dark'|'light'`, `bare`, `autoFocus`,
  `alwaysShowToolbar`, `submitLabel`/`submittingLabel`, `hideKbdHint`,
  `hideSubmitButton`, `rows` props. Existing 3 callers unchanged
  (task mode = pass `taskId`, default behavior preserved). Custom mode
  = pass `onSubmit` + (optional) `uploadContext` for R2 keying. Paste-image
  now wired inside SmartCompose (was caller-side before).
- **Commit**: `16e029de` — feat(SmartCompose): add custom-mode + light theme + flexible upload context (D14 prep)

### TP-01 — TodayPage morning thought (P0, D11 prefix-routed + time-aware)

- **File:line confirmed**: yes — `src/pages/portal/TodayPage.tsx:237-244`
  was bare `<input>` with no submit handler / state / keybind.
- **git log since audit**: none.
- **Reproduction**: typing in the input did literally nothing — confirmed.
- **Status**: STILL BROKEN → FIXED.
- **Action**: New component `src/components/today/MorningThoughtCompose.tsx`
  wraps SmartCompose (theme='dark', bare, rows=1) with D11 routing:
  - `@hermes <text>` → POST `/api/ai-requests` with `source_type='daily_thought'`
  - `note: <text>` → append to `today_state_<day>.thoughts` (LS array)
  - default → `useCreateTask` w/ `assignee=userSlug`, `group_override='priorities'`
  - Time-aware: `new Date().getHours() >= 17` → placeholder swaps to
    "Plan tomorrow's first move…" + tasks default `due_date=tomorrow`.
- **Decision**: D11.
- **Commit**: `d8239394`.

### TP-02 — Today RightNow chat input (P0)

- **File:line confirmed**: yes — `src/components/today/RightNowCard.tsx:67-71`
  was bare `<input>`, no handler.
- **git log since audit**: none.
- **Status**: STILL BROKEN → FIXED.
- **Action**: Replaced with `<SmartCompose taskId={task.id} theme="dark"
  bare rows=1 autoFocus />`. @hermes detection on the active task happens
  server-side via `/@(hermes|claude)\b/i` regex on save (existing path,
  unchanged). autoFocus so chat input gets keyboard focus when expand chevron flips.
- **Commit**: `a710f5ca`.

### PD-6 — ProjectDetail Overview Quick compose (P0)

- **File:line confirmed**: yes — `src/pages/ProjectDetail.tsx:853-1057`
  had `appendToCompose('@')` and `appendToCompose(':')` (literal char appends).
- **git log since audit**: none.
- **Status**: STILL BROKEN → FIXED.
- **Action**: Replaced the textarea + decorative @ / : / 📎 row with
  `<SmartCompose theme='light' bare value/onChange/onSubmit alwaysShowToolbar
  uploadContext={type:'project', id:slug} submitLabel={...} />`. Preserved
  Note/Comment type toggle, drag-drop wrapper (calls existing uploadToCompose),
  BottomSheet trigger label (still updates because state shared via value/onChange),
  broadcastProjectTyping firing from onChange. Removed dead imports
  (AtSign, Smile, Paperclip, appendCharToInput, quickComposeTextRef,
  quickComposeFileInputRef, appendToCompose helper).
- **Commit**: `2d65f176`.

### PD-6 family — ProjectUpdateFeed compose

- **File:line confirmed**: yes — `src/components/ProjectUpdateFeed.tsx`
  used `MentionInput` (partial Phase 38) but predated SmartCompose.
- **Status**: STILL BROKEN → FIXED.
- **Action**: Migrated to SmartCompose (theme='light', bare). Preserved
  the 4 type pills (progress/blocker/result/question) as a header row
  above the compose. UpdateCard reactions stay (per-row, separate from compose).
  Adds emoji palette + R2 paperclip + paste-image (were all missing).
- **Commit**: `ce5d537a`.

### PD-6 family — ProjectComments compose

- **File:line confirmed**: yes — `src/components/ProjectComments.tsx`
  used `MentionInput` but predated SmartCompose.
- **Status**: STILL BROKEN → FIXED.
- **Action**: Migrated to SmartCompose (theme='light', bare). Comments
  uniform — no type pills. Hermes per-row rendering (HermesResponse w/
  HermesMark, gold card) in the comments LIST is unchanged. Adds emoji
  palette + R2 paperclip + paste-image.
- **Commit**: `b220e53d`.

### MTG-02 — MeetingDetail action items form

- **File:line confirmed**: yes — `src/pages/MeetingDetail.tsx:1133-1167`
  had `appendCh('@')` + `appendCh(':')` decorative buttons.
- **Status**: STILL BROKEN → FIXED.
- **Action**: Replaced bare `<input>` + decorative buttons with SmartCompose
  (theme='light', bare, value/onChange controlled). NLP quick-add via
  `parseQuickAddInput` PRESERVED — token preview chips below still render
  on every keystroke since `text` state lives in this component, and
  submit feeds parsed.title/assigneeSlug/dueDate/priority into useCreateTask
  exactly as before. broadcastMeetingTyping fires on onChange. Form → div
  (SmartCompose handles Cmd+Enter; native form submit removed).
  Removed AddActionItemForm-local uploadToCompose + inputRef + fileInputRef.
- **Commit**: `ecb077a6`.

### MTG-03 — MeetingDetail notes editor

- **File:line confirmed**: yes — `src/pages/MeetingDetail.tsx:752-779`
  was plain 12-row `<textarea>`, no @-mention / no markdown / no Hermes.
- **Status**: STILL BROKEN → FIXED.
- **Action**: Replaced with SmartCompose (theme='light', bare, value=notesDraft
  onChange=setNotesDraft onSubmit=updateNotes+exitEditMode rows=12 autoFocus
  alwaysShowToolbar submitLabel='Save Notes'). Cmd+Enter still saves;
  Escape cancel kept on wrapper div. Cancel button retained alongside.
  Verified: no Hermes regex on meeting notes server-side (brief was
  speculative — confirmed via `grep -rn "hermes|claude" api/routes/meetings.ts`).
- **Commit**: `7b5611aa`.

### ATL-05 — AskTheLab composer + answer form

- **File:line confirmed**: yes — modal at `:501-511`, answer form at `:392-399`.
- **Status**: STILL BROKEN → FIXED.
- **Action**: Two sites:
  - **Question modal**: SmartCompose with `value`/`onChange`/`hideSubmitButton`
    (modal's own "Ask the Lab" button is canonical) + `onSubmit` calls
    extracted `submitQuestion()` helper. Cmd+Enter still triggers via
    SmartCompose's keydown. @hermes appears in mention dropdown — gives
    user a visible hint AI assist exists.
  - **Answer form**: SmartCompose (theme='light', bare, alwaysShowToolbar)
    with `submitLabel='Reply'`. Cmd+Enter submits answer. Real R2 attach
    via `uploadContext={type:'answer', entityType:'question'}` so a
    researcher can drop screenshots/PDFs.
- **New SmartCompose prop**: `hideSubmitButton` (used by the question modal
  where form-level submit is canonical).
- **Commit**: `0e358229`.

### Bundle C summary

- 9 sites + 1 foundation commit = **10 commits** on worktree branch.
- Build clean (`npm run build` + `tsc --noEmit -p tsconfig.app.json`)
  after each commit.
- SmartCompose now handles 11 surfaces total (3 prior task-mode +
  8 new — RightNow uses task mode, the other 7 use custom mode).
- Worktree NOT pushed; Nick to merge per CLAUDE.md Rule 9.

### Skipped / not in scope

- **PD-6 outer drag-drop wrapper kept** (uploads via existing
  uploadToCompose path that appends a markdown link — different from
  SmartCompose's paperclip flow which is also wired). Both work; no conflict.
- **MeetingDetail action items: token preview chips kept inline below
  the compose** (lines ~1115-1145 in current file). They were preserved
  per spec — the brief said NLP quick-add must keep working.
- **AskTheLab modal width (max-w-md)** left as-is per brief ("separate
  fix later").
- **TodayPage compose container chrome (🧠 emoji + dashed border)**
  kept; only the inner input swapped. CLAUDE.md Rule 7 (zero monospace)
  preserved (kbd hint moved to be conditional via `hideKbdHint`).
