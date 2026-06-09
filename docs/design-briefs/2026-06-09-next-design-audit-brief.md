# Next Claude Design Audit — Synthesis Brief (2026-06-09)

> **Purpose.** This doc is the pointable brief for the next **Claude Design** (visual/UX) audit of the MN-CCORE Lab Hub. It fuses three inputs: (1) a cold **Codex** engineering/simplification audit (Level-1 primitives + loose ends), (2) a **Claude-side loose-ends/workflow inventory** grounded in the repo + WORKPLAN + the Round-6 design handoff, and (3) **what we know about Nick + what we've strived for**. Point Claude Design at this doc; the companion **audit prompt** is `docs/design-briefs/2026-06-09-next-design-audit-PROMPT.md`.
>
> Source artifacts (gitignored scratch): `Scratch/codex-hub-simplify-2026-06-09/` (Codex `synthesis.md`, `blind-spots.md`, `inventory.md`). Design intent of record: `review/MN-CCORE Lab Hub Design System (5)/design/{Handoff - Task UI Consistency Pass.md, CLAUDE.md}`.

---

## SCOPE THIS ROUND (Nick, 2026-06-09)

**This is a visual-polish + workflow-efficiency + "no dead ends" round. North-star: a busy PI sits down and *falls in love* using it.** In scope: making it look good (consistency, the bg fix, **width is Tier-1**), making every click do something real and fast, making sure every endpoint/control has a purpose, and making things sit where they make sense.

⛔ **OUT OF SCOPE this round — deferred to its own dedicated session:** the **Today page**, the **daily-cockpit IA** (Today vs My Hub vs PB Sector), and the **operating-day plan model** (the localStorage-vs-Hub split-brain). Nick: *"not ideal to have a local and a hub-based one, but that's where we are… that should be its own session."* **Do not restructure Today or the plan this round.** Today-related findings below are kept as evidence but tagged ⛔ DEFERRED.

---

## 0. Who this is for, and what we've strived for

**Nick Ingraham** — PI of a pulmonary/critical-care research lab at UMN. Physician-scientist running ~64 projects, 5+ mentees, multiple R01/R03 grants, CLIF-consortium work, manuscripts, and clinical duty. The Hub is **his operating surface AND the team's** (20+ members). Daily pattern: **morning triage → mid-meeting quick-wins → heavy context-switching**. He runs a parallel single-user "Peripheral Brain" CLI (brain.db) that syncs to the Hub (Cloudflare D1).

**The design ethos (decided 2026-04-01): operational, not editorial.** The Hub is a research operations center, not a magazine. Dark-first; columnar tables not card-stacks on data pages; inline editability with visible affordance; rationed color (one accent per view, color = meaning); density is not clutter; optimistic UI + undo, never spinners/alerts.

**The throughline of recent work — collapse divergence into single primitives; make wrong states unrepresentable; reduce surface area:**
- **Task-UI consistency pass (Round 6)** — one shared `<TaskRow>` replacing ~10 divergent renderers; one date control; status-as-truth; "one background layer"; fixed left edge. *Partially shipped — see §2.*
- **Project-identity convergence** — typed `proj_*` PK everywhere internal; slug = display-only leaf. *Just completed + deployed.*
- **Primitive-enforcement** — route DSL, runtime entity guards, typed write-results, defensive lints.

**Nick thinks in Level-1 primitives:** a fix that makes the bad state *unrepresentable by construction* beats a guard/patch that leaves the class alive. The shared `<TaskRow>` is the canonical example (one row kills ten). The next audit should hunt for the *remaining* divergence-classes one primitive could collapse.

---

## 1. The design intent we are holding (don't re-derive — build on it)

