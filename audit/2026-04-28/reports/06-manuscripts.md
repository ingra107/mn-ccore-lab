# Manuscripts Page Audit (`/portal/manuscripts`)

**Date**: 2026-04-28
**Agent ID**: `ac45891930848b39b`
**Files reviewed**: `src/pages/portal/Manuscripts.tsx`, `src/components/NeedsAttentionDashboard.tsx`, `src/components/RevisionTracker.tsx`, `src/components/SubmissionTimeline.tsx`, `src/hooks/useLabPrefs.ts`, `api/routes/revisions.ts`, `src/lib/api.ts`

### 1. Executive read

- **The page does its core job well.** Columnar table with stage grouping, three working views (List / Pipeline / Trophy), a properly-spec'd T-29 triage dashboard, inline-editable Status / Stage / PI / Category, and a stalled-aware calculations row. It is one of the more architecturally-clean data pages in the Hub — markedly better than `Tasks` or `MyTasks`, both of which bolt features onto a single component.
- **There are three meaningful product gaps.** (a) `RevisionTracker` and `SubmissionTimeline` are *only* surfaced inside `ProjectDetail` — the Manuscripts page itself never embeds them, despite Phase 25 + the audit framework calling for an "active submissions widget." (b) `stale-drafts` filtering joins by `title` instead of `slug` — a fragile join across two different data sources. (c) The "Stalled" filter in the toolbar uses a hardcoded `STALLED_THRESHOLD_DAYS = 30` (`Manuscripts.tsx:39`) while T-29's `staleDays` comes from `useLabPrefs()` — two parallel staleness models the user can't reconcile.
- **Design system compliance is mixed.** Stage progress dots use `var(--teal)` instead of `--stage-fill-*` tokens (Rule 41 violation), category dots are visual-only (`CategoryIcon` brand primitive is ignored, Rule 29), and 14+ inline raw-hex / token-divergent styles repeat instead of using shared building blocks. Accessibility on the toolbar is incomplete (PI filter `<select>` is unlabeled, count badge contrast is borderline, `aria-controls` on attention-toggle missing).

### 2. Surface-by-surface walkthrough

#### Page header (`Manuscripts.tsx:217-309`)
The header uses `PageHeader` correctly with icon + title + count + actions. The dynamic title (`writingCount > 0 ? '(N writing)' : '(N)' | MN-CCORE`) is clever — it surfaces "writing-in-progress" as the most actionable signal — but it does an unconditional `document.title` overwrite in a `useEffect` that **races the `usePageMeta()` call two lines above** (`Manuscripts.tsx:69-72` + `207-212`). Whichever effect runs last wins, and on rerender the second effect always wins, so `usePageMeta` is dead code on this page. Either remove the `usePageMeta` call or have `useEffect` defer to it.

`TableControls` hosts a PI filter (`InlineSelect`), a Stalled toggle, density toggle, view picker, and count label. Two issues: (a) the PI dropdown only includes Nick + Nate — hardcoded — which is fine today but **silently excludes any future lab member who owns a manuscript**, and the dataset already supports anyone. The category quick-filter has the same hardcoding. (b) The "Stalled" pill's count comes from filtering `projects` rather than `manuscripts`, so it counts published-status-but-non-published-stage projects too.

#### Category filter row (`Manuscripts.tsx:319-367`)
A `role="tablist"` row of pill chips below `TableControls`. URL-synced via `?category=` — good for saved-views and shareable filtered states. But: no multi-select, no clear-button when `category=...` is set in URL but no chip is rendered as "selected" (e.g., URL has `?category=invalid`), and the chips lack `aria-controls="manuscripts-table"` so AT users hear a tab control with no associated panel. The category dot is a 6×6 `<span>` instead of `CategoryIcon` (which exists in the brand primitives — Rule 29). This violates the brand-primitive rule that's enforced everywhere else.

