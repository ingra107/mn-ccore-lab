# Claude Design — MN-CCORE Lab Hub: Audit + Redesign Brief (2026-06-09)

> Paste this into Claude Design with the Hub repo linked. It points at a synthesis brief built from a cold Codex engineering audit + a Claude loose-ends inventory + Nick's context. **Read the brief first:** `docs/design-briefs/2026-06-09-next-design-audit-brief.md`.

---

## 1. Who this is for + the product ethos

**Nick Ingraham** — PI of a pulmonary/critical-care research lab at UMN. Physician-scientist running ~64 projects, 5+ mentees, multiple R01/R03 grants, CLIF-consortium work, and manuscripts, with clinical duty. The Hub is **his daily operating surface AND the team's** (20+ members). His pattern: **morning triage → mid-meeting quick-wins → constant context-switching.** A single-user "Peripheral Brain" CLI (brain.db) syncs to the Hub (Cloudflare D1).

**Design ethos — operational, not editorial.** A research operations center, not a magazine:
- **Dark-first.** Deep-neutral bg (`#0b1017`, NOT blue-tinted), text `#e2e8f0`. Light mode secondary.
- **Columnar tables, not card-stacks, on data pages.** Cards are for dashboards only.
- **Inline editability with visible affordance** (every editable field shows a ▾; click → edit; auto-save on blur; no save button).
- **Rationed color = meaning:** coral=overdue/urgent, gold=Right Now/AI/planned, teal=interactive/system, green=done. Max ~2 non-neutral colors per view.
- **Density is not clutter.** More info, more readable — via weight + rhythm, not whitespace.
- **Optimistic UI + undo toast. Never spinners or `alert()` for actions.**
- **Typography:** DM Sans everywhere (body/UI); Fraunces on public pages only; JetBrains Mono for `<kbd>` only.

**What we've strived for (build on it, don't re-derive):** collapse divergence into single primitives; make wrong states unrepresentable; reduce surface area. Recent: a task-UI consistency pass (one shared `<TaskRow>`), a project-identity convergence, primitive-enforcement. Nick thinks in **Level-1 primitives** — a change that makes the bad state impossible by construction beats a patch.

## 2. Read first (design intent of record + the synthesis)
- `docs/design-briefs/2026-06-09-next-design-audit-brief.md` — **the synthesis** (Codex primitives §3, loose ends §2, north-star §4, prioritized focus §5). Everything below operationalizes its §5.
- `review/MN-CCORE Lab Hub Design System (5)/design/Handoff - Task UI Consistency Pass.md` — the Round-6 rules in force (one shared row, status-as-truth, one background layer, fixed left edge).
- `review/MN-CCORE Lab Hub Design System (5)/design/CLAUDE.md` — Nick's operating-day **"B2" model** (Right Now / Timeline drop-zones / task groups / right rail) + the behaviors he explicitly called out (body-click expands never promotes; all planned things in the swap queue; completed sinks; Right Now compact).
- `CLAUDE.md` (repo root) — the full design system + 68 critical rules + palette (hex-pinned, axe-AA).

## 3. Your charge — audit + polish, by three pillars

> ⛔ **OUT OF SCOPE this round (deferred to its own dedicated session):** the **Today page**, the **daily-cockpit IA** (Today vs My Hub vs PB Sector), and the **operating-day plan model** (the localStorage-vs-Hub split-brain). Do NOT restructure Today or the plan. This is a **visual-polish + workflow-efficiency + "no dead ends"** round. **North-star: a busy PI sits down and *falls in love* using it.**

