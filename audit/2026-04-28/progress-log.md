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
