# Session Handoff — Nick-Review Polish, Round 8/9/10

**Author:** Claude (Opus 4.6) at the end of 2026-04-13 session
**For:** Fresh Claude Code session picking up Wednesday 2026-04-15 (or later)
**Mission:** Continue the Nick-Review Polish work from Round 11 onward. R9 is **deployed**, R10 is **committed but NOT deployed** because we burned through the Cloudflare Workers free-tier request cap.

---

## TL;DR for the incoming session

1. **Do NOT run any Playwright tests, wrangler d1 --remote commands, or deploy commands until you confirm the 100K/day Workers request cap has reset.** It resets at UTC midnight daily. It was already exhausted when this session ended.
2. **Your first move after the cap resets** is: verify state → deploy R10 (commit `145ed8e`) → run regression. Exact commands in the [Wednesday deploy checklist](#wednesday-deploy-checklist) below. Do not touch code until you verify state.
3. **Read the source documents in order:**
   - This file (start here — has everything you need)
   - `Projects/mn-ccore-lab-hub/SESSION-KICKOFF-nick-review-polish.md` (the Round 8 mission brief from 2026-04-12)
   - `C:\Users\ingra107\mn-ccore-lab\review\round8-AGGREGATED-FINDINGS.md` (the consolidated Round 8 audit report)
   - `C:\Users\ingra107\mn-ccore-lab\CLAUDE.md` (repo guide)
4. **Roadmap summary:** R8 audit ✅ → R9 blockers ✅ shipped → R10 taxonomy ✅ committed → **R11 interaction completeness** (next) → R12 mobile pass → R13 Research Digest Model B. R9 and R10 closed 6 of Nick's 11 bugs; 5 remain.

---

## Live state (as of 2026-04-13 09:56 CT)

| Thing | State |
|---|---|
| **Deployed URL** | https://mn-ccore-lab.pages.dev |
| **Live commit** | `c1c74bf` (R9 + dashboard resizable cards, feat/dashboard-resizable-cards cherry-picked into main) |
| **Local HEAD** | `145ed8e` (R10 grants+projects taxonomy, meeting dedup) — NOT deployed |
| **Diff deployed → local** | 1 commit ahead: `145ed8e feat(R10): grants + projects status taxonomy + meeting dedup` |
| **D1 schema** | `grants.status` column added + populated (Wed should verify with one SELECT). Project status data lowercased. |
| **Working tree** | Clean except untracked `review/round8-*` screenshots + raw matrix files (not critical; can commit if desired) |
| **Branch** | `main` |
| **Remote** | `origin main` is at `c1c74bf` — need to push `145ed8e` Wednesday |

---

## Workers cap situation — READ THIS FIRST

**What happened:** Cloudflare sent a "daily requests limit exceeded" email at ~09:45 CT on 2026-04-13. The 100K/day free-tier cap was already exhausted by mid-morning. Nick was (rightly) confused because it was only 10 AM local.

**Why the day-boundary confusion:** the "daily" counter resets at **UTC midnight = 7:00 PM CT the day before**. So when the cap hit at 09:45 CT on 2026-04-13, the day had actually been running for ~15 hours since 7:00 PM CT on 2026-04-12. Overnight scheduled jobs, Hermes polling, any open team tabs, and the prior evening's session work all counted against that budget before this session even started.

**What this session's Round 8 + R9 work contributed (rough estimate):**
- Phase 1 discovery agents (D1 SQL / D2 FAB Playwright scan / D3 interactive surface): ~5,000 requests
- Phase 2 user journey agents (A/B/C/D/E/F, each hitting ~15 steps across the deployed site): ~13,500 requests
- `inspection.spec.ts` regression after R9 deploy: ~3,200 requests
- Smoke tests, dashboard verify, wrangler d1 commands: ~500 requests
- **Session total: ~22,000 requests (≈22% of the 100K budget)**

The other **78%** likely came from:
- **Hermes AI listener polling at 10-second interval = 8,640 req/day baseline** (per CLAUDE.md, `hub_ai_listener.py` polls `/api/ai-requests`). This alone is 8.6% of the cap every 24 hours with zero user activity.
- Any open Hub browser tabs on team computers (TanStack Query refetch on focus + 60s smart polling ≈ 600 req/hour per idle tab).
- Overnight scheduled jobs: `sync_d1_push.py` at 2:35 AM, `sync_d1_pull.py` at 2:40 AM, plus any cron-scheduled research-digest / watchdog / janitor / mechanic agents.
- The parallel Claude session Nick mentioned was working on project duplicates.
- Cloudflare retries / prefetches / bots.

**Action items for the incoming session:**
1. **Check the Cloudflare dashboard first.** Workers → mn-ccore-lab → Analytics → break down by route. Identify the top-N consumers. If `/api/ai-requests` is disproportionate, Hermes polling is the smoking gun.
2. **Consider lengthening the Hermes polling interval.** 10 → 60s drops it from 8,640/day to 1,440/day — a ~7,200/day savings for 50s worth of extra latency on AI requests. The `hub_ai_listener.py` file is on Nick's home laptop in `C:\Users\ingra107\Peripheral-Brain\scripts\` (or similar — Wednesday session should grep for it).
3. **Recommend the Workers Paid plan to Nick if he hasn't already switched.** $5/month → 10M requests/day (100× headroom). For a lab portal with 20+ team members + AI listener + sync system + audit sessions like this one, the free tier will keep burning. **$5 is less than one coffee.** This was raised but not yet acted on.
4. **Never run parallel Playwright audits against the deployed site again without a budget plan.** If you need journey-style testing, dispatch one agent at a time, or set up a proper Miniflare + local D1 stack to test against. Journey C (Grants) surfaced a related finding: `X-Test-Mode: true` header was a half-baked attempt at this.

---

## Wednesday deploy checklist

**Copy-paste this verbatim after confirming the Workers cap has reset (check Cloudflare dashboard or just try a single curl to the API — if it 200s, you're clear).**

```bash
cd /c/Users/ingra107/mn-ccore-lab

# 1. Sanity-check state
git status                                    # should be clean
git log --oneline -5                          # HEAD should be 145ed8e
npm run build                                 # should pass (it did at commit time)

# 2. Pull in case another session added commits
git pull origin main                          # likely a no-op
cd /c/Users/ingra107/Peripheral-Brain && git pull && cd -

# 3. Verify D1 schema state from R10 migrations (these ran yesterday)
npx wrangler d1 execute mnccore-lab --remote --json --command="SELECT status, COUNT(*) FROM grants GROUP BY status"
# Expect: funded 1, in_preparation 4
npx wrangler d1 execute mnccore-lab --remote --json --command="SELECT status, COUNT(*) FROM projects GROUP BY status"
# Expect: active 64 (or close — another session may have merged duplicates by now)

# 4. Push R10 commit
git push origin main

# 5. Deploy (ONE deploy — batch any hot-fixes first)
npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab

# 6. Smoke test the deploy (small request budget)
curl -s -o /dev/null -w "%{http_code}\n" https://mn-ccore-lab.pages.dev/grants
curl -s -o /dev/null -w "%{http_code}\n" https://mn-ccore-lab.pages.dev/projects

# 7. Run ONE regression suite (not all four — budget discipline)
npx playwright test tests/inspection.spec.ts --reporter=list
# Expected: ≥212 passed, ≤2 skipped, 0 failed (matches post-R9 baseline from 2026-04-13)
```

**If the deploy or regression surfaces a new failure**, diagnose locally before spending more requests. Use `npm run dev` and Playwright against `localhost:5173`.

---

## What's in R9 (deployed) and R10 (committed)

### R9 — "blockers + one-liners" (commit `2192734` + `c1c74bf`, deployed)

All referenced in `review/round8-AGGREGATED-FINDINGS.md`. These closed 6 of Nick's 11 bugs.

| ID | Fix | Location | Nick bug |
|---|---|---|---|
| R9-1 | FAB collision — replaced `max()` with `--fab-stack-{1,2,3}` CSS variable in `:root`, media-query scoped for <768px | `src/index.css` + `PortalLayout.tsx:258` + `ScrollToTop.tsx:21` + `QuickCaptureInbox.tsx:432` | #11 |
| R9-2 | Date picker flash — removed `showPicker()` + `onBlur setTimeout` | `src/components/InlineDatePicker.tsx:29-34, :97` | #10 |
| R9-3 | Row click anywhere opens detail — `onOpenDetail` falls through when `onSelect` absent | `src/components/tasks/TaskGridView.tsx:845-848` | #9 |
| R9-4 | Project picker no longer corrupts panel — ported to `createPortal` | `src/components/tasks/detail/FieldControls.tsx` ProjectSelect | #12 |
| R9-5 | Grants progress bar no longer clips at compact density — `height` → `minHeight`, dropped `overflow:hidden` | `src/pages/portal/Grants.tsx:567` | #2 |
| R9-6 | TaskDetailPanel chunk preloaded on idle via `requestIdleCallback` | `src/pages/portal/MyTasks.tsx:66-84` | #8 |
| R9-7 | Mobile QuickAdd input imperative `focus()` via `requestAnimationFrame` | `src/components/QuickAddTaskInput.tsx:119-131` | Journey F |
| R9-8 | D1 cleanup: 2 test grants deleted, 20 NULL-status tasks repaired; sync-bulk endpoint now defaults status='todo' / priority='medium' | `scripts/round9/r9-d1-cleanup.sql` + `api/routes/tasks.ts:441-442` | DI-3, DI-8 |
| R9-9 | Dashboard cards now draggable AND resizable via react-grid-layout; per-user+per-section localStorage persistence; theme-matched CSS overrides | `src/components/dashboard/DashboardGrid.tsx` + `src/lib/dashboardLayout.ts` + `src/styles/dashboard-grid.css` + `src/pages/Dashboard.tsx` | Nick feature request |

R9 post-deploy regression: **`inspection.spec.ts` 212 passed / 0 failed / 2 skipped** (6 minutes).

### R10 — "semantic corrections" (commit `145ed8e`, LOCAL ONLY)

| ID | Fix | Location |
|---|---|---|
| R10-1 | `grants.status` column added via `ALTER TABLE` | `scripts/round9/r10-grants-status-migration.sql` (**already applied to prod D1** during the session before the cap hit) |
| R10-2 | Grants reclassified: K23 provider variation mechvent → `funded`, all others → `in_preparation` | Same SQL file (applied) |
| R10-3 | Grant status taxonomy in UI: `GRANT_STATUS_OPTIONS` + `useUpdateGrant` mutation + `InlineSelect` on grants row + `PATCH /api/grants/:id` endpoint with field allowlist and status enum validation | `src/hooks/useGrantTimeline.ts` (types + options), `src/hooks/mutations/useOtherMutations.ts` (`useUpdateGrant`), `src/pages/portal/Grants.tsx` (wire), `api/routes/publications.ts` (`handleUpdateGrant`), `api/index.ts` (route) |
| R10-4 | Project status reuses task vocabulary: `active`/`waiting_external`/`blocked`/`done`. Data lowercased in D1. 12 frontend files + 3 API routes updated to use `isProjectActive()` helper or lowercase literal. `PROJECT_STATUS_OPTIONS` + `normalizeProjectStatus()` helpers added. | `src/lib/taskConstants.ts` (new constants + helpers), `scripts/round9/r10-projects-status-migration.sql` (**already applied**), then `Projects.tsx` / `StatsCard.tsx` / `ActivityFeedCard.tsx` / `GrantTimelineCard.tsx` / `LabPageLayout.tsx` / `MemberPage.tsx` / `Home.tsx` / `Pulse.tsx` / `AnalyticsPage.tsx` / `api/routes/publications.ts` / `api/routes/projects.ts` / `api/routes/narratives.ts` / `api/routes/pb-health.ts` |
| R10-5 | Meeting dedup normalizer — `normalizeMeetingTitle()` lowercases + trims + collapses whitespace before comparison | `api/routes/meetings.ts:270-305` |

**R10 commit:** `145ed8e feat(R10): grants + projects status taxonomy + meeting dedup`

**R10 was NOT deployed, NOT regression-tested.** Build clean locally (`npm run build` passes at commit time). Wednesday session MUST run `inspection.spec.ts` after deploying.

---

## R10 — things to verify on Wednesday after deploy

These need a spot-check because the commit landed with only a local build:

1. **Grants page → click a status pill.** Should open the InlineSelect dropdown with 7 values. Select a different one; undo toast should fire. Reload; value persists.
2. **Grants page → K23 provider variation mechvent** should show `Funded` not `Active`. If it shows `Active` the data didn't migrate — re-run the SQL.
3. **Projects page → click a status pill.** Should show 4 values (Active / Waiting (External) / Blocked / Done). Change one; should persist.
4. **Dashboard → StatsCard "Active Projects" count** should still read correctly (should match `SELECT COUNT(*) FROM projects WHERE status='active'`).
5. **GrantTimelineCard subtitle** on the dashboard should read like `"1 funded, 4 in prep"` (not `"X active, Y pending"`).
6. **POST a duplicate meeting** via the Coordinator workflow (same date, title differing only in case/whitespace). Should dedup.

**If any of these fail, the fix is almost certainly in the file:line references above.**

---

## What's NOT closed — roadmap from here

From the aggregated Round 8 report, these remain. Priority and effort estimates are mine.

### R11 — Interaction completeness (estimated ~4 hours)

These are real UX gaps the journeys surfaced. Most have file:line pointers already from Agent D3's interactive surface scan (`review/round8-interactive-surface.md`).

| ID | Fix | Source |
|---|---|---|
| R11-1 | MeetingDetail inline completion on action items — coordinator can't close the loop without leaving the meeting view | Journey B-H1 |
| R11-2 | N-key does NOT create a new decision on `/decisions` — CLAUDE.md claims it works, test confirms it doesn't. Either wire it or delete the claim from the Coverage table | Journey B-H2 |
| R11-3 | `/publications` "Copy bibliography" button is missing entirely — CLAUDE.md claims it exists. Either add or delete the claim | Journey B-H3 |
| R11-4 | Deadlines due-date cells are read-only — add inline editor | Agent D3 |
| R11-5 | Manuscripts PI/Category cells are read-only — add inline editors matching the Projects/Tasks pattern | Agent D3 |
| R11-6 | Ideas titles not clickable — click-to-detail panel missing | Agent D3 |
| R11-7 | Decisions titles not clickable — click-to-detail panel missing | Agent D3 |
| R11-8 | Grants rows have no click-to-detail (even after R10 wired status inline editing) | Agent D3 |
| R11-9 | **CLAUDE.md Component Coverage table is stale and cannot be trusted.** Journey B found at least 2 features listed as covered that are not actually wired. Recommend independent re-verification of every row in the Coverage table. | Journey B pattern |
| R11-10 | Nick bug #3 — regulatory strip click lands on `/personal` with no modal / no `.ics` download. Expected a detail view or download action. | Journey A |
| R11-11 | Nick bug #6 — stale focus highlight on MyTasks after clicking a different row. Agent D3 could not reproduce; Nick should manually confirm and file a repro if real. | Nick review |
| R11-12 | Nick bug #7 — "blue neon click outline too aggressive" on MyTasks. Manual verification needed; Nick said to tone it down if confirmed. | Nick review |

### R12 — Mobile pass (estimated ~3 hours)

From Journey F.

| ID | Fix | Source |
|---|---|---|
| R12-1 | Touch-target sweep: 18 sub-44px targets on `/dashboard`, 30 on `/my-tasks`. Raise to 44px minimum. Most are icon-only hover actions at 28×44. | Journey F-H2 |
| R12-2 | Typography floor: 10px text in 20+ spots per page. Raise to 11px minimum on mobile (<768px). | Journey F-H3 |
| R12-3 | Calendar lacks visible prev/next on touch — keyboard-only per CLAUDE.md. Add touchable arrows. | Journey F-H4 |
| R12-4 | MobileTabBar exposes only 4 of 18 portal routes. Add a "More" overflow or let users pin their most-used routes. | Journey F-H5 |
| R12-5 | Verify the QuickAdd mobile focus fix from R9-7 actually works on a real device. Headless Playwright emulation can miss iOS keyboard-activation quirks. | Nick should test on iPhone |

### R13 — Research Digest Model B (~8 hours, new feature)

From Journey E gap analysis. The current page is not as empty as Nick assumed — it has 375 papers loaded, plus save/dismiss/link-to-project buttons. What's missing for "Model B":

| Gap | Layer | Effort |
|---|---|---|
| Comment system per paper (table + API + UI) | schema + API + UI | 2.0h |
| Cross-date saved library view ("show all my saves, not just today's") | UI | 1.5h |
| Persistent "linked to project" badge after linking | UI | 1.0h |
| Multi-user save state via a join table (currently single TEXT) | schema + API | 1.0h |
| Private notes per paper | schema + UI | 1.0h |
| NIH Reporter PI-name search (`pi_names` criteria) on `/grants` | API | 0.5h |
| Tests + backend foundation | test + API | 1.0h |

**Also:** Journey E discovered that "NIH Reporter broken" was actually a location confusion. The Reporter search lives on `/grants`, not `/research-digest`. The Digest page only filters client-side on the day's already-fetched papers. Nick was searching the wrong page. The API route at `/api/grants/similar` works — returns 739 results for ARDS. PI name search just isn't implemented.

### Data integrity (from Agent D1)

R9 and R10 closed several of these. Remaining:

| ID | Finding | Status |
|---|---|---|
| DI-4 | 10 duplicate project pairs (hex id + slug id). Tasks/health splitting silently. 2 pairs have typo slugs (`graffy` / `gaffey`, truncated `decision-making-styles-of-medical`). | **Another Claude session is handling this — don't race it.** Nick said so explicitly. Wednesday session should `git pull` before doing anything to see their merge commits. |
| DI-6 | 330 active tasks have dangling `project_id`. 303 point to brain.db virtual buckets (`admin-tasks`, `peripheral-brain-system`). Rest are real slugs that never synced to D1. | Not touched. Fix requires aligning `brain.db` ↔ D1 slug generation in `sync_d1_push.py`. Estimated 2h. |
| DI-9 | 3 dead project columns (`pi_context`, `stage_notes`, `strategic_context`) — zero rows populated | Not touched. Either drop with `ALTER TABLE` or start populating. Low priority. |
| DI-10 | `short_name` editable only on ProjectDetail, not in the Projects list | Not touched. Half an hour of work. |
| DI-11 | `test_delete_` prefix missing from CLAUDE.md cleanup snippet | Not touched. 5 minutes. |

### Test infrastructure (from Agent D3 + Journey C + Journey D)

These are NOT user-facing bugs but they ARE blocking the reliability of future audits.

| ID | Finding | Fix effort |
|---|---|---|
| **C-H1 (critical)** | `playwright.config.ts` injects `X-Test-Mode: true`, which routes API calls to `mnccore-lab-test` (empty DB). **Prior inspection passes on data-rich pages (grants, tasks, projects) may have been false positives** because the test page was empty. | Unknown until investigated. Start by reading the playwright config and the API middleware that honors the header. Decide: either remove the header and test against prod, or properly seed the test DB. |
| D-BUG1 | `CreateTaskModal` assignee `<select>` is empty under X-Test-Mode because `DB_TEST` has no `team_members` rows. Breaks Journey D-03/04. | Seed script. 15 min. |
| D-BUG2 | Inline status/priority cells in TaskGridView lack `data-field` attributes. Tests can't target them with row-scoped locators. | Add attributes. 20 min. |
| D-BUG3 | Inline grid edits (status/priority) log to `activity_log` but NOT to `task_updates`. TaskDetailPanel Activity tab has no system events for grid-level changes. **Audit-trail gap** — not purely a test issue. | Wire the log. 30 min. |

---

## Dashboard resizable cards (R9-9) — known-good state

This was Nick's ad-hoc request mid-Round-8. It landed in R9 and is live.

**What it does:** Each dashboard card now has:
- A 6-dot drag handle at top-left (hover-reveal, 22×22, neutral color, teal focus ring)
- A bottom-right resize handle (SE only, hover-reveal, two-line chevron icon)
- Layout persists per user slug + section (`pinned` / `primary` / `secondary`) to localStorage under the `mnccore-dashboard-layouts-v1:*` keys
- A "Reset layout" button on the Pinned section header
- Responsive breakpoints: lg=4 cols / md=3 / sm=2 / xs=1, calibrated against container width (not window width — sidebar eats ~250px)
- Respects `prefers-reduced-motion`
- Print stylesheet collapses back to a vertical stack

**Files:**
- `src/components/dashboard/DashboardGrid.tsx` — the wrapper
- `src/lib/dashboardLayout.ts` — storage, reconciliation, default flow
- `src/styles/dashboard-grid.css` — theme overrides for react-grid-layout's default CSS
- `src/pages/Dashboard.tsx` — replaced 3 DndContext blocks with DashboardGrid

**Verification evidence** in `review/round8-dashboard-grid/`:
- `desktop-1440.png` — light mode, 4-col
- `mobile-375.png` — single-column
- `dark-desktop-1440.png` — dark mode
- `dark-hover-first-card.png` — hover state showing both handles

Resize test verified card grew 245×260 → 537×552 pixels (2×2 cells) and persisted after reload under `mnccore-dashboard-layouts-v1:anon:primary`.

**Gotchas discovered:**
- `react-grid-layout@2.2.3` is a hook-based rewrite with breaking API changes. **Downgraded to `1.5.3`** which has the `WidthProvider(Responsive)` HOC pattern. If you upgrade later, expect to rewrite `DashboardGrid.tsx`.
- The `@formkit/auto-animate` package was imported in `TaskGridView.tsx` but missing from `package.json` — blocked the first build of the session. Installed.
- Breakpoints: RGL measures the CONTAINER width, not the window. First attempt used `lg: 1440` and the content area at a 1440 viewport was only ~1000px, so `md` was active. Recalibrated to `lg: 960` (container ≥ 960 = 4 cols).
- Dark-mode verification needed the right localStorage key: `mn-ccore-theme` (NOT `theme`).

---

## Decisions locked in this session

1. **Grant status taxonomy** (Nick approved, landed in R10): `planning` / `in_preparation` / `submitted` / `funded` / `resubmission` / `declined` / `closed`. Only K23 provider practice variation in mechanical ventilation is `funded`. Everything else defaulted to `in_preparation` because the rows had data attached; they need per-grant review.
2. **Project status taxonomy** (Nick approved, landed in R10): reuse the task vocabulary — `active` / `waiting_external` / `blocked` / `done`. All 64 projects were lowercased to `active`; per-project judgment for the other values is deferred. The `stage` column carries the pipeline dimension (Idea → Published); `status` is orthogonal ("is this moving?").
3. **Research Digest = Model B** (Nick decision from the kickoff doc): interactive library where users save, comment, and link articles to projects. Currently deferred to R13 (~8 hours).
4. **Dashboard cards resizable AND draggable** (Nick ad-hoc request): landed in R9-9 via `react-grid-layout`. Replaces the prior `@dnd-kit` reorder-only pattern.

---

## Decisions still pending from Nick

1. **Duplicate project pair reconciliation** (DI-4). Nick said another session is handling this. Wednesday session: `git pull` first, then re-query D1 to see the current state.
2. **Per-grant review** beyond K23. 4 grants currently sit at `in_preparation` as a conservative default. Nick may want to promote some to `submitted` or demote some to `planning`. UI is now wired so he can do it inline on `/grants`.
3. **Per-project review** beyond the bulk `active` default. With 64 projects, some are almost certainly stalled (`waiting_external`), blocked, or actually done. R12 mobile pass is lower priority than Nick spending 20 minutes classifying these, IMO.
4. **Cloudflare Workers Paid plan** ($5/mo). Raised but not decided. Strong recommendation.
5. **Hermes polling interval**. 10s → 60s would save ~7,200 req/day. Latency cost is up to 50s per AI request. Probably worth it.

---

## Gotchas discovered during R8/R9/R10

These are non-obvious things that will trip up the Wednesday session or any future session:

1. **`package.json` can be out of sync with imports.** `TaskGridView.tsx` imported `@formkit/auto-animate/react` but the package wasn't declared. First build of this session failed on this. If you see `Cannot find module 'X'` in build, grep the imports.
2. **`react-grid-layout@2.x` is a breaking rewrite.** Stay on `1.5.3` unless you want to rewrite DashboardGrid. The old hook-less HOC API is what `DashboardGrid.tsx` depends on.
3. **Dark mode storage key is `mn-ccore-theme`, not `theme`.** The app's `useDarkMode` hook reads this. Playwright tests must use the right key or you'll screenshot light mode thinking it's dark.
4. **RGL measures container width, not window.** Breakpoints need to account for the sidebar. See `DASHBOARD_GRID_BREAKPOINTS` in `src/lib/dashboardLayout.ts`.
5. **Playwright `X-Test-Mode: true` header routes to an empty DB.** Agent C discovered this. Prior passes on data-rich pages (grants/tasks/projects) may be false positives. Treat inspection pass counts with skepticism until C-H1 is properly investigated.
6. **CLAUDE.md Component Coverage table is stale.** At least 2 rows (`N-key on /decisions`, `Copy bibliography on /publications`) claim coverage that doesn't exist. Use the table as "hopefully correct" not "ground truth."
7. **Legacy project status values can still appear** in static fallback data (`src/data/projects.ts`, `NickLab.tsx`, `NateLab.tsx`). The `normalizeProjectStatus()` helper in `taskConstants.ts` folds them. Don't delete the helper; some rendering paths still pass legacy values.
8. **The FAB stack now uses `--fab-stack-{1,2,3}` CSS variables** set in `:root` with a `<768px` media query override. If you add a new FAB, register it in `src/index.css` :root block, don't use `max()` math (that was the R9-1 root cause).
9. **The inspection test suite takes 6 minutes.** Don't run it casually during audit phases. Run it ONCE pre-deploy.
10. **Dashboard chunk is 175KB (gzipped 45KB)** after the RGL swap — ~80KB heavier than before. Accepted because resize+drag is a core interaction. If it becomes a problem, code-split Dashboard.tsx further.

---

## File inventory

### Committed this session (not yet all pushed)

- **R9 commits (pushed + deployed):**
  - `2192734` — R9 blockers batch
  - `c1c74bf` — dashboard resizable cards
- **R10 commit (LOCAL ONLY, needs push + deploy):**
  - `145ed8e` — grants + projects status taxonomy + meeting dedup

### New files created this session

```
review/round8-AGGREGATED-FINDINGS.md
review/round8-d1-data-integrity.md
review/round8-fab-collision.md
review/round8-interactive-surface.md
review/round8-journey-{a,b,c,d,e,f}.md
review/round8-dashboard-grid/{desktop-1440,mobile-375,tablet-1024,dark-desktop-1440,dark-hover-first-card}.png
review/round8-fab/*.png (51 collision screenshots)
review/round8-interactive/*.png + matrix.json
review/round8-journey-{a,b}/*.png
scripts/round9/r9-d1-cleanup.sql
scripts/round9/r10-grants-status-migration.sql
scripts/round9/r10-projects-status-migration.sql
src/components/dashboard/DashboardGrid.tsx
src/lib/dashboardLayout.ts
src/styles/dashboard-grid.css
```

### Non-disposable test specs left in the repo

- `tests/round8-interactive-surface.spec.ts` — D3 kept this as a regression suite for inline editor integrity
- `tests/round8-journey-{a,c,d}.spec.ts` — a few journey specs the agents chose to retain. These may have been intended as disposable; Wednesday session can audit and delete any that aren't pulling their weight.

### Modified files — R9

```
src/index.css                             (+17 lines: FAB stack vars)
src/components/PortalLayout.tsx
src/components/ScrollToTop.tsx
src/components/QuickCaptureInbox.tsx
src/components/InlineDatePicker.tsx
src/components/QuickAddTaskInput.tsx
src/components/tasks/TaskGridView.tsx
src/components/tasks/detail/FieldControls.tsx
src/pages/portal/Grants.tsx
src/pages/portal/MyTasks.tsx
src/pages/Dashboard.tsx                   (DndContext → DashboardGrid)
api/routes/tasks.ts                       (sync-bulk NOT NULL guards)
```

### Modified files — R10

```
api/routes/publications.ts                (handleUpdateGrant, status='active' update)
api/routes/projects.ts                    (WHERE status='active')
api/routes/narratives.ts                  (same)
api/routes/pb-health.ts                   (same)
api/routes/meetings.ts                    (normalizeMeetingTitle)
api/index.ts                              (PATCH /api/grants/:id route + import)
src/lib/taskConstants.ts                  (PROJECT_STATUS_OPTIONS + helpers)
src/hooks/useGrantTimeline.ts             (GrantStatus type + GRANT_STATUS_OPTIONS)
src/hooks/mutations/useOtherMutations.ts  (useUpdateGrant)
src/data/types.ts                         (Grant.status union widened)
src/pages/Projects.tsx
src/pages/portal/Grants.tsx               (InlineSelect wire)
src/pages/portal/AnalyticsPage.tsx
src/pages/MemberPage.tsx
src/pages/Home.tsx
src/pages/Pulse.tsx
src/components/LabPageLayout.tsx
src/components/dashboard/StatsCard.tsx
src/components/dashboard/ActivityFeedCard.tsx
src/components/dashboard/GrantTimelineCard.tsx
```

### Not touched but probably should be (R10 residual)

The static fallback data in `src/data/projects.ts` and `src/data/grants.ts` still has uppercase `'Active'`. They type-check because I widened the union, and `normalizeProjectStatus()` folds them at render time. Low priority to migrate, but ideally these go lowercase in a cleanup pass.

Also `src/pages/NickLab.tsx` and `NateLab.tsx` use `status: 'Active' as const` for display data. Same story — type-checks fine, renders via normalization. Cleanup pass material.

---

## Round 8 report map (for context)

Everything is in `C:\Users\ingra107\mn-ccore-lab\review\`:

| Report | Author | Purpose |
|---|---|---|
| `round8-AGGREGATED-FINDINGS.md` | Me (synthesis) | **Start here** — all 9 agent findings consolidated with prioritized fix plan |
| `round8-d1-data-integrity.md` | Agent D1 | SQL audit: duplicates, orphan FKs, stale statuses, slug mismatches, schema gaps |
| `round8-fab-collision.md` + `round8-fab/*.png` | Agent D2 | 51 collision screenshots + `collisions.json` + file:line root cause |
| `round8-interactive-surface.md` + `round8-interactive/matrix.json` | Agent D3 | 22 cell × page × result matrix; Nick's 5 confirmed bugs with file:line |
| `round8-journey-a.md` | Journey A (Opus) | PI morning review, 15 steps |
| `round8-journey-b.md` | Journey B (Opus) | Coordinator workflow, 18 steps — found 3 new high-severity issues |
| `round8-journey-c.md` | Journey C (Sonnet) | Grant management + density screenshots + X-Test-Mode critical finding |
| `round8-journey-d.md` | Journey D (Sonnet) | Data entry day, 14 steps + 3 test-infra bugs |
| `round8-journey-e.md` | Journey E (Sonnet) | Research Digest Model B gap analysis + effort breakdown |
| `round8-journey-f.md` | Journey F (Opus) | Mobile PI at 375×812, touch targets + typography gaps |

---

## Context on the other session

Nick mentioned during this session that **another Claude session is working on the project duplicates problem** (DI-4). That session also made a commit during our work (`3037b6f` originally on `feat/dashboard-resizable-cards` before I cherry-picked it and cleaned the branch — it was `api: add POST /api/projects/:id/delete route`, which became `0e6d481` on main).

**Implications for Wednesday:**
- **`git pull` before anything else** on both the repo and the Peripheral Brain.
- Re-query D1 to see the current state of the `projects` table. The duplicate pairs may already be merged.
- If another session is still running, coordinate before touching `projects` data.

---

## One thing Nick asked for that did NOT land

On the dashboard resizable cards, Nick said "just make sure it looks right and performs as well." I verified visually via Playwright screenshots and dark-mode rendering, and I checked the resize interaction works and persists. **I did NOT benchmark first-paint latency or scroll FPS.** The bundle is +80KB gzipped which is measurable but the rendering itself uses CSS transforms so it should be fine. Wednesday session should check the Performance panel once if Nick reports any jank.

---

## Final checklist for the incoming session

Before you make any code changes:

- [ ] Read this file, read `SESSION-KICKOFF-nick-review-polish.md`, read `round8-AGGREGATED-FINDINGS.md`.
- [ ] Verify Cloudflare cap has reset (check dashboard or curl one API route).
- [ ] `git pull` both repos.
- [ ] `git log --oneline -10` and confirm `145ed8e` is HEAD on main.
- [ ] `npm run build` — should pass.
- [ ] `git push origin main` to ship R10.
- [ ] Deploy: `npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab`.
- [ ] Smoke test 2-3 URLs with curl.
- [ ] Run `npx playwright test tests/inspection.spec.ts --reporter=list` and verify ≥212 passed.
- [ ] Spot-check the 6 items under "R10 — things to verify on Wednesday after deploy".
- [ ] If all green, Nick gets to play with the new Grants inline editing and project status dropdown. Let him drive R11 priorities based on what he notices next.

Good luck. The design ethos is still "operational not editorial" and the bar is still "Nick should be able to use the Hub for 30 minutes without finding a bug interaction testing would have caught." We're closer than we were on 2026-04-12 but we're not there yet.