#### NeedsAttentionDashboard (`NeedsAttentionDashboard.tsx`)
Implementation closely matches the T-29 spec:
- 3 subgroups (`revisions-overdue` / `awaiting-review` / `stale-drafts`)
- Empty-all renders single 32px muted line (`NeedsAttentionDashboard.tsx:66-79`)
- Single-non-empty subgroup renders expanded with no zero-state siblings (`onlyOne` branch, `:81 + :88`)
- Section collapse persisted to `manuscripts.attention.collapsed` LS (`:46-53`)
- Amber count pill at N≥5 via `CountBadge` — uses `--gold-on-emphasis` correctly per Rule 42

What's broken or suspect:
- **Click-to-filter wiring is half-implemented.** Click on subgroup header toggles `expanded` set AND `onFilterChange`. But "expand" and "filter" are two different ideas — clicking "Awaiting your review" expands the subgroup (good) AND filters the main table to those rows (also good)… but then clicking it again to *collapse* unsets the filter even though the filter's only purpose is to focus the table. A user who wants to read the rows in the subgroup but keep the full table below loses both at once. Should be two affordances: click chevron to expand/collapse, click row body or count badge to filter.
- **Every-row counts as "Filtering"** when active, but only one subgroup at a time can filter. This is unusual; the filter taxonomy is mutex even though it's expressed as 3 chips. Consider letting users multi-filter (`overdue || stale`).
- **`stale-drafts` filter hits `p.title` not `p.slug`** (`Manuscripts.tsx:146-151`). Stale drafts come from `publications` table (different rows than `projects`), and the matchup is by free-text title. Two manuscripts with the same title (or one with a stripped colon, or a typo) silently disappear. Worse: if there's no project at all (the publication isn't linked yet), the filter shows zero rows, even though the dashboard renders the row above it. The "open in main table" promise breaks. Should at minimum add a fallback: if filter zeros the table, render an inline note "These drafts aren't linked to a project yet — click to view in Publications."
- **`aria-controls` on subgroup toggle button is missing** (`:129-163`). The `aria-expanded` is correct (string, per Rule 39) but there's no link to the panel beneath, so screen reader users can't jump to the rows that just expanded.
- **Initial expanded state is empty**, so first paint of a multi-subgroup attention section shows three collapsed lines. Counts are visible but a user with one revision overdue + 3 stale drafts has to click twice to triage. Default to expanding the highest-urgency subgroup (`revisions-overdue` if N>0, else `awaiting-review`, else `stale-drafts`).

#### Main table — List view (`Manuscripts.tsx:373-668`)
6-column grid: `Title | Status | Stage | PI | Group | Days`. Stage-grouped headers when `sortKey==='stage'`. Inline editing via `InlineSelect` on Status / Stage / PI / Category — matches Rule 17 + R11-5.

What's working:
- `useListKeyboardNav` for J/K nav (`:168-173`).
- Stage progress dots row inline with the title (`:475-497`).
- Optimistic `inlineUpdate` mutation with rollback (`:102-120`) + 5s undo (`:124`) — Rule per design ethos.
- Mobile stacked layout (`:558-611`) with category dot + collapsed metadata row.
- Calculations row at bottom showing per-stage counts + "stalled" tail (`:626-666`).

