# SUPPLEMENTAL TICKETS — Cold-Audit Merge (2026-06-09)

Findings from the independent cold audit (4 lenses: code-UX, code-visual, live-prod screenshot judge on
`review/claude-design-20260609T-audit/`, width ground-truth) that the Claude Design round (TICKETS.md)
did not cover. **Nick approved merging these INTO this round (2026-06-09)** — they slot into TICKETS.md's
build-order phases as noted. Same guardrails as TICKETS.md (Today/cockpit/plan-model OUT; extend shipped
primitives via props; List power-grid protected; dark-first; axe-AA; PATHS routing).

Evidence provenance: file:lines verified against HEAD at audit time (2026-06-09). Re-verify before editing —
the round's earlier tickets may move lines.

---

## S1 · Deep-link consumer primitive — `?open=` / `?openTask=` **[HIGH — the #1 no-dead-ends finding]** · M
**Build-order slot: phase 3 (No dead ends).**
**Problem.** Task deep-links are generated in 6 places and consumed in ZERO:
generators = `api/routes/search.ts:238-240` (task → `/portal/projects/{slug}?openTask=` or `/portal/my-tasks?open=`),
`search.ts:412` (task notes), `:432` (task comments), `CommandPalette.tsx:338` (palette task pick),
`TaskDetailPanel.tsx:303` ("Copy task link"), `TaskContextMenu.tsx:418` ("open in new tab").
Consumers: none — `MyTasks/index.tsx:79-91` URL-sync effect actively STRIPS `open` on first render;
`ProjectDetail.tsx:199-215` reads only `tab`. Search→task, ⌘K→task, copy-link→teammate all silently dead-end.
**Fix.** One consumer effect per surface: MyTasks honors `?open=<taskId>` (open the detail drawer/panel for that
task, then strip the param); ProjectDetail honors `?openTask=` (`setSelectedTask`). Keep it a small shared helper
(`useOpenParam(key, onOpen)`) so future surfaces adopt it.
**Also fix in the same class:** `search.ts:458` emits `/portal/decisions?open=<id>` — DecisionsPage has no
`useSearchParams` at all; add the consumer (scroll-to + expand the decision).
**Accept.** Clicking a task search result / ⌘K task / pasted task link opens that exact task. Decision results open
that decision. Params strip after consumption (no stale re-opens on back-nav).

## S2 · Fake undo on bulk snooze **[HIGH — trust]** · S
**Slot: phase 3.**
**Problem.** `ProjectDetail.tsx:261` and `DeadlinesPage.tsx:93`: `showUndo('Snoozed N task(s) +Nd', () => {})` —
the undo callback is a NO-OP. Both loops also silently skip no-due-date tasks.
**Fix.** Capture prior due dates before the mutation; undo restores them. Toast reports skipped count
("3 snoozed · 1 skipped (no due date)").
**Accept.** Snooze → Undo restores the exact prior due dates (verify via API read-back). No silent skips.

## S3 · ProjectDetail category editor writes retired values → silent revert **[HIGH]** · S
**Slot: phase 3.**
**Problem.** `ProjectDetail.tsx:756-765` offers the legacy 4-bucket (`clif/lab/nate/mentee`); the API allowlist is
canonical 3-bucket (`api/routes/projects.ts:519`); every change 400s → optimistic revert with zero feedback.
A project with category `MNCCORE` shows the raw token (no matching option).
**Fix.** Use the shared canonical `CATEGORY_OPTIONS` (same source Projects.tsx/ManuscriptsPage use).
**Accept.** Category edits on ProjectDetail persist; all 3 canonical values render labeled.

## S4 · Manuscripts page identity — stage ≥ writing **[HIGH — system-of-record trust]** · M
**Slot: phase 4 (Consolidation), before/with P2-1 adoption on Manuscripts.**
**Problem.** `ManuscriptsPage.tsx:159` filter `p.status !== 'published' || p.stage === 'published'` is a tautology
(`status` enum is `active/waiting_external/blocked/done`, never `'published'`) → ALL projects render as manuscripts
("Admin Tasks", "ATS 2026 Conference" listed on live prod; count 78 = project count).
**DECISION (Nick, 2026-06-09): a manuscript = project with canonical stage ≥ writing** (`writing / submitted /
revisions / accepted / published`; UI 6-stage mapping via `stageNormalize.ts`). Zero data entry, self-maintaining.
**Fix.** Replace the filter with a stage-set check through `normalizeStage()`/canonical vocab. Counts, pipeline
view, and trophy cards follow. Earlier-stage projects appear only on Projects.
**Accept.** Manuscripts shows only stage≥writing projects; the page count reflects that subset; no admin/working-group
rows. Projects page unchanged.

