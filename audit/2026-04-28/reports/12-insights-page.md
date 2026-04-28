# InsightsPage audit — `/portal/insights`

**Date**: 2026-04-28
**Agent ID**: `a54538b57bbc42c06`
**Files reviewed**: `src/pages/portal/InsightsPage.tsx`, `docs/design-briefs/2026-04-26-insights-page.md`, `.stitch/designs/05-insights-page.png` + r1, `api/routes/insights.ts`, `src/hooks/useInsightConnections.ts`

## 1. Executive read

- **Implementation is brief-faithful but stops at "v0 spec compliance"** — every section in the brief shipped, queries match the SQL block almost verbatim, and the PI-only gate works. Nothing is broken. Nothing is exciting either; this is the most "designed by spec" page in the Hub, and it shows.
- **The big miss vs. ethos is action affordance.** "Insight without action = noise" is the audit framework's third principle. Of the seven surfaces on this page, only ONE has a CTA (the Stalled Registry's "+ Set follow-up"). The four hero cards, heatmap, funnel, scatter, and even the in-API "tasksPerPerson.distribution" payload are all read-only. A PI looking at an overloaded `nick-ingraham` row in the heatmap has no path from observation → action without leaving the page.
- **Hermes is completely absent.** The page is called "Insights," gold is the AI accent (Rule 59), the gold MetricCards are styled as if they're AI-generated — but there is no `HermesMark`, no "Tell me more," no "What should I do?" Per Rule 29 brand-primitive discipline, any AI-flavored insight surface should carry HermesMark. The current implementation is a statistical dashboard wearing AI cosplay.

## 2. Brief-vs-implementation gap analysis

### What the brief asked for vs. what shipped

| Brief requirement | Status | Evidence |
|---|---|---|
| Route at `/portal/insights`, PI-only gate | SHIPPED | `paths.ts:49`, `App.tsx:283`, `api/index.ts:331-334` |
| Sidebar entry "between Analytics and Calendar" under "Research" group | DRIFTED | `Sidebar.tsx:101` places it under **Lab** group between Analytics and **My Profile** — Calendar sits in a different section. Brief said "Research" group. Either the brief was wrong or sidebar IA changed; needs reconciliation. |
| Single endpoint `/api/insights/dashboard?week=YYYY-WW` (configurable week) | PARTIAL | `?week=` param accepted by URL? No. `handleInsightsDashboard` signature is `(env)` only — `isoWeek(new Date())` always uses current week (`insights.ts:274`). Brief explicitly said "optional, defaults to current". This rules out the "Insights for past weeks" follow-up before it can exist. |
| `Cache-Control: public, max-age=300, s-maxage=300` (5 min) | SHIPPED | `insights.ts:421` |
| 4 hero metric cards | SHIPPED | `InsightsPage.tsx:92-129` |
| Sparkline on each hero card | **MISSING** | Brief diagram explicitly shows `┄┄ spk` on every card. Implementation has only delta-vs-last-week on stalledProjects (`InsightsPage.tsx:196-200`); no sparkline anywhere. The API doesn't return sparkline arrays either (`insights.ts:244-249`). The brief response example included `sparkline: [14,15,13,12,11,12,13,12]` — not in actual `DashboardMetrics`. |
| Workload heatmap, 19 members × 5 weekdays, **3-bin teal scale** | SHIPPED but degenerate | `InsightsPage.tsx:218-223` uses 3 bins (low 1-3, med 4-8, high 9+). Bins keyed off `--stage-fill-data-collection` (teal-ish). 19-row max isn't enforced; only members with task rows appear (heatmap omits members with zero tasks for the week — see edge case below). |
| Pipeline funnel, 7 stages, `--stage-fill-*` colors | SHIPPED | `InsightsPage.tsx:30-38, 318` |
| Scatter chart, x=days idle, y=open tasks, **maroon outliers** (>30d OR >10 tasks) | SHIPPED | `insights.ts:385`, `InsightsPage.tsx:370` |
| Stalled registry: project / days idle / open tasks / **+ Set follow-up button** | SHIPPED with deviation | Brief said use `InlineDatePicker` to pick a follow-up date. Implementation hard-codes `+3 days` (`InsightsPage.tsx:410-412`) — no date picker. Brief also asked for `POST /api/projects/:slug/follow-up` mutation; implementation calls `POST /api/tasks` directly. Both are valid choices, but the brief deviation is silent. |
| Optimistic UI + Undo toast on follow-up creation | **MISSING** | `useMutation` has `onSuccess` showing a success toast (`InsightsPage.tsx:430`) but no optimistic update and no `useUndoToast`. Compare to TodayPage's bulk actions which use real `useBulkUpdateTasks` + UndoToast. |
| `EmptyStateArt` per Rule 29 | DOWNGRADED | Stalled empty state uses `EmptyState` with a generic `<TrendingUp />` icon (`InsightsPage.tsx:436-440`). Brief explicitly said "EmptyStateArt — when no stalled projects." |
| A11y: `role="gridcell"` with descriptive aria-label on heatmap | SHIPPED | `InsightsPage.tsx:253-254` |
| A11y: `<details>` table fallback under scatter | SHIPPED | `InsightsPage.tsx:379-399` |
| Skip-to-content target = metric hero row | **MISSING** | No `id` or `tabindex` on the metric grid (`InsightsPage.tsx:84`). |
| Tests in inspection + workflows + data-validation | UNVERIFIED | Did not grep tests; brief listed them as required. Worth verifying. |