From the **Round-6 handoff** (`Handoff - Task UI Consistency Pass.md`) — the global rules in force:
1. **One background layer.** Page is the flat base (`--cream`); only cards/sections carry a surface (`--ice`). Never a second tint *behind* the cards. *(Handoff calls this "the single biggest 'feels heavy' fix.")*
2. **Square = complete, everywhere.** Multi-select = shift-click/long-press. Body-click = expand. (Shipped.)
3. **Titles never truncate; one fixed left edge** via a reserved indicator-dot slot. (Shipped.)
4. **`status` is the source of truth** for done-ness; `completed` still written. (Shipped on core surfaces.)
5. **Color rationed to meaning** — coral=overdue/urgent, gold=Right Now/AI/planned, teal=interactive/system, green=done.
6. One shared `<TaskRow>`; one date control (`InlineDatePicker`); one due helper (`isOverdue()` + `<DueLabel>`). (Shipped.)

From the **design CLAUDE.md** — Nick's **operating-day "B2" model** (the mental model for Today): pill-strip daily glance → "Right Now" promoted slot (not a task) → Timeline with drag-to-time-slot drop zones → always-expanded task groups (planned→active→done) → right rail (Hermes / Needs Attention / Projects / Pulse). Behaviors he explicitly called out: *body-click expands (never promotes)*, *all planned things in the swap queue*, *completed sinks to bottom of its group*, *Right Now compact by default*.

---

## 2. What actually shipped vs. intended (the loose ends)

> Grounded, cited inventory. Full detail + file:lines in the loose-ends agent output; key items here. **Nick hates being told something is "done" when it isn't** — these are the gaps.

### 2A. Round-6 acceptance items NOT met
- **Background scheme shipped INVERTED (light mode).** Intent: flat `--cream` (white) page + subtle `--ice` (grey) cards. Reality: `--page-bg`/`--task-page-bg` = `#f5f5f5` (grey) **page** + `--cream`/`--task-panel-bg` = `#ffffff` (white) **cards** → a tint *behind* white cards, the inverse of the rule, re-introducing the exact "feels heavy" look Rule #1 was meant to kill. (`src/index.css:20,95,746,1023-1024`; dark mode preserves the intended page-darker-than-card relationship, so this is **light-mode-specific**.)
- **Cross-page content WIDTH is inconsistent.** Data pages `.content-container` = **1440px**; My Tasks Lanes = **1100px**; Columns = `colCount×280` (scrolls); List = virtualized. The centered column visibly jumps Today→Projects→My Tasks, and even between My Tasks' own three views. (`src/index.css:920` vs `src/pages/MyTasks/views/LanesView.tsx:50`.)
- **DH-5** (the one tracked acceptance item): visual verify of ProjectDetail Key Links compact chips + editor Due-date box on live — never eyeballed (only 3 prod projects have key_links; CF-Access-gated).
- **Known divergence:** per-view `DensityToggle` retained despite handoff §6 saying "retire per-view density toggles" (deliberate, but a spec divergence).

### 2B. The design CLAUDE.md "next design session" queue — real status
| Queued item | Status |
|---|---|
| Settings → Calendar connect | ✅ DONE (`CalendarFeedsPanel`, Integrations tab) |
| Settings → **personal link shortcuts** (per-user `label→url` chips for `obsidian://`/`claude://`/local paths) | ❌ NOT BUILT |
| Settings → task-source connectors | ❌ NOT BUILT |
| Settings → **default-view preference** | ❌ NOT BUILT (only ad-hoc `localStorage.mt_view`) |
| Settings → keyboard-shortcuts help | ◑ `ShortcutHelp.tsx` exists but not surfaced from Settings |
| `/personal` (My Hub) design-language refresh | ◑ Got shared `<TaskRow>`, no dedicated refresh (INFRA-6 open) |
| `/portal/overview` (Lab Overview) rework as weekly-planning surface | ◑ Still card-grid; PAGE-5 open |
| Projects detail page (was "stub") | ✅ Now a full surface |
| Mentees detail page (was "stub") | ✅ Now rich |
| Settings **AI tab** | ◑ Self-described "placeholder inputs" — just a Team-Directory link |

