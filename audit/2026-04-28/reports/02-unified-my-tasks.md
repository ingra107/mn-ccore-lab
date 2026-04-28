# UnifiedMyTasks Deep Audit — Phase 38 (`/portal/my-tasks`)

**Date**: 2026-04-28
**Agent ID**: `a0d8996ab785d4527`
**Files reviewed**: `src/pages/MyTasks/index.tsx` (re-exported via `src/pages/portal/UnifiedMyTasks.tsx` shim), `constants.ts`, `primitives.tsx`, `components/{TopBar,ViewPicker,FilterChip,BulkBar,InlineDetail,TaskDrawer}.tsx`, `views/{ColumnsView,LanesView,ListView}.tsx`, `hooks/{useTaskFilter,useSelection,useListKeyboard}.ts`, plus comparison against `src/components/tasks/TaskDetailPanel.tsx`, `TaskGridView.tsx`, `useSavedViews.ts`, `SavedViewsMenu.tsx`. The page is 100% extracted (the file the brief calls "primary" is a 9-line re-export).

The structural pattern — parent owns state, three view components consume the same `byGroup`/`filtered` slices, a shared TopBar drives URL params — is clean. The execution underneath that pattern is where the gaps live, and they are not small ones.

## 1. Executive read

- **Three views, three regressions in disguise.** The shared toolbar story is real and well-structured (parent state + `useTaskFilter` + URL round-trip), but underneath the surface UnifiedMyTasks **dropped almost every interactive affordance the rest of the Hub depends on**: no inline editing of any field, no virtualization, no drag-and-drop, no swipe-to-complete, and a bespoke `TaskDrawer`/`InlineDetail` that bypasses the cache-subscribed `TaskDetailPanel` Rule 18 was written for. The page renders nicely on a screenshot but, on a 647-task account, it ships less function than the `/portal/my-tasks-legacy` page it replaced.
- **The detail surface is the weakest part of the whole experience.** `InlineDetail` and `TaskDrawer` both take `task` as a parent prop and never resubscribe to the `['tasks']` cache (Rule 18 violation; compare `TaskDetailPanel.tsx:83` where `qc.getQueryCache().subscribe(...)` is the canonical pattern). After any bulk mutation, the open drawer still shows pre-mutation values. The drawer's subtask checkbox is decorative (`defaultChecked` with no `onChange` at `TaskDrawer.tsx:150`). Single-row "Archive" in `InlineDetail.tsx:78` writes `status:'done', completed:1` while bulk Archive in `index.tsx:167` writes `delete` — same word, two different state transitions, neither soft-deletes the way the confirm copy promises.
- **Saved Views work but the integration is half-wired.** Round-trip into URL params is correct, but `SavedViewsMenu.tsx:75` styles the dropdown with light-mode tokens (`var(--cream)`, `var(--ink)`, `var(--shadow-menu)`) inside a dark-first page (`PAGE_BG = #0b1017`). The menu visually pops out of the page palette. Rename is exposed in the hook (`useSavedViews.ts:72`) but `SavedViewsMenu` never wires a UI for it. There's no "default view," no "save changes to current view" affordance, and the active-view detection at line 45 compares the *complete* URL string — typing one character into Search drops the active highlight, which is non-obvious behavior.

## 2. View-by-view walkthrough

### Shared TopBar (`components/TopBar.tsx`)

The toolbar is good architecturally — view picker far-left (Rule 60 satisfied at `TopBar.tsx:65`), saved-views menu adjacent, vertical divider, then four filter chips and a hide-completed toggle. Critical observations:

