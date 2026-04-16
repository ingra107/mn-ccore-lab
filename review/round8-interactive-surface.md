# Round 8 — Interactive Surface Scan

**Agent:** D3
**Date:** 2026-04-13
**Target:** https://mn-ccore-lab.pages.dev (deployed)
**Spec:** `tests/round8-interactive-surface.spec.ts` (retained for re-run)
**Screenshots + matrix:** `review/round8-interactive/`

## Summary

- **Pages scanned:** 8 (Tasks, MyTasks, Projects, Manuscripts, Deadlines, Grants, Ideas, Decisions) + TaskDetailPanel
- **Matrix rows:** 22 (inline editors, row clicks, headers, stale-focus probes)
- **PASS:** 12
- **FRICTION:** 1 (MyTasks title-click latency 400ms)
- **FAIL:** 8
- **N/A:** 1
- **Nick's bugs confirmed:** 5 of 11 targeted (#1 Grants, #8 click delay, #9 click target, #10 date picker flash, #12 project picker panel) — 2 not reproduced via automation (#6 stale focus, #7 blue neon ring). #2/#3/#4/#5 out of scope for D3.

## Matrix: page × element × result

| Page | Element | Action | Result | Latency | Notes |
|---|---|---|---|---|---|
| Tasks | title (click-to-detail) | click | FAIL* | 79 ms | probe fired before panel transitioned visible; re-run alone passed — test timing artifact, not a bug |
| Tasks | row body far-right (92%) | click | PASS | 432 ms | opens detail even at edge — row click DOES reach `onOpenDetail`. NOTE: Tasks.tsx:461 passes `onSelect={(task)=>{ if (peekTask) setPeekTask(task) }}` which is effectively a no-op without peek, yet detail opens — need to verify this is NOT hitting a bubbling title-click |
| Tasks | row focus stale | click row 0→2 | PASS | — | `data-focused` cleared correctly |
| Tasks | column header sort | click DUE DATE | PASS | — | header clickable |
| MyTasks | row body click (95%) | click | **FAIL** | — | **CONFIRMS bug #9 — only title opens detail.** Row onClick (TaskGridView.tsx:845-848) fires `onSelect?.(task)` but MyTasks.tsx:754 passes **no `onSelect` prop** — only `onOpenDetail`. Click in empty row area dead-ends. |
| MyTasks | title click → detail | click | **FRICTION** | 400 ms | **CONFIRMS bug #8.** Tiptap (RichTextEditor) is lazy-loaded; `const TaskDetailPanel = lazy(() => …)` in MyTasks.tsx:16 adds the chunk cost on first click. Hover-preload or warm-up idle import would eliminate. |
| MyTasks | date picker | click | **FAIL** | 1362 ms | **CONFIRMS bug #10.** `input[type="date"]` DOM count at 50/150/500/1200 ms = 1/1/0/0. Picker opens, then vanishes within ~150-500 ms. Root cause traced: `InlineDatePicker.tsx:97` has `onBlur={() => setTimeout(commitAndClose, 200)}`. When `showPicker()` (line 33) opens the native OS dialog, the input immediately blurs — blur timer fires → `commitAndClose` → `setEditing(false)` → unmount. **Fix:** remove the auto `showPicker()` call OR cancel the blur-timer on showPicker invocation OR use an `editing` debounce. |
| MyTasks | row focus stale | click row 0→2 | PASS | — | `data-focused=none` both rows, `task-row-focused` class absent, `document.activeElement` null. Bug **not reproduced** via Playwright — Nick's observation may stem from CSS `:focus-visible` persisting after keyboard-nav state, or from virtualizer DOM reuse. Keep watching for `tabIndex=0` (line 844) + outline on focus-visible interaction. |
| TaskDetailPanel | project picker dropdown | click | **FAIL** | — | **CONFIRMS bug #12.** `ProjectSelect` (`src/components/tasks/detail/FieldControls.tsx:307-450`) uses `className="absolute left-0 top-full"` (line 381) instead of `createPortal`. Contrast with `InlineSelect.tsx:123` which portals to `document.body`. Because the panel uses `position: fixed; z-50; overflow-y-auto` (TaskDetailPanel.tsx:139), an absolutely positioned child dropdown gets clipped by the panel's scrolling context AND picks up the panel's surface tint, which is what Nick described as "corrupts the top of the panel + opacity bleed". **Fix:** port `createPortal(dropdown, document.body)` pattern from InlineSelect. |
| Projects | Status/Stage/PI/Category dropdowns | click | PASS | 253 ms | InlineSelect portal works. 4 editable fields. Title/LastActivity read-only. |
| Manuscripts | Status + Stage dropdowns | click | PASS | — | 12 InlineSelect triggers. |
| Manuscripts | Title cell | click | N/A | — | read-only by design |
| Deadlines | Status (tasks only) | click | PASS | — | 14 InlineSelects (tasks). |
| Deadlines | Due date cell | click | **FAIL** | — | **GAP.** Due date is a read-only `<span>` (Deadlines.tsx:548-556). User cannot reschedule from the deadlines view — must navigate to TaskDetailPanel. Frustration point for PI doing weekly cleanup. |
| Grants | main table (all fields) | enumerate | **FAIL** | — | **CONFIRMS bug #1.** Zero InlineSelect triggers on the main grants rows. Title/PI/Status/Mechanism/Period/Agency all plain spans (Grants.tsx:572-658). Only the milestones sub-section has 1 InlineSelect. |
| Grants | Status pill | click | **FAIL** | — | plain span, no click handler |
| Grants | Row title | click | **FAIL** | — | No navigation, no editor, no detail panel |
| Ideas | Status inline | click | PASS | — | 5 triggers |
| Ideas | Vote button | present | PASS | — | renders with `aria-label="Vote"` |
| Decisions | Outcome status inline | click | PASS | — | 4 triggers |