### What shipped beyond brief

- A11y: scatter has `<title>` tooltips on each `<circle>` (`InsightsPage.tsx:373`) — nice touch.
- The hero card delta indicator on stalled-projects has direction-encoded color (`green` ▼ improvement, `maroon` ▲ getting worse) — `InsightsPage.tsx:197`. Brief didn't spec this; it works.

### What the brief explicitly excluded but the absence still matters

- "Per-member drill-down on heatmap click — defer." Punted, but heatmap rows are navigable in zero ways — clicking a name does nothing, hovering shows no preview. This is exactly the kind of "punt the limitation forever" Nick rejects (per the MEMORY.md "no punting" entry).
- "Insights for past weeks (`week=` param defaults to current; archive UI is follow-up)." But the API doesn't even accept `?week=`; the param is unimplemented, not deferred.

## 3. Surface-by-surface walkthrough

### Header (`InsightsPage.tsx:77-81`)
- `PageHeader` with `<TrendingUp />` icon. Subtitle: `Hub aggregation · 2026-W17`. Static, no last-computed timestamp, no manual refresh button. Compare to InsightsCard (Lab Overview) which has a `RefreshCw` button (`InsightsCard.tsx:31-51`); the dedicated page has no equivalent. PIs need to refresh tab to see fresh data, and the 5-min edge cache means "force refresh" is the only way to break out of stale data.

### Metric hero row (`InsightsPage.tsx:84-130`)
- Four cards, `repeat(auto-fit, minmax(200px, 1fr))`. On a wide monitor this is 4-up; at ~1000px it's 3-up + 1 wrapped (visually awkward — odd row left-aligned).
- Two of four cards use `accent="var(--gold)"` (manuscripts + grants). Per Rule 59, gold = AI insights. These are statistical not AI — the gold accent is misapplied. Current uses suggest gold also reads as "user-driven action / planned" elsewhere (Today/MyTasks — Rule 59), but this isn't Today/MyTasks.
- `var(--maroon)` accent on stalled count > 0 is fine semantically (warning). But the maroon hex is the **bright dark-mode variant** `#f0737e` — on a `--surface-1` (dark cardish) bg, fine. In **light mode**, `--maroon` resolves to `#7a0019` and the 32px tabular-nums "12" stalled-projects number sits on a white-ish card. Contrast OK there. But: the green-on-stalled (`var(--green)` for delta) — `#066e2f` light / `#6ee89a` dark — does not test against `--surface-1` light. Worth running through axe.
- `MetricCard` brand primitive exists (per CLAUDE.md "use them, don't reinvent"), but this page rolls its own `MetricHero` (`InsightsPage.tsx:172-209`). Brief allowed "reuse MetricCard if shape fits"; shape clearly does fit (label + number + delta + sublabel) — this is reinvention. Concretely: `BrandShared MetricCard` is what the Lab Overview's `BentoCard` uses; if a future design pass changes metric-card semantics, this page won't pick it up.