- **Inline `<h1>My Tasks</h1>` instead of `PageHeader`.** Line 41. The shared `PageHeader` ships on 17/19 portal pages with `aria-live` on count/subtitle (per the "Component Coverage" matrix in CLAUDE.md). MyTasks rolls its own. The "23 visible" count at line 42 has no `aria-live`, so screen readers won't announce filter changes — every other data page does.
- **The "Group" filter chip is a smell against Rule 60.** The view picker already implies a layout shape; a Group chip lets you filter to one group, but in Lanes view that filter collapses 4 of 5 lanes into "nothing here" empty states (`LanesView.tsx:58`) — the lane scaffolding still renders. In Columns view it does the same to 4 of 5 columns. This filter is only legible in List view. Per Rule 60 ("if a filter only makes sense in one view, the toolbar contract is wrong") this either needs to (a) collapse non-matching lanes/columns automatically, or (b) move into the List-view-only context.
- **Mentee filter has a special sentinel `'__any_mentee__'`** (`TopBar.tsx:91`, `useTaskFilter.ts:43`). Sentinel strings in URL params bleed into saved views; if researchTeam membership shifts, an old saved view targeting a now-departed mentee silently no-ops. Better: encode as a separate URL key (`mentee=any` vs `mentee=<slug>`).
- **Quick-view tabs and filter chips are visually inconsistent.** Tabs at line 56 are 11px pill buttons with full-width borders; FilterChip at `FilterChip.tsx:21` is also a 11px pill but has a label-prefix + dropdown caret. Chained on one row they look like the same control type with different shapes. Consider promoting quick views to actual tabs (with a thin underline) and demoting filter chips, OR unifying both to chips with an "active value" highlight.
- **No typeahead on filter dropdowns.** Per design ethos #3 (Airtable pattern — "Dropdowns with 5+ options show typeahead filter input + arrow key navigation"), the Project filter needs typeahead. With 71 projects in prod, scrolling a 280px-tall list to find one is friction. `FilterChip.tsx:29` is a flat list with `maxHeight: 280`.
- **No `aria-expanded` on the FilterChip dropdowns.** The button at `FilterChip.tsx:23` has no aria attributes at all, no aria-haspopup, no aria-expanded toggle. SavedViewsMenu has it (line 53). Inconsistent.
- **Clear-all is destructive without confirmation but not undoable.** Resetting filter + search + quickView to nothing is fine; but if a user has a long search query they can't recover it. A 5s undo toast like every other destructive action would close the loop (Pattern 9).
- **`filter.mentee` is wired into the chip but never restored from URL** at `index.tsx:62` (the field is hardcoded to `null` on init while priority/project/group all read from `searchParams`). A saved view that captured a Mentee filter won't restore it. Bug.

### Columns view (`views/ColumnsView.tsx`)

Five-column 1400px-min grid in horizontal scroll with mobile fade gradient (lines 26–46). Each column is a sticky-header section + list of cards.

- **No virtualization.** Render path is `tasks.map((t) => <Card />)` (line 65). A user with 250 deep-work tasks renders all 250 DOM nodes in one column. Legacy `TaskGridView.tsx:5` uses `@tanstack/react-virtual`. UnifiedMyTasks dropped it. With 647 tasks across 5 columns this materially affects scroll perf and any filter change re-creates every Card.
- **Card body click expands inline (line 100).** Rule 58 satisfied. The `data-stop` ergonomic for child clicks is clever but fragile — a future engineer adding a button inside the card has to remember to set `data-stop="1"`. A `stopPropagation` in the handler chain is more durable.
- **No drag/reorder.** Columns is the obvious place for cross-group drag (drag a card from Quick → Priorities = `group_override='priorities'`). The whole `tasks.group_override` system (Rule 63) was built for this kind of explicit reclassification, but the affordance is hidden behind `Move →` button-drilldown inside the expand state. The kanban metaphor is half-promised.
- **Status circle is missing.** The card's left border is colored by group meta and turns gold when planned, but there is no clickable status circle to mark done. Users go expand → Action bar → … there's no Complete button at all in `InlineDetail`. Single-row complete is missing from the UI; the only completion path is bulk-select-then-complete.
- **`opacity: 0.5` on completed cards (line 105) is compound-opacity territory.** Rule 43 forbids dimming whole cards. The Chip + LinksBar inside drop below AA.
- **The `📍` override pin chip is 9px font with `letter-spacing: 0.04em`** (line 113). Rule 38 forbids 9px text — it triggers axe contrast failures and was eliminated in Phase 31. Same fate at `LanesView.tsx:111` and `ListView.tsx:89`.
- **`Card` reads `(task as TaskRow & { _group?: GroupKey })._group ?? 'deep'`** at line 90. The same "patch-the-row-with-_group" trick recurs in LanesView (line 88) and ListView (line 68). It's a leaky type cast that the filter hook attaches at `useTaskFilter.ts:52`. Pull `_group` and `_tag` into a real `EnrichedTaskRow` type instead of `as TaskRow & { _group?: GroupKey }` everywhere.

### Lanes view (`views/LanesView.tsx`)

Stacked accordion sections with peek/show-more. Centered `maxWidth: 1100`.

- **Local `collapsed` and `peek` state are not URL-synced or persisted** (lines 23–24). Reload the page → all five lanes reset to expanded with first-4 peek. Saved Views can't capture lane-collapsed state. For a "pick a lane and stay there" mental model this is the wrong default.
- **Peek shows first 4** (`tasks.slice(0, 4)`, line 35) but the sort upstream is "planned → active → done" (Rule 62). What you actually peek is "the 4 highest-ranked". Fine, but undocumented in UI. A label like "first 4 of 12 — 8 hidden" instead of `+8 more` would be more honest.
- **Lane headers are full-width buttons** (line 42) — clicking anywhere collapses. But the right side of the header has overdue/planned chips that look like badges, not click affordances; users frequently mis-click on chips that don't have stopPropagation. They DO collapse the lane (intentional?), but it feels like a bug because the chip is shaped like an interactive element.
- **No drag-to-promote between lanes.** Same regression as Columns. Move-→ menu inside InlineDetail is the only `group_override` path.
- **Empty-when-filtered states are flat.** When a global filter knocks a lane to 0, the lane still renders with a "nothing here" placeholder (line 58). Combined with the section header + chevron it eats ~80px per empty lane. Auto-collapse empty lanes when a filter is active.
- **`sticky top: 0` is not on the lane header** — only the `<button>` row but not the section. Scrolling down a long lane loses the header. Compare ColumnsView.tsx:54 which has `position: sticky` on the column header.