What's broken or suspect:
- **Stage progress dots violate Rule 41.** The current-stage dot is `var(--teal)` (`:486`), which flips to a light dark-mode variant where white text on it fails 2:1. These dots don't carry text but the tokens are still wrong-typed — they should be `--stage-fill-*` per Rule 41 since the row is on a near-black panel.
- **Stage progress dots are not interactive.** The dots render `title={s}` for tooltip but aren't buttons. Users can't click a dot to advance the stage — they have to use the Stage `InlineSelect`. A clickable dot row would be the highest-leverage interaction on this page (one-click stage advancement).
- **Days-in-stage calculation is wrong-headed.** `daysInStage()` uses `project.updated_at` (`:42-45`), which means *any* edit to the project (including renaming the title or changing the PI) resets the stalled counter. The metric should be days since the last `stage` field change, which requires reading the activity log or storing `stage_entered_at`. Today, every inline edit makes a stalled paper appear fresh — the dashboard is lying to the team.
- **Inline edit click handlers don't always `stopPropagation`.** PI and Category cells wrap the InlineSelect in `<div onClick={(e) => e.stopPropagation()}>` (`:520, :533, :602`), but Status and Stage cells (`:501-509`, `:512-516`) do NOT. The `<Link to={PATHS.project(project.slug)}>` parent (`:445`) catches the click, so opening the Status dropdown ALSO navigates away. Test this on prod — odds are ~50% click latency wins lets the dropdown open, but key-clicks or precise click-and-drag will cause unintended navigation. It's the kind of bug Nick will hit twice and then file a GH issue.
- **6-column desktop grid breaks below ~1280px** because the columns are fixed at `90px 100px 140px 80px 68px` plus a flexing title (`:379`). On a 1024px laptop window with sidebar open (~880px usable), the title gets crushed and the stage-progress dots wrap below the title. There's no responsive intermediate between desktop and the `sm:hidden` mobile fork.
- **No `entity_id` data attribute** for testability. Other pages (per Rule 17 / data-testid policy) carry `data-testid="manuscript-row-${slug}"`. This page has none. Playwright tests fall back to text-content selectors.
- **"Group" column header is misleading.** The label is "Group" (`:389`) but the column shows category (`CLIF/Lab/Mesfin/Mentee`). A reader sees "Group" and expects authoring team or PI. Rename to "Category" to match the rest of the page taxonomy.
- **Days column uses `'var(--text-label)'`** (`:545`) where every other column uses raw `'14px'` / `'12px'` / `'11px'` literals. Mix of token vs literal in the same row.

#### Pipeline view (`Manuscripts.tsx:671-755`)
A 7-column horizontal pipeline (`Idea` → `Published`). Each card uses `motion.div` with layout animations + `AnimatePresence` for stage transitions.

Issues:
- **`gridTemplateColumns: repeat(7, minmax(180px, 1fr))`** at desktop = 1260px minimum without the sidebar. Below that, `overflowX: 'auto'` (`:677`) kicks in. There's no horizontal scroll affordance — no shadow gradient, no scroll-hint. Users see the first 4-5 columns and don't realize Published is offscreen.
- **Card has no inline edit affordance.** Pipeline view is a beautiful read-only browse mode. To advance a paper from Writing → Review you have to click into ProjectDetail. Drag-and-drop between columns is the canonical pipeline expectation — not implemented.
- **Card height is fixed-implicit** — long titles overflow the bottom of the card via `lineHeight: 1.4` and no `WebkitLineClamp`. On mobile, a 3-line title plus avatar pushes the card to 80+ px while neighbors stay at 50px.
- **Stage column header has no count limit** — when Idea has 30 entries the column is 30 stacked cards. No virtualization, no "Show all (30)" cutoff. With 71 projects in prod and a long-tail Idea bucket, this column will be 600+ px tall.

#### Trophy view (`Manuscripts.tsx:758-838`)
Cover-style cards for `stage === 'Published'` with a teal/gold gradient, journal+year, title (Fraunces italic), DOI link.

Issues:
- **Reads project fields that don't exist in the type.** `(p as any).journal_name || (p as any).target_journal || (p as any).journal` (`:773`) — three different field names cast through `any`. The `Project` type doesn't declare any of them, and the API may not send any of them. If `journal_name` is what the backend serves, lock to that and add it to the type. The triple-fallback is a smell that says "I don't know what the API returns."
- **Cards minHeight 220px even when empty.** A card with no journal, no year, no DOI is 220px of mostly-blank teal/gold gradient. Either render a more compact card when metadata is sparse, or fetch the missing data.
- **`var(--ink-bright, #fff)`** appears 3 times (`:794, :803`) — fine because gradient is white-text-on-color, but per Rule 14 this is exactly the right use. Document that this is intentional (the comment is missing).
- **No link out to the linked Publications entry.** Trophy view shows the cover but never offers "View in Publications" or "Open citation." A published manuscript should auto-create a `publications` row, and that row should be reachable from this card.