### Workload heatmap (`InsightsPage.tsx:211-292`)
- Grid `gridTemplateColumns: '120px repeat(5, 1fr)'`. 19 rows × 5 cols at 22px each = ~440px tall. Fits.
- **Bug:** uses React `<>...</>` fragments inside a CSS Grid as direct children of the grid container (`InsightsPage.tsx:246-272`). Each row is wrapped in a fragment containing 1 rowheader + 5 gridcells = 6 grid items. This works in modern browsers because fragments don't render a wrapper, but assigning `key` to the fragment is fine; however `<>` doesn't accept `key` as a prop in the standard form — line 246 is `<>...</>` not `<React.Fragment key={...}>`. Each child carries its own `key`, so the fragment level is unkeyed. React will warn about siblings sharing keys if the inner elements collide; here they're per-row + per-day so they're unique. Not broken, but fragile.
- Cells use 3 bins keyed off `--stage-fill-data-collection` (`#0d6f68`). The brief said "teal scale" — this is a slate-teal. `--teal-solid` would be more on-brand.
- `cellColor(0) = 'rgba(255,255,255,0.03)'`. In light mode this is invisible against white-ish cards. The whole cell is rendered (you see the empty box outline) but the bg has no contrast. Minor.
- **`distribution` is fetched but never rendered.** API computes per-person open-task distribution (`insights.ts:303`), payload includes it (`InsightsPage.tsx:20`), no UI surface uses it. The hero card just shows total/avg. A "tasks per person" bar would be the highest-leverage addition — that's literally what the metric label promises but doesn't deliver.
- **Subtle data bug:** API filters `due_date >= date('now', 'weekday 1', '-7 days') AND < date('now', 'weekday 1')` (`insights.ts:342-343`). SQLite's `date('now','weekday 1')` returns *next* Monday (or today if today is Monday). On a Wednesday, `weekday 1` = upcoming Monday, `-7 days` = previous Monday → range = previous Monday through next-Monday-minus-1 = "this week so far + remaining" actually, no: it's the previous Monday through Sunday. So on Wednesday it shows last Monday-Sunday, not "this week's tasks". On a Sunday `weekday 1` = tomorrow, range = last Monday-Sunday. The chart says "Tasks due this week" (aria-label `InsightsPage.tsx:236`) but the data is **last week**. Since brief SQL is the same, this is brief-and-impl in lockstep, but the user-facing label is wrong. A correct "this week" filter is `due_date >= date('now', 'weekday 0', '-6 days') AND < date('now', 'weekday 0', '+1 day')` (Sun→Sat) or similar.
- Members with zero tasks for the week don't appear at all (`heatmapMap` only gets entries for assignees with rows). A 19-member team with 8 members idle this week shows an 11-row heatmap. Brief diagram shows 19 fixed rows; impl is reactive.
- Heatmap row name is read-only — clicking does nothing. Should `Link` to `/portal/team/:slug` or `/portal/my-tasks?assignee=:slug`.

### Pipeline funnel (`InsightsPage.tsx:294-339`)
- 7 horizontal bars, stage-fill colors. Width = `(count / max) * 100%`. Fine.
- White text on bar (count) — `--stage-fill-*` tokens are AA-pinned for white text per Rule 41. Good.
- Stage with `count = 0` renders an empty bar (count rendered as empty string `:330`). Reads as "we have no stages at this level" which is fine, but a zero-count stage and a stage you don't have any data for both look identical. A zero label `0` would be clearer.
- Bars have no click target. Clicking "Writing — 4" should ideally filter Projects to `stage=Writing` (deeplink to `/portal/projects?stage=Writing`).
- Stage labels are right-aligned at 110px flex-basis — tight at 11px font. "Data Collection" and "Data Analysis" both fit, barely. RTL or zoom would clip.