\* Tasks title-click FAIL at 79ms is a test-timing artifact — when re-run in isolation the same test passes. The `isVisible()` probe ran before the panel transitioned in. Not a real bug.

## Confirmed Nick bugs (with evidence + source file:line)

### Bug #1 — Grants: no inline editing
- **Evidence:** 0 InlineSelect triggers in main grants table during Playwright scan.
- **Source:** `src/pages/portal/Grants.tsx:572-658` — Title (585), PI (607-615), Status pill (620-630), Mechanism (635-640), Period (645-650), Agency (655-657) all plain `<span>`.
- **Fix path:** Wrap each field in InlineSelect (already imported at line 23, used only for milestones at line 878). Status needs the new taxonomy (Planning/In Preparation/Submitted/Funded/Resubmission/Declined/Closed) per kickoff doc. Title → inline text editor pattern from TaskGridView title (line 937-961). Period → two InlineDatePicker. PI → InlineSelect from directors list.

### Bug #8 — MyTasks title click has ~400ms latency
- **Evidence:** measured 400ms latency from click to panel visible; 167ms on a later rerun (after chunk cached). First-visit penalty confirmed.
- **Source:** `src/pages/portal/MyTasks.tsx:16` — `const TaskDetailPanel = lazy(() => import('../../components/tasks/TaskDetailPanel'))`. TaskDetailPanel imports Tiptap (`RichTextEditor.tsx`) at module load.
- **Fix path:** Preload on hover (`onMouseEnter` triggers dynamic `import()` without awaiting) OR import TaskDetailPanel eagerly on `/my-tasks` mount after first paint (idle callback).

### Bug #9 — MyTasks click target too narrow
- **Evidence:** click at 95% across row (empty area after priority column) did NOT open detail panel.
- **Source:** `src/components/tasks/TaskGridView.tsx:845-848`:
  ```
  onClick={() => { onFocusIndex?.(index); onSelect?.(task) }}
  ```
  — row onClick fires `onSelect` but MyTasks (line 754) does not pass `onSelect` — only `onOpenDetail`. So anywhere that's not the title span (line 967, which calls `onOpenDetail` on click with `stopPropagation`) just updates focus index silently.
- **Fix path:** Either (a) change row onClick to also call `onOpenDetail?.(task)` unless the click came from an interactive cell (e.target.closest('.inline-select-trigger, [data-testid^="task-due-"], [data-testid^="task-status-"], [data-testid^="task-priority-"], .task-row-checkbox, .subtask-expand-btn, [data-testid^="task-title-"]') → ignore); OR (b) in MyTasks, pass `onSelect={setSelectedTask}` alongside `onOpenDetail`. Option (a) is cleaner — same click semantics across all TaskGridView consumers.

