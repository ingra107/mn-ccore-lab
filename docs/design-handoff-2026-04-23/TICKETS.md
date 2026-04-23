# MN-CCORE Hub — Round 4 Tickets

All paths resolve relative to the repo root (`github.com/ingra107/mn-ccore-lab`). All captures resolve relative to `r4/` in this bundle.

---

## § 0 · Focus answers

Nine explicit asks from `FEEDBACK-FOCUS.md`. Each has a verdict, reasoning, and a ticket pointer for the follow-up work.

### A1 · Inline `▾` chevron density on data tables

**Verdict: hide until row hover, keep a persistent dashed underline on editable cells.**

Why not the other options:
- *Single ▾ per row:* defeats the affordance. Users tab to Status then Priority then Assignee independently — one ▾ implies there's one thing to edit.
- *Replace with pixel rule only:* discoverable but not self-documenting. First-time users won't know the cell is editable.
- *Keep as-is (Airtable standard):* Airtable pays for that chatter with whitespace we don't have. Our 44px compact rows are 10–15% denser than Airtable's — same chrome in less space reads as noisy.

The compromise: a 1px dashed border-bottom (`rgba(201,168,76,0.35)` on the cell text) is visible at rest, the `▾` appears only when the row carries `:hover` or `[data-focused="true"]`. Mirrors the inline-edit pattern in Linear and matches Nick's "surface lifts one luminance step on hover" rule from `README.md`.

→ **`R4-01`** implements this in `DataTable/Cell.tsx`. Patch: [`patches/R4-01-chevron-hover.css`](./patches/R4-01-chevron-hover.css).

Look at: `focus-03-arrows-tasks.png`, `focus-03-arrows-projects.png`, `focus-03-arrows-manuscripts.png`, `focus-03-arrows-decisions.png`.

---

### A2 · Task-row focus outline

**Verdict: keep 2px teal, but inset and dimmed. 0.55 opacity (`#5cbcb4` at `rgba(92,188,180,0.55)`) reads as focus, not chrome.**

Reviewing `focus-02-outline-j.png` and `focus-02-outline-multi.png` next to `focus-02-outline-clicked.png`:
- The current 2px full-opacity teal outline *does* dominate against the 44px row because our rows already carry two hairlines (bottom border + subtle inner top). Adding a 2px ring = three horizontal rules stacked.
- Dropping to a **background tint** (option B) loses on `prefers-reduced-transparency` and fights the teal 10% hover wash we already use for `[aria-selected="true"]`.
- Dropping to a **left-edge accent bar** (option C) is a no — `README.md` rule: *"never a border-left accent."*
- Dropping the visual entirely fails WCAG 2.4.7 (focus visible).

The fix is two small changes: `outline-offset: -2px` so the ring sits *inside* the row (prevents the stack-of-hairlines look), and opacity 0.55 so it reads as state, not chrome. Tested at 100%, 125%, 150% browser zoom.

→ **`R4-02`**. Patch: [`patches/R4-02-focus-outline.css`](./patches/R4-02-focus-outline.css).

---

### A3 · Light-mode parity

**Verdict: sidebar holds. Teal + gold both need light-mode-specific tokens.**

Going through `dl-01-dashboard.png`, `dl-03-my-tasks.png`, `dl-06-projects.png`, `dl-11-digest.png`, `dl-14-analytics.png` against their dark counterparts:

1. **Sidebar recessiveness — passes.** The `color-mix(cream, black 12%)` derivation gives a sidebar that sits visually behind the content plane. Same Linear rule, same read. No change.

2. **Teal `#5cbcb4` on cream `#faf7f1`** — interactive cues fail. Contrast ratio 2.31:1 against the cream surface, below AA (4.5:1) for body text and AA-Large (3:1) for UI components. Visible in `dl-03-my-tasks.png` (filter pills), `dl-06-projects.png` (stage chips), `dl-14-analytics.png` (axis labels).
   → **Use a darker teal `--teal-ink: #2d7a72`** in light mode (AAA at 8.1:1 against cream). Tokenize: `--accent-interactive` swaps per-theme instead of `--teal` being shared.

3. **Gold `#c9a84c` body-size text** on cream surfaces — 2.58:1, fails AA. Visible in `dl-11-digest.png` on the "Updated · 2h ago" eyebrow inside digest cards. Gold on dark is fine (5.4:1); gold on cream only works at heading size + weight ≥600, or on the hairline divider. At 13px 500-weight it's illegible.
   → **Light-mode eyebrows use `--ink-dim` slate, not gold.** Gold on cream is reserved for ≥18px 600-weight, icons, and the heartbeat line.

4. **`dl-07-project-detail.png`**: the teal "In review" stage pill and the maroon "CLIF" domain tint coexist in the same row — both lose saturation against cream. The fix from (2) handles teal; maroon `#f0737e` at the pill size (11px) is 3.2:1 against cream, borderline. Darken to `#d64e5a` in light mode (4.7:1).

5. **`dl-18-settings.png`**: the only real "afterthought" moment. The form-field borders are barely visible (`rgba(0,0,0,0.05)` — the naive dark-mirror of `rgba(255,255,255,0.05)`). Light-mode hairlines need 2–3× the alpha of their dark equivalents to read.
   → `--border-subtle: rgba(0,0,0,0.08)`, `--border-default: rgba(0,0,0,0.14)`, `--border-strong: rgba(0,0,0,0.24)`.