#### RevisionTracker / SubmissionTimeline (NOT on Manuscripts page)
Both components exist (`RevisionTracker.tsx`, `SubmissionTimeline.tsx`) but are *only* embedded inside `ProjectDetail` (`ProjectDetail.tsx` is the only consumer). The audit framework explicitly asks "active submissions widget on the Manuscripts main page?" — the answer is **no, it doesn't exist**. The legacy `ActiveRevisionsDashboard` (`RevisionTracker.tsx:858-1032`) is exported but no longer rendered on this page (replaced by `NeedsAttentionDashboard`). Dead code per Rule per `/simplify` discipline.

### 3. Findings table

| ID | Severity | Surface | Issue | Fix | Effort |
|----|----------|---------|-------|-----|--------|
| M-01 | High | List view | Status + Stage InlineSelect cells lack `e.stopPropagation` — opening dropdown can navigate away | Wrap both in `<div onClick={(e) => e.stopPropagation()}>` like PI/Category | XS |
| M-02 | High | Filter logic | `stale-drafts` filter joins by `title` (brittle); orphan publications silently disappear | Backend should return `project_slug` on stale_drafts rows; if NULL, render inline "unlinked" hint | M |
| M-03 | High | List view | `daysInStage()` uses `updated_at`, which any field edit resets — stalled metric is unreliable | Add `stage_entered_at` column (schema bump) OR derive from activity log | M |
| M-04 | High | Toolbar | Two parallel staleness models (`STALLED_THRESHOLD_DAYS=30` hardcoded vs `useLabPrefs.manuscriptsStaleDays`) | Replace hardcode with `prefs.manuscriptsStaleDays`; document in CLAUDE.md Rule 54 | XS |
| M-05 | Med | Header | `usePageMeta` + `document.title` effect race — `usePageMeta` is dead | Remove the `useEffect` and pass dynamic count through `usePageMeta(title)` | XS |
| M-06 | Med | Stage dots | Use `var(--teal)` not `--stage-fill-*` (Rule 41 violation) | Map stage→`--stage-fill-{idea,...published}` token | XS |
| M-07 | Med | Stage dots | Not interactive — can't click to advance | Wrap each in `<button>`, advance stage on click, undo toast | S |
| M-08 | Med | List view | 6-col grid breaks 1024-1280 viewport; title squeezed | Add intermediate `md:` grid with collapsed Days+Group columns | S |
| M-09 | Med | NeedsAttention | Click-to-filter and click-to-expand share one button — collapse loses filter | Split: chevron toggles expand; row body / count toggles filter | S |
| M-10 | Med | NeedsAttention | Default-collapsed subgroups; user has to click to triage | Auto-expand highest-urgency non-empty subgroup on first paint | XS |
| M-11 | Med | Trophy view | Reads `(p as any).journal_name \|\| target_journal \|\| journal` | Add fields to `Project` type; pick canonical name; remove cast | XS |
| M-12 | Med | Page | Active Submissions widget missing despite Phase 25 spec | Add a `<SubmissionTimelineSummary>` at top of List view (top 5 active) | M |
| M-13 | Med | Pipeline | No drag-and-drop between stages | Wire `react-dnd` or `@dnd-kit` per Phase 25 expectation | L |
| M-14 | Med | Toolbar | PI filter hardcoded to Nick + Nate — silently excludes future PIs | Derive options from manuscripts: `[...new Set(projects.map(p => p.pi))]` | XS |
| M-15 | Med | Category chips | Use `<span>` 6×6 dots instead of `CategoryIcon` brand primitive (Rule 29) | Swap to `<CategoryIcon category={value} size={12} />` | XS |
| M-16 | Med | A11y | Toolbar PI `<select>` lacks `aria-label` per Rule 38 | Add `aria-label="Filter by PI"` | XS |
| M-17 | Med | A11y | Subgroup toggle missing `aria-controls` | Add `aria-controls="ms-subgroup-${key}-rows"` | XS |
| M-18 | Med | A11y | Category tablist has no `aria-controls` | Add `aria-controls="manuscripts-table"` | XS |
| M-19 | Low | Trophy | Card minHeight 220px even with sparse metadata | Compact mode when journal+year+DOI all missing | S |
| M-20 | Low | Trophy | No "View in Publications" link from card | Add link if `p.publication_id` is set | S |
| M-21 | Low | Pipeline | Idea column unbounded vertical growth | Cap at 8, add "Show all (N)" | S |
| M-22 | Low | Pipeline | No horizontal-scroll affordance | Right-edge fade gradient + scroll hint on hover | XS |
| M-23 | Low | List | No `data-testid` on rows | Add `data-testid="manuscript-row-${slug}"` | XS |
| M-24 | Low | List | "Group" header label confusing — column shows category | Rename header to "Category" | XS |
| M-25 | Low | Code | `ActiveRevisionsDashboard` (`RevisionTracker.tsx:858-1032`) is dead | Delete; `NeedsAttentionDashboard` replaced it | XS |
| M-26 | Low | Mobile | Mobile stacked card has no stage progress dots | Render condensed dot strip (5px) below metadata row | S |
| M-27 | Low | Stalled | Stalled count badge uses `--orange` solid bg with white text, hardcoded `'white'` not `--ink-bright` | Replace with token | XS |
| M-28 | Low | Hover | `:hover` rule uses `var(--gold-hover)` for read-state — clashes with stalled-orange semantic | Use `--surface-3` or cool hover | XS |
| M-29 | Low | List | Density classes don't propagate to mobile stacked rows | Apply density tokens to mobile path | S |
| M-30 | Low | Filter UX | URL `?category=invalid` shows nothing with no clear-button | Validate against `CATEGORY_LABEL`; reset to '' if unknown | XS |

