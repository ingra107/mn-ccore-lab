# Decision: Retire my-tasks-legacy route + bootstrap `comments` drift (2026-06-14)

## What was retired

### my-tasks-legacy frontend route (Task A)
- Removed `MyTasksLegacy` lazy import from `src/App.tsx` (~line 127).
- Removed `/portal/my-tasks-legacy` route definition from `src/App.tsx` (~line 274).
- Removed `myTasksLegacy` entry from `src/constants/paths.ts`.
- Updated stale comment in `src/pages/MyTasks/index.tsx` that referenced the legacy mount path.

The legacy route aliased `src/pages/portal/MyTasks` (the old pre-Round-2 page) at
`/portal/my-tasks-legacy` as a sprint safety net. Round 2 (`/portal/my-tasks` →
`src/pages/MyTasks/index.tsx`) had fully soaked; `paths.myTasksLegacy` had zero consumers.
`src/pages/portal/MyTasks` itself is NOT deleted — it may still be imported elsewhere;
only the route alias and path constant were removed.

### bootstrap-schema.sql `comments` table drift (Task B)
- Removed the dead `comments` table CREATE block from `api/bootstrap-schema.sql` (was lines 96-103).

The `comments` table (project discussions) was removed from prod D1 in schema-v78. The
other five retired tables (daily_plans, daily_reflections, task_comments, task_updates,
project_updates) were already absent from bootstrap. Leaving `comments` meant a fresh
bootstrap would resurrect a table that no handler reads or writes. Dependency grep confirmed
zero bare `comments` table reads/writes in tests, seed, or TS handlers (all `comments`
references in the codebase are sub-paths or real tables: digest_comments, task_comments,
reviewer_comments).

### Stale comment in pb-sector.ts (Task C)
- Updated the NOTE block at `api/routes/pb-sector.ts` lines 8-13: changed "remain physically;
  drop is deferred" to "were removed in schema-v78 (2026-06-14)" for daily_plans and
  daily_reflections. The comment for hub_pomodoro_slots was not changed (it is accurate to
  note it was superseded; physical drop status not confirmed in this task).

## Context

The six "twin" D1 tables (daily_plans, daily_reflections, comments, project_updates,
task_comments, task_updates) were already physically removed in prod D1 as of schema-v78.
Today's cleanup is residual only: no table drops were performed (nothing to drop). Only
the frontend alias, the bootstrap resurrection risk, and stale comments were addressed.

## Files touched

- `src/App.tsx`
- `src/constants/paths.ts`
- `src/pages/MyTasks/index.tsx`
- `api/bootstrap-schema.sql`
- `api/routes/pb-sector.ts`
- `docs/2026-06-14-retire-legacy-d1-twins-and-my-tasks-legacy.md` (this file)