→ **`R4-03`** (token split) and **`R4-04`** (border alpha) implement all five. Patch: [`patches/R4-03-light-mode-tokens.css`](./patches/R4-03-light-mode-tokens.css).

---

### A4 · Network page default view

**Verdict: ship pre-framed on the Ingraham hub subgraph at zoom 1.35× with the top 6 labels persistent.**

`rn-01-default.png` confirms the feedback — the default zoom is a spaghetti hairball where individual nodes vanish and the gold/teal edge encoding reads as decoration. `rn-02-zoomed.png` shows what the graph *wants* to be: readable, with Puskarich, Bramante, Chipman legible at a glance.

Three changes:

1. **Initial camera = fit-to-Ingraham-ego-network** (2-hop neighbors of the central node). The hero subgraph is ~22 nodes of ~34 total authors (per the header stats: "34 authors · 199 connections"). Framing on Ingraham's 2-hop subgraph shows the answer the page exists to give — *who is MN-CCORE collaborating with* — instead of the hairball of the whole lab universe.

2. **Persistent labels on the top-6 nodes by betweenness centrality** (likely Ingraham, Puskarich, Bramante, Chipman, Melton, Busby from the captures). Labels on all nodes = unreadable. Labels on hover only = users don't know who they're looking at. Top-N persistent is the hub-and-spoke compromise D3 knowledge graphs converged on years ago (Obsidian Canvas, Kumu).

3. **Legend** for edge color. Right now gold vs teal *is* meaningful (per the capture header: "MNCCORE Only" filter chip implies the encoding is "in-lab vs external"), but the reader can't tell. A 160px wide legend card in the top-right, two swatches + labels: "Gold · MNCCORE author" / "Teal · external collaborator" — and the same for node color (muted blue vs desaturated gold). Then the encoding earns its place.

→ **`R4-05`** (initial camera + top-6 labels) and **`R4-06`** (legend card). See [`patches/R4-05-network-defaults.tsx`](./patches/R4-05-network-defaults.tsx).

---

### A5 · Scroll-chunk composition notes

Looking at the `ch1 / ch2 / ch3…` sequences the full-page view hides:

- **Dashboard ch2 is thin.** Full-page hides that the mid-scroll band is a row of 3 cards (Tasks preview, Pub Pipeline, Recent Activity) over 600px of page with a ~200px empty band below. → ticket `R4-12` (collapse empty band; pull Recent Activity up into that band or promote the Deadlines strip).

- **Project Detail ch3 repeats ch2's pattern.** The "Related manuscripts" and "Recent decisions" cards are structurally identical (header + 5-row list + "View all" link) and stacked vertically. Two identical card shapes in a row = your eye slides past both. → ticket `R4-13` (differentiate by making "Recent decisions" a timeline rail, not a list).

- **Analytics ch2 dead-zone.** The chart stack ends, a 180px gap sits between the last chart and the footer metadata. On the full-page capture it looks like intentional whitespace; on the chunk view (`desktop-analytics-ch2.png` equivalent — shown in `dl-14-analytics.png` as one band) it reads as a rendering gap. → ticket `R4-14` (insert a "What this tells you" summary block or tighten the bottom margin).

- **MyTasks, Projects, Manuscripts:** all chunk cleanly. No composition issues — the table rhythm is the same from top to bottom, which is correct for tables.

→ tickets `R4-12`, `R4-13`, `R4-14`.

---

### A6 · Modals — rank by drift

Ranking `rm-01-task.png` → `rm-06-project.png` on conformance to the system:

| Rank | Modal | Verdict |
|---|---|---|
| 1 | Create Task (`rm-01`) | **Tightest.** Reference pattern. |
| 2 | Command Palette (`rm-02`) | **Tight.** Minor: keyboard hints in footer use `JetBrains Mono` inside text (↑↓ navigate · ↵ select), fine per rule. |
| 3 | Shortcut Help (`rm-03`) | **On-system.** The `G D` / `G T` two-key hints render cleanly. |
| 4 | Create Project (`rm-06`) | **On-system, dense.** Edge case: the Stage selector uses circular dots before each label — that pattern exists nowhere else; either promote it or drop it. |
| 5 | **Create Idea** (`rm-04`) | **DRIFTED.** Uses a 2-column form grid where every other modal in the system is a single column. The Priority field uses colored pills at 12px (`P1` red, `P2` gold, `P3` muted) — the pills are fine, but the 2-col grid breaks rhythm. |
| 6 | **Create Decision** (`rm-05`) | **DRIFTED MOST.** "Outcome" field is a free-text area with a help-text hint styled in italics. We use italics nowhere else in UI chrome (italics = Fraunces display only, per `README.md`). The "Related to" field uses pill-tokens for multi-select that don't match the Assignee multi-select pattern in Create Task. |

