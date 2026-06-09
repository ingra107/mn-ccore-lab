# Next Claude Design Audit — Synthesis Brief (2026-06-09)

> **Purpose.** This doc is the pointable brief for the next **Claude Design** (visual/UX) audit of the MN-CCORE Lab Hub. It fuses three inputs: (1) a cold **Codex** engineering/simplification audit (Level-1 primitives + loose ends), (2) a **Claude-side loose-ends/workflow inventory** grounded in the repo + WORKPLAN + the Round-6 design handoff, and (3) **what we know about Nick + what we've strived for**. Point Claude Design at this doc; the companion **audit prompt** is `docs/design-briefs/2026-06-09-next-design-audit-PROMPT.md`.
>
> Source artifacts (gitignored scratch): `Scratch/codex-hub-simplify-2026-06-09/` (Codex `synthesis.md`, `blind-spots.md`, `inventory.md`). Design intent of record: `review/MN-CCORE Lab Hub Design System (5)/design/{Handoff - Task UI Consistency Pass.md, CLAUDE.md}`.

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

**Codex "works-for-Nick" (the IA truth):** *too many "where do I work?" surfaces* — Today vs My Hub/Personal vs PB Sector all show overdue/due-today strips with different data + a different plan model. **Morning triage is not one state.** Meeting flow loses notes at the capture moment. This is the single biggest workflow finding and it's an **information-architecture** question only a design audit can resolve.

---

## 4. The mission north-star (the strategic frame the audit should serve)

From `WORKPLAN.md` — the Hub's reason for being, in priority order:
- **P1 — Sync fidelity** (PB↔Hub) — drift-audit + automate the manual sync; trust the data.
- **P2 — Today / My Tasks completeness** — surface the v55 **delegation workflow fields** (`waiting_on`/`promised_to`/`promise_date`/`next_checkin`) + commitments tracker; planning UX (Plan button, meeting-notes persistence). *This is "the Hub serving HIS delegation workflow" — promises made to 5 mentees in meetings.*
- **P3 — Research System-of-Record trustworthiness** (Projects / Manuscripts / Grants) — data-completeness, ProjectDetail **Activity tab** (emits exist, UI unwired — INFRA-1), **staleness surfacing** (`last_meaningful_movement`/`stale_active_since` dropped in `rowToProject` — INFRA-8), real grant milestones (DH-1). *For ~64 projects, "what moved / what's stalled" is the trust blocker.*
- **P4 — Smarter Hermes / Co-Scientist** (longer-horizon).

---

## 5. What the next Claude Design audit should focus on (synthesis)

> Merged + prioritized from Codex (§3) + the Claude-side inventory (§2) + the north-star (§4). Tiered: the IA questions only a design audit can answer first, then the consistency primitives, then the workflow surfaces. The companion PROMPT operationalizes these.

### Tier 1 — Information architecture & the operating day (the big questions)
1. **Decide the ONE daily cockpit.** There are three "where do I work?" surfaces with overlapping content + *different plan models*: Today (`localStorage` plan), My Hub/Personal (duplicate overdue/due-today strips), PB Sector (D1 `dailyPlan`). Design must decide what the single morning-triage cockpit is and what belongs on the first viewport — *don't add cards; collapse surfaces.*
2. **Design the durable Right Now / Planned / Done model** as one visual system shared by Today + My Tasks (today the plan is a browser-local blob that doesn't sync or reach PB Sector). This is the §3 Primitive #1 made visible.
3. **Make meeting rows obviously save to the record.** Today's "take notes" textarea is local-only scratch state that vanishes on refresh; the real persisted notes mutation lives only on MeetingDetail. Redesign so capture = persistence, and resolve the transcript/audio "coming soon" dead controls (wire to Hermes or hide).

### Tier 2 — Consistency primitives (visual systems to standardize once)
4. **Fix the light-mode background inversion** — one token-family change: flat `--cream` page + subtle `--ice` cards (kill the grey-page/white-card tint-behind-cards that re-introduces the "feels heavy" look). Consistent across every surface, correct in both themes.
5. **Establish ONE page-width rule** — a single max-width (or a documented data-vs-dashboard split) for all three My Tasks views + every data page. No width jump on navigation.
6. **Produce a DataPage Shell spec** — header / filters / table / empty-error-loading / density / mobile fallback — so Projects/Manuscripts/Grants/Decisions/Deadlines stop hand-rolling it (§3 Primitive #2).
7. **Audit task rows at 360/390/768px** — ListView, Deadlines, MenteeMilestones, Today timeline; finish the mobile-only-desktop status/action controls; extend the shared row+editor into the remaining forks.
8. **Accent + opacity discipline** — kill the completed-row **compound-opacity** violation (whole-row dim breaks Rule 43 — use muted title/border), and replace every **`window.alert()`** failure path with the optimistic-UI + undo-toast the ethos mandates.
9. **Define modal vs bottom-sheet once** — including transcript/create/edit flows; everything routes through `ui/Modal` / `BottomSheet`.

### Tier 3 — Workflow surfaces that serve Nick (the north-star)
10. **Surface the delegation workflow (P2)** — `waiting_on`/`promised_to`/`promise_date`/`next_checkin` + commitments in the row/detail UI. The mentee-promise loop (promises made in meetings to 5 mentees) has schema but zero UI.
11. **ProjectDetail as research System-of-Record (P3)** — collapse notes/comments/activity into one chronological research-activity stream (§3 Primitive #8); wire the Activity tab + project **staleness** ("what moved / what's stalled" across 64 projects).
12. **Close the Settings gaps that serve the daily loop** — personal link shortcuts (per-user `obsidian://`/`claude://`/local-path chips), default-view preference, surface ShortcutHelp, make the AI tab real.
13. **One canonical "what should I focus on"** — reconcile Today's client `HermesSuggests` vs Dashboard's server `ProactiveBrief` into one brief on Today.
14. **PI/mentee oversight as an actual check-in workflow** (not just milestone inventory) + Lab Overview rework (PAGE-5) + My Hub design pass (INFRA-6) + the tablet breakpoint split-brain (UX-9, 768–1024px iPad-portrait nav).
15. **Treat Narratives as suspect** — its API/UI data contract is broken (stage colors can't match, `pub_date` vs `year`); design should not polish broken semantics — fix the contract or shelve the page.

---

## 6. Blind spots / what only a visual + live audit can judge

- Codex saw ~8.6% of the repo, no DB/auth/web/cross-machine/visual access (`blind-spots.md`). Its verdict is sound on **static code structure**, blind to **live data, sync state, and rendering**.
- The bg-inversion's *felt* severity, the responsive breakpoints, contrast/animation polish, and "does this actually feel right to operate" are **exactly what Claude Design (live, visual) is for** — that's why this audit follows.
- Live data caveats: only 3 prod projects have Key Links; citation/h-index data depends on a PB cron that may not be running (Citations card shows "—"); grant milestones never seeded with real data.
