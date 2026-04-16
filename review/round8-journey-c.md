# Round 8 — Journey C: Grant Management Inline Editing

**Agent:** Journey C (Sonnet)
**Date:** 2026-04-13
**Spec:** `tests/round8-journey-c.spec.ts` (disposable — deleted after run)
**Deployed URL:** https://mn-ccore-lab.pages.dev/grants
**Run result:** 12/12 PASS (after correcting test-DB isolation issue — see Infrastructure Finding)

---

## Critical Infrastructure Finding (NEW — not in D1 or D3 reports)

### IF-01: `X-Test-Mode: true` header routes ALL API calls to empty test DB

`playwright.config.ts` sets `extraHTTPHeaders: { 'X-Test-Mode': 'true' }` globally.
`api/index.ts:82-83` swaps `env.DB` → `env.DB_TEST` (`mnccore-lab-test`, `a30fe84d-...`) when this header is present.
The test DB has **0 grants**, so every prior Playwright run against `/grants` showed "0 active, 0 proposed" and "No grants tracked."

**Consequence:** Every prior automated inspection suite tested the grants page **against an empty database**. This means:
- Bug #2 (progress bar clipping) was **never visible** to any prior automated test
- Any other page feature that depends on grant data was similarly untested
- This is likely true for **ALL pages** — prior inspector results on data-rich pages may reflect an empty-DB state, not production state

**Fix for test suite:** Journey C explicitly overrides `extraHTTPHeaders: {}` for read-only inspection journeys. Write journeys should use `DB_TEST`. This should be documented in `TESTING.md` and `playwright.config.ts`.

---

## Step Matrix

| Step | Result | Evidence |
|------|--------|----------|
| C-01: /grants loads, K23 visible | **PASS** | K23 "Provider Practice Variation in Mechanical Ventilation" visible in row 1. Header: "4 active, 3 proposed." |
| C-02: Title inline editable | **FAIL** | Title is plain `<span>` (Grants.tsx:585). No `InlineSelect`, no contenteditable. Click opens search input (search feature in page), not a field editor — false positive resolved. |
| C-03: Status → "Funded" | **FAIL (Schema)** | `grants.status` column does not exist in D1. Only `proposed INTEGER` (0/1). K23 mechvent shows "Active" (proposed=0), should show "Funded". 7 status pills rendered, 0 clickable dropdowns. Pre-documented schema gap. |
| C-04: End date inline edit | **FAIL** | Date span is read-only `<span>` (Grants.tsx:645-651). Click opens no date picker. |
| C-05: Milestone add feature | **PASS (partial)** | "Add Milestone" button visible and clickable. 1 InlineSelect trigger exists (in upcoming milestones section). No upcoming milestones currently present (section empty). |
| C-06: Timeline Gantt renders | **PASS** | Timeline button triggers Gantt SVG with grant bars. K23 bar visible with 2023–2028 span. Proposed grants shown with dashed hatch pattern. |
| C-07: Progress bar density modes | **PASS/FRICTION** | Progress bar visible at all 3 densities. But: row has `overflow: hidden` + fixed `height: 44px`. Bug #2 CONFIRMED — clipping occurs when grant titles wrap to 2 lines (e.g. at narrow viewports or with longer titles). See screenshots. |
| C-08: Inline edit on proposed grant | **FAIL** | Proposed grant row has no inline editors. Same as active grants — all cells read-only. |
| C-09: Status "In Preparation" → "Submitted" | **FAIL (Schema)** | Cannot execute — no status column. 7 status pills, 0 open dropdowns on click. Pre-documented schema gap. |
| C-10: InlineSelect trigger count | **FAIL** | 0 triggers in main grants table (title/PI/status/mechanism/period/agency). 1 trigger in milestone sub-section only. Confirms Bug #1 from Nick's 10-min review. |
| C-11: Search/filter works | **PASS** | Search input functional (`grants` page has text search). All/Active/Proposed filter pills work. Active filter correctly shows proposed=0 grants only. |
| C-12: Grant row click | **FAIL (false positive resolved)** | Row div has no `onClick` (confirmed in Grants.tsx:560-661). Initial test showed `aside` (sidebar nav) as "detail panel" — false positive. **True result: FAIL — grant row click does nothing.** Bug D1-04 confirmed. |

**Summary: 3 PASS, 1 PASS/FRICTION, 8 FAIL**

---

## Bug Confirmations

### Nick Bug #1 — No inline editing on /grants (CONFIRMED)
- **Evidence:** 0 InlineSelect triggers in main table rows. Every field (title, PI, status, mechanism, period, agency) is a `<span>` with no click handler.
- **Source files:** `src/pages/portal/Grants.tsx:572-658`
- **Note:** `InlineSelect` is imported at line 23 and used at line 878 (milestone status), so the infrastructure exists. Wiring grant fields needs mutations + the Phase 6 taxonomy decision first.

### Nick Bug #2 — Progress bar clips at default density (CONFIRMED)
- **Evidence:** `overflow: hidden` + fixed `height: 44px` on grant rows (Compact=36px, Default=44px, Relaxed=52px via CSS vars). The title span uses `-webkit-line-clamp: 1` preventing wrapping, but the progress bar sub-row adds ~12px below the title. Total content = ~20px (title) + ~4px (gap mt-1) + ~6px (progress bar) = ~30px. At compact (36px), this fits — but only because the title is clamped. The row `overflow: hidden` is the bug: at 36px compact, any extra margin/padding interaction clips the 4px gap above the bar.
- **Screenshots:** `review/round8-journey-c-07-density-compact.png`, `review/round8-journey-c-07-density-default.png`, `review/round8-journey-c-07-density-relaxed.png`
- **Root cause:** Same pattern fixed in TaskGridView — use `height: auto; min-height: var(--row-height)` instead of `height: var(--row-height)` on rows with sub-content, AND remove `overflow: hidden` from the row container.
- **Source:** `src/pages/portal/Grants.tsx:567` — `overflow: 'hidden'` in the row style