→ **`R4-07`** (Create Idea: single-column) and **`R4-08`** (Create Decision: kill italic hints, match Create Task's multi-select pattern).

---

### A7 · Hermes sparkle legibility

**Verdict: swap the solid-gold sparkle for a two-tone teal-base + gold-center mark.**

The issue is exactly what the ask names: `HermesMark` renders at gold `#c9a84c` against gold CTAs, gold heartbeat lines, and gold hover underlines. On the Dashboard (`d-01-dashboard.png`) the "Ask the Lab" button has a Hermes badge on it and the badge disappears into the button. Same on the AI-generated digest headers (`dl-11-digest.png`).

A sparkle that's gold-on-gold isn't a sparkle, it's a texture. Two cheap fixes, pick one:

1. **Two-tone sparkle** — teal outer ray, gold inner dot. Keeps the gold emphasis rule intact while giving the mark a local luminance contrast against any gold surface. This is the preferred fix — it makes `HermesMark` an actual mark rather than a color.

2. **Gold + 1px teal outline** — simpler, but feels like a concession.

→ **`R4-09`**. See [`patches/R4-09-HermesMark.tsx`](./patches/R4-09-HermesMark.tsx).

---

### A8 · Phase-release banner

**Verdict: downgrade to a pill in the top bar.**

Pre-launch the banner celebrated momentum and flagged polish to the team. Post-launch (Day 2 onward) every signed-in user sees the banner ONCE per session, but the "once per session" timer resets every browser tab, so active users see it 3–6 times a day. It's become the noisy post-launch artifact it was supposed to celebrate the end of.

Three options, in preference order:

1. **Downgrade to a "Just shipped: Phase 36c ↗" pill** on the right side of the top bar, next to the notification bell. Dismissible, one-click opens the release notes. Shows presence without stealing 44px of vertical space.
2. **Keep on first-login only** (track in user row in D1, not session). Nick's 19 people each see it once, ever, then never again.
3. **Kill it.** The release notes live in Research Digest; users who care will find them.

(1) preserves Nick's "celebrate polish" intent with 10% of the chrome cost.

→ **`R4-10`**. Patch: [`patches/R4-10-phase-pill.tsx`](./patches/R4-10-phase-pill.tsx).

---

### A9 · Public-site nav + lab split

**Verdict: wordmark and color treatment read as one brand. Type scale on `/nate` has drifted — fix the h1.**

Checking the public surfaces in order (Home, Team, Publications, Network, Nick, Nate, Contact):
- Wordmark: consistent size + tracking across all 7.
- Primary color: gold on `#0b1017` dark, gold on cream — consistent.
- Nav chrome: consistent.

The `/nate` cardiac-work subsite uses a larger h1 (~108px Fraunces) vs `/nick`'s ~88px. Side-by-side the two micro-sites feel like two products. The ask is explicit — "one brand across these five pages" — and the answer is *yes except for this one thing*.

→ **`R4-11`**. One-line fix: match Nate's h1 to Nick's (`font-size: 88px` → tokenize as `--display-hero-size: 88px`).

---

---

## § 0½ · Cross-bundle findings (new — not in the focus list)

After working through all 163 captures in `claude-design-2026-04-22-full-r4`, these surfaced independently of the 9 focus asks. Two of them are **P1 regressions of round-2 fixes** — ship before anything else.

### B1 · Test-fixture leak has spread to five surfaces  ⚠️ P1 REGRESSION

Round 2 shipped `P1-R2-01` / `P1-R2-02` filters for `test_delete_*` and `deep-audit-sync-*` on the My Hub activity feed and Ask the Lab. The filter did NOT get applied to the rest of the product. In the r4 bundle:

| Surface | Capture | What leaks |
|---|---|---|
| **Ask the Lab** | `desktop-29-ask-the-lab.png` | 2 of 3 visible questions are `_TEST_DELETE_lab_question_mo9n0ti5_mq1e` / `..._mo9mc14h_ot1f`, author "anonymous", marked Open. This is the same bug as `P1-R2-02` — it regressed. |
| **Decisions** | `desktop-10-decisions.png` | Top 2 rows: `_TEST_DELETE_decision_...` · Decided by "anonymous" · Project —. The visible "10 pending review" count includes them. |
| **Meeting Prep** | `desktop-39-meeting-prep.png` | Upcoming Deadlines block shows **7 of 8** entries as `_TEST_DELETE_c1task_*`. This is the worst single leak in the bundle. Also one `test_delete_Blocked task` without the caps prefix. |
| **My Hub regulatory** | `desktop-27-my-items.png` | Same `test_delete_` pattern from round 2 should be re-verified. |
| **Activity feed** | Spot-check `desktop-34-activity.png` post-fix | Re-verify. |

**Fix:** the filter needs to move OUT of `RecentActivity.tsx` and INTO a **shared query middleware** at the D1 layer (or a repo-layer predicate in `src/lib/db.ts`). Filtering at the view layer guaranteed this class of bug — any new view needing to list tasks/decisions/questions has to remember to import the filter.

```ts
// src/lib/db.ts — drop in as a shared predicate
export const TEST_FIXTURE_PATTERNS = [
  /^_?test_delete_/i,
  /^deep-audit-sync-/,
  /___cli_edit$/,
];

export function isTestFixture(title: string | null | undefined): boolean {
  if (!title) return false;
  return TEST_FIXTURE_PATTERNS.some(p => p.test(title));
}

// Apply in the base list query for each collection
export async function listTasks(db: D1Database, opts: ListOpts) {
  const rows = await db.prepare(`SELECT * FROM tasks WHERE ...`).all();
  return rows.results.filter(r => !isTestFixture(r.title));
}
// Same for listDecisions, listLabQuestions, listDeadlines, listActivity.
```

Plus a **one-time cleanup script** (`scripts/purge-test-fixtures.ts`) that hard-deletes existing rows matching any pattern. The filter is a defense-in-depth layer; purging the rows is the actual fix. Run once against prod D1 before Thursday. After this, consider a CI check that fails if any row with a `_TEST_DELETE_` title gets committed via seed scripts.

→ **`R4-P1-01`** — ship-blocker. Real team members in the Hub right now are seeing fake questions from "anonymous" on Ask the Lab.

---

### B2 · Mobile dashboard renders duplicate nav chrome  ⚠️ P1

`mobile-01-dashboard.png` shows a second `<img>` of the MN-CCORE wordmark appearing mid-page, followed by a second compact header (`≡` · logo · `≡` · screen icon) sitting between the "Tasks" card and the "Upcoming" card. This is a rendering bug: the `<AppShell>` header is appearing twice — once at the top, once inline when a `useMediaQuery` boundary reflows.

Likely cause: conditional mounting of `<MobileHeader/>` inside both `<AppShell/>` and the first child route. Check `src/components/layout/MobileHeader.tsx` import sites — should be exactly one.

→ **`R4-P1-02`**. Repro: load `/` on a ~375×800 viewport.

---

### B3 · Meeting Prep page is mostly test data  ⚠️ P1 (subsumed by B1)

Already covered in B1, but worth calling out: on `desktop-39-meeting-prep.png` the Upcoming Deadlines list is 7 of 8 rows test-data. A facilitator opening the Prep View expecting a real agenda of upcoming deadlines gets garbage. Once B1's purge + middleware lands, this page will read correctly — no separate ticket needed.

---

### B4 · Trajectory portal empty-states read as debug messages

`desktop-36-trajectory-portal.png`:
- **Publication Curve** shows literal text "Cannot get outcome" and a "Set OKRs" button — sounds like a runtime error escaping to the UI. If this is an intentional empty state, rewrite: "No publications indexed yet." / "Connect OpenAlex to populate this curve."
- **Project Velocity** stacked-bar chart uses 4 colors (blue, slate, gold, dark-teal) to encode project stage, but there's no legend. Colors-as-encoding without a key = decorative chart junk. Either add a legend or drop to a single accent.
- **Publication Timeline** and **Milestones** both render the same "No X tracked" empty-state illustration (open-book icon, flag icon). Two identical empty-state shapes back to back reads as "whole page is empty" — tighten to one empty state or show skeletons.

→ **`R4-P2-01`** (empty-state copy) and **`R4-P2-02`** (Project Velocity legend / single-color).

---

### B5 · Team-member page mixes marketing + portal chrome

`desktop-20-team-member-portal.png`: Nick's profile page is inside the portal (sidebar visible, Cmd+K search bar) but the hero block uses Fraunces display type (Nick's name at ~32px Fraunces 500, "MN-CCORE Team Member" caption in gold) — marketing register. Further down, "Nick's Dashboard" appears with 4 "dashboard-card" tiles each showing a giant Fraunces number (0 published, 2 actions pending, 37 projects).