### 2C. Stub / dead-control / fake-data surfaces
- **MeetingNotes "Process Meeting" modal has dead controls** — "Upload Audio" tab = disabled "coming soon" drop zone; "Process Transcript" only fires a *"coming soon — AI not yet wired"* toast. A PI in back-to-back meetings hits this dead end. (`MeetingNotesPage.tsx:258-262,341-354`.)
- **`window.alert()` failure paths** — violates the optimistic-UI+undo-toast ethos; jarring native dialogs on delete/duplicate/snooze failures (`ProjectDetail.tsx:298-329`, `MyTasks/index.tsx:185`, `SmartCompose.tsx:241`, `today/MorningThoughtCompose.tsx:84,100`).
- **Settings AI tab placeholder** (`SettingsPage.tsx:197`); **hardcoded mentee-list fallback** (`MenteeMilestonesPage.tsx:41` TODO); **PublicationDetail** decorative empty press-mentions (`:373`).

### 2D. Cross-surface inconsistencies
- **Two "what should I focus on" surfaces** with different data: Today's client-computed `HermesSuggestsCard` vs Dashboard's server `/api/proactive-brief` `ProactiveBriefCard`. One canonical brief wanted on Today.
- **Inline-edit parity:** My Tasks List = full inline-edit power-grid (deliberate, Rule 60); Columns/Lanes/Today-drawer = quick-edit chips. Three affordances over one model.
- **Background + width** (§2A) render *consistently inverted/inconsistent* across surfaces.

---

## 3. Level-1 Simplifying Primitives (Codex cold audit — verified)

> Codex (gpt-5.5, read-only, ~8.6% repo coverage) found the **big architectural primitives** the design-side inventory didn't. Headline findings spot-checked against real code (✓ verified). Full output: `Scratch/codex-hub-simplify-2026-06-09/synthesis.md`.

**Codex's verdict:** the biggest Level-1 win is a **single durable operating-day plan primitive**; the worst loose end is **meeting-capture dishonesty**; the top workflow win is making one true morning-triage + meeting-flow cockpit backed by the same persisted plan.

| # | Primitive | Class it collapses | Shape | Effort |
|---|---|---|---|---|
| 1 | **Durable Operating-Day Plan** ✓ | **Split-brain across 3 stores:** Today plan = `localStorage` (`useTodayState.ts:29`); MyTasks writes that *same* localStorage blob directly (`MyTasks/index.tsx:166`); PB Sector uses a *separate* D1 `dailyPlan` (`PBSector.tsx:102`). Three day-planners pretending to be one → one D1-backed plan API (synced, cross-device, shared by Today + MyTasks + PB Sector). | ENG+DESIGN | L |
| 2 | **DataPage Shell** | Projects/Manuscripts/Grants/Decisions each hand-roll filter/sort/view/density/loading/empty/width state (`Projects.tsx:129`, `ManuscriptsPage.tsx:102`, `GrantsPage.tsx:382`, `DecisionsPage.tsx:751`); `TableControls` exists but "each page provides its own." → one DataPage shell. | ENG+DESIGN | M/L |
| 3 | **Query Resource Primitive** | Many hooks bypass `fetchApi`'s typed errors and silently return `[]`/`null` on failure (`useApiData.ts:271,301,515,1729`); `QueryState` exists but opt-in → real-empty vs error-empty are indistinguishable. | ENG | M |
| 4 | **Universal Task/Operational Row** | Shared `TaskRow` won, but forks remain: MyTasks ListView grid row (`ListView.tsx:190`), Personal TodayHero rows (`PersonalPage.tsx:837`), Deadlines task rows (`DeadlinesPage.tsx:500`). | DESIGN+ENG | M |
| 5 | **Task Field Editor Primitive** | `TaskQuickEditChips` centralizes Status/Priority/Due/Project, but ListView (`ListView.tsx:66`) + Deadlines (`DeadlinesPage.tsx:568`) reimplement the same handlers. | ENG+DESIGN | M |
| 6 | **One Modal/Sheet Shell** | `ui/Modal` has portal+escape+focus-trap, but MeetingNotes (`MeetingNotesPage.tsx:242`) + CreateProject (`CreateProjectModal.tsx:67`) hand-roll their own. | DESIGN+ENG | M |
| 7 | **Canonical Research Stage Model** | Stage label/color/API vocabulary drift: ProjectDetail local stages (`ProjectDetail.tsx:69`), Narratives API lowercase (`narratives.ts:37`), Narratives UI Title-Case color map (`NarrativesPage.tsx:16`) → colors can't match. | ENG | S/M |
| 8 | **Unified Project Activity Timeline** | ProjectDetail splits notes/comments/activity tabs (`ProjectDetail.tsx:67`); Activity then re-embeds decisions/deps/updates/comments/actions (`ProjectActivity.tsx:51`). One chronological stream. | ENG+DESIGN | L |