### Velocity scatter (`InsightsPage.tsx:341-402`)
- Hand-rolled SVG (700×240). Brief said "Recharts ScatterChart" (`brief:141`). Hand-rolled is fine — but skips Recharts' tooltip, axis labels, brushing.
- Axis lines, no tick labels, no axis title (label is in subtitle prose `:352-354`). Compare to Stitch design (below) which has clean labeled axes.
- Outliers larger circle + maroon. Non-outliers teal. No size scale, no opacity scale, no labels. A PI looking at the chart knows "there are 3 maroon dots over there" but can't identify which projects without hovering each. `<title>` tooltips work in browser (`:373`) but not reliably; on touch devices they don't.
- Scrollable container `overflow: auto` (`:355`) — good for narrow viewports.
- The `<details>` table fallback is great a11y. Could be promoted to default-visible filter: "Show outliers as a list" since that's the actionable subset.
- **No projection of cluster centers, no quadrants.** A 4-quadrant overlay (low-idle/low-tasks "healthy", high-idle/low-tasks "abandoned", low-idle/high-tasks "overloaded", high-idle/high-tasks "critical") would turn a scatter into a diagnosis.

### Stalled registry (`InsightsPage.tsx:404-519`)
- Single visible CTA on the page: `+ Set follow-up`.
- **Hard-coded `+3 days` due date** (`InsightsPage.tsx:410-412`). No `InlineDatePicker` per brief. PI can't say "follow up next Monday" — only "in 3 days from now". Compare to ProjectDetail which has full inline date picking on tasks.
- Assignee defaults to current PI's slug, falls back to `'nick-ingraham'`. Title format is `"Follow up on stalled project: <project title>"` — this is fine but doesn't note which PI assigned it or why. A task description carrying "auto-created from Insights / 22d idle / 7 open tasks" would link the action back to the data state.
- No "snooze" or "dismiss" — once a project is stalled it stays stalled until project_updates flow in. PI clicking +Set follow-up doesn't change the stalled state of the project, so on next visit the project is still in the registry. No ack mechanism.
- **Two parallel renders (desktop + mobile)** at `InsightsPage.tsx:446-516`. The two render the same data twice with different layout. Idiomatic Hub pattern is `useIsMobile()` (per Rule 55) or pure CSS. Two render trees ship 2× the DOM nodes — small list but pattern-wise should consolidate.
- Mobile fallback uses `+ Follow-up` button (no "Set"). Desktop uses `+ Set follow-up`. Different label for the same action.
- `TableContainer` is used but `ColumnHeader` is NOT (rolled own at `:446-452`). Per Rule 17, data-pages use shared ColumnHeader; the brief allowed dashboard-page exception "EXCEPT the bottom Stalled Registry which is a small embedded table — apply ColumnHeader + TableContainer per existing pattern." Spec violated.
- Project title `<Link>` truncates with ellipsis at the column width. Long titles fully clipped — no `<HoverCard>` to preview. Nick has a HoverCard wired to project links elsewhere.

### Insight categories (audit framework Q3)

The audit framework asks: "What categories of insights exist?" Implementation surfaces:
1. **Stagnation** (stalled projects, 14d threshold)
2. **Workload distribution** (heatmap, hero per-person avg)
3. **Manuscript progress** (count + awaitingReplyOver7d)
4. **Grant pipeline** (count + days to next deadline)
5. **Project velocity** (scatter outliers)
6. **Pipeline shape** (funnel)

Missing categories (vs. project-context "what insights matter for an academic lab"):
- **Mentee progress** — separate page exists (`/portal/mentee-milestones`), no signal here even though mentee stalls are different from project stalls (e.g. zero data extracts in 3 weeks).
- **Publication velocity** — not surfaced (e.g. "lab pub rate is 0.4/mo, 3-month rolling average is 0.9").
- **Anomaly flagging** — no "Nick has 4× his average task load this week" delta callout.
- **Cross-project semantic edges** — `useInsightConnections` IS the cross-project topic-overlap engine (`api/routes/insights.ts:50-211`), but it's NOT surfaced on this page. It's only used in Lab Overview's `InsightsCard`. The page named "Insights" omits the semantic-insights engine.

This is the biggest design gap: the existing /api/insights/connections endpoint with 4 inference modes (PI overlap / category+stage / topic keywords / shared papers) is unused on the Insights page. A "Connections" panel showing top-5 cross-project topic links — with a "do something" CTA like "Schedule a sync between these two projects" — would justify the Insights label.