### List view (`views/ListView.tsx`)

Dense table, j/k cursor, e/Enter drawer, x select. Footer kbd legend is a nice Linear-grade touch.

- **JetBrains Mono in the footer** (line 27, 55). Rule design-ethos #7 says "Zero monospace in content" — `<kbd>` is the explicit exception, and the footer uses `<kbd>` correctly. But the footer wrapper itself is `fontFamily: 'var(--font-mono)…'` (line 55) which means the surrounding labels ("move", "select", "drawer", "deselect") are in mono too. That's content, not a key cap. Fix: only the kbd elements get mono.
- **Hard-coded grid template `'32px 26px 1fr 150px 76px 38px 80px 80px 70px'`** at line 32 + 81. No column resize, no reorder, no `useTableConfig` (legacy `TaskGridView.tsx:21` does all three). On a 1366px laptop with sidebar open, content area drops to ~1100px and the title column becomes ~520px — fine — but the user can't trade Project for Title. Rule 17 ("data pages use columnar `TableContainer + ColumnHeader`") is technically violated; this is a hand-rolled table.
- **No `<th>` semantics, no role="grid"**. Whole table is `<div>`-soup. SR users get nothing.
- **Cursor highlight is a 3px left border** (line 81) which causes a 3px reflow on every j/k press because `borderLeft` is on the same element that holds content. Use a pseudo-element or a fixed-width gutter to avoid the layout shift.
- **No multi-select via Shift+click.** With j/k cursor + x-to-select, the user can't say "from row 5 to row 12 select all." Compose with `useListKeyboard` to add Shift+x range select.
- **Cursor doesn't follow filter/search.** Type "manuscript" in TopBar search → filtered list shrinks from 230 to 7 → cursor clamps to last index (`useListKeyboard.ts:23`). Good. But the cursor doesn't reset to 0; it lands on the *last* filtered task, not the first. Disorienting. Reset to 0 when filter changes.
- **No row-double-click hint.** `onDoubleClick={onDouble}` at line 80 opens the drawer, but the footer legend doesn't tell users that exists. Either remove it (e/Enter is enough) or document it.
- **Owner column shows raw slug** (`task.assignee` at line 98) — no Avatar, no name resolution. The legacy TaskDetailPanel's row uses `getPersonInfo()`. Rule 5 says "always use `getPersonInfo()`," but ListView passes the slug as text. `nick-ingraham` reads worse than "Nick I." with avatar.

### TaskDrawer (`components/TaskDrawer.tsx`) — List view's right-side panel

380px fixed-width side panel. Bypasses the canonical `TaskDetailPanel`.

- **Rule 18 violation.** The drawer takes `task` as a prop (line 34) and never subscribes to the `['tasks']` cache. After bulk-priority-change with the drawer open on the same task, the drawer still shows old priority. `TaskDetailPanel.tsx:83` is the reference implementation; the new drawer ignores it.
- **No tabs.** `TaskDetailPanel` ships 5 tabs (Overview / Notes / Comments / Activity / Details — Phase 27). The new drawer collapses all of that into a single scroll. Comments tab is gone. Activity tab is gone. Files tab is gone. Reactions exist on individual updates (line 180) but there's no compose surface for the comments tab. Feature regression.
- **No `aria-modal`, no focus trap, no Esc-to-close.** Only the close button works (line 92). Compare `TaskDetailPanel` which is fully a11y-conformant. Phase 23 closed every modal's a11y gap; the new drawer reopens them.
- **Subtask checkbox is decorative** (line 150). `defaultChecked` + no onChange = clicking does nothing. Subtask completion from the drawer is broken.
- **No deadline/priority/status edit anywhere in the drawer.** `<Defn>` cells at lines 137–142 render plain text. With a 5+ option status list this is exactly where the design-ethos's inline edit + ▾ affordance should live. Currently the only way to change a single task's status from MyTasks is to select it (1 row) and use the bulk bar — three clicks where one should do.
- **Recent updates tab caps at 6** (line 167). On a long-running task with 30 updates, only 6 are reachable. No "show all" link. Compare TaskDetailPanel's Activity tab which paginates.
- **No prev/next nav.** The legacy TaskDetailPanel has Alt+Up/Down to walk filtered tasks. Power-mode List view is the obvious place for this and it's missing.