**Codex loose ends (beyond §2C):** Today meeting notes local-only ✓ (`Timeline.tsx:69`); transcript/audio UI unwired; **dead `handleUpsertTodayMd`** ✓ (`pb-today.ts`, unregistered, delete); Narratives API/UI contract mismatch (`pub_date` vs `year`; stage colors); mobile-only-desktop status edits on MenteeMilestones (`:697`) + Deadlines (`:599`); completed-row **compound-opacity violation** (`TaskRow.tsx:281` dims the whole row — breaks CLAUDE.md Rule 43); Personal uses root paths not `PATHS` (`PersonalPage.tsx:974`); legacy MyTasks possibly parked (verify/delete).

**Codex "works-for-Nick" (the IA truth) — ⛔ DEFERRED to its own session:** *too many "where do I work?" surfaces* — Today vs My Hub/Personal vs PB Sector all show overdue/due-today strips with different data + a different plan model. **Morning triage is not one state.** This is the single biggest workflow finding, but Nick has **deferred the Today/cockpit/plan restructure to a dedicated session** — it is NOT in this polish round. **Of the table above, Primitive #1 (Durable Operating-Day Plan) is ⛔ DEFERRED.** Primitives #3 (Query Resource) and #7 (Stage Model) are **ENG-only** (not a design-audit concern → WORKPLAN backlog). The rest (#2 DataPage Shell, #4 Universal Row, #5 Field Editor, #6 Modal Shell, #8 Project Activity overlap) are visual/IA-consistency wins that **ARE** in scope.

---

## 4. The mission north-star (the strategic frame the audit should serve)

From `WORKPLAN.md` — the Hub's reason for being, in priority order:
- **P1 — Sync fidelity** (PB↔Hub) — drift-audit + automate the manual sync; trust the data.
- **P2 — Today / My Tasks completeness** — surface the v55 **delegation workflow fields** (`waiting_on`/`promised_to`/`promise_date`/`next_checkin`) + commitments tracker; planning UX (Plan button, meeting-notes persistence). *This is "the Hub serving HIS delegation workflow" — promises made to 5 mentees in meetings.*
- **P3 — Research System-of-Record trustworthiness** (Projects / Manuscripts / Grants) — data-completeness, ProjectDetail **Activity tab** (emits exist, UI unwired — INFRA-1), **staleness surfacing** (`last_meaningful_movement`/`stale_active_since` dropped in `rowToProject` — INFRA-8), real grant milestones (DH-1). *For ~64 projects, "what moved / what's stalled" is the trust blocker.*
- **P4 — Smarter Hermes / Co-Scientist** (longer-horizon).

---

## 5. What the next Claude Design audit should focus on (this round)

> **North-star: a busy PI sits down and *falls in love* using it.** Every change earns its place by making the Hub look intentional, respond instantly, and never dead-end. Organized by Nick's three pillars. **Width is explicitly Tier-1.** Today/cockpit/plan are ⛔ out of scope (see the scope box up top).

### Pillar 1 — Make it look good (visual consistency & polish)
1. **ONE page-width rule. [TIER-1 — Nick-flagged "very important"]** A single max-width (or a documented data-vs-dashboard split) applied to every data page + all three My Tasks views. No width jump as you navigate (today 1440 vs 1100 vs horizontal-scroll). `src/index.css:920` vs `MyTasks/views/LanesView.tsx:50`.
2. **Fix the light-mode background inversion.** Flat `--cream` (white) page + subtle `--ice` (grey) cards — kill the grey-page/white-card "tint behind the cards" that re-introduces the "feels heavy" look. Consistent on every surface, correct in both themes. `src/index.css:20,95,746,1023-1024`.
3. **Token / spacing / radius / icon-size discipline + columnar-table polish + accent & opacity discipline.** Snap literal px to the token scale (sizes/paddings/radii currently drift a few px and read "slightly off"); kill the completed-row whole-row dim (compound-opacity, breaks Rule 43 — use muted title/border); ration color to meaning. Everything should read *deliberate*.