### AI provenance (audit framework Q5)
- None. The whole page is statistical / SQL-derived. No `HermesMark` (Rule 29). No "Hermes generated this" callout. Calling it "Insights" without AI is fine, but Rule 59 says gold = AI; gold is used on metrics that aren't AI. Either swap accents or wire actual Hermes elaboration on click.
- Hermes integration (Q9) absent. `Tell me more` / `What should I do?` are both Hermes-flavored; both are obvious extension points.

### Refresh / freshness (audit framework Q7)
- 5-min edge cache + TanStack `staleTime: 5 * 60 * 1000`. Computed on demand. No "last refreshed" timestamp. No manual refresh button on the Insights page (one exists on the Lab Overview InsightsCard). On a paid Workers plan with 6 SQL queries per request, cost is fine; freshness is the user's blocker, not perf.

### Filters (audit framework Q8)
- **Zero filters.** Brief excluded "comparison view (this week vs last) — only the sparkline + delta-vs-last-week per metric for now." But:
  - No category filter (CLIF / Lab / Mesfin / Mentee). PI can't see "stalled CLIF projects only".
  - No time horizon (14d stall threshold is hard-coded — clinical-grant PIs might want 30d, mentee-PIs might want 7d).
  - No severity filter on scatter.
- The brief's `?week=` param isn't even wired (see §2). Once it is, a week-prev/week-next chevron pair belongs in the header.

## 4. Findings table

| ID | Severity | Surface | Issue | Fix | Effort |
|---|---|---|---|---|---|
| INS-01 | P0 | Heatmap data | "Tasks due this week" label shows last week's tasks (SQL `weekday 1, -7 days` range) | Change to `due_date >= date('now','weekday 0','-6 days') AND < date('now','weekday 0','+1 day')` (Mon-Sun) or stop labeling as "this week" | S |
| INS-02 | P0 | Stalled CTA | Hard-coded `+3d` due date — no date picker per brief | Wire `InlineDatePicker` between button + mutation; show picker inline like ProjectDetail | S |
| INS-03 | P1 | Page-wide | Zero refresh button on a cached page | Add `<RefreshCw>` next to PageHeader subtitle, invalidate `['insights-dashboard']` | XS |
| INS-04 | P1 | API | `?week=` param accepted by neither API nor URL — historical view impossible | Parse `c.req.query('week')` in the route, pass to `handleInsightsDashboard(env, week)`, replace `isoWeek(new Date())` | S |
| INS-05 | P1 | Hero | Sparklines specified by brief (every card) — none implemented | Compute 8-week trailing series in API for each metric; render as inline SVG path in `MetricHero` | M |
| INS-06 | P1 | Hero | Should use shared `MetricCard` brand primitive, not roll-own | Replace `MetricHero` with `MetricCard` from `src/components/` | XS |
| INS-07 | P1 | EmptyState | Brief said `EmptyStateArt`; impl uses generic `EmptyState` | Swap import + use `<EmptyStateArt variant="all-clear" />` (or whichever fits) | XS |
| INS-08 | P1 | Action affordance | 5 of 7 surfaces have zero CTA — heatmap rows, scatter dots, funnel bars not navigable | Make heatmap rownames `Link` to `/portal/team/:slug`; funnel bars to `/portal/projects?stage=:stage`; scatter dots to project detail | S |
| INS-09 | P1 | tasksPerPerson | API returns `distribution` array, UI never renders it | Add a per-person bar chart panel below the hero or sort heatmap by distribution count (currently sorted by sum of mon-fri only — should match) | S |
| INS-10 | P1 | Insights coverage | `/api/insights/connections` semantic edges engine exists but is not on the page named "Insights" | Add a "Connections" panel — top 5 cross-project edges with reason chip + "Schedule sync" CTA | M |
| INS-11 | P2 | Hermes | No HermesMark, no "Tell me more" — page mismatched to Rule 29/59 | Add HermesMark on each insight card with a "Tell me more" → opens AskTheLab pre-filled with insight context | M |
| INS-12 | P2 | Stalled registry | Mobile + desktop renders diverge in label ("+ Set follow-up" vs "+ Follow-up") | Single render tree using `useIsMobile()` per Rule 55 | XS |
| INS-13 | P2 | Stalled registry | No `ColumnHeader`, no shared header pattern | Use `<ColumnHeader />` per Rule 17 (data-page treatment per brief) | S |
| INS-14 | P2 | Stalled registry | Set-follow-up is fire-and-forget; no optimistic UI, no UndoToast | Wire `useTaskMutations` + UndoToast | S |
| INS-15 | P2 | Filters | Zero filters — category, severity, time horizon all hard-coded | Add category multi-select filter chip in header; persist to LS | M |
| INS-16 | P2 | Scatter | No quadrant overlay, no axis labels | Add 30d/10-task crosshair lines + 4-quadrant labels ("healthy / abandoned / overloaded / critical") | S |
| INS-17 | P3 | Heatmap | Zero-task members hidden — 19→11 row visual collapse | Pad list with zero rows for missing active members, sort idle-last | S |
| INS-18 | P3 | Hero card | Gold accent on Manuscripts + Grants conflicts with Rule 59 gold = AI | Swap to neutral or `--maroon-solid` for severity, reserve gold for genuine AI insights | XS |
| INS-19 | P3 | A11y | Skip-to-content target on metric hero specified — missing | `id="insights-hero"` + `tabindex="-1"` on metric grid; add to skip-link list | XS |
| INS-20 | P3 | Stalled registry | Truncated project titles have no `HoverCard` preview | Wrap `Link` in `<HoverCard type="project" slug={r.slug}>` | XS |
| INS-21 | P3 | Funnel | No click target on bars | Wrap bar in `<Link to={PATHS.projects + '?stage=' + r.stage}>` | XS |
| INS-22 | P3 | Heatmap | `<>` fragment as Grid child — fragile, unkeyed | Replace fragments with explicit `<div role="row" style={{display: 'contents'}}>` | XS |
| INS-23 | P3 | Naming | Page route `dashboard` query key (`['insights-dashboard']`) collides conceptually with Today/Lab Overview "dashboard" | Rename to `['insights', 'operational']` for clarity | XS |
| INS-24 | P3 | API/Schema | `manuscript_revisions` + `nih_grants` queries silent-catch errors as 0 (`.catch(() => ({c:0}))` `:320, 326, 331`) — masks schema drift | Surface error in metric sublabel ("data unavailable") instead of swallowing | S |