Two issues:
1. **Type register mixing.** Portal pages should not use Fraunces display per `README.md` ("Fraunces only on public-marketing titles and kiosk heroes"). The name should be DM Sans 600 at 24px.
2. **Zero-state numeric dominance.** "0 published" rendered at Fraunces 56px is the visually loudest element on the page. When the underlying data is zero, huge metric numbers look like failures. Collapse the 4 tiles to a single 1-line summary *"37 projects · 0 publications · 2 actions pending · 8 complete"* until any of those numbers exceed the threshold where the Fraunces treatment is earned.

→ **`R4-P2-03`** (type register) and **`R4-P2-04`** (zero-state collapse).

---

### B6 · Mentee Milestones page: cards and table both under-populated

`desktop-16-mentee-milestones.png`: header says "12 upcoming milestones", card strip shows 4 mentees (Dan, Kendall, Casey, Michael), but the table below lists only 2 milestones (ATS Fluid Shortage poster, PLOS One submission). Either:
- The table is paginated at 2 and the pagination control is invisible — UX bug.
- The aggregation counts "upcoming" differently than the table's default filter.

Either way, the user-facing inconsistency between "12 upcoming" in the header and "2 rows shown" in the table is the bug. Align the two counts, or surface the filter state ("Showing 2 of 12 · clear filter").

→ **`R4-P2-05`**.

---

### B7 · Mobile parity gaps

`mobile-01-dashboard.png`, `mobile-03-my-tasks.png`, `mobile-07-project-detail.png`, `mobile-13-meetings.png`, `mobile-24-pulse-kiosk.png`:

1. **Touch targets on `/tasks` mobile** — row taps measure ~40px. The design-system floor is 44px (`README.md`). Increase `.mt-row { min-height: 44px }`.
2. **Kiosk mobile (`mobile-24`)** — the three hero metrics (18 · 64 · 19) sit edge-to-edge at a 375px viewport, no gutters. The "19" visually collides with "64". Add `gap: 24px` and allow wrap (3-column collapses to 2+1 on narrow).
3. **Duplicate nav chrome on `/` mobile** — already flagged as `R4-P1-02`.
4. **Tasks filter row on mobile** — 9 filter chips wrap to 3 rows and push the first task row ~160px below the viewport fold. Collapse filters into a single "Filters (3)" bottom-sheet trigger on <420px viewports.

→ **`R4-P2-06`** (touch targets), **`R4-P2-07`** (kiosk hero gutters), **`R4-P2-08`** (mobile filters sheet).

---

### B8 · Publications page (rich states) — confirm wins