### InlineDetail (`components/InlineDetail.tsx`) — Columns + Lanes inline expand

Smaller version of the drawer.

- **Same Rule 18 violation.** `task` is a prop, no cache subscription.
- **No SubtaskList. No Comments. No Activity feed.** Just a description blurb (line 86) + 5 buttons + meta line + SmartCompose. Compare TodayPage's `TaskDetailDrawer` (which the comment at line 4 claims this "mirrors") — that one renders subtasks, blocks, and a richer update feed.
- **`window.confirm()` for archive** (line 77). Rule "Optimistic + 5s undo. Never spinners for actions." A blocking confirm is the wrong shape. Bulk archive uses `window.confirm()` too (`index.tsx:165`) — same problem in two places.
- **Archive ≠ Archive.** Single-row archive at line 78 mutates `status:'done', completed:1` (which is "complete" not "delete"). Bulk archive at `index.tsx:167` calls `bulkUpdate.mutate({ ids, action: 'delete' })` (which sets `deleted_at`). Two different state transitions for the same labeled action. The single-row path is straight-up wrong — it leaves the task in the user's "done" bucket forever instead of soft-deleting.
- **Move popover writes `group_override` but never refreshes the parent list**. The optimistic update in `useUpdateTask` should handle it, but the parent's `byGroup` memo depends on `filtered` which depends on `getGroupForTask` which now reads the new override. This works *only* because the optimistic mutation patches the cache. Cross-check: an error rollback would leave the toast saying "Moved to ..." but the task back in its old bucket — the toast becomes a lie. Toast should fire on rollback too, with apology copy.

## 3. Findings table