### Pillar 1 — Make it look good (visual consistency & polish)
1. **ONE page-width rule. [TIER-1 — Nick: "very important"]** A single max-width (or a documented data-vs-dashboard split) for every data page + all three My Tasks views. No width jump on navigation (today 1440 vs 1100 vs horizontal-scroll).
2. **Fix the light-mode background inversion.** Intended: flat `--cream` (white) page + subtle `--ice` (grey) cards. Shipped: grey `#f5f5f5` page + white cards — a tint *behind* the cards (the exact "feels heavy" thing Rule #1 forbids). Specify the corrected token scheme, every surface, both themes.
3. **Token / spacing / radius / icon-size discipline + columnar-table polish + accent & opacity discipline.** Snap literal px to the token scale (sizes/paddings/radii drift a few px and read "slightly off" everywhere); kill the completed-row whole-row dim (compound-opacity, breaks Rule 43 — muted title/border instead); ration color to meaning. Make every surface look *deliberate*.

### Pillar 2 — Every click does something real (efficiency & no dead ends) [TIER-1 on click-efficiency]
4. **Surface every affordance on the FIRST click — the date-picker archetype.** Editing a due date today drills: click → an "edit mode" showing a raw value (`05/01`) → click again → a calendar → and the +1d/+1wk quick options are a *separate* reveal. **Nick wants one click to pop both an actual month-calendar grid AND the quick presets together** — choose a day or a preset, instantly; never a bare "05/01" edit field. (`src/components/InlineDatePicker.tsx`.) **Then hunt the whole CLASS:** multi-click chains, edit-modes showing a raw value instead of the rich control, hidden affordances, anything that's 2 clicks where 1 would do. *This is the heart of the "fall in love" ask — find and fix these everywhere.*
5. **No dead controls.** Every button/affordance does a real thing or is removed: transcript/audio "coming soon" (`MeetingNotesPage.tsx:258,341`), the Settings AI-tab placeholder (`SettingsPage.tsx:197`), mobile-only-disabled status edits (`MenteeMilestonesPage.tsx:697`, `DeadlinesPage.tsx:599`), and replace every `window.alert()` failure with optimistic-UI + undo-toast (`ProjectDetail.tsx:298-329`).
6. **Snappy, low-friction interactions everywhere** — inline-edit affordances always visible (▾), auto-save on blur, instant optimistic feedback + undo toast, no spinners for actions.

### Pillar 3 — Every endpoint has a purpose + things make sense where they are (IA sanity & no orphans)
7. **No orphans.** Every route / control / endpoint either has a live, sensible purpose or is removed (dead `handleUpsertTodayMd`; verify/retire legacy MyTasks). Things sit where a user expects them.
8. **Consolidate & standardize what EXISTS (not new features):** a **DataPage shell** so Projects/Manuscripts/Grants/Decisions/Deadlines stop each hand-rolling filters/sort/density/empty/width; the **shared row + field-editor** extended into the remaining forks (ListView/Deadlines/Personal); **modal vs bottom-sheet defined once**; ProjectDetail's overlapping notes/comments/activity tabs made to make sense.
9. **Mobile coherence** — task rows + controls audited at 360/390/768px (incl. the 768–1024px iPad-portrait nav split-brain); nothing clips, overlaps, or silently disables on touch.

### Secondary / candidate (flag — likely future rounds, not this polish focus)
- The v55 **delegation workflow** UI (`waiting_on`/`promised_to`/…) + commitments — a real feature build; flag for later.
- **Narratives** — flag, don't polish: its API/UI data contract is broken (stage colors can't match; `pub_date` vs `year`).

## 4. Guardrails — what's already shipped (do NOT re-spec) + invariants
- **Shipped + correct, leave alone:** the shared `<TaskRow>` (square=complete, body-click=expand, shift-click=select, fixed left edge, full titles); status-as-truth (`isTaskDone`); one date control; `<DueLabel>`/`isOverdue()`; the `ui/` primitives (Button/Chip/Field/Modal). **Extend these via props — never re-fork a per-surface row.**
- **My Tasks List view is a protected power-grid** (j/k/e/x nav + inline-edit columns) — the deliberate exception; don't "unify" it to inline-expand.
- **Routing:** all gated routes under `/portal/*`; public at root; internal nav via `src/constants/paths.ts`.
- **Invariants:** dark-first; columnar tables on data pages (cards = dashboards only); rationed color; opacity ≥0.85 floor on readable dark text; no compound-opacity; hex-pinned palette (axe-AA). Full list: repo `CLAUDE.md` "Critical Rules" + "Design System."

## 5. Deliverable (match prior Claude Design rounds)
- **An annotated visual audit** — screenshots of the live/linked surfaces with callouts; especially the bg-inversion, the width inconsistency, the click-efficiency inefficiencies (the date-picker class), dead controls, and the mobile widths.
- **Mockups** for the highest-impact visual fixes (the corrected bg + width system) and the **interaction patterns** you redesign (the first-click date control; any other click-chain you collapse).
- **A prioritized ticket backlog** `TICKETS.md`: **P1** = Pillar-1 visual consistency (**width**, bg) + the **click-efficiency class** + **dead-control** elimination; **P2** = the consolidation primitives (DataPage shell, shared row/editor, modal/sheet, mobile coherence); **P3** = remaining sensible-placement + polish — each ticket file-scoped where possible, honoring §4.
- **A token/spec sheet** for any new shared system (the corrected bg tokens, the page-width rule, the DataPage shell, the first-click date control).

## 6. What only you can judge (why this audit follows the Codex pass)
The Codex audit saw ~8.6% of the repo, no live data, no rendering. The *felt* severity of the bg-inversion, the real mobile breakpoints, the click-by-click friction, contrast/animation polish, and above all **"does a busy PI fall in love sitting down to use this"** — that's yours. Find the inefficiencies, make it beautiful, make every click pay off.

> **One-liner kickoff:** *Read `docs/design-briefs/2026-06-09-next-design-audit-brief.md` and the design-intent docs it cites, then audit the linked Hub. This is a visual-polish + workflow-efficiency round — **Today / the daily cockpit / the plan model are OUT** (own session). **Pillar 1 — make it look good:** ONE page-width rule (Tier-1), fix the light-mode bg inversion, token/opacity discipline. **Pillar 2 — every click does something real:** make the date picker (and every control like it) surface its full calendar + quick options on the FIRST click; kill dead controls and `alert()`s. **Pillar 3 — every endpoint has a purpose, things make sense where they are:** no orphans; consolidate the DataPage shell / shared row+editor / modal-vs-sheet. Honor the shipped primitives in §4 (extend rows via props, never re-fork). Deliver an annotated audit + mockups + a P1/P2/P3 TICKETS.md. North-star: a user sits down and falls in love.*