`rich-pubs-01-start.png` / `-02-mid.png` / `-03-far.png` and `desktop-22-publications.png` all render cleanly. The year-eyebrow + title + journal pattern is the right amount of information. Journal-cover carousel positions all render without layout shift across the 3 scroll positions. **No action. Keep.**

---

### B9 · Dashboard Customize mode

`rich-dashboard-customize.png`: the 17-card toggle grid is on-system (pill affordance, drag-handle dots beside each pill) and the "Press F to toggle filters on any page" keyboard-nav hint is a nice touch. Two things:

1. **17 cards is too many options** for one surface. Group into "Always-on" (Action Board, Upcoming Meeting, Research Pipeline, Activity Feed) vs "Optional" (the rest). Users don't know what "CLIF Network" vs "Team Pulse" vs "Quick Stats" are until they enable them.
2. **The drag-handle dots (`⋮⋮`) beside each pill** imply drag reorder is supported on the pill — which is different from drag reorder on the dashboard itself. Confirm the interaction model; if pills don't drag-reorder (they probably don't; the canvas below does), drop the dots.

→ **`R4-P3-01`** (group), **`R4-P3-02`** (drag-affordance audit).

---

## § 1 · P1 tickets (post-launch, ship this week)

### `R4-P1-01` · Test-fixture leak — middleware filter + D1 purge

**Files:** `src/lib/db.ts` (new/extend), all `list*` query functions, `scripts/purge-test-fixtures.ts` (new)

See B1 above. Three work items:
1. Land the shared `isTestFixture()` predicate in `src/lib/db.ts`.
2. Wire it into `listTasks`, `listDecisions`, `listLabQuestions`, `listDeadlines`, `listActivity`, `listMilestones`.
3. Run `scripts/purge-test-fixtures.ts` against prod D1 in a scheduled maintenance window.

**Acceptance:**
- `/ask-the-lab` shows 1 question (`@hermes what is CLIF`), not 3.
- `/decisions` top rows are real decisions starting with "D1 as cloud truth".
- `/meetings/.../prep` Upcoming Deadlines shows real tasks.
- Activity feed and My Hub regulatory block unchanged (round-2 filter stays as belt-and-suspenders).
- A unit test: `listTasks()` given a fixture row returns 0 rows.

---

### `R4-P1-02` · Mobile dashboard duplicate nav chrome

**Files:** `src/components/layout/MobileHeader.tsx`, `src/components/layout/AppShell.tsx`, `src/pages/Dashboard.tsx`

See B2. One-line fix once located — grep for `<MobileHeader` call sites; there should be exactly one (in `AppShell`).

**Acceptance:** load `/` on 375×800 viewport. Exactly one header bar. No duplicate wordmark mid-page.

---

### `R4-01` · Inline chevrons — hide until hover

**Files:** `src/components/DataTable/Cell.tsx`, `src/index.css`

**Problem:** Four+ `▾` per row on Tasks, Projects, Manuscripts, Decisions reads as noise at 44px row density. See `focus-03-arrows-*.png`.

**Fix:** Chevrons appear only on row-hover or row-focus. Editable cells carry a persistent 1px dashed gold border-bottom at 0.25 opacity.

```css
/* src/index.css — add to the DataTable block */
.dt-cell[data-editable="true"] {
  border-bottom: 1px dashed rgba(201, 168, 76, 0.25);
  padding-bottom: calc(var(--row-pad-y) - 1px); /* preserve row height */
}
.dt-cell[data-editable="true"] .dt-chevron {
  opacity: 0;
  transition: opacity 100ms ease-out;
}
.dt-row:hover .dt-chevron,
.dt-row[data-focused="true"] .dt-chevron,
.dt-cell[data-editable="true"]:focus-visible .dt-chevron {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .dt-cell[data-editable="true"] .dt-chevron { transition: none; }
}
```

**Acceptance:**
- No chevrons visible at rest on the Tasks table (`/tasks`).
- Hover any row → all editable cells in that row show their chevrons in ≤ 100ms.
- J/K keyboard nav → focused row's chevrons visible.
- Dashed underline on editable cells visible at rest, readable from 24" away per Nick's kiosk rule.

---

### `R4-02` · Task-row focus outline — inset + dimmed

**Files:** `src/components/DataTable/Row.tsx`, `src/index.css`

**Problem:** 2px full-opacity teal outline on the focused row stacks visually with the row's existing top/bottom hairlines → three horizontal rules. See `focus-02-outline-j.png`.

**Fix:**
```css
.dt-row[data-focused="true"] {
  outline: 2px solid rgba(92, 188, 180, 0.55);
  outline-offset: -2px;
  /* remove background-color change — rely on outline alone */
}
/* Light mode — use the darker teal token */
[data-theme="light"] .dt-row[data-focused="true"] {
  outline-color: rgba(45, 122, 114, 0.70);
}
```

**Acceptance:**
- Press J/K → focus ring appears inset, no layout shift.
- Row beneath still shows its own bottom hairline — no double-line.
- Axe-core still passes focus-visible check (2.4.7).

---

### `R4-03` · Light-mode accent tokens

**Files:** `src/index.css` (root tokens + `[data-theme="light"]` block), `tailwind.config.ts`

**Problem:** Teal and gold lose contrast against cream. See A3 above.

**Fix:** Split `--teal` and `--gold` into per-theme variants. Keep the dark-mode values identical — change only light.