## 5. Top 5 high-leverage enhancements

1. **Wire the Connections engine onto the Insights page (INS-10).** `/api/insights/connections` already exists with PI/category-stage/topic-keyword/shared-paper inference. Adding a "Cross-Project Connections" panel between the funnel and the scatter delivers the only AI-shaped insight the codebase already has — and gives this page an identity beyond "stats dashboard." Pair with a CTA: "Schedule sync" → creates a meeting in the Meetings table linking both projects. **2-3 days.**

2. **Make the page navigable (INS-08).** Every chart should answer "okay, where do I go?" Heatmap rows → team workspace. Funnel bars → filtered projects list. Scatter dots → project detail. The page becomes the lab's command center instead of a pretty observer. **1 day.**

3. **Hermes round-trip (INS-11).** "Why is this project stalled?" → click HermesMark → opens AskTheLab pre-filled with `Project: <slug>, last update: <date>, open tasks: <n>, what's the diagnosis?` Hermes already polls `/api/ai-requests`; this is a thin shim from page to existing infra. The page named "Insights" gains an AI partner. Closes the loop on Rule 29/59. **1-2 days.**

4. **Sparklines + week comparison (INS-04, INS-05).** The brief diagrammed sparklines on every hero card; without them, the hero strip is "4 numbers." Adding 8-week trailing sparklines + the already-spec'd `?week=` param + week-prev/week-next chevrons makes this page useful for quarterly retros, not just the current Tuesday. **2 days.**

5. **Replace `+3d hardcode` with `InlineDatePicker` (INS-02) + Hermes-suggested date.** Brief specified InlineDatePicker. Better: the picker pre-fills with a Hermes-suggested follow-up date based on project category and PI's typical sync cadence. Even without Hermes, just wiring the picker recovers brief compliance. **0.5 day for picker, +1 day for Hermes suggestion.**

## 6. Stitch design observations

Comparing `.stitch/designs/05-insights-page.png` (original v0) and `05-insights-page-r1.png` (r1 refined) to the implementation:

**What Stitch got right and the impl missed:**

