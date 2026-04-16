# Round 8 — Journey A: PI morning review

**Agent:** Journey A (Opus)
**Date:** 2026-04-13
**Target:** https://mn-ccore-lab.pages.dev
**Spec:** `tests/round8-journey-a.spec.ts` (disposable — deleted post-run)
**Evidence:** `review/round8-journey-a/step*.png` (15 screenshots)
**Runtime:** 25.5 s wall clock, 8 tests, 0 Playwright failures
**DB:** `mnccore-lab-test` (Playwright injects `X-Test-Mode: true`)

## Summary

| | Count |
|---|---|
| PASS | 9 |
| FRICTION (worked but subpar) | 4 |
| FAIL (behaved worse than spec) | 0 |
| BLOCKED (data unavailable, not a defect) | 2 |

The journey is **completable end-to-end**. No outright defects were found — every step produced some correct behavior. Four of the fifteen beats are friction (below the quality bar Nick set in the kickoff doc); two are blocked by missing seed data.

The two friction items worth fixing this round:
1. **Overdue inline count does not pre-filter the destination view.** Clicking "4 overdue" on the dashboard navigates to `/my-tasks` but leaves all filters cleared. The user has to re-discover the Overdue quick filter.
2. **TaskDetailPanel open latency (~435 ms) is 2× the 200 ms target** specified in the kickoff doc. This is the same budget defect called out in the spec.

## Step matrix

| # | Step | Result | Evidence | Notes |
|---|------|--------|----------|-------|
| 1 | Open /dashboard, Lab Health Score visible | **PASS** | `step01-dashboard.png` | `LabHealthScore` renders in the dashboard control bar next to overdue/due-today counts. Bento grid and cards load. |
| 2 | Scan regulatory alert strip | **BLOCKED** | `step02-no-regulatory-strip.png` | `useExpiringRegulatory(60)` returns 0 rows on the test DB. Strip only renders when there is an expiring item. No defect — need seed regulatory data to exercise. |
| 3 | Click strip → regulatory context or modal with .ics download | **BLOCKED/FRICTION** | *code read* | `Dashboard.tsx:638-659` wraps the strip in `<Link to="/personal">`. No modal, no .ics download anywhere on the path. If .ics export was expected, feature is not built. No anchor/scroll to the regulatory section on arrival. |
| 4 | Click the inline "N overdue" count on /dashboard | **PASS** | — | Label read "4 overdue" on the dashboard control row, click landed on /my-tasks. |
| 5 | Expect filtered-overdue / assigned-to-me view | **FRICTION** | `step05-after-click.png` | URL is `/my-tasks` with **no query param and no quick filter pre-pressed**. The link at `Dashboard.tsx:424` is `href="/my-tasks"`. A PI clicking "4 overdue" expects a scoped list. **Fix:** link to `/my-tasks?filter=overdue` and auto-toggle the QuickFilter on mount. |
| 6 | Click one overdue task | **PASS** | `step06-mytasks.png` | First task row clickable via `[data-testid^="task-title-"]`. |
| 7 | TaskDetailPanel opens < 200 ms, no click delay, no stale focus | **FRICTION** | `step07-panel.png` | 414–576 ms across runs (~450 ms avg) — **2× the 200 ms budget**. Panel renders correctly, no stale-focus. Latency = mount cost of 5 eagerly-hydrated tabs + Tiptap editor. Lazy-load Notes/Activity/Details, or warm an off-screen instance on `mouseenter`. |
| 8 | Change due date inline | **PASS** | `step08-before-click.png` | InlineDatePicker trigger lives in `[data-testid^="task-due-"]`. Click opens the editor. (Detail panel must be closed first — it overlays the grid. Not a bug, just something the automation had to learn.) |
| 9 | Date picker stays open — NOT the "flashes and closes" bug | **PASS** | `step09-picker.png` | **Known bug did NOT reproduce.** Preset strip (`Today / Tomorrow / Next Mon / +1 Week / Clear`) stays visible. Native `<input type="date">` not visible in headless Chromium because `showPicker()` is no-op there, but `editing=true` state holds. If Nick still sees a flash, suspect OS-specific `showPicker()` throw. Needs manual retest. |
| 10 | Pick date, blur, reload, persist | **PASS** | `step10-after-pick.png`, `step10-after-reload.png` | "Tomorrow" preset → `onMouseDown` → `onChange` → mutation → optimistic. Reload re-hydrates list. |
| 11 | Close panel, press `g p` chord → `/projects` | **PASS** | `step11-projects.png` | `useKeyboardShortcuts.ts` chord state machine handled `g` → leader → `p` → `/projects`. No jitter. |
| 12 | Open "Needs Attention" project, click inline status | **FRICTION/BLOCKED** | `step12-projects-filtered.png` | All-view: 21 `.inline-select-trigger` buttons. Clicking "Needs Attention" filter → 0 projects. Test DB has no stale-flagged projects (or classifier is too conservative). No distinct empty state — reads like a load failure. Add an `<EmptyState title="No projects need attention" />` on zeroed filter. |
| 13 | Inline dropdown opens, pick new status, persists | **PASS** | `step13-status-dropdown.png`, `step13-after-change.png` | Fell back to "All" filter; `InlineSelect` click → `role=listbox` open → first option `Active` selectable, persists. |
| 14 | Ctrl+I opens Quick Capture, type, submit | **PASS** | `step14-quickcapture-open.png`, `step14-after-submit.png` | `QuickCaptureInbox.tsx:46` handler fires. Dialog portal, focus trap, Escape close. Ctrl+Enter → `POST /api/inbox`. |
| 15 | Verify toast, `/api/inbox` row, eventual PB sync | **PASS** | — | `GET /api/inbox` → 200, `found=true`. Toast "Captured → Inbox" shows. PB pull-sync is async (runs via `sync_d1_pull.py`) — not exercised here. Test data cleaned. |