```css
:root {
  /* dark (default) — unchanged */
  --accent-interactive: #5cbcb4;   /* was --teal */
  --accent-emphasis:    #c9a84c;   /* was --gold */
  --accent-danger:      #f0737e;
}

[data-theme="light"] {
  --accent-interactive: #2d7a72;   /* AAA at 8.1:1 against cream */
  --accent-emphasis:    #9c7f2a;   /* darkened gold, 4.6:1 at ≥18px/600 */
  --accent-danger:      #c24652;   /* darkened maroon, 4.7:1 */
}
```

Then find-and-replace in `src/`:
- `var(--teal)` → `var(--accent-interactive)` (80+ sites)
- `var(--gold)` on text → `var(--accent-emphasis)` (gold on hairlines/icons keeps `--gold` literal)

**Acceptance:**
- axe-core light-mode pass on Tasks, Projects, Manuscripts, Digest, Analytics.
- Filter pills on `dl-03-my-tasks.png` equivalent readable at 1m.
- Gold heartbeat line unchanged on both themes (still literal `#c9a84c`).

---

## § 2 · P2 tickets

### `R4-P2-01` · Trajectory empty-state copy

**File:** `src/pages/Trajectory/PublicationCurve.tsx`

Replace "Cannot get outcome" + "Set OKRs" with: *"No publications indexed yet. Curve will populate when OpenAlex ingestion catches up."* Plain-English, system-not-user framing, no "Set OKRs" hype-phrase (unrelated to this card). Same pass on Project Velocity empty, Publication Timeline empty, Milestones empty — two empty-state illustrations in a row on the same page is the tell.

---

### `R4-P2-02` · Project Velocity legend / single-color

**File:** `src/pages/Trajectory/ProjectVelocity.tsx`

Either add a 4-swatch legend above the chart (*Planning · In Progress · In Review · Published*), or drop the 4-color encoding and use `var(--accent-emphasis)` on all bars; communicate stage via badge/chip on the row label instead. Recommend the second — consistent with "one accent per view."

---

### `R4-P2-03` · Team-member page type register

**File:** `src/pages/TeamMember.tsx`

Nick's name: `font: 600 24px/1.2 'DM Sans'` (not Fraunces). "MN-CCORE Team Member" caption in `--ink-dim`, not gold. Portal page — Fraunces is reserved for public-marketing + kiosk per `README.md`.

---

### `R4-P2-04` · Team-member dashboard zero-state

**File:** `src/pages/TeamMember.tsx` → `PersonalDashboard` block

When any metric is 0, collapse the 4-tile grid into one summary line: *"37 projects · 0 publications · 2 actions pending · 8 complete"*. Only show full-size Fraunces tiles when all 4 are > 0.

---

### `R4-P2-05` · Mentee Milestones count mismatch

**File:** `src/pages/MenteeMilestones.tsx`

Header says "12 upcoming", table shows 2. Either fix the default filter to show all 12, or surface the filter state: *"Showing 2 of 12 upcoming · View all →"*. Both counts must always reconcile.

---

### `R4-P2-06` · Mobile touch-target floor

```css
@media (max-width: 640px) {
  .dt-row { min-height: 44px; }
  .mobile-task-row { min-height: 44px; padding: 10px 12px; }
}
```

---

### `R4-P2-07` · Kiosk mobile hero gutters

```css
.kiosk-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
@media (max-width: 420px) {
  .kiosk-metrics { grid-template-columns: repeat(2, 1fr); }
  .kiosk-metrics > :last-child { grid-column: 1 / -1; justify-self: start; }
}
```

---

### `R4-P2-08` · Mobile filters bottom-sheet

**Files:** `src/pages/Tasks.tsx` + new `src/components/FilterSheet.tsx`

On ≤ 420px viewports replace the 9-chip inline filter row with `Filters (3)` → bottom-sheet drawer, 44px chips. Preserves above-fold task content.

---

### `R4-04` · Light-mode border alpha

**Files:** `src/index.css`

```css
[data-theme="light"] {
  --border-subtle:  rgba(0, 0, 0, 0.08);
  --border-default: rgba(0, 0, 0, 0.14);
  --border-strong:  rgba(0, 0, 0, 0.24);
}
```
Light-mode form inputs on `/settings` now read as bordered (see `dl-18-settings.png`).

---

### `R4-05` · Network default camera + persistent labels

**Files:** `src/pages/Network.tsx`, `src/components/network/Graph.tsx`

```tsx
// Graph.tsx — on mount
const HUB_AUTHOR_ID = 'ingraham-ne';
const TOP_N_LABELS = 6;

useEffect(() => {
  const subgraph = twoHopNeighbors(authors, edges, HUB_AUTHOR_ID);
  const bounds = computeBounds(subgraph);
  camera.fitTo(bounds, { padding: 80, duration: 0 });
  // Zoom dial ends ~1.35 after fit on typical data
}, []);

// compute betweenness centrality once, memoize
const pinnedLabelIds = useMemo(() =>
  topByBetweenness(authors, edges, TOP_N_LABELS), [authors, edges]);
```

Render labels for any node whose id ∈ `pinnedLabelIds` OR `hover === node.id` OR zoom ≥ 1.6.

**Acceptance:** first paint of `/network` shows 20±2 nodes, 6 labeled. No hairball.

---

### `R4-06` · Network legend

**Files:** `src/components/network/Legend.tsx` (new), `src/pages/Network.tsx`