### 4. Top 5 high-leverage enhancements

1. **Click-to-advance stage dots.** The dot row at `Manuscripts.tsx:475-497` is read-only. Make each dot a `<button>` that advances the stage to that target with confirmation + 5s undo. This is a 30-minute change that adds the highest-frequency action on this page (stage advancement happens weekly per manuscript) without requiring the dropdown. A "drag the dot forward" affordance would be even better but a click is enough.

2. **Active Submissions widget at the top of List view.** Render a horizontal-scroll row of `SubmissionTimeline` mini-cards above the table, scoped to manuscripts with `submitted` / `reviews_received` / `revision_due` in the last 30 days. The component already exists — just needs a thin wrapper that fetches across all projects and renders the next event per project. This was implied by Phase 25 (`Paper Submission Lifecycle`) but never landed on Manuscripts itself.

3. **Pipeline view drag-and-drop between stages.** Pipeline today is read-only. With `@dnd-kit/core` already in the lockfile (used elsewhere), wiring drag-from-column to drop-on-column is ~80 lines + the existing `inlineUpdate` mutation. This converts the Pipeline view from "another way to look at the same data" (current value: low) to "the canonical way to advance papers" (high).

4. **Auto-link Published manuscripts to Publications entries.** When a project's stage flips to `Published`, the Hub should auto-create a `publications` row and store the link on the project. Trophy view's card then becomes a real bridge between the operational surface (Manuscripts) and the curated archive (Publications). Today the surfaces are parallel data silos.

5. **`stage_entered_at` column + per-stage time-in-stage analytics.** Right now `daysInStage` is wrong. With a real `stage_entered_at`, the Manuscripts page can render a 7-stage horizontal heatmap showing per-stage average time across the lab — a real PI dashboard signal that LabSync doesn't have. Schema migration is small (one column + a trigger to update it on stage change), payoff is large.

### 5. NeedsAttentionDashboard — T-29 spec compliance