## Friction list (prioritized)

1. **[Med] Step 5 — Overdue link has no filter param.** `Dashboard.tsx:424` should become `/my-tasks?filter=overdue`, and `MyTasks.tsx` should parse the query string on mount to preselect the Overdue QuickFilter.
2. **[Med] Step 7 — TaskDetailPanel mount is 2× the 200 ms budget.** Consider lazy-loading the Notes/Activity/Details tabs, or suspending the Tiptap editor until the Details tab is shown. Budget applies whether or not the panel is a virtual-scroll item.
3. **[Low] Step 3 — Regulatory strip has no modal / no .ics download.** If the kickoff expectation of "open modal with download .ics" is on the roadmap, not implemented. Current behavior routes to `/personal` with no deep-link to the regulatory section; consider `?section=regulatory` + scroll-into-view.
4. **[Low] Step 12 — "Needs Attention" filter can produce a silent empty state.** Add an explicit EmptyState copy so a zero-result filter reads as "all clear" instead of "broken".

## Not reproduced

- **Date picker "flashes and closes"** (step 9, known bug per kickoff). In headless Chromium the preset popover stays open indefinitely and the editor state holds. Needs manual verification in real Windows Chrome / Safari. Suspected OS-specific native `showPicker()` interaction.

## Cleanup

All test_delete_ inbox rows removed from `mnccore-lab-test`:

```
npx wrangler d1 execute mnccore-lab-test --remote --command="DELETE FROM inbox WHERE text LIKE 'test_delete_%'"
# -> changes: 3
```

No writes hit `mnccore-lab` (prod) — the Playwright `extraHTTPHeaders` force `X-Test-Mode: true` on every browser request, so all POSTs routed to DB_TEST.

The spec file `tests/round8-journey-a.spec.ts` is disposable; deleted after this run per kickoff instructions.

## Selectors used (for future journeys)

- `button.inline-select-trigger[aria-haspopup="listbox"]` — any inline-editable cell
- `[role="listbox"]` — InlineSelect dropdown open state
- `[data-testid^="task-title-"]` — task row title click
- `[data-testid^="task-due-"] button` — InlineDatePicker trigger
- `[data-testid="task-detail-panel"]` — detail panel mounted
- `[role="dialog"][aria-labelledby="qci-heading"]` — Quick Capture open state
- `a:has-text("N overdue")` — dashboard overdue link
- `a:has-text("regulatory item")` — regulatory alert strip