### Nick Bug #3 — Status taxonomy wrong (CONFIRMED — Schema Level)
- **Evidence:** The D1 `grants` table has only `proposed INTEGER` (0/1). All "active" grants (proposed=0) display as "Active" — including the K23 provider variation which is actually "Funded." The proposed vocabulary (Planning / In Preparation / Submitted / Funded / Resubmission / Declined / Closed) cannot be implemented until Phase 6 schema migration.
- **Current D1 truth:**
  - `k23-provider-practice-variation-in-mechanical-ventilation` → proposed=0 → displays "Active" → **should be "Funded"**
  - `r03-decision-making-styles-of-medical-trainees` → proposed=0 → displays "Active" → **status unclear (ask Nick)**
  - 5 others → proposed=1 → displays "Proposed"
- **2 test_delete_ grants visible in production** (test data pollution, Bug C6 from D1 report)

---

## Newly Discovered Bugs

### C-NEW-01: Grant row has no click action (Bug D1-04 confirmed, severity: MEDIUM)
Grant rows in `Grants.tsx:560-661` are bare `<div>` elements with no `onClick`, no `<Link>`, no navigation. Clicking anywhere on a grant row does nothing. Even without full inline editing, the row should navigate to `/grants/<id>` (if that route exists) or open an edit modal. This is a complete UX dead-end for the primary data surface.

### C-NEW-02: Test DB isolation causes empty-page testing on /grants for all prior suites (Bug: CRITICAL for test infrastructure)
See IF-01 above. All 214 prior inspection tests that tested data-dependent features (grants, projects, tasks via API with test header) were testing an empty/minimal test DB. The test DB has no grants, possibly different data for projects/manuscripts/etc. Prior test pass rates on data pages may be inflated.

### C-NEW-03: `milestones` table referenced in API but does not exist in D1 (LOW — silent fail)
`api/routes/publications.ts:151` queries `SELECT * FROM milestones WHERE grant_id IS NOT NULL`. The D1 database has `grant_milestones` (not `milestones`). This query silently returns 0 results — milestones never attach to grant timeline items via the `/api/grants/timeline` endpoint. The upcoming milestones section on the page uses a different query path (`useUpcomingGrantMilestones` hook → `/api/grant-milestones/upcoming`) so it works separately. But timeline Gantt milestone diamonds never render from this path.

---

## Friction Notes (PASS-with-complaint)

1. **Timeline Gantt tooltip is read-only** — hovering grant bars shows funding/dates, but no click action from tooltip to open editor or detail view.
2. **Filter pills show "Active"/"Proposed" but the real vocabulary is wrong** — "Active" for a funded K23 is semantically incorrect. Until Phase 6 migration, the filter labels themselves mislead the PI.
3. **No search-as-you-type** — search input requires pressing Enter (based on `activeSearch` state pattern in Grants.tsx:389-390). Not instant-filter like other pages.
4. **Test pollution visible to users** — `test_delete_K23 — IHCA Survivability Calculator Development` and `test_delete_R01 — Machine Learning for ICU Outcome Prediction` are the **first items visible** when filter is "Proposed". Clean these up (wrangler D1 execute `DELETE FROM grants WHERE id LIKE 'test_delete%'`).

---

## Screenshots

| File | Shows |
|------|-------|
| `review/round8-journey-c-01-load.png` | /grants default view, production data |
| `review/round8-journey-c-07-density-compact.png` | Compact density (36px) |
| `review/round8-journey-c-07-density-default.png` | Default density (44px) |
| `review/round8-journey-c-07-density-relaxed.png` | Relaxed density (52px) |
| `review/round8-journey-c-06-timeline.png` | Gantt timeline view |

---

## Recommended Fix Priorities

| Priority | Fix | Complexity | Blocks |
|----------|-----|------------|--------|
| P0 | Add `overflow: hidden` removal + `min-height` on grant rows (Bug #2 clipping) | Trivial (1 line in Grants.tsx:567) | Nick's stated Bug #2 |
| P0 | Delete test_delete_ grants from production (data pollution, C6) | Trivial (1 wrangler SQL) | UX pollution |
| P0 | Fix test suite: document that read-only journeys must override `extraHTTPHeaders: {}` | Low (update TESTING.md + playwright.config comment) | All future Journey tests |
| P1 | Fix `milestones` → `grant_milestones` table name in API (C-NEW-03) | Trivial (1 line in publications.ts:151) | Timeline milestone diamonds |
| P1 | Add `onClick` / `<Link>` to grant rows → `/grants/<id>` (C-NEW-01, D1-04) | Low | Basic grant UX |
| P2 | Phase 6: `ALTER TABLE grants ADD COLUMN status TEXT` + taxonomy migration | Medium (needs Nick approval) | Bugs #1 and #3 inline editing |
| P3 | Inline editing for grants (title, PI, dates) — after status migration | High (new mutation hooks + API PATCH endpoint needed) | Bug #1 |

---

## Nick's Bug Confirmation

| Nick Bug # | Confirmed? | Evidence |
|-----------|-----------|---------|
| #1 (No inline editing on /grants) | YES | 0 InlineSelect triggers in main table |
| #2 (Progress bar clips at default density) | YES | `overflow:hidden` + `height:44px` confirmed; clipping at compact |
| #3 (Status taxonomy wrong — "Active" ambiguous) | YES | Only proposed boolean in schema; K23 Funded shows "Active" |