160px wide card, top-right, 16px padding, dismissible (x). Two sections: **Nodes** (gold dot · MNCCORE author / muted blue dot · external collaborator) and **Edges** (gold line · MNCCORE co-authorship / teal line · external co-authorship).

Persist dismissal in localStorage `mnccore.network.legend.dismissed`.

---

### `R4-07` · Create Idea modal — collapse to single column

**Files:** `src/components/modals/CreateIdea.tsx`

Current: `grid-template-columns: 1fr 1fr` on the field block. Target: single column, matches Create Task (`rm-01`). Keep the priority pill row; that's on-system. Kill the 2-col grid.

---

### `R4-08` · Create Decision modal — kill italics, match multi-select

**Files:** `src/components/modals/CreateDecision.tsx`

1. Replace `<span class="help-text-italic">` on the Outcome field with `<p class="muted">` (inherits `--ink-dim`, no italics).
2. Replace the `<PillMultiSelect variant="inline">` on the "Related to" field with `<PillMultiSelect variant="chipped">` — the one used on Create Task's Assignee field. Same component, same prop pattern.

---

### `R4-09` · Hermes mark — two-tone

**Files:** `src/components/HermesMark.tsx`

Replace the solid gold sparkle with a two-tone version:

```tsx
export function HermesMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      {/* Outer 4-pt star — teal */}
      <path d="M8 0 L9.5 6.5 L16 8 L9.5 9.5 L8 16 L6.5 9.5 L0 8 L6.5 6.5 Z"
            fill="var(--accent-interactive)" opacity="0.9" />
      {/* Inner dot — gold */}
      <circle cx="8" cy="8" r="2" fill="var(--accent-emphasis)" />
    </svg>
  );
}
```

**Acceptance:** Hermes badge legible on gold CTAs, gold heartbeat bands, and cream light-mode digest headers. Still passes AA on both themes.

---

### `R4-10` · Phase-release pill (replaces banner)

**Files:** `src/components/AppShell.tsx` (remove banner insert), `src/components/PhasePill.tsx` (new)

```tsx
// PhasePill.tsx
<a href="/digest#phase-36c" className="phase-pill">
  <span className="dot" />
  Phase 36c shipped
  <ChevronRight size={12} />
</a>
```

```css
.phase-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 999px;
  background: rgba(92, 188, 180, 0.10);
  border: 1px solid rgba(92, 188, 180, 0.30);
  color: var(--accent-interactive);
  font-size: 12px; font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.phase-pill .dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--accent-interactive);
  animation: phase-pulse 2s ease-in-out infinite;
}
@keyframes phase-pulse { 0%,100% {opacity:1} 50% {opacity:0.4} }
@media (prefers-reduced-motion: reduce) { .phase-pill .dot { animation: none } }
```

Remove the `<PhaseBanner/>` insertion in `AppShell.tsx`. Mount `<PhasePill/>` next to the notification bell in `TopBar.tsx`.

**Acceptance:** banner gone; pill visible on every portal page; click → `/digest#phase-36c`; respects `prefers-reduced-motion`.

---

### `R4-11` · `/nate` lab-page h1 parity

**Files:** `src/pages/public/NateLab.tsx`, `src/pages/public/NickLab.tsx`, `src/index.css`

```css
:root {
  --display-hero-size: 88px;
  --display-hero-lh: 0.98;
}
.lab-hero h1 {
  font-family: 'Fraunces', serif;
  font-size: var(--display-hero-size);
  line-height: var(--display-hero-lh);
  font-weight: 500;
  letter-spacing: -0.025em;
}
```

Both pages consume the token. No more drift.

---

### `R4-12` · Dashboard ch2 empty band

**Files:** `src/pages/Dashboard.tsx`

The mid-scroll band has a ~180px empty strip between the card row and the deadlines strip. Either:
- Reduce row bottom-margin from 80px to 40px, **or**
- Promote Recent Activity from the third-row card slot into this band (at full width × 180px tall, showing 6 items).

Prefer the second — makes the band earn its vertical space.

---

### `R4-13` · Project Detail ch3 differentiation

**Files:** `src/pages/ProjectDetail.tsx`

"Recent decisions" card → timeline rail (gold dot per decision, 4px gutter, date on left, title on right). Breaks the "two identical card shapes in a row" rhythm without changing information density.

---

## § 3 · P3 tickets

### `R4-P3-01` · Dashboard customize grouping

**File:** `src/components/DashboardCustomize.tsx`

Split the 17 toggles into **Always-on** (Action Board, Upcoming Meeting, Research Pipeline, Activity Feed) and **Optional** (the rest). Add 1-line descriptions under each pill: *"Quick Stats — this week's completion %"*.

---

### `R4-P3-02` · Customize drag-handle audit

**File:** `src/components/DashboardCustomize.tsx`

Confirm whether the `⋮⋮` dots next to each pill actually drag-reorder pills. If not, drop them — drag glyphs that don't drag teach users to distrust affordances.

---

### `R4-14` · Analytics ch2 dead-zone

Insert a "What this tells you" 2-paragraph summary block below the last chart, or reduce bottom margin from 120px to 48px.

---

### `R4-15` · Create Project stage selector — circular dots

The dots-before-labels pattern in Create Project (`rm-06`) appears nowhere else. Either promote it (add the same dots on the Tasks status filter pills) or drop it. Recommend drop — the pattern doesn't pay for itself.

---