### Pillar 2 — Every click does something real (efficiency & no dead ends) [TIER-1 on the click-efficiency class]
4. **Surface every affordance on the FIRST click — the date-picker archetype.** Editing a due date today drills: click → "edit mode" shows a raw value (e.g. `05/01`) → click again → a calendar → and the +1d/+1wk quick options are a *separate* reveal. **Nick wants ONE click to pop both an actual month-calendar grid AND the quick presets together** — pick a day from the grid or a preset, immediately. (`src/components/InlineDatePicker.tsx`: `:162` trigger → `:88+` editing renders a native input + `:71-86` presets, not an immediate calendar.) **Then hunt for the whole CLASS:** multi-click chains, "edit modes" that show a raw value instead of the rich control, hidden affordances, anything that takes 2 clicks where 1 would do. This is the heart of the "fall in love" ask.
5. **No dead controls — every button/affordance does a real thing or is removed:** transcript/audio "coming soon" (`MeetingNotesPage.tsx:258,341`), the Settings AI-tab placeholder (`SettingsPage.tsx:197`), mobile-only-disabled status edits (`MenteeMilestonesPage.tsx:697`, `DeadlinesPage.tsx:599`), and replace every `window.alert()` failure with the optimistic-UI + undo-toast the ethos mandates (`ProjectDetail.tsx:298-329` et al.).
6. **Snappy, low-friction interactions everywhere** — inline-edit affordances always visible (▾), auto-save on blur, instant optimistic feedback, undo toast, no spinners for actions.

### Pillar 3 — Every endpoint has a purpose + things make sense where they are (IA sanity & no orphans)
7. **No orphans.** Every route / control / endpoint either has a live, sensible purpose or is removed (e.g., dead `handleUpsertTodayMd`; verify/retire legacy MyTasks). Things sit where a user expects them.
8. **Consolidate & standardize what EXISTS (not new features):** a **DataPage shell** so Projects/Manuscripts/Grants/Decisions/Deadlines stop hand-rolling filters/sort/density/empty/width (§3 #2); the **shared row + field-editor** extended into the remaining forks — ListView/Deadlines/Personal (§3 #4/#5); **modal vs bottom-sheet defined once** (§3 #6); ProjectDetail's overlapping notes/comments/activity tabs made to make sense (§3 #8).
9. **Mobile coherence** — task rows + controls audited at 360/390/768px (incl. the 768–1024 iPad-portrait nav split-brain), so nothing clips, overlaps, or silently disables on touch.

### Secondary / candidate (flag — likely future rounds, not the polish focus)
- The v55 **delegation workflow** UI (`waiting_on`/`promised_to`/…) + commitments — a real feature build, not polish; flag for a later round.
- **ENG-only backlog** (not a *design* audit): the query-resource primitive, the canonical stage model + the **Narratives** data-contract break (stage colors can't match; `pub_date` vs `year`) — design should not polish broken semantics; I can queue these to `WORKPLAN.md`.

---

## 6. Blind spots / what only a visual + live audit can judge

- Codex saw ~8.6% of the repo, no DB/auth/web/cross-machine/visual access (`blind-spots.md`). Its verdict is sound on **static code structure**, blind to **live data, sync state, and rendering**.
- The bg-inversion's *felt* severity, the responsive breakpoints, contrast/animation polish, and "does this actually feel right to operate" are **exactly what Claude Design (live, visual) is for** — that's why this audit follows.
- Live data caveats: only 3 prod projects have Key Links; citation/h-index data depends on a PB cron that may not be running (Citations card shows "—"); grant milestones never seeded with real data.