| Spec item | Implemented? | Notes |
|-----------|--------------|-------|
| 3 subgroups (overdue / awaiting / stale) | Yes | `NeedsAttentionDashboard.tsx:22-30` |
| Computed from manuscript_revisions + reviewer_comments + publications | Yes | `revisions.ts:277-311` |
| `?review_days=&stale_days=` query params | Yes | `:269-275` |
| Thresholds from `useLabPrefs` (default 7/30) | Yes | `:42-45` + `useLabPrefs.ts:16` |
| Clamped 0-365 | Yes | `useLabPrefs.ts:32-36` |
| Replaces `ActiveRevisionsDashboard` | Partially — old component still exported but not rendered |
| 3 collapsible subgroups | Yes | `:122-181` |
| Amber count pill at N≥5 | Yes | `CountBadge` w/ `--gold-on-emphasis` |
| Click-to-filter wires to main table | Yes, but coupled to expand toggle |
| Section collapse persisted to LS | Yes | `LS_COLLAPSED = 'manuscripts.attention.collapsed'` |
| Empty-all = single 32px muted line | Yes | `:66-79` |
| Single-subgroup renders without zero-state siblings | Yes | `onlyOne` branch + `nonEmpty` filter |
| Thresholds in Settings → Lab tab | Yes | `SettingsPage.tsx:626` `LabPrefsPanel` |

**Spec compliance: 12/13 strong.** The one weakness is the click semantics (M-09) — the spec says "click-to-filter," current implementation is "click-to-expand-AND-filter," which produces the bug where collapsing a subgroup also clears the filter. Minor but real.

### 6. Brand & design-system observations

- **Brand primitives ignored.** `CategoryIcon` exists (Rule 29) but the page renders 6×6 colored `<span>` dots in the title cell, the category chip row, the pipeline cards, AND the mobile stacked layout. Five separate sites of bespoke category visualization. This is a CategoryIcon adoption opportunity.
- **No `HeartbeatLine` / `HeartbeatDivider` between sections.** Other surfaces use the ECG motif as section separator (Rule 29). The boundary between NeedsAttention and category chips and the table is plain `marginBottom`. Adds visual rhythm + brand voice.
- **`HermesMark` not used despite Hermes auto-summary opportunity.** Hermes can summarize a manuscript's revision status, suggest next steps, parse reviewer comments. Today there's no `@hermes` surface on this page — a button "Ask Hermes about this paper" on each row would land instantly.
- **Stage progress dots: `var(--teal)` for current, `var(--ink-muted)` for past, transparent for future** (`:483-489`). Three issues: (a) `--teal` not `--stage-fill-*` — Rule 41 violation; (b) past states all collapse to same `--ink-muted` so you can't tell "Idea→DataCollection" from "Idea→Writing"; (c) future-state border `0.85` opacity flickers in dark mode against the row hover bg. Fix: future = 1px `--border-subtle`, past = 4px `--ink-muted`, current = 6px `--stage-fill-{stage}`.
- **`--text-label` only used on the Days column** (`:545`), nowhere else in row. Mixing literal-px and tokens in same row is not the discipline applied elsewhere.
- **Hover rule `var(--gold-hover) !important`** (`:849`) is fine but `!important` is a smell — the parent `<Link>` reset shouldn't need it. Likely `Link` default styling fights Tailwind reset somewhere; fix the cascade rather than `!important`.
- **`CATEGORY_DOT.nate = var(--gold)`** (`:51`) is correct for the "Mesfin" semantic but the key is `nate` not `mesfin`. Slug rename Phase 36b updated all team slugs but this category token still uses the old key. The map works (`CATEGORY_LABEL.nate = 'Mesfin'`) but anyone grepping for "mesfin" misses this code path.

### 7. Edge cases / failure modes

