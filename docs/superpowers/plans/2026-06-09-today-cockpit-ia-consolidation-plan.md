# Today Cockpit — IA consolidation plan (dedicated session)

- **Created:** 2026-06-09 (Workstream B follow-on — PLAN ONLY, no code this round)
- **Predecessor:** Workstream B shipped the durable plan store as synced task columns
  (`planned_for` / `plan_slot` / `plan_rank`). Decision:
  `Peripheral-Brain/Context/Decisions/2026-06-09-today-plan-task-columns.md`.
- **Why a separate session:** Workstream B deliberately did NOT touch the OTHER plan stores.
  Consolidating them is an information-architecture decision with its own blast radius (retirements,
  data migration, frontend removal) — it must not ride on the additive schema slice. This file is the
  scoped ticket queue for that session.

## The problem: FOUR overlapping "today / plan" stores

After Workstream B there are four substrates that all answer some flavor of "what am I doing today":

| # | Store | Where | Owns | Overlap with Workstream B |
|---|---|---|---|---|
| 1 | **Today plan columns** (canonical, NEW) | `tasks.planned_for/plan_slot/plan_rank` (D1 + brain.db) | The operating-day plan for everyone's Today cockpit | — (this IS the new SSOT) |
| 2 | **PB Sector `daily_plans`** | D1 `daily_plans` (`api/schema-v20.sql`, routes `api/routes/pb-sector.ts`) | `star_task_id`, `focus_task_ids`, `quick_win_ids`, `intention`, `gratitude`, `status` per `plan_date` | DIRECT — star/focus/quick_win is the same "Right Now / planned / quick" model the task columns now own |
| 3 | **Personal** | `src/pages/portal/PersonalPage.tsx` | per-person task surface (no dedicated plan table found; uses tasks) | INDIRECT — any local "strip"/plan affordance should read the task columns |
| 4 | **`lab_settings.today_md`** | D1 `lab_settings` key, route `api/routes/pb-today.ts` (read-only) | The raw generated TODAY.md text (Nick's CLI output, mirrored for the read-only Hub view) | NONE structurally — it's a rendered artifact, not a plan store. Verdict below. |

Plus the disposition question for `daily_plans`' siblings: `pomodoro_sessions`, `daily_reflections`
(intention/gratitude/highlight/learned), `dispatch_queue`.

## Tickets

### IA-1 — `daily_plans` retirement vs migration (the load-bearing decision)
**Question:** does anything still WRITE/READ `daily_plans`? Audit `api/routes/pb-sector.ts` callers +
the frontend (PB Sector planner UI, if any is still mounted). Then decide per the substrate-swap skill:
- **If dead (0 live writers/readers):** retire it — `/substrate-swap` checklist (twin-file grep, 24h
  dogfood, handoff sweep). The plan model it held (star/focus/quick_win) is now the task columns
  (`plan_slot='right_now'` = star; `'strip'`/`'between-<n>'` + `plan_rank` = focus/quick ordering).
- **If live:** write a migration that lifts the latest `daily_plans` row's task lists onto the task
  columns (star_task_id → plan_slot='right_now'; focus_task_ids/quick_win_ids → planned_for=today +
  plan_slot='strip' + plan_rank by list order), then retire. Carry `intention`/`gratitude` to IA-4.
**Hard rail:** this is a D1 table retirement — cross-repo schema coordination + decision doc + Time-
Travel backstop. Do NOT drop the table in the same commit as the code that stops using it without the
substrate-swap dogfood window.

### IA-2 — Personal strip / plan affordances read the task columns
Audit `PersonalPage.tsx` (+ `HubTaskRow`) for any local plan/strip state. Re-point any "plan for
today" / promote affordance there at `src/lib/todayPlan.ts` (the same primitive Today/MyTasks now use),
so Personal stays in lockstep with the one plan store. No new store.

### IA-3 — `lab_settings.today_md` verdict: KEEP (not a plan store)
`today_md` is the rendered TODAY.md text Nick's CLI emits, surfaced read-only at `/api/pb/today`
(`pb-today.ts`; the POST upsert was already retired 2026-05-05). It is an ARTIFACT, not a plan
substrate — it does not compete with the task columns. **Verdict: keep as-is.** The only follow-up is
cosmetic: TODAY.md now carries the 📌 plan markers (Workstream B), so the read-only Hub view inherits
them for free — verify the view renders the new markers acceptably; no schema change.

### IA-4 — pomodoro / intention / gratitude disposition (options, decide in session)
These rode on `daily_plans` / its sibling tables but are NOT "the plan":
- **pomodoro_sessions** — already partly live (TodayPage `usePBSessionStats` reads PB pomodoro for the
  focus-minutes metric). **Option A (recommended):** keep as its own table (it's session telemetry,
  not a plan); it already has a clean home. **Option B:** fold into a future activity-timeline (M5).
- **intention / gratitude** (on `daily_plans`) — daily scratch text, per-day, single-user.
  **Option A:** these are the morning-cockpit equivalent of the LS `thoughts` field Workstream B left
  in localStorage — if they should be durable, give them a tiny `daily_journal(date, intention,
  gratitude)` table OR fold into the M5 timeline; **Option B:** drop (if unused). Decide by usage audit.
- **daily_reflections** (highlight/learned/energy/focus) — evening reflection, parallel to intention.
  Same A/B as above; likely converges with M5.

### IA-5 — consolidation acceptance
After IA-1..IA-4: exactly ONE plan store (the task columns). Update the shared-schema-registry +
`Context/Decisions/` with the retirement(s). Re-run the four-store table above — it should collapse to
"task columns + (artifact: today_md) + (telemetry: pomodoro) + (optional journal)".

## Sequencing + risk
1. **IA-1 audit FIRST** (is `daily_plans` live?) — gates whether this is a retire or a migrate session.
2. IA-2 + IA-3 are low-risk (read re-point + a verdict).
3. IA-4 is a usage-audit-driven decision, not a forced change.
4. Every table retirement = `/substrate-swap` skill + decision doc + cross-repo coordination + dogfood
   window. No blanket drops.

## Out of scope (explicit)
- The Workstream B task columns themselves (shipped; this session consumes them, doesn't change them).
- M5 activity-timeline build (`docs/superpowers/plans/2026-05-26-m5-timeline-build-plan.md`) — IA-4 may
  hand intention/gratitude/reflections to it, but M5 is its own track.
- The `notes`↔`description` privacy regression (M5 owns that).