## S5 · Activity feed: anonymous actors + broken day grouping **[HIGH]** · M
**Slot: phase 4.**
**Problem (live prod, screenshot-verified).** Every Activity row's actor renders "anonymous"; "Most active: anonymous"
in the header; the "Jun 9, 2026" day header repeats before EACH entry instead of grouping; redundant "Task" type pill
per row; page renders ~14.7K px tall with no pagination.
**Fix.** (a) Resolve actor slug→display name via `getPersonInfo()` at render (and find why the feed rows carry no/
unresolvable actor — if `activity_log.actor` is empty at write, fix the write site); (b) group-by-day properly (one
header per day); (c) drop the type pill when a type filter is active; (d) paginate or windowed-load.
**Accept.** Real names on rows; one date header per day; page loads a bounded window.

## S6 · Skeleton-as-final-state class **[HIGH]** · S-M
**Slot: phase 4 — fold into P2-7 (empty/loading once) as additional acceptance targets.**
**Problem (live prod).** Ask-the-Lab shows 3 ghost skeleton cards with "0 open questions"; Mentee Milestones shows a
permanent shimmer table under three "0 upcoming · 0 done" cards; Deadline Cascade shows a full page of skeleton rows
with "0 deadlines tracked". Shimmer-as-final-state reads broken.
**Fix.** When fetch resolves to 0 rows, swap skeleton → the shared designed `EmptyState` (Narratives page is the
in-house template). This is P2-7's shell contract — these 3 pages are the acceptance checklist additions.
**Accept.** No skeleton persists after data resolves on Ask-the-Lab / Mentee Milestones / Deadline Cascade.

## S7 · z-50 modals sit at dropdown z — layering bug **[HIGH per visual-consistency audit]** · S
**Slot: phase 4 — fold into P2-4 (one modal shell).**
**Problem.** `AskTheLab.tsx:473` + `MeetingNotesPage.tsx:265` hand-rolled modals use Tailwind `z-50` = `--z-dropdown`
(50) → dropdowns can layer above the modal backdrop.
**Fix.** P2-4 already routes MeetingNotes through `ui/Modal`; include AskTheLab's modal too (or at minimum bump to the
modal z token).
**Accept.** No portal modal shares a z-value with dropdowns; AskTheLab + MeetingNotes dialogs use `ui/Modal`.

## S8 · Branded entity-not-found page · S
**Slot: phase 4.**
**Problem (live prod).** "Project not found" / "Meeting not found" are bare undesigned H1s with no recovery path.
**Fix.** One shared `EntityNotFound` component (EmptyStateArt + search link + recent/sibling links + back), used by
ProjectDetail / MeetingDetail / MeetingPrep (and any `:slug`/`:id` detail page).
**Accept.** Deep-linking a bad slug lands on a branded state with ≥2 onward actions.

## S9 · Meeting agenda drag-reorder snaps back · S
**Slot: phase 3.**
**Problem.** `MeetingDetail.tsx:255-269` `handleAgendaDragEnd` computes `arrayMove` + POSTs but never writes the new
order to state/cache → visual revert until refetch (the action-items reorder at `:271-279` does it right).
**Fix.** Mirror the action-items pattern: optimistic local order + cache write.
**Accept.** Dragged agenda item stays where dropped; survives refetch.

## S10 · ⌘K palette category-filter commands are no-ops · S
**Slot: phase 3.**
**Problem.** `CommandPalette.tsx:280-296` navigates to `PATHS.projects + '?category='` but `Projects.tsx:129` keeps
category in local state and never reads the URL (ManuscriptsPage DOES read it — `:104-113`).
**Fix.** Projects reads `?category=` on mount/param-change (same pattern as ManuscriptsPage).
**Accept.** ⌘K "Filter CLIF Projects" lands on Projects pre-filtered.

