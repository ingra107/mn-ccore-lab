# Round 8 — Aggregated Findings (Nick-Review Polish)

**Date:** 2026-04-13
**Sources:** 9 agent reports (3 discovery + 6 journeys)
**Status:** Discovery complete, awaiting Nick approval before fix rounds

---

## Top-of-mind for Nick

1. **Grants has no `status` column at all in D1** — only a `proposed` boolean. Nick's whole status-taxonomy issue isn't a UI bug; it's a schema gap. Phase 6 migration is load-bearing.
2. **One bad line of CSS explains 51 FAB collisions.** `PortalLayout.tsx:258` uses `max(24px, 72px)` → always `72px`. Quick Add pins to same pixel as ScrollToTop on every route at every viewport. One-line fix.
3. **Playwright test infra has been testing the wrong database.** `X-Test-Mode: true` header routes to an empty `mnccore-lab-test` DB. Prior inspection pass counts on data-rich pages (grants, tasks, projects) are likely inflated. Need to audit what was actually tested.
4. **Mobile PI cannot create tasks.** Quick-add FAB at 375px tap surfaces no focusable input. Everything else on mobile is secondary friction; this one blocks core workflow.

---

## Data Integrity (from Agent D1)

| # | Severity | Finding | Fix |
|---|---|---|---|
| DI-1 | P0 | `grants` has no `status` column; only `proposed` boolean | Schema migration (Phase 6) |
| DI-2 | P0 | K23 provider variation marked "Active" — should be "Funded" | Data migration after DI-1 |
| DI-3 | P0 | 2 `test_delete_` grants in production | SQL DELETE |
| DI-4 | P0 | 10 duplicate project pairs (hex id + slug id); tasks/health splitting silently | Merge SQL + sync script fix upstream |
| DI-5 | P1 | All 64 projects are `status='Active'` — no differentiation | Nick taxonomy decision first, then bulk update |
| DI-6 | P1 | 330 active tasks have dangling `project_id` (303 → virtual buckets `admin-tasks`, `peripheral-brain-system`) | Align brain.db project slugs with D1, or create virtual project rows |
| DI-7 | P1 | Duplicate meeting on 2026-04-07 (dedup missed case/format variant) | Merge + add normalization to dedup |
| DI-8 | P1 | 20 active tasks have `status = NULL` despite API guard | Sync-bulk path bypasses the guard — patch |
| DI-9 | P2 | 3 dead project columns (`pi_context`, `stage_notes`, `strategic_context`) | Drop columns or start populating |
| DI-10 | P2 | `short_name` editable only on ProjectDetail | Add inline editor on Projects list |
| DI-11 | P2 | `test_delete_` prefix missing from CLAUDE.md cleanup snippet | Update docs |

Full SQL in `round8-d1-data-integrity.md`.

---

## FAB / Overlay Collisions (from Agent D2)

**Root cause, one line:** `src/components/PortalLayout.tsx:258` — `bottom: 'max(24px, calc(72px + env(safe-area-inset-bottom, 0px)))'`. Author wanted "24px on desktop, 72px on mobile" but `max()` always picks the larger, so Quick Add is at `72px` on every viewport — identical to ScrollToTop's hardcoded `bottom: 72` in `ScrollToTop.tsx:21`. With ScrollToTop z-index 50 > Quick Add 40, Quick Add is invisible and unclickable as soon as the user scrolls 400px+.

**Count:** 51 pairwise collision instances across 17 routes × 3 viewports. All from the same source.

**Secondary issues** (not in collision count):
- UndoToast lower half sits behind MobileTabBar on mobile
- BulkActionToolbar rightmost buttons sit under FAB column on narrow screens
- Two ScrollToTop components exist (`ScrollToTop.tsx` portal vs `Layout.tsx:744` public) — consolidate
- ScrollToTop dark-mode visibility weak
- BulkActionToolbar z-index too low vs toasts

**Fix:** Replace the `max()` with a media-query-driven CSS variable. One edit, regression test at 375/768/1440. Full inventory in `round8-fab-collision.md`.

---

## Interactive Surface Scan (from Agent D3)

**Matrix:** 22 rows → 12 PASS / 1 FRICTION / 8 FAIL / 1 N/A.

**Nick's 11 bugs confirmed (5 of 11, with file:line fixes):**

| Nick # | File:line | Root cause |
|---|---|---|
| 1 | `Grants.tsx:572-658` | 0 InlineSelect triggers in main table |
| 8 | `MyTasks.tsx:16` | Tiptap lazy load → 400ms first panel open. Preload on row hover or preload TaskDetailPanel module |
| 9 | `TaskGridView.tsx:845-848` + `MyTasks.tsx:754` | Row onClick fires `onSelect`, which MyTasks doesn't pass |
| 10 | `InlineDatePicker.tsx:33` → `:97` | `showPicker()` triggers blur → `setTimeout(commitAndClose, 200)` → unmount. Remove `showPicker()`. Note: Journey A could not reproduce in headless — worth a manual retest, but the root cause analysis holds |
| 12 | `FieldControls.tsx:381` | `ProjectSelect` uses `position: absolute` instead of `createPortal` like `InlineSelect.tsx:123`. Copy the pattern |

