# TICKETS — Polish + Workflow Round (2026-06-09)

Prioritized backlog from the visual-polish + workflow-efficiency + no-dead-ends audit.
Companion to `Design Audit — Polish & Workflow.html`. North-star: **a busy PI sits down and falls in love using it.**

**⛔ Out of scope (own session):** the Today page, the daily-cockpit IA (Today vs My Hub vs PB Sector), the operating-day plan model (localStorage-vs-Hub split-brain). No ticket below touches them.

**⚠️ Guardrails — honor the shipped primitives:**
- Extend the shared `<TaskRow>` / `TaskQuickEditChips` **via props** — never re-fork a per-surface row.
- My Tasks **List view is the protected power-grid** (j/k/e/x + inline-edit columns) — do NOT unify it to inline-expand.
- Dark-first; columnar tables on data pages (cards = dashboards only); rationed color; opacity ≥0.85 floor on readable dark text; no compound-opacity; hex-pinned palette (axe-AA).
- All gated routes under `/portal/*`; nav via `src/constants/paths.ts`.

Effort: **S** ≤½ day · **M** ~1–2 days · **L** ~3+ days.

---

## ✅ Decisions resolved up front (Nick, 2026-06-09 — no stop-gates; these replace any mid-build "ask")
1. **Width (P1-1):** *Principle over px.* Hold the fixed left edge / anchored primary column; let the widest real table set the actual `--col-main` width so nothing horizontally scrolls. The tokens (band/main/rail) are the mechanism, not exact mandated pixels.
2. **Priority (P1-12):** Overdue floats to the top **by default** on My Tasks + data pages. In the List power-grid, the user's column-sort overrides when active.
3. **Honest clock (P1-13):** Show the truth even when ugly — `"unknown / never synced"` rather than any green "fresh" that isn't real. Never a comforting fake.
4. **Staleness (P2-9):** Unify the **definition/mechanism** (days-since-meaningful-movement), but keep **sensible per-domain default thresholds** (e.g. task ~10d, manuscript ~30d), all surfaced in Settings — not one blanket number.
5. **Capture (P2-10):** The **⌘K quick-add modal is the single canonical capture** everywhere; the inbox becomes a *view* of captured items, not a separate capture UI.
6. **ProjectDetail (P2-5):** Collapse to **one chronological activity stream**; Notes / Comments / All become **filters** over it (separate tabs go away).
7. **Inline-edit (P2-3):** On data pages, **status · due date · owner · priority · project** are click-to-edit; heavier edits stay on the detail page.
8. **Mobile (P2-6 / P3-5):** Do the **full mobile responsive sweep this round** (360 / 390 / 768 + iPad-portrait), not just the no-dead-end fixes — Nick is desktop-first but wants it right for the 20-person team.
9. **Affordance visibility (P1-11):** Conservative default — discoverable but still quiet (grip ≥0.6, caret/meta at the readable tier but subordinate). Fine-tune live later.
10. **AI tab (P1-9):** Remove it; relocate the Team Directory link into the Team / Directory nav.

---

## P1 — Make it right (visual consistency + click-efficiency + dead controls)