## S11 · Ctrl/Cmd+N quick-add shortcut can never fire · S
**Slot: phase 3 — fold into P2-10 (one capture surface).**
**Problem.** `GlobalQuickAddModal.tsx:246-262` binds Cmd/Ctrl+N — browser-reserved (new window); pages cannot
intercept it in Chrome/Edge/Firefox. The advertised capture shortcut is dead.
**Fix.** Rebind to an interceptable combo (recommend `q` single-key when no input focused, matching Ideas' `n`
precedent) and update every hint surface that names the old shortcut.
**Accept.** The documented shortcut opens quick-add in Chrome/Edge/Firefox; no hint text references Cmd+N.

## S12 · Inert grant milestones on Deadlines · S
**Slot: phase 4 — rides P2-3 (field-editor to data pages).**
**Problem.** `DeadlinesPage.tsx:543,569-586,600-610`: milestone rows un-clickable, status renders `—`, date read-only,
grant name not a link — while `useUpdateGrantMilestone` already exists (Grants → Post-Award).
**Fix.** Render the milestone status editor here (existing mutation) + link the row to its grant.
**Accept.** Milestone status editable from Deadlines; grant name navigates.

## S13 · Calendar: deadline/task events un-clickable · S
**Slot: phase 3.**
**Problem.** `CalendarPage.tsx:358,468,536`: `Wrapper = e.type === 'meeting' ? Link : 'div'` — only meetings open.
**Fix.** Tasks open the task (via the S1 deep-link param on MyTasks); deadlines navigate to Deadlines anchored/filtered.
**Accept.** Every calendar event type responds to click with a sensible destination.

## S14 · Task detail panel cul-de-sac: dead blocked-by click + no project link · S
**Slot: phase 3.**
**Problem.** `TaskDetailPanel.tsx:566` wires `TaskDependenciesSection` `onOpenTask={() => {}}` — clicking a blocking
task does nothing. No path from a task to its project's page anywhere in `tasks/detail/*`.
**Fix.** Pass a real `onOpenTask` (panel already has task-swap plumbing via onPrev/onNext); add an "→ open project"
link beside the Project field.
**Accept.** Clicking a dependency opens that task; project link navigates to ProjectDetail.

## S15 · Ideas → project promotion · M
**Slot: phase 4.**
**Problem.** No promote/convert anywhere in `IdeasPage.tsx` — the board's telos (idea→project) requires retyping
everything in CreateProjectModal elsewhere.
**Fix.** "Promote to project" on approved cards → CreateProjectModal prefilled (title/description/submitter) →
on create, archive the idea with a link to the new project.
**Accept.** One click from an approved idea to a prefilled project create; idea auto-archives with back-link.

## S16 · Create flows end in silence · S
**Slot: phase 3.**
**Problem.** `useCreateProject` (`useProjectMutations.ts:9-27`) — no toast, no navigation; modal closes and the new
project materializes somewhere in a sorted list. ProjectDetail's `createTask` (`:2054-2060`) likewise.
**Fix.** Success toast with "Open →" action on every create (project, task, idea, question). Pattern exists:
`handleDuplicateProject` navigates; UnifiedMyTasks toasts.
**Accept.** Every create surfaces a toast with a working "Open →".

## S17 · One stage-editing grammar · M
**Slot: phase 4 — rides P2-3.**
**Problem.** Same field, three grammars: Projects list = instant NO undo (`Projects.tsx:108-126`); Manuscripts =
instant + undo (`ManuscriptsPage.tsx:153-156,698-704`); ProjectDetail = confirmation banner (`:786-793,1552-1611`).
**Fix.** Standardize on instant + undo (design rule 8) on all three; kill the confirmation banner.
**Accept.** Stage edits behave identically (instant, undoable) on Projects, Manuscripts, ProjectDetail.

## S18 · "Notes are private" copy is false · S
**Slot: phase 3 (copy-only; M5 does the real privacy split later).**
**Problem.** `ProjectDetail.tsx:1877-1878` + `TaskDetailPanel.tsx:1040` tell users notes are "private", but the Notes
tab renders for every viewer; the notes→description privacy split is pending M5 (per CLAUDE.md). Users are invited to
write candid notes into a team-visible feed.
**Fix.** Copy now says "informal progress log — visible to the team". Leave the M5 architecture alone.
**Accept.** No UI copy claims notes are private until M5 ships the split.

