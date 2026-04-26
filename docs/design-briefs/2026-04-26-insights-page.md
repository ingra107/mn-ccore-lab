# Design brief — `/portal/insights` (Stitch-derived)

**Date:** 2026-04-26
**Source:** Stitch consultant batch r1 — `.stitch/designs/05-insights-page-r1.png`
**Stitch screen ID:** see `.stitch/designs/05-insights-page-r1.json`
**Status:** Plan-ready. No code yet.
**Estimated build:** 3-5 days, single feature branch, **no new tables**.

---

## Vision

A research-ops insights dashboard that surfaces non-obvious patterns from existing Hub data — what's accelerating, what's stalled, who's overloaded, where attention should go this week. Replaces ad-hoc "what's stalled?" Slack pings.

PI-only by default (`isPiRequest()` gate). Lab members see project-velocity + their own workload only.

## Page shape (mirrors Stitch r1 mockup)

```
┌─ Operational Insights ─────────────────────── [chip: Hub Aggregation Week N] ┐
│                                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
│  │ Stalled  │  │ Tasks/   │  │ Mss in   │  │ Grants   │                      │
│  │ projects │  │ person   │  │ revision │  │ pipeline │                      │
│  │   12     │  │   6.4    │  │    8     │  │    4     │                      │
│  │  ┄┄ spk  │  │  ┄┄ spk  │  │  ┄┄ spk  │  │  ┄┄ spk  │                      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘                      │
│                                                                              │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────┐        │
│  │ Workload heatmap                │  │ Pipeline funnel             │        │
│  │ 19 members × 5 weekdays         │  │ 7 stages, project counts    │        │
│  │ teal scale, 3 discrete bins     │  │ stage-fill colors per stage │        │
│  └─────────────────────────────────┘  └─────────────────────────────┘        │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐        │
│  │ Project velocity outliers (scatter)                              │        │
│  │ x = days since last update | y = open task count                 │        │
│  │ outliers (>30d OR >10 tasks) in maroon                           │        │
│  └──────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────┐        │
│  │ Critical Stalled Project Registry                                │        │
│  │ table: project | days idle | open tasks | + Set follow-up [btn]  │        │
│  └──────────────────────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Routes + paths

- Add to `src/constants/paths.ts`: `insights: '/portal/insights'`
- Add to `tests/helpers/paths.ts`: `insights: '/portal/insights'`
- App.tsx: gated route under `<RequireAuth>`, lazy `<InsightsPage />`
- Sidebar: new entry under "Research" group, between "Analytics" and "Calendar". Icon: `<TrendingUp />` from lucide. Label: "Insights".

## API — single endpoint

`GET /api/insights/dashboard?week=YYYY-WW` (optional, defaults to current ISO week)

Returns:

```ts
{
  week: "2026-W17",
  metrics: {
    stalledProjects: { count: 12, deltaWoW: -2, sparkline: [14,15,13,12,11,12,13,12] },
    tasksPerPerson: { avg: 6.4, distribution: { ... } },
    manuscriptsInRevision: { count: 8, awaitingReplyOver7d: 3 },
    grantsInPipeline: { count: 4, daysToNextDeadline: 9 }
  },
  workloadHeatmap: [
    { slug: "nick-ingraham", days: { mon: 8, tue: 5, wed: 9, thu: 4, fri: 7 } },
    // ... 18 more rows
  ],
  pipelineFunnel: [
    { stage: "Idea", count: 6 },
    { stage: "Data Collection", count: 11 },
    // ... 5 more
  ],
  velocityScatter: [
    { slug: "clif-pf-sf", title: "...", daysSinceUpdate: 18, openTasks: 4, isOutlier: false },
    // ... per project
  ],
  stalledRegistry: [
    { slug: "...", title: "...", daysIdle: 22, openTasks: 7, suggestedAction: "Schedule sync with team" },
    // ... 14d+ idle
  ]
}
```

Hono route file: `api/routes/insights.ts`. PI-only via existing `isPiRequest()` middleware on the route. Cache `Cache-Control: public, max-age=300, s-maxage=300` (5 min — insights change slowly).

### Underlying SQL (all on existing tables)

```sql
-- Stalled projects (14d+ no activity)
SELECT COUNT(*) FROM projects p
WHERE p.deleted_at IS NULL AND p.status='active'
  AND NOT EXISTS (
    SELECT 1 FROM project_updates pu
    WHERE pu.project_id = p.id AND pu.created_at > datetime('now','-14 days')
  );

-- Tasks per person
SELECT assignee, COUNT(*) AS open_tasks
FROM tasks
WHERE deleted_at IS NULL AND completed=0
GROUP BY assignee;

-- Workload heatmap (this week, by weekday)
SELECT assignee,
  CAST(strftime('%w', due_date) AS INT) AS dow,
  COUNT(*) AS task_count