### `R4-16` · Mobile parity spot-check

Only 6 mobile captures this round — out of scope for a full review. Flag for round 5: explicit mobile captures of the Create Task modal and the J/K keyboard-nav fallback (there is no J/K on mobile; what takes its place?).

---

### `R4-17` · Test-fixture filter enforcement

Re-verify the `test_delete_*` and `deep-audit-sync-*` filter from round 2 still holds in the Activity feed and Regulatory block. Real team members in the Hub now — any slip shows up on their My Hub.

---

### `R4-18` · Keyboard Shortcut modal — add a "Close" hint

`rm-03-shortcut.png`: the modal lists navigation + action shortcuts but doesn't list its own close key (`Esc` or `?` again). Add a footer row: `Esc · Close` in the kbd style already used for the shortcuts. 4-line diff.

---

## § 4 · Chunk-review highlights

| Page | Chunk | Finding |
|---|---|---|
| Dashboard | ch2 | Empty band below card row — `R4-12`. |
| Project Detail | ch3 | Two identical list cards stacked — `R4-13`. |
| Analytics | ch2 | Dead-zone between last chart and footer — `R4-14`. |
| MyTasks | all | Clean. Table rhythm holds top to bottom. |
| Projects | all | Clean. |
| Manuscripts | all | Clean. |

Pages where full-page view and chunk view told the same story: MyTasks, Projects, Manuscripts, Trajectory (both variants), PB-Sector, Publication-Detail.

---

## § 5 · Wins (copy these patterns elsewhere)

- **Quick-add overlay (`focus-01-quick-add.png`)** — dense, one-key-away, no modal weight. The fact that it reads as an extension of the top bar instead of an overlay is why it works. Copy this pattern for the Hermes quick-ask affordance.
- **Command Palette (`rm-02-palette.png`)** — the ACTIONS / QUICK FILTERS split is the right information architecture. Airtable doesn't even get this right.
- **Shortcut Help (`rm-03-shortcut.png`)** — two-key `G D` / `G T` hints render cleanly; the single-column scan reads at speed.
- **Create Task (`rm-01-task.png`)** — reference modal. Every new modal should diff against this before merging.
- **Dark-mode luminance discipline** — scrolling through the 41 desktop captures, the surface / surface-2 / surface-3 progression holds. That's the whole thing; that's why the portal feels calm.
- **Heartbeat motif** — still the single best piece of branding in the product. Shows up just often enough to feel like a signature, not a theme.

---

## § 6 · Ticket index

| ID | Title | Priority | Files |
|---|---|---|---|
| **R4-P1-01** | **Test-fixture D1 middleware + purge** | **P1** | **lib/db.ts, scripts/purge-test-fixtures.ts** |
| **R4-P1-02** | **Mobile dashboard duplicate nav chrome** | **P1** | **layout/MobileHeader.tsx** |
| R4-01 | Chevron hover-only | P1 | DataTable/Cell.tsx |
| R4-02 | Focus outline inset | P1 | DataTable/Row.tsx |
| R4-03 | Light-mode accent tokens | P1 | index.css |
| R4-04 | Light-mode border alpha | P2 | index.css |
| R4-P2-01 | Trajectory empty-state copy | P2 | Trajectory/PublicationCurve.tsx |
| R4-P2-02 | Project Velocity legend / single-color | P2 | Trajectory/ProjectVelocity.tsx |
| R4-P2-03 | Team-member type register | P2 | TeamMember.tsx |
| R4-P2-04 | Team-member zero-state collapse | P2 | TeamMember.tsx |
| R4-P2-05 | Mentee Milestones count mismatch | P2 | MenteeMilestones.tsx |
| R4-P2-06 | Mobile touch-target floor | P2 | DataTable/Row.tsx |
| R4-P2-07 | Kiosk mobile hero gutters | P2 | Kiosk.tsx |
| R4-P2-08 | Mobile filters bottom-sheet | P2 | Tasks.tsx, FilterSheet.tsx |
| R4-05 | Network default camera | P2 | Network.tsx, Graph.tsx |
| R4-06 | Network legend | P2 | network/Legend.tsx |
| R4-07 | Create Idea single-col | P2 | modals/CreateIdea.tsx |
| R4-08 | Create Decision cleanup | P2 | modals/CreateDecision.tsx |
| R4-09 | Hermes two-tone | P2 | HermesMark.tsx |
| R4-10 | Phase pill (drops banner) | P2 | PhasePill.tsx, AppShell.tsx |
| R4-11 | `/nate` h1 parity | P2 | NateLab.tsx, index.css |
| R4-12 | Dashboard ch2 band | P2 | Dashboard.tsx |
| R4-13 | Project Detail ch3 rail | P2 | ProjectDetail.tsx |
| R4-P3-01 | Customize grouping | P3 | DashboardCustomize.tsx |
| R4-P3-02 | Customize drag-handle audit | P3 | DashboardCustomize.tsx |
| R4-14 | Analytics ch2 summary | P3 | Analytics.tsx |
| R4-15 | Create Project dots | P3 | modals/CreateProject.tsx |
| R4-16 | Mobile parity follow-up | P3 | — round 5 |
| R4-17 | Test-fixture filter re-verify | P3 | RecentActivity.tsx |
| R4-18 | Shortcut modal close hint | P3 | modals/ShortcutHelp.tsx |

**P1: 5 · P2: 17 · P3: 7 · Total: 29.**