## S19 · Visible-data-hygiene chokepoint: slug→name everywhere · S
**Slot: phase 4 (pairs with S5).**
**Problem (live prod).** "Welcome back, nick-ingraham" (`MyItems`); PI column mixes "Nick Ingraham"/"nick"/blank
(Projects/Manuscripts); avatar fallback styles mixed in one column.
**Fix.** Render people via `getPersonInfo()` (Critical Rule 5) at the offending sites; one avatar fallback style.
**Accept.** No raw slug renders as a display name on Personal/MyItems/Projects/Manuscripts/Activity.

## S20 · Today first-viewport redundancy (LIGHT TOUCH — Today structure is out of scope) · S
**Slot: phase 5 (polish), narrowly.**
**Problem (live prod).** "9 overdue" renders 3-4× in the first viewport (pill row, DAY SCORE subtitle, NEEDS
ATTENTION rail, coral row labels); three empty instructional bands stack (calendar hint + two drop-zone hints);
RIGHT NOW hero truncates its task title while the same task renders in full below; permanent how-to micro-copy
under the H1.
**Fix (visual only, NO plan-model/IA changes).** Say overdue once with authority (rail keeps it; day-score subtitle
drops the dupe; pills become filters); collapse empty timeline/planned sections to single-line affordances; let the
hero title wrap to 2 lines (it should show `short_title` per Rule 68); demote the how-to copy to a dismissible hint.
**Accept.** One overdue statement above the fold; no stacked empty drop-zone hints; hero title readable.

## S21 · Misc visual drift (from the consistency lens) · S
**Slot: phase 5 — fold into P1-8's sweep checklist.**
- `ManuscriptsPage.tsx`: 7× literal `0.12s ease-out` transitions → duration tokens.
- `InsightsPage.tsx:240` + `ManuscriptsPage.tsx:260`: rogue `paddingBottom: '6rem'` (PortalLayout owns bottom clearance).
- `SessionHistory.tsx:177` Fraunces on a portal stat number (undocumented `--font-display` creep; MetricCard
  `variant="display"` is the only sanctioned use).
- 23 `onMouseEnter/Leave` JS-hover sites (`MyTasks.tsx:684+`, `PersonalPage.tsx:132+` etc.) → CSS hover.
- `GrantsPage.tsx:568` `col-header-row` class has no CSS rule anywhere (dead class — delete or define).
- Meeting H1s render literal `--` double-hyphen ("Biweekly Meeting -- April 07") → normalize to em-dash at render.
- Analytics "Idea" appears twice in Pipeline Distribution (two buckets) → canonicalize through `normalizeStage()`.
- Promo coach-marks inside toolbars (Projects "Try Pipeline view" toast occludes the Pipeline toggle mid-word;
  Deadlines "Switch to Timeline") → dismiss-once and never overlapping interactive chrome.
- Deadlines dead columns: TYPE all-"Task", STATUS all-"To Do", identical avatar ×22 → auto-hide single-valued columns
  (DataPage shell concern).
- Projects pin star `opacity: 0.15` 12px target (`Projects.tsx:486-495`) → P1-11 floor applies.
- ProjectDetail tasks-tab "Copy" button gives zero feedback (`:1960-1971`) → flip-to-check like its siblings.
- Decisions page leads with eight always-expanded "What was the outcome?" forms before any content
  (`DecisionsPage`) → collapse to one-line "Record outcome →" prompts; log first.

---

## Already DONE this session (do not redo)
- TICKETS P3-1 (dead `handleUpsertTodayMd`) = commit `d56db3e8`.
- TICKETS P3-2 (legacy shim) = commit `6b120af2` — NOTE: only the 8-line `UnifiedMyTasks.tsx` re-export shim was
  deleted; the real 1,376-line legacy page at `/portal/my-tasks-legacy` (`src/pages/portal/MyTasks.tsx`) is still
  routed and is a `/substrate-swap`-gated retire (separate decision).
- TICKETS P3-3 (Personal→PATHS) = commit `825938c6`.
- "Secondary/flag" Narratives contract = commit `1f281a1e` (+ canonical `stageLabel()`/`stageColor()` shipped in
  `stageNormalize.ts` — S4/S17/P2-9 adopters should use these, not new maps).