- **`05-insights-page.png` had narrative insight cards in the hero strip** ("Mortality data shows 18% increase…", "Tracheostomy decisions: 80% align…", etc.) with severity icons (warning triangle, lightbulb, clipboard, info circle). These were prose summaries, NOT just numbers. THAT is the AI-flavored insight surface — observation + interpretation. The impl reduces these to bare numerics. **Steal: prose-narrative cards as the top row, numerics demoted to a second row or sparkline footer.**
- **Stitch's heatmap legend used Mon-Tue-Wed-Thu-Fri header columns + total-tasks column on the right.** The impl skips the total column. Steal: rightmost "Total" column with sum.
- **Stitch's scatter had a colored cluster overlay** showing density — 4 cluster regions, not 4 absolute quadrants. Visually distinct from impl's bare dots-on-axes. The Stitch r1 mock specifically shows a green cluster (healthy projects) and a red cluster (outliers) with shaded ellipses behind them.
- **Stitch's stalled registry was 5-column** (status pill / project / urgency / due / suggested action). Impl is 4-column with no status pill or suggested action. Brief response shape included `suggestedAction: "Schedule sync with team"` — never wired into UI or API. Impl drops this entirely.
- **Stitch's right-side floating "AI assistant" affordance** (the small pill button bottom-right of the scatter card in `05-insights-page.png`) is exactly the Hermes mid-page anchor we should add. Direct steal.

**What Stitch over-promised:**

- The "Operational Operational" double-rendered chip — brief flagged as artifact, impl correctly omits. Good.
- Stitch's page was titled "This Week's Insights" (`05-insights-page.png`) and "Operational Insights" (r1). Impl uses "Operational Insights" — alignment with r1.
- Stitch's metric numbers used hand-drawn-feel typography (looked editorial). Impl uses operational tabular-nums per design ethos. Right call.

**Color discipline observations:**

- Stitch r1 uses teal+gold heavily on the heatmap and metric cards. Impl scopes teal to interactive only. Stitch has the more visually rich page; impl is calmer. Per design ethos #5 ("one accent per view"), impl is more correct — but the page reads flatter than the design proposed.

## 7. Brand & design-system observations