### P1-1 · Anchored-column width rule **[TIER-1]**  · M
**Problem.** No single source of truth for the centered column. `.content-container` = 1440px (`src/index.css:920`); My Tasks Lanes caps at 1100px (`src/pages/MyTasks/views/LanesView.tsx:50`); Columns = `colCount×280` (h-scroll); List = virtualized. The column visibly jumps on navigation and even between the three My Tasks views.
**The principle (Nick, 2026-06-09).** The felt problem isn't the number — it's that *the focus moves when you switch tabs*, while some pages waste a big empty middle. So don't pick "two max-widths." **Anchor the primary column:** its left edge + measure stay identical on every page; a right-rail helper extends *outward* into the space beside it (never recenters or widens the main column); pages with no rail leave that space empty rather than re-centering.
**Fix.** Three tokens, applied via the DataPage shell (P2-1):
- `--content-band: 1232px` → the centered band, identical on every page (= main + gap + rail).
- `--col-main: 880px` → the anchored primary column (tables, lists, detail). Same left edge + width on **all data pages + all three My Tasks views**.
- `--col-rail: 320px` → optional right rail (Today's context, filters). Lives beside the column; absent = empty, column does NOT expand.
- Dashboards (pure card grids) may fill the full `--content-band` — the one documented exception.
**Acceptance.** The main column's left edge is the same pixel on Projects, My Tasks (all 3 views) and Today. No `maxWidth` literal remains in `LanesView`; `.content-container` is replaced by the band/column tokens; navigating produces zero horizontal shift of the primary column. Columns still scrolls inside `--col-main`.
**Files.** `src/index.css`, `src/pages/MyTasks/views/{LanesView,ColumnsView,ListView}.tsx`, any `.content-container` consumers; the DataPage shell (P2-1) owns the band/column layout.

### P1-2 · Fix light-mode background inversion  · S
**Problem.** Light mode ships grey page + white cards (`--task-page-bg:#f5f5f5` behind `--task-panel-bg:#ffffff`) — a tint *behind* the cards, the inverse of Round-6 Rule #1. (`src/index.css:20, 95, 746, 1023–1024`.)
**Fix (see spec sheet).**
- `--page-bg` / `--task-page-bg` → `#faf8f3` (`--cream`, flat page = lightest layer).
- `--task-panel-bg` / card surfaces → `#f4f5f7` (`--ice`, step down).
- Card gets a `1px rgba(15,25,35,.06)` hairline instead of a drop shadow on a grey wash.
- **Dark mode unchanged** (`#0b1017` page / `#0f1923` card already correct).
**Acceptance.** In light mode the page is the lightest surface, cards a hair darker; no card "floats" on a tint. Verify on Projects, My Tasks (all 3 views), Manuscripts, Settings. axe-AA holds.
**Files.** `src/index.css`.

### P1-3 · First-click date control  · M
**Problem.** Editing a due date drills 3 levels: chip → raw `05/01` native field → OS calendar; presets are a separate strip. (`src/components/InlineDatePicker.tsx:162`, `:88+`, `:71–86`.)
**Fix.** Replace the native-input edit mode with a single popover that renders **on the first click**: inline presets (Today · Tomorrow · Next Mon · +1 Week) at top + a full in-app month grid (keyboard-navigable, today ringed, selection in gold) + a Clear in the footer. Pick a day or preset → optimistic write + close. Esc reverts; outside-click commits pending. (Working reference: the "Proposed" demo in the audit HTML.)
**Acceptance.** One click sets a date from either the grid or a preset. No native `<input type=date>` edit-mode state remains. Keyboard: arrows move day, Enter commits, Esc cancels.
**Files.** `src/components/InlineDatePicker.tsx` (+ shared by every surface that uses it — verify no regressions in ListView columns / Today drawer / Deadlines).

### P1-4 · Hunt the click-chain class  · M
**Problem.** The date picker names a class: any control that opens an "edit mode" showing a raw value instead of the rich control. Candidates: status (bare field before menu), project reassign (drills), inline title edits.
**Fix.** Audit every inline-edit affordance; the control IS the affordance — one click reveals all of it. Where a quick-edit chip exists (`TaskQuickEditChips`), the rich popover should open on first click, not a raw value.
**Acceptance.** Documented pass over all inline editors; each is ≤1 click to the rich control. No "edit mode shows raw value" patterns survive.
**Files.** `TaskQuickEditChips`, status/project editors, `InlineDatePicker` (done in P1-3).

### P1-5 · Kill MeetingNotes dead controls  · S
**Problem.** "Process Meeting" modal has a disabled "Upload Audio" coming-soon drop zone (`MeetingNotesPage.tsx:341`) and a "Process Transcript" that only toasts *"coming soon — AI not yet wired"* (`:258`).
**Fix.** Until AI is wired: hide the Audio tab entirely; make "Process" save the pasted transcript as a real meeting note (the honest, useful action). No promise the app can't keep.
**Acceptance.** No "coming soon" control in the modal; pasting a transcript + Process persists a note and closes optimistically.
**Files.** `src/pages/portal/MeetingNotesPage.tsx`.

### P1-6 · Replace every `window.alert()` with undo-toast  · S
**Problem.** Delete/duplicate/snooze failure paths fire native `alert()` (`ProjectDetail.tsx:298–329`, `MyTasks/index.tsx:185`, `SmartCompose.tsx:241`, `today/MorningThoughtCompose.tsx:84,100`).
**Fix.** Route all through the existing optimistic-mutation + undo/error toast. No native dialog for any action.
**Acceptance.** Grep for `window.alert(` returns zero hits in action paths; failures surface as toasts.
**Files.** the four above.

### P1-7 · Completed-row compound-opacity  · S
**Problem.** Done rows dim the *whole row* with `opacity: isDone ? 0.6 : 1` (`src/components/tasks/TaskRow.tsx:281`) *on top of* an already-muted title (`:303/:317`) — compound opacity, drops meta/due/project below the 0.85 floor (breaks Rule 43).
**Fix.** Remove the whole-row `opacity:0.6`. Doneness reads from the filled check + line-through + `INK_MUTED` title; mute the border a touch if more separation is wanted. Metadata stays ≥0.85.
**Acceptance.** Completed row's metadata is fully legible; row still reads "done." No element inherits stacked opacity.
**Files.** `src/components/tasks/TaskRow.tsx`.

### P1-8 · Token / spacing / radius snap sweep  · M
**Problem.** Literal px paddings/radii/icon-sizes drift a few px off the 8px grid + radius scale — reads "almost aligned" everywhere.
**Fix.** Sweep inline literals → `--sp-*`, `--radius-*`, token sizes from `colors_and_type.css`. Add a lint to flag raw px in style props where a token exists.
**Acceptance.** Spot-check 6 surfaces: paddings on the 4/8/12/16/24 grid; radii from the scale; no stray `13px`/`7px` literals where a token fits.
**Files.** repo-wide style props; `src/index.css`; lint config.

### P1-9 · Settings AI tab — remove the placeholder  · S
**Problem.** AI tab is "placeholder inputs" — really just a Team Directory link (`SettingsPage.tsx:197`).
**Fix.** Remove the tab (Nick's call, 2026-06-09) and relocate the Directory link to where it belongs (Team / Directory nav). No empty tab.
**Acceptance.** No placeholder AI tab; Directory link reachable from a sensible home.
**Files.** `src/pages/.../SettingsPage.tsx`.

### P1-10 · Heartbeat loaders — retire the spinners  · M
**Problem.** `HeartbeatLine.tsx` is a reusable ECG-pulse component whose own docstring lists *"Loading skeletons (replacing spinners)"* — reduced-motion safe, shares the favicon trace. Yet ~7 surfaces still spin a raw CSS spinner (incl. the **app-boot screen**) and dashboard cards show literal *"Loading…"* text. A generic spinner is the opposite of "feels designed"; the lab's own pulse is right there.
**Fix.** Route every route-level + card loader through `HeartbeatLine` (content skeleton for tables). Keep inline button states; kill all full-page/route spinners + "Loading…" strings.
**Acceptance.** Grep for `animate-spin` (route/page scope) and `Loading…` returns zero in those contexts; loaders show the heartbeat or a skeleton.
**Files.** `App.tsx:154`, `Digest.tsx:1010`, `MeetingDetail.tsx:228`, `MyItems.tsx:668`, `TrajectoryPage.tsx:1218,1500`, `ProjectComments.tsx:103`; dashboard cards (`FileActivityCard`/`EmailDraftsCard`/`PomodoroStatsCard` "Loading…"); `HeartbeatLine.tsx`.

### P1-11 · Affordances visible, not hover-summoned  · S
**Problem.** Nick's rule is *inline-edit affordances always visible (▾)*, but `TaskRow` dims the expand caret + meta to `opacity:0.35` until hover (`:329,:340`) and the grip to `0.3` (`:194`). On desktop the "more here" signal hides until hover; **on touch there's no hover**, so it's permanently ghosted — a discoverability dead end on mobile.
**Fix.** Raise resting opacity to a discoverable floor (grip ≥0.6; caret/meta at the readable tier), keep hover as subtle emphasis, not a reveal.
**Acceptance.** Caret + grip visible without hover on desktop and on touch; row still reads calm; no affordance below the readable opacity floor at rest.
**Files.** `src/components/tasks/TaskRow.tsx:194,329,340`.

### P1-12 · Priority you can see without reading **[TIER-1]**  · M
**Problem.** Nick's #1 daily friction (Jun 9): *"I don't see clearly my main priority… so much overdue but not organized, I read through so much before I know where to focus."* On My Tasks + data pages, overdue is a small coral chip lost in a flat list; nothing floats slipping work to the top.
**Scope note.** The cockpit-level cure (a landing that surfaces the #1 thing) is the **deferred Today session**. This ticket is the in-scope half: make overdue unmistakable + sorted on the list/data surfaces.
**Fix.** Default-sort overdue to the top (oldest-late first) within each group; give the overdue group one coral header with a live count; carry the coral accent on the row's left edge so it reads in one sweep. Apply via the DataPage shell (P2-1) so My Tasks + Projects + Manuscripts + Grants + Deadlines all behave the same.
**Acceptance.** Opening any list/data page, overdue items are visually unmistakable and ordered oldest-late-first without applying a filter; "where do I focus" is answered by the page's shape before reading.
**Files.** `MyTasks/views/*`, `MyTasks/hooks/useTaskFilter.ts` (default order), `TaskRow` overdue treatment, the DataPage shell (P2-1).

### P1-13 · Honest sync clock  · S
**Problem.** `StatusBar`'s "Last synced" resets to `new Date()` on **any** react-query cache success (`StatusBar.tsx:8–22`) — it reflects the browser's last fetch from edge cache, NOT the real PB→Hub sync. It shows a green "just now" even when the actual sync (`hoursSinceLastSync()`, `today/constants.ts:121`) is days stale. Directly breaks Nick's "data current & correct" trust.
**Fix.** Point the status bar at the real PB→Hub sync timestamp (the one Today uses); coral past 24h per Rule 59. A green clock must mean fresh.
**Acceptance.** Status bar shows the true last-sync age and turns coral >24h; no path resets it to "now" on a mere cache read.
**Files.** `src/components/StatusBar.tsx`; reuse `hoursSinceLastSync()` / the real sync source.

---

## P2 — Consolidate (the primitives that collapse divergence)

### P2-1 · DataPage shell  · L
**Problem.** Projects / Manuscripts / Grants / Decisions / Deadlines each hand-roll filter + sort + view + density + loading + empty + width (`Projects.tsx:129`, `ManuscriptsPage.tsx:102`, `GrantsPage.tsx:382`, `DecisionsPage.tsx:751`). `TableControls` exists but "each page provides its own."
**Fix.** One `<DataPage>` shell owning chrome + the width rule (P1-1) + responsive breakpoints + empty/loading states. Pages pass data + columns + config.
**Acceptance.** The 5 pages share one shell; width + density + empty states are defined once; no per-page width literal.
**Files.** new `src/components/DataPage.tsx`; the 5 pages; `TableControls`.

### P2-2 · Extend shared `<TaskRow>` into remaining forks  · M
**Problem.** Forks remain: ListView grid row (`ListView.tsx:190`), Personal TodayHero rows (`PersonalPage.tsx:837`), Deadlines task rows (`DeadlinesPage.tsx:500`).
**Fix.** Extend the shared row **via props** (grid/compact/hero variants). List view keeps its power-grid behavior — add a `variant="grid"` prop, do NOT replace its keyboard model.
**Acceptance.** One row component renders all four surfaces; no copy-pasted row JSX remains; List keyboard nav intact.
**Files.** `src/components/tasks/TaskRow.tsx`; the three forks.

### P2-3 · Extend field-editor into remaining forks  · M
**Problem.** `TaskQuickEditChips` centralizes Status/Priority/Due/Project, but ListView (`ListView.tsx:66`) + Deadlines (`DeadlinesPage.tsx:568`) reimplement the handlers. And the data pages (Projects/Manuscripts/Grants) don't offer inline quick-edit of the common fields at all — Nick (Jun 9): *"mostly — the common fields (status, dates, owner)"* should be click-to-edit in place, heavy edits stay on the detail page.
**Fix.** Route ListView + Deadlines through the shared editor; delete duplicate handlers. **Extend the same editor to the data-page columns** so status / due / owner / priority / project are inline-editable (with the always-visible ▾ from P1-11) on Projects/Manuscripts/Grants — heavier edits still open detail.
**Acceptance.** One set of status/priority/due/owner/project handlers; ListView + Deadlines + the data pages all call it; those five fields edit inline with a visible affordance, no detail round-trip.
**Files.** `TaskQuickEditChips`; `ListView.tsx`; `DeadlinesPage.tsx`; the data-page column cells.

### P2-4 · One modal / sheet shell  · M
**Problem.** `ui/Modal` has portal + escape + focus-trap, but MeetingNotes (`MeetingNotesPage.tsx:242`) + CreateProject (`CreateProjectModal.tsx:67`) hand-roll their own.
**Fix.** Route both through `ui/Modal`. Define modal-vs-bottom-sheet **once**: bottom-sheet on mobile (<768px), centered modal on desktop, as a responsive prop on the shell.
**Acceptance.** Both dialogs use `ui/Modal`; one responsive modal/sheet rule; focus-trap + escape work in both.
**Files.** `src/components/ui/Modal.*`; `MeetingNotesPage.tsx`; `CreateProjectModal.tsx`.

### P2-5 · ProjectDetail — one activity stream  · L
**Problem.** ProjectDetail splits notes/comments/activity into tabs (`ProjectDetail.tsx:67`); Activity then re-embeds decisions/deps/updates/comments/actions (`ProjectActivity.tsx:51`) — same content twice.
**Fix.** One chronological activity stream; tabs become **filters over** it (Notes / Comments / All), not duplicate renderers.
**Acceptance.** No content appears in two tabs; switching tabs filters one stream.
**Files.** `src/pages/ProjectDetail.tsx`; `ProjectActivity.tsx`.

### P2-6 · Mobile coherence sweep — full pass  · M
**Problem.** Task rows + controls unaudited at 360/390/768px; iPad-portrait (768–1024) nav split-brain; status edits no-op on touch (P3-5). Nick is desktop-first but wants the **full sweep done this round** for the 20-person team (Jun 9).
**Fix.** Audit the three widths; ensure nothing clips/overlaps; titles wrap (not truncate); ≥44px hit targets; stacked-card breakpoints defined in the DataPage shell (P2-1).
**Acceptance.** Clean render + working touch at 360/390/768; no horizontal scroll; iPad-portrait nav resolves to one state.
**Files.** `DataPage` shell; `TaskRow`; nav components; `src/index.css` breakpoints.

### P2-7 · Define empty/loading states once  · M
**Problem.** Empty + skeleton states vary per page.
**Fix.** Standard empty + skeleton components consumed by the DataPage shell; one copy voice ("No tasks yet," etc.).
**Acceptance.** Every data page shows the shared empty/skeleton; no bespoke per-page variants.
**Files.** `DataPage` shell; shared `EmptyState` / `Skeleton`.

### P2-8 · Designed empty state into My Tasks + Today  · S
**Problem.** A real `EmptyState` + `EmptyStateArt` (8 lab illustrations) is used on ~20 surfaces, but the daily-driver surfaces fall back to bare italic text: `"nothing here"` / `"no tasks match"` (My Tasks all 3 views) and `"No meetings on today's calendar."` (Today timeline).
**Fix.** Route these through the existing `EmptyState` with the right `EmptyStateArt` variant + a clear-filters action. Folds into P2-7 (the shell owns empty states).
**Acceptance.** No bare-italic empty text in My Tasks or Today; "all caught up" reads as a designed state with art + action.
**Files.** `ColumnsView.tsx:75,98`, `LanesView.tsx:79`, `ListView.tsx:123`, `today/Timeline.tsx:165`; `EmptyState.tsx`, `EmptyStateArt.tsx`.

### P2-9 · One staleness truth  · M
**Problem.** "Stale" means four different things: `10d` on My Tasks chips (`ColumnsView/ListView`), `14d` in the dashboard + portal filter (`MyTasks.tsx:238`), `30d` for manuscripts (`manuscriptsStaleDays`), and *health-score < 50* for Projects (`Projects.tsx:48`). "What's slipping" never gives one answer. (Also: `last_meaningful_movement`/`stale_active_since` dropped in `rowToProject` — INFRA-8.)
**Fix.** One staleness definition — a single configurable `days-since-meaningful-movement` threshold (surface it once in Settings; the manuscripts threshold already models this). Every surface reads it; Projects "needs attention" reconciles to the same basis. Pairs with the honest clock (P1-13).
**Acceptance.** One threshold drives every "stale" chip/filter/sort; changing it in Settings updates all surfaces; Projects no longer uses a separate health-score definition for staleness.
**Files.** `MyTasks/*`, `ManuscriptsPage`, `Projects.tsx`, `useApiData.ts` (`rowToProject` — re-surface the dropped fields), Settings.

### P2-10 · One capture surface  · M
**Problem.** In-Hub capture is four slightly-different things — `GlobalQuickAddModal` (⌘K), `QuickCaptureInbox`, `QuickCaptureBar`, and Personal's own `QuickCapture` (`PersonalPage.tsx:147`). Nick (Jun 9) falls back to the Obsidian CLI because none is the one reliable capture. *(The full capture→act→talk-to-Claude loop is the deferred session; this ticket is the consolidation half.)*
**Fix.** One capture primitive, reachable everywhere (⌘K + a persistent affordance), that always lands the item reliably with optimistic feedback. Ensure "work on this" / promote is never a dead button.
**Acceptance.** A single capture component backs all entry points; capture always persists with a toast; no duplicate capture UIs remain.
**Files.** `GlobalQuickAddModal.tsx`, `QuickCaptureInbox.tsx`, `QuickCaptureBar.tsx`, `PersonalPage.tsx:147` → one primitive.

---

## P3 — Make sense (orphans + sensible placement + polish)

### P3-1 · Delete dead `handleUpsertTodayMd`  · S
Unregistered handler in `pb-today.ts` — unreachable. Delete. **Accept.** No reference remains; routes unaffected.

### P3-2 · Verify / retire legacy MyTasks  · S
Confirm the parked legacy implementation is unrouted; delete, or redirect to the canonical three-view page. **Accept.** One My Tasks reachable; legacy gone or redirected.

### P3-3 · Personal → route through `PATHS`  · S
`PersonalPage.tsx:974` uses hardcoded root paths. Route through `src/constants/paths.ts`. **Accept.** No literal route strings in Personal.

### P3-4 · Mentee-list hardcoded fallback  · S
`MenteeMilestonesPage.tsx:41` TODO ships a hardcoded mentee list. Source from data. **Accept.** No hardcoded fallback list.

### P3-5 · Mobile status-edit working touch path  · S
Status edits silently disabled on mobile (`MenteeMilestonesPage:697`, `DeadlinesPage:599`). Make the field-editor work on touch (it's the same primitive, P2-3) or don't render it. **Accept.** No control that no-ops on tap.

### P3-6 · Opacity ≥0.85 floor sweep  · M
Audit readable dark text for sub-0.85 opacity and compound stacks (beyond P1-7). Ration color to meaning (≤2 non-neutral per view). **Accept.** Spot-check passes; no compound opacity on readable text.

### P3-7 · One global density — compact default  · S
Round-6 handoff §6 said retire per-view `DensityToggle`; it still ships per view. Move to a single global density setting (Settings → default preferences), drive `--row-height` from it. **Default = compact** (Nick is the daily power user and wants maximum info density, 2026-06-09). **Accept.** No per-view density control; one global density applies everywhere; ships compact.
**Files.** `DensityToggle` consumers; `SettingsPage`; `useDensity` hook; `src/index.css` (`--row-height`).

---

## Secondary / flag (NOT this round)
- **v55 delegation workflow UI** (`waiting_on` / `promised_to` / `promise_date` / `next_checkin`) + commitments tracker — real feature build, later round.
- **ENG-only backlog** (not a design ticket) → WORKPLAN: Query-Resource primitive (real-empty vs error-empty); Canonical Research Stage model; **Narratives data-contract break** (stage colors can't match; `pub_date` vs `year`) — do not polish broken semantics.

---

### Build order (continuous — no stop-gates)
Execute top to bottom; later steps assume earlier ones. Dependencies noted.

**1 · Foundation (unblocks everything)**
- P1-1 Anchored-column width tokens → P1-2 Light-mode bg inversion → P2-1 DataPage shell (consumes the width rule; every data-page ticket rides it).

**2 · The felt "fall in love" wins** (Nick's three loves — calm · focus · trust)
- P1-12 Priority-at-a-glance · P1-13 Honest sync clock · P2-9 One staleness truth · P1-3 First-click date control · P1-10 Heartbeat loaders · P1-11 Visible affordances · P1-7 Completed-row opacity.

**3 · No dead ends**
- P1-5 MeetingNotes dead controls · P1-6 alerts→undo-toasts · P1-9 remove AI tab · P2-10 One capture surface.

**4 · Consolidation** (rides the shell + primitives)
- P2-2 shared row into forks · P2-3 field-editor + inline common-fields · P1-4 click-chain class (after the date control + editor land) · P2-4 one modal/sheet · P2-5 ProjectDetail activity stream · P2-7 empty/loading once · P2-8 empty states into My Tasks + Today.

**5 · Polish + cleanup** (low-risk, any time near the end)
- P1-8 token snap sweep · P3-1 delete dead handler · P3-2 retire legacy MyTasks · P3-3 PATHS routing · P3-4 mentee fallback · P3-7 compact-default global density · P3-6 opacity floor sweep · P3-5 mobile status-edit · P2-6 mobile coherence (full sweep — for the team).

The deep cures for Nick's #1 friction (a cockpit showing the top priority) and his CLI fallback (capture→act→Claude) are the **deferred Today/cockpit/plan session** — flagged, not attempted here.