**Not reproduced:** #6 stale focus (clean on all three probes), #7 blue neon ring (manual needed).

**Newly discovered gaps:**
- Deadlines due-date read-only
- Grants row has no click-to-detail (even empty areas)
- Manuscripts PI/Category not inline
- Ideas/Decisions titles not clickable

**Top fix priorities:** (P0) date picker `showPicker()` removal, (P0) TaskGridView row fall-through to `onOpenDetail`, (P0) `createPortal` on ProjectSelect, (P1) Tiptap preload, (P1) Grants inline (recommend deferring to Phase 6 after status column lands).

Full matrix in `round8-interactive-surface.md`.

---

## Journey A — PI morning (Opus)

9 PASS / 4 FRICTION / 0 FAIL / 2 BLOCKED (missing seed data).

- **Step 5 friction:** "N overdue" dashboard link is `/my-tasks` with no `?filter=overdue` or auto-toggle. PI lands on unfiltered board.
- **Step 7 friction:** TaskDetailPanel mount measured **~435ms** — 2× the 200ms budget. Cause: eager hydration of all 5 tabs + Tiptap.
- **Step 9:** Date-picker flash did NOT reproduce in headless Chromium (preset strip stayed visible). Worth a manual retest — root cause in D3 still holds at the code level.
- **Step 3:** Regulatory strip routes to `/personal` with no modal and no `.ics` download. Kickoff expected one.
- **Step 12:** Projects "Needs Attention" filter returns 0 rows on test DB with no distinct empty state (reads like a load failure).

Full report: `round8-journey-a.md`.

---

## Journey B — Coordinator (Opus)

5 PASS / 2 FAIL / 11 FRICTION. Three new high-severity findings not in Nick's original list:

- **B-H1:** Meeting action items have NO inline completion control. Coordinator must leave the meeting view to close the loop. Violates Pattern 4.
- **B-H2:** N-key create does NOT fire on `/decisions` (despite CLAUDE.md claim that it's verified). Zero rows written during test confirms.
- **B-H3:** `/publications` Copy bibliography button is **missing** despite Phase 26aq changelog + Component Coverage table both claiming it exists.

**Medium findings:** no carry-forward affordance on meetings, `/deadlines` rows unaddressable (broken click or card-only), deadline status picker non-responsive (same family as #10 date picker), no agenda/prep CTA from `/meetings` list, `/personal` regulatory strip absent, `/calendar` slow/blank.

**Pattern:** the Component Coverage table in CLAUDE.md is stale — features listed as "covered" aren't actually wired. Independent verification needed across the full matrix.

Full report: `round8-journey-b.md`.

---

## Journey C — Grant management (Sonnet)

12/12 tests executed. 3 PASS, 1 PASS/FRICTION, 8 FAIL. Confirms all three Nick grants bugs and surfaces a test-infra problem that affects prior results.

- **Bug #1:** 0 InlineSelect triggers in main grants table. Every cell is a plain `<span>`. Infrastructure exists (used in milestone sub-section) but nothing wired.
- **Bug #2:** Progress bar clipping. `Grants.tsx:567` row has `overflow: hidden` + fixed `height: var(--row-height)`. At compact (36px), title + 4px gap + 6px bar = ~46px in 36px container. **One-line fix:** change `height` to `minHeight` + remove `overflow: hidden`.
- **Bug #3:** `grants.status` column doesn't exist in D1 — only `proposed` boolean. K23 shows "Active" because there's no "Funded". Phase 6 migration is non-optional.

**Critical new finding (C-H1):** `playwright.config.ts` injects `X-Test-Mode: true`, which routes all API calls to `mnccore-lab-test` (empty DB). Every prior Playwright test that hit `/grants` (or any data-rich page) was testing against an empty page. **Prior inspection pass counts on data-dependent surfaces are suspect.** Needs audit.

Full report: `round8-journey-c.md`.

---

## Journey D — Data entry (Sonnet)

8/8 PASS, 4 friction, 3 bugs.

- **D-BUG1 (medium):** CreateTaskModal assignee `<select>` is empty in test mode because `DB_TEST` has no `team_members` rows. Seed fix.
- **D-BUG2 (medium, test infra):** Inline status/priority cells in TaskGridView lack `data-field` attributes. Row-scoped locators can't find them. Add attributes so tests can target them.
- **D-BUG3 (real, low-medium):** Inline grid edits (status/priority) log to `activity_log` but NOT to `task_updates`. TaskDetailPanel Activity tab therefore shows no system events for grid-level changes — **audit trail gap**.

All functional paths (create → list → dashboard → activity → edit → soft delete) PASS via API.

Full report: `round8-journey-d.md`.

---

## Journey E — Research Digest Model B gap analysis (Sonnet)

**NIH Reporter "broken" was a location/query bug, not integration failure:**
- Reporter search lives on `/grants`, not `/research-digest`. Nick was likely on Digest, which only does client-side filtering of the day's already-fetched papers.
- ARDS search on `/api/grants/similar` actually returns 739 results.
- "ingraham" returns zero because the API only searches `terms` (abstract/title). PI name search needs a separate `pi_names` criteria — not implemented.

**Current Digest state:** 375 papers in D1 (April 2–13), save/dismiss/link-to-project buttons already wired. Not as empty as assumed.

**Model B gaps:**
| Gap | Layer | Effort |
|---|---|---|
| Comment system per paper | schema + API + UI | 2.0h |
| Cross-date saved library view | UI | 1.5h |
| Persistent "linked to project" badge | UI | 1.0h |
| Multi-user save state (join table) | schema + API | 1.0h |
| Private notes per paper | schema + UI | 1.0h |
| NIH Reporter PI search | API | 0.5h |
| Tests | test | 0.5h |
| Backend foundation | API | 0.5h |
| **Total** | | **~8h** |

Kickoff estimate was 4–6h. Comments + cross-date library add the extra 2h.

Full report: `round8-journey-e.md`.

---

## Journey F — Mobile PI (Opus)

14 PASS / 11 FRICTION / 4 FAIL at 375×812 iPhone 13 with touch.

**Top finding — blocks core workflow:**
- **F-H1:** Quick-add FAB (`aria-label="Quick add task (Ctrl+N)"`) at (311, 632) on `/my-tasks` — tap surfaces no focusable title input. **Mobile PIs cannot create tasks.** Blocks steps 4 and 5 of Journey D equivalent.

**Systemic:**
- **F-H2:** 18 sub-44px touch targets on `/dashboard`, 30 on `/my-tasks` (many icon-only 28×44 hover actions).
- **F-H3:** Typography drops to 10px in 20+ spots per page against an 11px mobile floor.
- **F-H4:** Calendar lacks visible prev/next on touch — keyboard-only per CLAUDE.md, unusable on phone.
- **F-H5:** MobileTabBar only exposes 4 of 18 portal routes. No "More" overflow.

**FAB stack at iPhone 13:** Quick-add y=632, inbox y=696, tab bar y=755. 20px gap — no overlap today but **touch-slop risk**. Will intersect with D2 fix.

**Good:** no horizontal overflow anywhere (responsive grid holds); MobileTabBar and Quick Capture sheet both work when reached.

Full report: `round8-journey-f.md`.

---

## Prioritized fix plan (for Nick's approval)

### Round 9 — blockers and one-liners (aim: single deploy)

| # | Fix | Source | Effort |
|---|---|---|---|
| R9-1 | `PortalLayout.tsx:258` FAB collision — rewrite `max()` as media-query CSS var | D2 | 20min |
| R9-2 | `InlineDatePicker.tsx:33` — remove `showPicker()` | D3 / Nick #10 | 15min |
| R9-3 | `MyTasks.tsx:754` — pass `onSelect={openDetail}` (or refactor TaskGridView row onClick to prefer `onOpenDetail`) | D3 / Nick #9 | 30min |
| R9-4 | `FieldControls.tsx:381` — port `createPortal` pattern from `InlineSelect.tsx:123` | D3 / Nick #12 | 45min |
| R9-5 | `Grants.tsx:567` — `height` → `minHeight`, remove `overflow: hidden` (progress bar clipping) | C / Nick #2 | 15min |
| R9-6 | `MyTasks.tsx` — preload TaskDetailPanel on hover (`onMouseEnter={() => import(...)}`) | A / D3 / Nick #8 | 30min |
| R9-7 | Mobile Quick-add FAB on `/my-tasks` — fix tap-to-focus (likely modal state, pointer-events, or missing input focus) | F | 1h |
| R9-8 | Delete 2 `test_delete_` grants + 20 null-status tasks (SQL) | D1 | 10min |
| R9-9 | Merge 10 duplicate project pairs + fix 2 typo slugs — MANUAL, needs Nick sign-off per project | D1 | 1h |

Total: ~4h code + 1h data + 1h QA = **~6 hours to land R9**.

### Round 10 — semantic corrections

| # | Fix | Source | Effort |
|---|---|---|---|
| R10-1 | Schema v39 migration: `ALTER TABLE grants ADD COLUMN status TEXT DEFAULT 'planning'` + enum | DI-1, C | 30min |
| R10-2 | Nick approves grant status taxonomy vocabulary | kickoff | 10min (decision) |
| R10-3 | Bulk update grants: K23 provider-var mechvent → "funded", all others → "planning" or "in_preparation" | DI-2 | 20min |
| R10-4 | Frontend Grants inline editing: wire InlineSelect on title/status/end_date/PI | Nick #1 | 2h |
| R10-5 | Projects status taxonomy refresh (all 64 off "Active") | DI-5 | Nick decision + 1h update |
| R10-6 | Dangling task `project_id` cleanup — align brain.db ↔ D1 slug generation | DI-6 | 2h |
| R10-7 | Sync-bulk path: enforce status-NOT-NULL guard that API already enforces | DI-8 | 30min |
| R10-8 | Meeting dedup normalizer | DI-7 | 30min |

**~8 hours for R10.**

### Round 11 — interaction completeness

- MeetingDetail inline completion on action items (B-H1)
- N-key on /decisions (B-H2) — verify CLAUDE.md claim, fix or delete
- /publications Copy bibliography (B-H3) — verify, fix or delete from CLAUDE.md coverage table
- Deadlines due-date inline (D3)
- Manuscripts PI/Category inline (D3)
- Ideas/Decisions title click-to-detail (D3)
- Grants row click-to-detail (D3)
- CLAUDE.md Component Coverage table: independent verification of every claimed feature (B pattern — table is stale)

**~4 hours for R11.**

### Round 12 — mobile pass

- Touch-target sweep on /dashboard (18) and /my-tasks (30) — 44px minimum (F-H2)
- 10px → 11px minimum font floor on mobile (F-H3)
- Calendar touch nav (F-H4)
- MobileTabBar overflow/More button (F-H5)
- Research Digest search clarity: move NIH Reporter to a visible place OR add `pi_names` field to the existing grants search (E)

**~3 hours for R12.**

### Round 13 — new feature: Research Digest Model B

Full 8-hour build from Journey E gap analysis.

### Test infra cleanup (can run parallel)

- Audit which Round 0–7 tests were run under `X-Test-Mode: true` and may have been testing an empty DB (C-H1). This is load-bearing for the 9.44/10 score.
- Seed team_members in DB_TEST (D-BUG1)
- Add `data-field` attributes to inline cells (D-BUG2)
- Wire `task_updates` log from inline grid edits (D-BUG3)

---

## What's NOT recommended

- Re-running the 10-consultant visual audit. Done 6 times, diminishing returns. The next audit loop should be journey-based like Round 8.
- Tackling CLS residuals on /meetings (0.154) or /dashboard (0.126). Not launch-blocking.
- Reverting the dashboard RGL swap (feat/dashboard-resizable-cards, commit `d10d4b4`) to simplify — the resizable dashboard already works, ships in this round.

---

## Report inventory

- `round8-d1-data-integrity.md` (+ raw SQL queries)
- `round8-fab-collision.md` (+ 51 screenshots + `collisions.json`)
- `round8-interactive-surface.md` (+ matrix.json + screenshots)
- `round8-journey-a.md` (+ 15 step screenshots)
- `round8-journey-b.md` (+ results.json + screenshots)
- `round8-journey-c.md` (+ density screenshots)
- `round8-journey-d.md`
- `round8-journey-e.md`
- `round8-journey-f.md`
- `round8-dashboard-grid/` — RGL swap verification screenshots (desktop, tablet, mobile, dark, hover-with-handles)

---

## In-progress and shipped during this session

- ✅ **Dashboard resizable+draggable cards** (feat/dashboard-resizable-cards, d10d4b4) — react-grid-layout swap, layout persistence per user+section, theme-matched CSS overrides. Build clean, Playwright verified (resize 245→537 px persists across reload).
- ✅ Branch: `feat/dashboard-resizable-cards` is clean and ready to merge once Nick approves.

---

## Ask Nick

1. **Approve R9 as the next commit batch** (6h, one-liners + blockers, single deploy). These have zero semantic risk and land Nick's own 11 bugs.
2. **Approve grant status taxonomy vocabulary** — planning/in_preparation/submitted/funded/resubmission/declined/closed (kickoff proposal). Unblocks R10.
3. **Decide on project status taxonomy** — all 64 being "Active" is meaningless. Options: keep simple 3-state (active/paused/complete), adopt lifecycle (concept/active/writing/submitted/published), or per-project case-by-case.
4. **Decide on the duplicate project merges** (10 pairs) — need source-of-truth designation per pair before SQL merge. R9-9 is blocked without this.
5. **Sign off on merging `feat/dashboard-resizable-cards` into main** in the next deploy window, or hold it for R9.