### Bug #10 — MyTasks inline date picker flashes and closes
- **Evidence:** `input[type="date"]` visible at 50ms and 150ms, gone by 500ms. Container survives (preset buttons still counted at end) — so `editing` state stays true briefly but the input unmounts. This indicates the `commitAndClose()` was called by blur-timer (200ms) which fires `setEditing(false)`.
- **Root cause:** Cascade at `src/components/InlineDatePicker.tsx:29-35` → `showPicker()` opens native OS date dialog → input blurs → `onBlur={() => setTimeout(commitAndClose, 200)}` at line 97 → `commitAndClose` checks `pendingValue !== value` (false, user never touched yet) → skips onChange but **always** calls `setEditing(false)` (line 41). Picker closes 200ms after first blur.
- **Fix path:** Three good options:
  1. Remove the automatic `showPicker()` call. Let user click the visible input to open the native picker (standard HTML5 pattern) — blur-while-picker-open won't happen if Chromium manages focus.
  2. Gate `commitAndClose` on blur: track whether `showPicker` was called with a ref. If yes, ignore the first blur.
  3. Move to a custom (non-native) calendar popover — more work but cleanest. Presets are already there.
- **Recommend option 1** — smallest diff, stays aligned with HTML5 semantics.

### Bug #12 — TaskDetailPanel project picker visual corruption
- **Evidence:** Dropdown renders with `class="absolute left-0 top-full mt-1 z-50 rounded-lg shadow-lg border"` inside the panel's fixed/overflow-auto container. Button y = 475px, panel has its own surface tint that mixes with the dropdown's cream background.
- **Source:** `src/components/tasks/detail/FieldControls.tsx:381`:
  ```
  <div className="absolute left-0 top-full mt-1 z-50 ..."
  ```
- **Fix path:** Port the `createPortal` pattern from `src/components/InlineSelect.tsx:123-203`. Compute button bounding box, render to `document.body`, use `position: fixed` with computed top/left. Every other inline dropdown on the site already does this — ProjectSelect is the lone holdout.

## Newly discovered bugs / gaps

### D1-01 — Deadlines: Due date is read-only
- **Severity:** Medium. This is the PI weekly-review surface.
- **Source:** `src/pages/portal/Deadlines.tsx:548-556`.
- **Fix:** Wrap due date in `InlineDatePicker` (same component that MyTasks uses) — blocked by bug #10 first.

### D1-02 — Manuscripts: Title, PI, Category, Days read-only; only Status/Stage editable
- **Severity:** Low-Medium. Matches current design (titles tend to not need inline editing on manuscripts), but PI and Category feel like things a PI would want to change inline. Flag for Nick's review.
- **Source:** `src/pages/portal/Manuscripts.tsx:416-466`.

### D1-03 — Ideas/Decisions: Title not clickable to detail
- **Severity:** Low. Idea and Decision rows have status inline + vote/tags, but title span has no click action. There is no separate detail page for ideas/decisions, so this may be intentional.
- **Action:** Verify with Nick that ideas and decisions don't need a detail view. If they do, match TaskGridView title pattern.

### D1-04 — Grants row has no click-to-detail
- **Severity:** Medium. Even if inline editing is deferred, the user should be able to click a grant row to navigate to `/grants/<slug>` for full editing.
- **Source:** `Grants.tsx:560-660` — `<div>` has no onClick, no Link wrapper.

### D1-05 — Tasks title-click race with lazy TaskDetailPanel
- **Severity:** Low (test-only) but worth noting. On Tasks page, first click may appear to fail if automated test doesn't wait for the lazy chunk. Same root cause as bug #8 — preloading solves it.

## Gaps: D1 columns with no UI editor (per page)