| ID | Severity | View/Surface | Issue | Proposed fix | Effort |
|----|----------|--------------|-------|--------------|--------|
| MT-01 | P0 | TaskDrawer + InlineDetail | Rule 18 cache-subscription violation: drawer holds stale `task` after mutations | Adopt the `qc.getQueryCache().subscribe()` pattern from `TaskDetailPanel.tsx:83`; pass `taskId` not full row | M |
| MT-02 | P0 | InlineDetail Archive | Single-row Archive does `status:'done', completed:1` instead of soft-delete; mismatch with bulk Archive | Call `useUpdateTask` with `deleted_at` or use `bulkUpdate({ ids:[id], action:'delete' })` | S |
| MT-03 | P0 | TaskDrawer subtasks | `defaultChecked` + no onChange — checkboxes are inert | Wire to `useToggleSubtask` mutation (`hooks/mutations/useSubtaskMutations.ts`) | S |
| MT-04 | P0 | All three views | No virtualization; renders all 647 tasks. Filter changes re-create every row | Adopt `@tanstack/react-virtual` (already in deps) for ListView + per-lane in LanesView + per-column in ColumnsView | M |
| MT-05 | P0 | Toolbar | Inline editing absent everywhere — no status / priority / due / assignee / project edit on any row in any view | Reintroduce `InlineSelect`, `InlineAssigneePicker`, `InlineDatePicker` into List view minimum (closest to the current design); long-term in Columns/Lanes too | L |
| MT-06 | P1 | TaskDrawer | No tabs (Notes/Comments/Activity/Files all missing) — feature regression vs `TaskDetailPanel` | Either compose with `<TaskDetailPanel />` directly inside the drawer wrapper, or rebuild the 5-tab structure | L |
| MT-07 | P1 | TaskDrawer | No `aria-modal`, no focus trap, no Esc close (Phase 23 a11y regression) | Add focus-trap + `role="dialog"` + Esc handler. Same drawer wrapper pattern used in modals | S |
| MT-08 | P1 | Columns + Lanes | No drag-to-reclassify; the whole `tasks.group_override` system is button-drilldown-only | `@dnd-kit` on cards + drop targets per group; on drop fire `useUpdateTask({group_override: dropped})` | M |
| MT-09 | P1 | All three views | No swipe-to-complete, no row-level swipe (Rule 56) | Wrap row in `motion.div` w/ `useSwipeAction({ onSwipeLeft, onSwipeRight })`; mobile-only | M |
| MT-10 | P1 | InlineDetail | No single-row Complete button — must select-then-bulk to mark a task done | Add `✓ Complete` ghost button next to Snooze; mirror to `TaskDrawer` | S |
| MT-11 | P1 | TopBar | Inline `<h1>` not the shared `PageHeader`; no `aria-live` on count | Adopt `PageHeader` (CLAUDE.md "Component Coverage" matrix) | S |
| MT-12 | P1 | FilterChip Project | No typeahead despite ~71 projects (design ethos #3 violation — Airtable pattern requires typeahead at 5+) | Add input field at top of dropdown, arrow nav, fuzzy match | M |
| MT-13 | P1 | SavedViewsMenu | Light-mode tokens in dark-first page (`var(--cream)`, `var(--ink)`) | Switch to `PANEL_BG`/`INK`/`INK_DIM` parity with FilterChip dropdown, OR hex-pin per Rule 59 | S |
| MT-14 | P1 | SavedViewsMenu | Rename exposed in hook but no UI; no "default view"; no "save changes" | Add ⋯ row menu w/ Rename/Delete/Set as default; "Save changes" when query differs from active view | M |
| MT-15 | P1 | index.tsx:62 | `filter.mentee` initialized to `null`, ignores URL param — saved views can't restore mentee | Mirror priority/project/group: `searchParams.get('mentee')` | S |
| MT-16 | P1 | TopBar Group chip | Group filter in Columns/Lanes views collapses 4/5 lanes to "nothing here" placeholders | Auto-hide non-matching lanes/columns; OR scope Group chip to List view only | S |
| MT-17 | P1 | LanesView | Lane collapsed/peek state not URL-synced or persisted | Persist to `localStorage.mt_lane_collapsed`; round-trip into URL for saved views | S |
| MT-18 | P1 | ListView | Hard-coded grid template (no column resize/reorder/sort), no role="grid" | Adopt `useTableConfig` + `ColumnHeader` + `TableContainer` shared components | L |
| MT-19 | P1 | ListView Owner col | Raw slug rendered (`task.assignee`) instead of `getPersonInfo()` (Rule 5) | Render Avatar + initials via `getPersonInfo()` | S |
| MT-20 | P2 | All views | `📍` override chip uses 9px font (Rule 38: minimum 10px) | Bump to `--text-micro` (10px) | S |
| MT-21 | P2 | ColumnsView/LanesView/ListView | `opacity: 0.5` on completed rows compounds with child opacities (Rule 43 violation) | Use strikethrough + `color: var(--muted)` on title; remove parent opacity | S |
| MT-22 | P2 | InlineDetail/TaskDrawer | `window.confirm()` for archive — wrong shape per ethos #8 | Optimistic delete + 5s undo toast (already imported `useUndoToast`) | S |
| MT-23 | P2 | All views | `data-stop="1"` ergonomic is fragile; new clickable children must remember to set it | Switch to standard `e.stopPropagation()` in child onClick handlers (already used in some sites — inconsistent) | S |
| MT-24 | P2 | ListView | j/k cursor doesn't reset to 0 after filter change — lands on last row | Reset cursor when `filtered.length` changes meaningfully (e.g. when search/quickView changes) | S |
| MT-25 | P2 | ListView footer | `fontFamily: monospace` on whole footer turns labels mono (ethos #7) | Mono only on `<kbd>` elements | S |
| MT-26 | P2 | TaskDrawer | No prev/next (Alt+Up/Down) navigation through filtered list | Pass `filtered` + `currentIndex` to drawer; keyboard handler | M |
| MT-27 | P2 | InlineDetail | Move popover toast lies on rollback (mutation onError still shows "Moved to …") | Use `onError` to fire `showError`-style toast, not just `onSuccess` | S |
| MT-28 | P2 | BulkBar | Bulk Snooze loops single mutations (`Promise.all`); on 50 tasks fires 50 API calls | Add `action: 'snooze'` to `useBulkUpdateTasks` API contract | M |
| MT-29 | P2 | TopBar | Filter chips have no `aria-expanded`/`aria-haspopup` (FilterChip.tsx:23) | Add aria attrs; mirror SavedViewsMenu | S |
| MT-30 | P2 | TopBar | Quick-view tabs and filter chips visually conflict — same shape, different semantics | Underline-active for tabs OR unify to chip pattern | S |
| MT-31 | P2 | All views | Rendering enriched `TaskRow & { _group, _tag }` via `as` cast in 5+ sites | Define `EnrichedTaskRow` type in `constants.ts`, return from `useTaskFilter` | S |
| MT-32 | P2 | LanesView | Section header not sticky (compare ColumnsView column header) | `position: sticky; top: 0` on the lane header | S |
| MT-33 | P2 | TaskDrawer | Recent updates capped at 6, no "show all" | Pagination or "show 6 more" button | S |
| MT-34 | P2 | BulkBar Reassign | Static `assigneeOptions` (`index.tsx:195`) hand-rolled list of researchTeam + 2 hardcoded names — drift risk | Source from `team.ts` getActiveMembers() to stay in sync as Phase 39 auto-creates members | S |
| MT-35 | P2 | Toolbar | "clear all" doesn't clear `filter.hideCompleted`, leaving inconsistency between "default state" expectations | Either include hideCompleted in clear, or rename to "clear filters" and document scope | S |
| MT-36 | P2 | InlineDetail SmartCompose | "@hermes" placeholder is great, but no preview of who's currently in the conversation (PresenceAvatars) | Add `<PresenceAvatars entityType="task" entityId={task.id}>` near compose | S |

## 4. Top 5 high-leverage enhancements

1. **Replace `TaskDrawer` with `<TaskDetailPanel taskId={drawerId} />`** wrapped in a 380px aside. This single change closes MT-01, MT-03, MT-06, MT-07, MT-10, MT-26, MT-33 — about a third of the P0/P1 list. The legacy TaskDetailPanel already has Notes/Comments/Activity/Files tabs, cache subscription, focus trap, prev/next nav, R2 attachments, reactions, mentions, and Hermes wiring. `InlineDetail` should compose the same component into a smaller-height container or share its action bar logic via a `<TaskActionBar />` extraction. The current bespoke detail surfaces are a Phase 38 sprint shortcut that became permanent debt.

2. **Inline editing on the List view first**, then percolate to Columns/Lanes. Even if Columns/Lanes stay click-to-expand-only, the List view is a "data page" by Rule 17. It should match Tasks/Manuscripts/Projects in inline editability. The minimum first pass: status (`InlineSelect`), priority (`InlineSelect`), assignee (`InlineAssigneePicker`), due (`InlineDatePicker`), project (`InlineSelect`). Tab/Shift+Tab between cells. ▾ caret on hover. With this, a power user can triage 50 tasks without ever opening the drawer — which is the whole point of the List view existing alongside Columns/Lanes.

3. **Drag-to-reclassify in Columns + Lanes.** The `group_override` system was designed for this. Right now the only way to use it is: click card → click "Move →" → click target group → click somewhere to dismiss. Four clicks for what should be one drag. `@dnd-kit` is already in `package.json` and used by `TaskGridView`. Wire `DndContext` at the ColumnsView root, drop targets per column, fire `useUpdateTask({group_override: target})` on drop with optimistic + undo. Same pattern for Lanes (drop on lane header collapsed-or-not). This is the kanban metaphor cashed in.

4. **Virtualize all three views.** Drop `tasks.map(...)` for `useVirtualizer` in ListView and per-lane / per-column in the other two. With 647 tasks, the page currently renders ~600 cards on first paint (filtered ≈ 250–400 typically). Switching views remounts everything. Filter changes recompute keys. Profile in DevTools — the un-memoized Card children plus `useTaskFilter`'s array map allocation per filter change is a measurable regression vs legacy.

5. **Saved Views v1.5: rename, default, "save changes."** Three small additions, all in `SavedViewsMenu.tsx`, that close the "set up a workflow once and live there" use case which is *the entire reason saved views exist*. Right now Save creates a new view, Click applies, Trash deletes. Missing: Rename (already in hook, just needs UI), Set as default (LS-only — `defaultViewId` per page), and "Save changes" (when `currentQuery !== view.query` while a view is active, show a small ↻ icon next to the active view name). And while you're in there: theme it dark to match the page.

## 5. Cross-view consistency observations

- **Click-to-expand semantics: Columns + Lanes use inline expand, List uses right drawer.** This is intentional (Rule 60 explicit) but the *content* of those two surfaces diverges sharply: InlineDetail has only the 5-button action bar + meta + SmartCompose, while TaskDrawer has the action bar + meta dl + subtasks + recent updates + SmartCompose. Same task, two different detail UIs depending on which view the user is in. Either (a) inline expand should be a compact subset of the drawer (e.g. drop subtasks/updates), or (b) both should compose `<TaskDetailPanel>` and let it adapt density via a prop. Right now they're two sibling implementations drifting independently.
- **Selection styling differs.** Selected card in Columns is `${meta.color}15` background + colored border (line 102). Selected row in Lanes is the same `${meta.color}15` background. Selected row in List is `rgba(201,168,76,0.06)` (gold tint) — completely different color (line 81). Either gold means "selected" everywhere or group-color means "selected" everywhere. Currently it's group-color in 2/3 views and gold in the third.
- **Cursor / focus indicator only in List.** No j/k or arrow-key navigation in Columns or Lanes. CD spec called this out as intentional but it leaves Columns/Lanes feeling distinctly less keyboard-first than the rest of the Hub. Tab-through cards is unguided.
- **Override pin chip placement differs.** ColumnsView puts `📍` between title and priority (line 113). LanesView puts it leading the tail-cluster (line 111). ListView puts it inline with the title (line 89). Same chip, three positions.
- **`stopPropagation` strategy is mixed.** Some children use `data-stop="1"` (Columns line 109, Lanes line 102), some use `e.stopPropagation()` directly (Columns Link line 119, Lanes Link line 107, List checkbox line 84), some rely on `data-stop` AND `stopPropagation` (Columns line 109). Pick one.
- **Status display:** Columns + Lanes show status only via the waiting Chip (and only when `=== 'waiting_external'`). List has a dedicated Status column. So in Columns view a user can't tell if a task is `blocked` vs `todo` vs `in_progress` from the card — only by expanding. The `STATUS_COLOR` map is imported in ListView only.
- **Card vs LaneRow vs ListRow tag glyph (`_tag`) is identical** but its visual treatment differs: 12px in Columns + Lanes, 11px in List. Snap to a single `--text-small`.
- **Project-name ellipsis lengths vary.** Columns: 130px max-width (line 119). Lanes: 160px (line 107). List: takes 150px column. Same project name appears different-truncated depending on which view you're in.

## 6. Brand & design-system observations

- **Hex-pinned colors throughout** (`constants.ts:41–50`). Per Rule 59 this is intentional on Today/MyTasks surfaces because they render outside `.dark` chrome — but `--font-sans` and `--font-mono` are CSS-var-resolved (`index.tsx:206`, `ListView.tsx:55`). That's fine but worth noting: the page lives in a hybrid hex-pinned-color + token-resolved-font world.
- **No use of `--stage-fill-*`, `--gold-on-emphasis`** (Rules 41–42) anywhere. The page bypassed the stage-fill family entirely with hex constants. Acceptable per Rule 59 but means Phase 35's contrast lessons aren't inherited. If a future a11y pass migrates more pages to stage-fill, MyTasks won't be one of them.
- **`STATUS_COLOR.blocked = '#f0737e'` (coral) and `PRIORITY_COLOR.urgent = '#f0737e'`** — same hex. Rule 59 assigns coral specifically to "overdue / stalled / warnings / overlapping meetings." Blocked-status and urgent-priority both use it, which means a row can have a coral status text + coral priority chip + coral overdue chip + coral border. Visual cacophony when stuff's on fire.
- **Border colors are pure `rgba(255,255,255,0.NN)` everywhere** (0.04, 0.05, 0.06, 0.08, 0.10, 0.12, 0.15, 0.18). Eight different alpha values when CLAUDE.md's tier system is 0.03/0.06/0.10/0.15. Consolidate.
- **`borderRadius` values are 3, 4, 5, 6, 8, 999** — 3 and 5 are not in the tokens. Use `--radius-sm` (4) consistently; 5 looks like a sketch leftover.
- **Animation: only `transition: 'background 120ms'`** on cards (line 105) and rows (`LanesView.tsx:100`). 120ms isn't in the duration tokens — closest is `--duration-fast` (100ms) or `--duration-normal` (150ms). Snap.
- **No `prefers-reduced-motion` consideration.** Lane chevron rotates with `transform` (`LanesView.tsx:46`) using a hardcoded 200ms — should respect reduced motion.
- **EmptyStateArt is not used.** `nothing here` and `no tasks match` are literal italic strings. Rule 29 says "Brand primitives live in `src/components/` — use them." `EmptyStateArt` exists. The Empty State component matrix has `EmptyState` on 15 portal pages — not on MyTasks because MyTasks rolls its own.

## 7. Edge cases / failure modes

- **Tasks with no assignee.** `useTasks({ assignee: userSlug })` filters to *assigned-to-me* tasks, so unassigned never appears in MyTasks. But "tasks I created without assignee" or "team tasks where I'm `claude-ai` proxy" are invisible. Probably correct behavior for "My Tasks" but should be documented; users ask "where's the task I just created" because GlobalQuickAdd defaults assignee to `emailToSlug(user.email)` per Rule 34.
- **Tasks where `userSlug` is null.** When auth hasn't resolved, `useTasks(undefined)` fetches *all* tasks (`index.tsx:40`) — so on the auth race condition the page flashes the global task list before settling on the user's. Add `enabled: !!userSlug`.
- **0 tasks empty state.** When the user is genuinely new and has 0 tasks, the page renders 5 empty columns each with "nothing here" italics, plus 0 visible in the count. There's no "create your first task" CTA. Compare the rest of the Hub which uses `<EmptyState ... action="Create task">`.
- **1000+ tasks (future).** No virtualization → DOM weight + filter-recompute time grows linearly. Today the median user has ~30; Nick has 600+.
- **Long titles.** ColumnsView clips to 2 lines (`-webkit-line-clamp: 2`, line 111). LanesView truncates to `maxWidth: 360` (line 105). ListView `whiteSpace: nowrap` + ellipsis (line 85). Three different behaviors for the same data. A title like "Re-run RR4 for K23 mechvent CLIF cohort with corrected SaO2/FiO2 censoring per reviewer 2 comment 4" — Columns shows ~80 chars, Lanes shows ~50, List shows ~30 (depending on column width). Title hover does NOT show full title in any view (no `title={task.title}` on the title element in any of the three components).
- **Subtask-heavy task.** TaskDrawer renders all subtasks (line 148) — no virtualization. A task with 80 subtasks renders 80 rows.
- **Blocked task with `task.blocked_by` set.** The drawer shows `blocks` (downstream — what this task blocks) at line 154. `blocked_by` (upstream — what blocks this) is never rendered. `TaskDetailPanel` does both. Half the dependency graph is invisible.
- **Cross-project tasks (project deleted).** If `task.project_id` references a project that was deleted, `projectsByPid.get(...)` returns undefined → renders `—`. No "project deleted" hint.
- **Snoozed tasks.** No "snooze until" representation. Snooze just bumps due_date. So a task snoozed +1d looks identical to a task naturally due tomorrow — there's no provenance signal. CD spec called for a 💤 chip; not present.
- **Completed (showCompleted toggle).** "Hide completed" is the default per `index.tsx:64`. With it OFF, completed tasks render with `opacity: 0.5` + strikethrough. With 200 completed tasks turning the toggle OFF kicks 200 dimmed rows into view at once with no virtualization → noticeable scroll jank.
- **Saved view with stale project_id.** A saved view captures `project=manuscript-2024`. That project gets deleted. Reapplying the view filters to a project that no longer exists → 0 tasks → empty state with no hint that the saved view targets a tombstone.
- **localStorage quota for `today_state_<date>`.** Plan-today + promote write to `today_state_<YYYY-MM-DD>` keys daily, never garbage-collected. After a year that's 365 keys. They're small but unbounded. Add a sweep on read that drops keys older than ~14 days.

## 8. Open questions for PI

1. **Is the Move popover actually used?** It's a 5-click path to do what a single drag-drop would. Tracking: does anyone except Nick ever invoke `group_override`? If usage data is sparse, consider promoting drag as primary and removing the popover.
2. **Three views for ~19 academics — is anyone using all three?** The `localStorage.mt_view` distribution would tell you whether to keep all three or simplify. CD spec was confident "List view = power mode." Is that what mentees want, or do they live in Columns?
3. **Should `Tasks` (the team-wide page) and `MyTasks` share the same view picker UX?** Right now `/portal/tasks` uses legacy `TaskGridView` (with virtualization, inline editing, drag, swipe), `/portal/my-tasks` uses this new bespoke tree (with none of the above). A team member who learned MyTasks first hits Tasks and has to re-learn the entire interaction model. Would unifying around `TaskGridView` (or extracting a `<TaskListSurface>` with view modes) be worth the consolidation?
4. **Is `Mentee` filter relevant for non-PI users?** A trainee viewing their MyTasks doesn't have mentees. Should the chip hide for `member_type !== 'PI'`? (Pulling `useAuth().user.member_type` is cheap.)
5. **Does "Plan today" from MyTasks actually flow to TodayPage?** It writes `today_state_<date>` localStorage which TodayPage reads on mount. But cross-tab sync is via storage events and TodayPage doesn't seem to listen (would need to verify on the Today audit pass). If Nick plans 5 tasks on MyTasks then switches tabs to Today, do they appear? If the tab was already open: probably not without a manual refresh.
6. **Should completed tasks in MyTasks show their completion date?** Currently they show `updated_at` only. Sorting "completed today vs completed last month" is impossible without it.
7. **`SavedViews` is per-device localStorage. The hook docstring promises a v2 D1 table. Is that on the Phase 40 roadmap, or has it slipped?** A user who flips between work laptop and home laptop loses their saved views.
8. **Bulk archive uses `window.confirm()` for safety. Acceptable, or should it move to a "type DELETE to confirm" modal for the 50-task case?** A misclick on bulk archive after selecting 200 tasks is unrecoverable except via D1 admin restore.

---

**Summary for the synthesis pass:** UnifiedMyTasks shipped the *layout* of three coordinated views well (TopBar contract, useTaskFilter, byGroup memoization, URL round-trip) but skipped the *behaviors* the rest of the Hub had earned: inline editing, virtualization, cache-subscribed drawer, drag-to-reclassify, swipe-to-complete, focus-trapped modal a11y, EmptyState/PageHeader primitives. The fix path is clear and mostly compositional rather than architectural — adopt `TaskDetailPanel`, restore inline edit cells, wire drag, virtualize. Estimated effort to close P0+P1: 2–3 sessions. Estimated effort to close everything: 5–6 sessions. The legacy `/portal/my-tasks-legacy` should remain mounted until P0s are closed; right now it's the more functional surface.