FROM tasks
WHERE deleted_at IS NULL AND completed=0
  AND due_date >= date('now','weekday 1','-7 days')
  AND due_date < date('now','weekday 1')
GROUP BY assignee, dow;

-- Pipeline funnel
SELECT stage, COUNT(*) FROM projects
WHERE deleted_at IS NULL AND status='active'
GROUP BY stage;

-- Velocity scatter (per project, days since last update + open task count)
SELECT p.slug, p.title,
  julianday('now') - julianday(MAX(pu.created_at)) AS days_idle,
  (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.deleted_at IS NULL AND t.completed=0) AS open_tasks
FROM projects p
LEFT JOIN project_updates pu ON pu.project_id = p.id
WHERE p.deleted_at IS NULL AND p.status='active'
GROUP BY p.id;
```

## Components — Hub primitives, no shadcn

```
src/pages/portal/InsightsPage.tsx                 — top-level
src/components/insights/MetricHeroCard.tsx        — 4 hero cards (reuse MetricCard if shape fits)
src/components/insights/WorkloadHeatmap.tsx       — 19×5 grid, 3-bin teal scale
src/components/insights/PipelineFunnel.tsx        — 7 horizontal bars, stage-fill colors
src/components/insights/VelocityScatter.tsx       — Recharts ScatterChart, maroon outliers
src/components/insights/StalledRegistry.tsx       — TableContainer + ColumnHeader + per-row "+ Set follow-up" InlineButton
src/hooks/useInsights.ts                          — TanStack Query wrapper for /api/insights/dashboard
```

**Primitives to use (NOT raw markup):**
- `MetricCard` — hero number + sparkline. Check if existing component fits shape; if not, extend.
- `TableContainer` + `ColumnHeader` — registry table per Rule 17 (data-page treatment).
- `InlineDatePicker` — "Set follow-up" date for the action button (creates a follow-up task).
- `Avatar` — heatmap row labels (slug-based).
- `EmptyStateArt` — when no stalled projects ("All projects active in last 14 days").

**Stage-fill colors must use the `--stage-fill-*` tokens** (Rule 41) — funnel bars + their text. Do NOT use `--teal`/`--gold`/`--slate` (they flip light in dark mode + #fff text fails AA).

**Data-page taxonomy:** Insights is a **dashboard page** per Rule 17 (charts + metric cards + panels). Exempt from columnar table requirement EXCEPT the bottom Stalled Registry which is a small embedded table — apply ColumnHeader + TableContainer per existing pattern.

## Mutations — one new

`POST /api/projects/:slug/follow-up` → creates a task with `project_id=...`, `assignee=<current PI>`, `due_date=<picked date>`, `title="Follow up on stalled project: <project title>"`. Optimistic UI via existing `useTaskMutations`. Undo toast.

## Tests

1. `tests/local/data-validation.spec.ts` — extend with insights endpoint shape assertions.
2. `tests/inspection.spec.ts` — add InsightsPage to the rotating route list. Screenshot capture.
3. `tests/inspection-workflows.spec.ts` — workflow: PI navigates to /portal/insights → workload heatmap renders → click "+ Set follow-up" on stalled row → InlineDatePicker opens → pick date → task created in tasks table.

## A11y

- Heatmap cells: `role="gridcell"` with `aria-label="${name}: ${dayName}: ${taskCount} open tasks"`.
- Funnel bars: `role="img"` with text alt + visible count.
- Scatter chart: data table fallback below the chart (`<details>`) with the same data.
- Skip-to-content target: the metric hero row.

## Out-of-scope (intentionally)

- The Stitch mockup's "Operational Operational" double-rendered chip (model artifact — discard).
- Data export ("EXPORT LOGS" button in the Stitch mockup) — defer to follow-up if PI asks.
- Per-member drill-down on heatmap click — defer.
- Insights for past weeks (`week=` param defaults to current; archive UI is follow-up).
- Comparison view (this week vs last) — only the sparkline + delta-vs-last-week per metric for now.

## Definition of done

- ✓ Route lives at `/portal/insights`, PI-only gate verified
- ✓ All 5 SQL queries return correct counts on prod D1 (verified via Quick D1 console)
- ✓ Heatmap renders 19 rows × 5 cols with 3-bin teal scale, legend visible
- ✓ Funnel uses exact `--stage-fill-*` tokens, white text passes axe AA
- ✓ Scatter outliers in `#f0737e` maroon
- ✓ "+ Set follow-up" creates a real task, lands in `tasks` table, syncs to brain.db via `sync_d1_pull`
- ✓ `npm run build` clean, inspection spec green
- ✓ Sidebar entry added, route exported from `paths.ts`, test helper updated
- ✓ Updated CHANGELOG.md with phase entry

---

**Reference:** Stitch r1 mockup at `.stitch/designs/05-insights-page-r1.png` — open in browser before building. Use as visual reference, not as literal codegen target.