| Page | Column / field | Editable in UI? | Notes |
|---|---|---|---|
| Grants | title | NO | read-only span (Grants.tsx:585) |
| Grants | pi | NO | Avatar + last-name span |
| Grants | status / proposed | NO | pill is a plain span |
| Grants | mechanism | NO | plain span with color |
| Grants | agency | NO | plain span |
| Grants | start_date / end_date | NO | formatted span |
| Grants | amount (if in D1) | NO | not rendered |
| Deadlines | due_date | NO | read-only span (548-556) |
| Deadlines | project | NO | projectMap display only |
| Deadlines | assignee | NO | Avatar only |
| Manuscripts | title | NO | read-only |
| Manuscripts | pi | NO | avatar only |
| Manuscripts | category | NO | label span |
| Projects | title | NO | Link text only |
| Projects | short_name | NO | span |
| Projects | description | NO | not editable from list |
| Tasks/MyTasks | project | YES (via InlineCellSelect) | PROJECT column editable in grid |
| Tasks/MyTasks | blocked_by | NO | shown via Link2 icon only |
| Tasks/MyTasks | subtasks | YES (expand to add) | |
| Tasks/MyTasks | description (rich) | YES (in detail panel) | |
| Tasks/MyTasks | updated_at | NO (derived) | |
| Tasks/MyTasks | key_link_1/2/3 | YES in detail only | not in grid |
| Ideas | submitter / created_at | NO | |
| Decisions | title / tags / sentiment | NO | only outcome_status editable |

## Friction notes (pass-with-complaint)

1. **MyTasks title-click 400ms first time:** passes the "<200ms" bar on a warm cache only; first visit feels sluggish. Preload TaskDetailPanel on hover of any row or on idle callback after mount.
2. **InlineSelect portal latency 253-319ms:** feels snappy but not instant. CSS `transition: background-color var(--duration-normal)` on the trigger adds perceived delay. Consider `--duration-fast` for the trigger hover transition.
3. **Projects page click handler shadowing:** each cell has its own `onClick={(e) => e.preventDefault()}` wrapper. Works but fragile — any new field added will also need that pattern.
4. **Deadlines `onClick={(e) => e.stopPropagation()}` at status cell** suggests someone already hit the "row click steals cell click" problem. Good defensive pattern but symptomatic that the row-click model isn't ergonomic.
5. **TaskDetailPanel has 5 tabs** (Overview/Notes/Comments/Activity/Details). The ProjectSelect lives in Overview. If Nick opens Details tab first then goes back, the select state may flash. Not reproduced but worth a manual check.

## Not reproduced (needs Nick or manual verification)

- **Bug #6** (MyTasks stale row focus highlight): Playwright probes `data-focused` attr, `.task-row-focused` class, `document.activeElement` — all come back clean after clicking a different row. The artifact Nick sees may be browser `:focus-visible` ring lingering from keyboard nav, or React virtualizer reusing DOM nodes between scroll positions. Need a manual screen-capture at Nick's resolution/theme to confirm.
- **Bug #7** (blue neon click outline too aggressive): CSS inspection only; no Playwright measure for "visual aggressiveness". Check `.cell-focused` rule in `TaskGridView.tsx` and any global `*:focus` rule in `index.css` — hand off to consultant if still an issue.

## Cleanup

- `tests/round8-interactive-surface.spec.ts` — **retained** for Phase 4 fix-verification re-runs. Delete after Round 8 closes.
- Screenshots in `review/round8-interactive/` — retained for fix rounds.
- `review/round8-interactive/matrix.json` — raw data backing this report.

## Recommended fix priorities (for Round 8 Phase 4)

1. **P0 — Date picker fix** (bug #10) — single-file change in `InlineDatePicker.tsx`, unblocks D1-01 Deadlines inline date too.
2. **P0 — Row click target fix** (bug #9) — TaskGridView row onClick needs to fall through to `onOpenDetail` when not clicking an interactive cell. Benefits both Tasks and MyTasks.
3. **P0 — ProjectSelect portal fix** (bug #12) — port InlineSelect's `createPortal` pattern to FieldControls.tsx.
4. **P1 — Tiptap preload** (bug #8) — hover preload on task rows + idle-import on `/my-tasks` mount.
5. **P1 — Grants inline editing** (bug #1) — bigger scope, ties into grant status taxonomy migration (Phase 6). May be worth waiting for that decision before wiring inline editors, to avoid re-doing it.
6. **P2 — Grants row click → detail** — quick win independent of inline edit work.
7. **P2 — Deadlines due-date inline** — once date picker is fixed.