- **Rule 29 violated**: brand primitives (`HermesMark`, `EmptyStateArt`, `CategoryIcon`) absent. `EmptyStateArt` was specified in the brief and downgraded.
- **Rule 41 honored**: `--stage-fill-*` tokens used on funnel bars (good, brief explicit).
- **Rule 59 misapplied**: gold accent on Manuscripts + Grants hero cards. Gold = AI per Rule 59. Should use neutral or maroon-for-severity.
- **Rule 17 violated**: stalled registry is "an embedded table on a dashboard page" per brief; impl uses raw `<div>` headers instead of `<ColumnHeader>`.
- **Rule 5 violated**: design ethos #5 says "one accent color per view." Page uses teal (heatmap, hero, set-follow-up button), gold (2 hero cards), maroon (stalled count, scatter outliers), green (improvement delta). 4 accents.
- **Typography**: `MetricHero` uses 32px fontWeight 700 — that's `--weight-metric` which is correctly the dashboard-numbers weight per design ethos #4. Good. Section headers use 14px/600 — correctly `--weight-heading`.
- **Spacing**: uses `var(--sp-*)` tokens consistently. Good.
- **Z-index**: not relevant here (no overlays except `<details>`). Not exercised.
- **Rule 50 (PageHeader subtitle aria-live)**: PageHeader's subtitle has aria-live by default but the count chip (`SectionHeader count`) doesn't.
- **MetricCard primitive available, page rolls own** — biggest brand-consistency gap.
- **Density**: page is sparse, lots of whitespace. Per "more info, more readable" (design ethos #6), the page can absorb more — sparklines, totals column, suggested-action column, connections panel.

## 8. Edge cases / failure modes

| Case | Behavior | Should be |
|---|---|---|
| 0 stalled projects, 0 active grants, 0 manuscripts | Hero cards show 0/0/0, EmptyState in registry | Bigger celebratory empty: "All clear this week — workload is balanced, no stalls, no urgent grants." (use `EmptyStateArt`) |
| 0 active projects (all archived/done) | Funnel is 7 zero-count bars; scatter is empty SVG; registry empty | Render a single page-wide EmptyState explaining state |
| 50+ stalled projects | Registry becomes a 50-row endless table with no virtualization | Virtualize via `@tanstack/react-virtual` or paginate (10 default + "Show more") |
| Only 1 PI on the Hub | Brief allows lab members to see "project-velocity + their own workload only" — impl treats the whole page as PI-only (403 for non-PI) | Split: lab members get a reduced view (heatmap-self, scatter, no manuscripts/grants), PIs get full. Brief explicitly mentions this lab-member fallback (`brief:14`). |
| Cold start (new lab, no project_updates ever) | All projects show daysSinceUpdate = 999 (`insights.ts:384`); all stalled | Treat "never had an update" differently from "stalled for 999 days" — show "Awaiting first update" subtitle on registry rows |
| Schema drift (manuscript_revisions or nih_grants table missing) | Silent catch → 0 (`insights.ts:320, 326, 331`) | Render "Data unavailable" sublabel on metric cards instead of fake 0s |
| All members have 0 tasks scheduled this week | Heatmap empty-state message renders | Same path; OK |
| Mobile (<480px) | Hero grid `auto-fit minmax(200px,1fr)` collapses to 1-up; heatmap 120px label column too wide | Adjust column to `min(120px, 30vw)` and stack heatmap vertically per-day below ~600px |
| User toggles to light mode | `cellColor(0) = rgba(255,255,255,0.03)` invisible; track legend dots invisible | Use surface tokens that flip with theme |
| Stale insights (>7 days old data via cache) | No indication; 5-min cache means data feels fresh but `data.week` is the only freshness signal | Add `<time>` element with relative timestamp ("Computed 4 minutes ago") |
| 0 outliers in scatter | Section header count = 0; chart shows all teal dots | Section header text "No outliers — all projects updating regularly" |
| `getPersonInfo()` returns generic for unknown slug | Heatmap row uses literal slug text | Already handles via getPersonInfo — but stalled registry doesn't show assignee |
| Tab parked in background 30+ min | TanStack `refetchOnWindowFocus` defaults true → refetch on return; but no real-time invalidation | Add to `useRealtimeSync`'s broadcast list — when any project_update is created, invalidate `['insights-dashboard']` |

## 9. Open questions for PI

1. **Is this PI-only by design, or should lab members see a reduced view?** Brief said "PI-only by default; lab members see project-velocity + their own workload only" — impl is full PI gate (403 for everyone else). This eliminates the lab-member view path entirely. Confirm intent.

2. **Does the page need to be the home of the Cross-Project Connections engine?** It's the most differentiated feature in the codebase (4-mode semantic inference) and currently lives only on Lab Overview as `InsightsCard`. Promoting it to InsightsPage would consolidate the "Insights" identity.

3. **Is +3d the right default for follow-up tasks, or should it be PI-configurable?** Hard-coded today; the brief explicitly said use `InlineDatePicker`. Confirm whether to honor the brief or accept the hardcode.

4. **What's the Hermes integration story for this page?** Rule 59 gives gold to AI; impl uses gold without AI. Either (a) stop using gold here, or (b) wire Hermes (Tell me more / What should I do? round-trip).

5. **Stale-thresholds (`STALL_THRESHOLD_DAYS = 14`, `SCATTER_OUTLIER_DAYS = 30`, `SCATTER_OUTLIER_TASKS = 10`) — should these be PI-configurable?** Different categories likely have different cadences. Mentee projects probably should stall at 7d; CLIF mature analyses can stall at 30d without alarm. Currently hard-coded constants.

6. **Should the insights page receive realtime invalidation?** When a project_update lands, the whole "stalled" set flips immediately. Currently we wait 5 minutes for the cache or a manual reload. Worth wiring through `useRealtimeSync` like other surfaces?

7. **Does this page deserve "no-data" treatment for new labs / cold starts?** Right now a brand-new lab would see all zeros across the board, which reads as "broken page" rather than "you're starting from a clean slate." Worth a Phase-2 onboarding view?

8. **Should the brief's `?week=` param ship?** Without it, "Insights for past weeks" remains a follow-up forever; with 30 minutes of work, the API + URL are wired, and a future archive UI becomes possible.
