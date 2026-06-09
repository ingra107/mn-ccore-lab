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

## 3. Your charge — audit + decide + redesign, in three tiers

### Tier 1 — the IA decisions only you can make (highest value; produce mockups)
1. **Decide the ONE daily cockpit.** Today (`localStorage` plan) vs My Hub/Personal (duplicate overdue/due-today strips) vs PB Sector (a separate D1 `dailyPlan`) are three overlapping "where do I work?" surfaces with *different plan models*. Decide what the single morning-triage cockpit is, what lives on the first viewport, and what each other surface becomes (merge/retire/repurpose). **Don't add cards — collapse surfaces.**
2. **Design the durable Right Now / Planned / Done model** as ONE visual system shared by Today + My Tasks (today the plan is a browser-local blob that doesn't sync or reach PB Sector). Specify the row affordances, the swap queue, the planned→active→done group sort, and how "plan for today" works identically everywhere.
3. **Redesign meeting capture so taking notes = saving.** Today's meeting textarea is local-only and vanishes on refresh; transcript/audio controls say "coming soon." Design the meeting row so notes/actions persist to the meeting record, and resolve the dead transcript controls (wire to the AI assistant "Hermes," or hide).

### Tier 2 — consistency primitives (standardize once, apply everywhere)
4. **Fix the light-mode background inversion.** Intended: flat `--cream` (white) page + subtle `--ice` (grey) cards. Shipped: grey `#f5f5f5` page + white cards (a tint *behind* the cards — the exact "feels heavy" thing Rule #1 forbids). Specify the corrected token scheme, consistent across every surface, correct in both themes.
5. **ONE page-width rule** — a single max-width (or a deliberate, documented data-vs-dashboard split) for all three My Tasks views + every data page (currently 1440 vs 1100 vs scroll). No width jump on navigation.
6. **A DataPage Shell spec** — header / filters / table / empty-error-loading / density / mobile-fallback — so Projects/Manuscripts/Grants/Decisions/Deadlines stop each hand-rolling it.
7. **Mobile task rows at 360/390/768px** — ListView, Deadlines, MenteeMilestones, Today timeline; finish the desktop-only status/action controls; one shared row+editor, no forks.
8. **Accent + opacity discipline** — kill the completed-row whole-row dim (compound-opacity, breaks Rule 43 — use muted title/border) and replace every `window.alert()` failure with optimistic-UI + undo-toast.
9. **Modal vs bottom-sheet, defined once** (transcript/create/edit) through the shared `ui/Modal` + `BottomSheet`.

### Tier 3 — workflow surfaces that serve Nick (the north-star)
10. **The delegation workflow** — surface `waiting_on`/`promised_to`/`promise_date`/`next_checkin` + commitments in the row/detail UI (schema exists, zero UI). This is the mentee-promise loop.
11. **ProjectDetail as research System-of-Record** — collapse notes/comments/activity into one chronological research-activity stream; surface project **staleness** ("what moved / what's stalled" across 64 projects).
12. **Settings gaps for the daily loop** — personal link shortcuts (per-user `obsidian://`/`claude://`/local-path chips), default-view preference, surface the keyboard-shortcuts help, make the AI tab real.
13. **One canonical "what should I focus on"** (reconcile Today's HermesSuggests vs Dashboard's ProactiveBrief).
14. **PI/mentee oversight as a check-in workflow** + Lab Overview rework + My Hub design pass + the 768–1024px tablet (iPad-portrait) nav split-brain.
15. **Narratives** — flag, don't polish: its data contract is broken (stage colors can't match; `pub_date` vs `year`).

## 4. Guardrails — what's already shipped (do NOT re-spec) + invariants
- **Shipped + correct, leave alone:** the shared `<TaskRow>` (square=complete, body-click=expand, shift-click=select, fixed left edge, full titles); status-as-truth (`isTaskDone`); one date control; `<DueLabel>`/`isOverdue()`; the `ui/` primitives (Button/Chip/Field/Modal). **Extend these via props — never re-fork a per-surface row.**
- **My Tasks List view is a protected power-grid** (j/k/e/x nav + inline-edit columns) — the deliberate exception; don't "unify" it to inline-expand.
- **Routing:** all gated routes under `/portal/*`; public at root; internal nav via `src/constants/paths.ts`.
- **Invariants:** dark-first; columnar tables on data pages (cards = dashboards only); rationed color; opacity ≥0.85 floor on readable dark text; no compound-opacity; hex-pinned palette (axe-AA). Full list: repo `CLAUDE.md` "Critical Rules" + "Design System."

## 5. Deliverable (match prior Claude Design rounds)
- **An annotated visual audit** (screenshots of the live/linked surfaces with callouts) — especially the Tier-1 cockpit/IA surfaces, the bg-inversion, and the mobile widths.
- **Mockups for the Tier-1 decisions** (the one daily cockpit + the durable plan model + the meeting-capture row) — these are decisions, not just tickets.
- **A prioritized ticket backlog** `TICKETS.md`: **P1** ship-blockers (the IA decisions + bg/width + meeting honesty + dead controls), **P2** consistency primitives, **P3** workflow surfaces — each ticket file-scoped where possible, honoring §4.
- **A token/spec sheet** for any new shared system (the corrected bg tokens, the page-width rule, the DataPage shell).

## 6. What only you can judge (why this audit follows the Codex pass)
The Codex audit saw ~8.6% of the repo, no live data, no rendering. The *felt* severity of the bg-inversion, the real mobile breakpoints, contrast/animation polish, and above all **"does this actually feel right to operate as a busy PI's daily cockpit"** — that's yours. Decide the IA; we'll implement against your spec.

> **One-liner kickoff:** *Read `docs/design-briefs/2026-06-09-next-design-audit-brief.md` and the two design-intent docs it cites, then audit the linked Hub. Make the Tier-1 IA decisions (one daily cockpit, one durable plan model, meeting-capture-saves) with mockups; fix the Tier-2 consistency primitives (bg inversion, one width, DataPage shell, mobile rows, opacity/alert discipline); spec the Tier-3 workflow surfaces. Honor the shipped primitives in §4 — extend rows via props, never re-fork. Deliver an annotated audit + mockups + a P1/P2/P3 TICKETS.md.*