- **0 manuscripts.** EmptyState renders "The shelf is empty." Calculations row hidden. Good.
- **1 manuscript.** Single-row table. Stage group header still renders ("Idea 1 ────"). Acceptable but visually heavy for a single row. Consider: hide group header if only one stage non-empty.
- **50 manuscripts in Idea.** No pagination, no virtualization. The page renders all 50 rows synchronously. With 71 projects in prod this is fine, at ~200 it lags. Pipeline view's Idea column will be 500+ px tall.
- **Long titles (>100 chars).** Desktop list: title wraps and pushes the row height (no `WebkitLineClamp`). Pipeline card: same — card grows to 4 lines. Trophy view: 3-line clamp (good).
- **Multi-revision papers (3+ rounds).** Not surfaced on Manuscripts page itself — only inside ProjectDetail. NeedsAttentionDashboard only shows the most-overdue revision per row (?). Worth confirming the SQL in `revisions.ts:277-291` handles multi-round papers — currently it returns one row per revision (good), so a paper with R1 overdue AND R2 overdue would show twice.
- **All-stalled state.** Calculations row `marginLeft: auto` orange "N stalled" tail (`:660`). Visually heavy. If `stalled === manuscripts.length`, the whole row is orange, which is the right signal but could also be the wrong signal (the lab could just be on vacation — collective stall).
- **All-fresh state.** No surface celebrates this. NeedsAttention collapses to single line. Could add a positive signal ("All caught up — last triage Mon 9am").
- **Manuscript without a stage.** Falls through to "Idea" by default (`:194` `map['Idea'].push(p)`). Silent. Good fallback.
- **Manuscript without a category.** `CATEGORY_DOT[p.category] ?? 'var(--slate)'` (`:462`) — silver dot, no label. Mobile stacked layout shows no category at all in compact metadata row. Should default to "Uncategorized" pill.
- **Stalled overlap with NeedsAttention.** A paper can be in both the toolbar Stalled filter AND the NeedsAttention `revisions-overdue` subgroup. They don't visually deconflict — clicking Stalled then a NeedsAttention chip stacks both filters with no UI showing this. The result table is the AND of both. Add a "1 stalled · 1 overdue" composite indicator.

### 8. Open questions for PI

1. **Drag-and-drop on Pipeline view — yes or no?** Adds ~80 lines + `@dnd-kit` work. Trades the read-only safety for a one-action stage advance.
2. **`stage_entered_at` schema bump.** Real days-in-stage requires this. The migration is cheap; the Hub-brain.db cross-repo coordination per Rule R10 is the real cost. Worth a Decision doc?
3. **Auto-create publication row on `stage='Published'`?** Today these are parallel surfaces. Auto-link is the "obvious" fix but creates a second source of truth on what was a manuscript. Do you want the Manuscripts page to be the lifecycle-of-record from idea → published, or do you want Publications to take over once shipped?
4. **Hermes integration on Manuscripts.** "Summarize the open R2 reviewer comments and suggest a draft response" is in scope for Hermes today. Should there be a row-level "Ask Hermes" button on this page, or stay confined to ProjectDetail's Revisions tab?
5. **PI filter hardcoded to Nick + Nate.** Will any mentee become a PI on a manuscript? If so, the filter needs to derive PI options from data, not the static `PI_OPTIONS` constant.
6. **Trophy view "covers."** The teal/gold gradient is generic. Do you want real journal logos / cover thumbnails (would need a DOI→cover service like Crossref or manual upload), or stay with the generic gradient?
7. **Active Submissions widget at top of page — confirm placement.** Above NeedsAttention or below? My instinct is below NeedsAttention, above the category chips, scoped to "events in last 14 days." But you may prefer it as a fourth subgroup *inside* NeedsAttention.
8. **Should clicking the title cell open ProjectDetail, or expand a Manuscripts-detail panel?** Today (`:445`) full-row navigates to `/portal/projects/<slug>`. Other data pages (Tasks) use a side-panel detail pattern with stable cursor. Manuscripts could either stay row-as-link or become row-expands-panel — but mixing the two ("title goes to ProjectDetail, hovering reveals a peek panel") is the worst of both.
