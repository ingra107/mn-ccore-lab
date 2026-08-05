# MN-CCORE Lab Hub -- Claude Operating Guide

## First read on every session — in this order

Before writing any code or answering any question about this project, read:

1. **`SESSION-HANDOFF.md`** — current gate state, what-to-do-first, git HEADs, gotchas. One-page. Always. If the session starts in AUTO MODE or AUDIT MODE, that file's top section is the prescriptive ticket queue. Execute it in order without re-triaging.
2. **`PROJECT.md`** — frontmatter has canonical `next_action` + `primary_folder`.
3. **`REFERENCE.md`** — API endpoints + D1 table list when you need one.
4. **`CHANGELOG.md`** — top entry = most recent phase; jump here when asked "what changed."
5. **`docs/OBSERVABILITY.md`** — `/api/health` runbook.

Historical material in `docs/archived/` — safe to ignore unless explicitly spelunking history. Detailed design reference in `docs/design-system.md` — its top section **"Design Principles (Nick's bar)"** is the 10 standing UI rules to read BEFORE building any component.

## Vision

The MN-CCORE Lab Hub is the **team's operating surface** — where research gets managed, meetings get run, and information flows between Nick's CLI system and every team member's browser.

## Quick Reference

| Thing | Value |
|-------|-------|
| Live site | mn-ccore-lab.pages.dev (LIVE — CF Access gated via @umn.edu policy on `/portal/*`) |
| Repo | github.com/ingra107/mn-ccore-lab (720+ commits) |
| Today landing | `/portal/dashboard` → `src/pages/portal/TodayPage.tsx` |
| Lab Overview | `/portal/overview` → `src/pages/Dashboard.tsx` |
| MyTasks | `/portal/my-tasks` → `src/pages/MyTasks/` (`App.tsx` lazy-imports the dir directly; the old `portal/UnifiedMyTasks.tsx` re-export shim was deleted 2026-06-09; 3 views, shared toolbar) |
| Deploy | **Manual, and CLAUDE RUNS IT — do NOT ask Nick to deploy.** Pushing to `origin/main` does NOT deploy; Claude runs the deploy itself. From repo root, in the **Bash tool**: `npm run deploy:pages:gated` (= `npm run build` + `wrangler pages deploy dist --project-name mn-ccore-lab --branch main`). **Wrangler is already authenticated at the system/env level** — confirm with `npx wrangler whoami` (returns token scopes), then just run the deploy. `$CLOUDFLARE_API_TOKEN` not appearing in bash's own env is a red herring; wrangler finds it. **Do NOT** invoke `powershell.exe` from Bash or `sed`/grep the token out of `secrets.ps1` — both are auto-mode-classifier-DENIED and waste a turn. ⚠️ **This ban is about EXTRACTING/PRINTING the `CLOUDFLARE_API_TOKEN` only — it does NOT mean "don't touch API keys."** Two different keys: the deploy token (wrangler finds it automatically) vs the app **`X-API-Key` = `PB_API_KEY`**, which is ALREADY an env var in the Bash tool. To empirically verify a gated `/api/*` endpoint, use `PB_API_KEY` IN-PLACE: `curl -H "Authorization: Bearer $PB_API_KEY" https://mn-ccore-lab.pages.dev/api/...` (shell expands it, value never prints — no leak; server checks `env.PB_API_KEY` in `api/middleware/api-key-auth.ts`). Prefer this 30-second empirical proof over a deductive "needs the key" caveat. **Do NOT** `wrangler login`. Get Nick's go first only if the change is risky, then run it yourself. |
| Stack | React 19 + Vite 8 + Tailwind v4 + Framer Motion 12 + TypeScript + Hono v4.12 |
| Testing | Playwright 1.59 (4 suites) + Vitest 4.1. **Never quote a test count from this file — run `npm run test:api`.** (1263 on 2026-07-25, and every number previously written here went stale.) |
| Data | TanStack Query v5 + Cloudflare D1 + Recharts. **Table + route counts are DERIVED, not documented** — see the row below. |
| D1 database (prod) | `b8453e9b-7c5f-4029-b07d-dd89c05d00cf` (ENAM), binding: `DB`. **Schema version = the highest-numbered `api/schema-v*.sql`** (v104 on 2026-07-25), enforced by `python scripts/check-schema-versions.py` — which also gates commits, so the FILES are the source of truth and this line is only a hint. ⚠️ This row previously enumerated v75–v82 by hand and sat **18 migrations stale**, which nearly caused a new migration to be misnumbered on top of an existing one. It then drifted again (v102 while the files were at v104), which is what the hand-written "Recent:" list below invited — so that list is now gone. **Do not re-add a changelog here**; add the migration file, let the checker track it, and read `ls api/schema-v*.sql` when you need the number. |
| Counting things | Don't trust prose for counts — derive them: **tables** `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'` via `scripts/wrangler-d1` (75 on 2026-07-22); **routes** = the pin in `api/routes/route-contract.generated.test.ts` (257 on 2026-07-23), which fails the build when it drifts; **tests** = the run. |
| D1 database (test) | `a30fe84d-0891-4035-9358-f7813b5f5807` (mnccore-lab-test), binding: `DB_TEST` |
| Schema drift CI | `.github/workflows/schema-drift.yml` — nightly 03 CT. Guardrail against silent prod migrations. |
| Deploy mode | **THREE surfaces, one repo — deploy each deliberately.** (1) `mn-ccore-lab.pages.dev` = production site (frontend + `/api/*` fetch): manual via **`npm run deploy:pages:gated`** ONLY — no CI auto-deploy; its bindings live in the Pages project itself (dashboard — verified via `wrangler pages download config`, 2026-07-06), NOT in wrangler.toml. (2) The standalone `mn-ccore-lab-api` worker = the **CRON engine** (calendar poller / pulse / digest — Pages cannot run scheduled events): deploy via **`npm run deploy:worker`** (= `python scripts/wrangler_d1.py deploy --env production`). Non-cron `/api/*` route changes do NOT need this — `functions/api/[[route]].ts` re-imports the same `api/index.ts` handler, so every Pages deploy already ships those fresh; only a change to the `scheduled()` export (cron logic) needs a worker redeploy. wrangler.toml's top level is deliberately INERT (#500 post-mortem 2026-07-06) — prod bindings + crons live under `[env.production]` only, so `--name`/ad-hoc copies are born powerless; the wrapper blocks env-less deploys. ⚠️ History: #137 (2026-06-21) deleted this worker as "zero consumers" — a negative-space miss (the crons WERE its consumers; the orphaned api-test twin masked the breakage until the 2026-07-06 calendar outage). It was resurrected 2026-06-23. Do not re-retire without `substrate-swap`. (3) **`mn-ccore-artifacts.pages.dev` = the COOKIELESS artifact origin** (added 2026-07-22, PB backlog #508): a second Pages project serving ONLY `GET /a/:id` (public HTML artifacts), source in **`artifacts-site/`**, deploy via **`npm run deploy:artifacts`**. Its D1 binding is CODE-owned in `artifacts-site/wrangler.toml` (unlike surface 1). It exists so untrusted user-authored HTML never executes on the host that scopes `CF_Authorization` — `*.pages.dev` is on the Public Suffix List, so it is a different SITE and no cookie can cross. `mn-ccore-lab.pages.dev/a/:id` now only 301s there. ⚠️ Keep it minimal — no `/api/*`, no SPA, no Access app, no secrets, no crons; every one of those re-imports Hub authority into the origin whose whole value is having none. Minimality is GATE-ENFORCED since 2026-07-29 (PB #883): `scripts/check-artifacts-origin-minimal.mjs` (allowlist — one Function route importing the shared handler, one `[[d1_databases]]` binding, no other sections/keys, no `_worker.js`/`_routes.json`/`_redirects`) runs from `.githooks/pre-commit` on any `artifacts-site/**` commit AND as the first step of `npm run deploy:artifacts`; dashboard-side state (Access attach, `wrangler pages secret put`) stays outside its coverage. Only `artifacts-site/**` + `api/routes/public-artifact.ts` affect it; a normal Pages deploy does NOT update it. Verify live commit: `wrangler pages deployment list --project-name mn-ccore-lab` (Source col); worker: `wrangler deployments list`; artifacts: `wrangler pages deployment list --project-name mn-ccore-artifacts`. |
| PB project | `Projects/mn-ccore-lab-hub/` -- PROJECT.md, living plan, future ideas |

## Design System

### Design Ethos: Operational, Not Editorial (Decision: 2026-04-01)

The Hub is a **research operations center**, not a magazine. Full rationale: `Context/Decisions/2026-04-01_hub-design-ethos-pivot.md` (PB repo). Detailed design reference in `docs/design-system.md` — read its **"Design Principles (Nick's bar)"** section (the 10 standing UI rules) before building any component.

**Core principles (NEVER violate):**
1. **Dark-first design.** Dark bg is deep neutral (#0b1017), NOT blue-tinted. Text is #e2e8f0. Light mode secondary.
2. **Columnar tables, not card stacks.** Data pages use fixed-column tables (Title|Assignee|Due|Status|Priority). Cards are for dashboards only. Fixed row height for vertical scanning.
3. **Inline editability with visible affordance.** Every editable field shows "▾" indicator. Click cell → dropdown/picker by type. Auto-save on blur. No explicit save button.
4. **Typography: 3-tier weight, 5-tier opacity.** Weights: `--weight-body` (400), `--weight-ui` (500), `--weight-heading` (600), `--weight-metric` (700). Opacity: `--ink-primary` (1.0), `--ink-muted` (0.7), `--ink-label` (0.55), `--ink-hint` (0.4), `--ink-disabled` (0.3). NEVER opacity below 0.3 on readable dark-mode text.
5. **One accent color per view.** Teal for interactive. Max 2 non-neutral colors per view.
6. **More info, more readable.** Density is not clutter. The secret: font-weight 400, grouped sections with rhythm, consistent icon opacity.
7. **Zero monospace in content.** JetBrains Mono for `<kbd>` only. ALL other text is DM Sans.
8. **Optimistic UI + undo.** State changes are instant. Undo toast for 5 seconds. Never show spinners for actions.
9. **Click targets must be precise.** Clicking a task row opens detail panel. ONLY clicking the status circle changes status. Hover actions hidden until hover.

### Fonts
- **Portal/body:** DM Sans everywhere. `--font-sans` and `--font-body` both resolve to DM Sans.
- **Public website titles:** Fraunces. `--font-display` = Fraunces (public pages only).
- **Code only:** JetBrains Mono.

### Palette (Phase 35 hex-pinned, 2026-04-18 axe AA)

All text-carrying color tokens are **literal sRGB hex**, not OKLCH. (axe-core 4.11's OKLCH parser resolves to darker sRGB than Chromium renders.) OKLCH remains only on pure-bg tokens (`--cream`, `--ice`, `--gold-light`).

| Token | Light | Dark |
|-------|-------|------|
| `--slate` | `#1a2939` | `#b0b5b9` |
| `--teal` | `#006b66` | `#5cbcb4` |
| `--teal-subtle` | `#4a8a87` | — |
| `--gold` | `#6b5420` | `#dcb355` |
| `--maroon` | `#7a0019` | `#f0737e` |
| `--orange` | `#a23d08` | `#f08a5b` |
| `--green` | `#066e2f` | `#6ee89a` |
| `--teal-solid` | `#0d6f68` (both) | — |
| `--maroon-solid` | `#8a1f2e` (both) | — |
| `--stage-fill-idea` | `#4b5563` (both) | — |
| `--stage-fill-data-collection` | `#0d6f68` (both) | — |
| `--stage-fill-analysis` | `#6b5420` (both) | — |
| `--stage-fill-writing` | `#a23d08` (both) | — |
| `--stage-fill-review` | `#8a1f2e` (both) | — |
| `--stage-fill-submitted` | `#0d6f68` (both) | — |
| `--stage-fill-published` | `#066e2f` (both) | — |
| `--gold-on-emphasis` | `#5a4518` | `#dcb355` |

- `--teal-solid` + `--maroon-solid`: solid button/badge bg where white text sits on top (6-7:1 with #fff). Separate token from `--teal` because button bg has opposite contrast needs from same-color text.
- `--stage-fill-*`: for ANY bar/pill/button fill where white text sits on top — these never flip between themes. `--slate`/`--teal`/`--gold` flip to light dark-mode variants where `#fff` text fails ~2:1.
- `--gold-on-emphasis`: gold text on `--gold-emphasis` pill. `--gold` light on `#efebdf` = 4.25:1 fail; pinned to `#5a4518` (5.8:1).
- Sidebar-bg: `color-mix(in oklch, var(--cream), black 12%)`. Category dots: 6px, 0.7 opacity — maroon=CLIF, teal=Lab, gold=Mesfin.

### Opacity policy (dark mode AA)

`opacity: 0.30-0.55` on slate/teal/maroon/gold text fails AA. Codemod 2026-04-18 bumped 640+ sites to 0.85. Use **0.85 as the floor** for secondary text; reserve 0.55-0.70 for decorative (borders, inactive dots). Never go below 0.30 on readable text.

### Opacity policy (light mode AA)

`--ink-label` light = 0.70, `--ink-hint` light = 0.68 (bumped from 0.62, r7 audit). `--muted` light = `#5a6370` (bumped from `#6b7280` 2026-04-22). Avoid `opacity <= 0.70` on slate text on white/near-white bg; prefer `color: var(--muted)`.

### Compound-opacity is forbidden

Parent `opacity` multiplies with children. A card with `opacity: 0.85` + a child green/maroon span with `--ink-label` (0.70) compounds to effective alpha 0.595, failing AA. Never dim a whole card for state — use `borderLeft: transparent`, strikethrough, or `color: var(--muted)` on the title.

### Gold buttons (both themes)

Gold bg is identical across themes. Use a fixed literal dark color like `#1a1a1a` for text on gold backgrounds (not `color: var(--ink)` which flips with theme).

### Table Pattern (apply to ALL data pages)

- Shared `ColumnHeader` + `TableContainer` (`src/components/table/`). Full spec in `docs/design-system.md`.
- Hover-only badges: use `visibility: hidden`, not `opacity: 0` (keeps element out of AT tree).

### Data-Pages vs Dashboard-Pages Taxonomy (GC-6)

**Data pages** — columnar table rules apply (ColumnHeader + TableContainer, inline editing, row separators; density is GLOBAL — one Settings→Appearance control drives `--row-height`, default compact, per-view toggles removed P3-7 2026-06-09):
- Tasks, MyTasks, Projects, Manuscripts, Deadlines, Grants, Ideas, Decisions, Settings team directory

**Dashboard pages** — exempt from columnar table rules (charts + metric cards + panels):
- Dashboard, Analytics, PI Analytics, Personal, Meetings (split-panel), Calendar, Home (public)

A page is a "data page" if its primary content is a scrollable record list. Never mix.

**The anchored band edge is UNIVERSAL (Nick 2026-06-10) — the width exemption is DEAD.** This taxonomy still governs CONTENT rules (data pages = columnar tables; dashboards = cards/charts) but it NO LONGER governs page WIDTH. Every page — data AND dashboard AND the operating surfaces (Today, My Hub, My Tasks all 3 views, Calendar, Lab Overview) — shares ONE centered band with the SAME left content edge as the Research tabs (Projects/Manuscripts/Grants). Mechanism: the `.content-container` band (max-width `--content-band`, auto-margins, responsive 1.5/2/3rem padding) with the primary column left-anchored to `--col-main` inside it; full-height flex surfaces (My Tasks) use the `.mt-band` helper (same band math) so their toolbar + views land on the identical edge; Today's `.b2-grid` is centered on `--content-band` with main=`--col-main`/rail=`--col-rail`. Verified left edge = 320px @ 1440, 480px @ 1920 on all ten pages (`review/edge-fix-0610/edges.json`); since bug #70 (2026-06-11) `--content-band` is **1440px** (was 1296px), pulling the wide-viewport edge ~72px closer to the sidebar (≈408px @ 1920) — the edge is still UNIVERSAL, just nearer the nav; ≤~1570px viewports unchanged (padding floor binds). My Tasks List view fills the FULL centered band (`.mt-band`, no inner `--col-main` cap — same width as Calendar/My Hub, NOT fluid-to-viewport; Nick's bug-#70 follow-up) since the same fix, and its side control is the canonical DoneBox (complete), not a select checkbox — select via `x`/shift-click. Dashboards (pure card grids, e.g. Lab Overview) may still FILL the full band rightward, but they start at the same left edge — no `maxWidth:'100%'` override, no full-bleed-at-viewport-left. NEVER reintroduce a page-wide background tint around an operating surface (Today/My Tasks once painted `--task-page-bg` edge-to-edge — removed 2026-06-10; only cards/rows/panels carry their own surfaces; the page sits on the global page bg like every other page).

### Shared Utilities
- `src/lib/dateUtils.ts` — all date formatting
- `src/lib/time.ts` — canonical time chokepoint (Increment 1A): `Instant`/`CivilDate` types, `nowInstant()` (UTC), `formatLocal()` (viewer-local display), `todayCivil()`. Discipline: store instants UTC, display viewer-local (browser zone = traveler-aware). Lint R20-R23 (`scripts/check-time-discipline.mjs`, **ENFORCE** — CI hard-fails on any new raw-date site) flags raw `new Date().toISOString()` / `.toISOString().split|slice`. Plan 1B (the ~139-site display migration to viewer-local) is **COMPLETE** (2026-05-25): all hits cleared, lint flipped WARN→ENFORCE. `dateUtils.ts` remains in use alongside `time.ts`.
- `src/data/team.ts:getPersonInfo()` — team member lookup
- `formatBrandName()` from `BrandName.tsx` — any text that might contain "MNCCORE"

## Architecture

```
brain.db ⇄ D1 (mnccore-lab) ←API→ React + TanStack Query
   ↑                    ↑
Nick's CLI         Team's Hub
(single user)   (20+ team members)
```

(Airtable retired 2026-04-21. `entity_aliases.alias_kind='airtable_legacy'` rows resolve forever for historical lookups.)

- **API:** Cloudflare Worker, Hono v4.12 (`api/index.ts`); route count is pinned by `route-contract.generated.test.ts` (257 on 2026-07-23 — read the pin, not this sentence). Middleware chain: OPTIONS preflight → test-mode DB swap → API-key auth → authed-user resolve → PI gate for `/api/pb/*` GETs → REQUIRE_AUTH gate for POST/PUT → version-bump-on-success. Do NOT add routes with raw `url.pathname === ...` comparisons — use `app.get/post('/api/...', handler)`.
- **Auth:** CF Access gates `mn-ccore-lab.pages.dev/portal/*` (single destination). JWT via JWKS in `api/jwt-verify.ts`. `REQUIRE_AUTH=1` + `VITE_REQUIRE_AUTH=1` both active. `/api/*` is NOT gated by CF Access (auth via X-API-Key + `REQUIRE_AUTH` + JWT server-side). `getAuthUser()` and `isPiRequest()` are `async` — callers must `await`.
- **Email:** Resend (`api/lib/email.ts`) + daily digest (`api/routes/digest-email.ts`). Preview: `/api/digest-preview?member=nick`
- **Sync:** `scripts/db/sync/` module in PB, invoked via `python scripts/db/sync.py {pull|push|sync|status}`. Scheduled + /process-triggered.

### Sync Architecture

**Tasks & projects: D1 (Hub) is canonical; brain.db is a disposable pull-cache** (PB Phase D/E/F simplification, 2026-05-27). Every hub-synced tasks/projects write — status, assignee, key-links, slug rename, create, delete — routes through BrainDB **Hub-first** writers: POST `/api/mutations` first, then mirror the accepted canonical row into brain.db. **No outbox lane, no `local_modified`, no dirty-push** for tasks/projects edits; the local row can be discarded + rebuilt from Hub (`rebuild_brain_db.py --import-pb-only`). The **pull** direction is still LWW-gated (3 origin-aware UTC pull-gates in `hub.py`; Hub wins when strictly newer). ⚠️ The outbox machinery is **still load-bearing** for PB-local semantic tables (sessions, agent_knowledge, memory_facts, decisions, kg_*, pomodoro_sessions, trajectories) + `inbox_events` — "no outbox" applies ONLY to the tasks/projects edit lane. `sync_status` has been **physically dropped** from tasks/projects (mig-094, commit `3eefab88`, 2026-05-27); the column survives only on the Lane-3 outbox tables + `inbox_events`. Do not reference a tasks/projects `sync_status` column — it no longer exists.

**Key rules:**
- Brain.db tasks use canonical `task_{ulid}` IDs. Hub-created tasks use typed ULIDs (e.g., `task_01KP...`). Both reachable via `entity_aliases` (hub_slug alias).
- **`tasks.project_id` (+ all project-FK columns) STORE the typed `proj_*` PK.** Three axes (post Slice C, 2026-06-09): **storage = typed `proj_*`** · **sync wire = typed `proj_*`** (PB push sends typed via `hub_payload.py:canonicalize_project_id_for_hub`; PB pull requests `?wire=typed` and resolves fail-closed via `hub.py:_resolve_task_project_fk`) · **browser `/api/tasks` display = SLUG**. The browser slug is the LEGITIMATE one-way human projection, resolved at ONE chokepoint — a `COALESCE((SELECT p.slug FROM projects p WHERE p.id = t.project_id), t.project_id) AS project_id` subquery embedded in `TASK_SELECT_COLS` (`api/lib/task-cols.ts`), so no task-read endpoint can leak the typed PK; `?project=` resolves slug→id; `meetings.ts` aliases `tasks t` (do NOT reintroduce the `.replace(/\bt\./g,'')` strip — it corrupts the subquery). A sync-only `TASK_SELECT_COLS_TYPED` (raw `t.project_id`, gated to `canSeePb` callers via `?wire=typed`) gives replication the typed PK without changing the browser shape. Frontend keys project lookups by slug (`projectsByPid` is slug-keyed despite its name) — that's correct; the browser stays slug. Internal mutation paths (`applyInsert`/`applyPatch`/`advanceProjectMovement`/cascade) use the **stored typed PK** — `applyPatch` FK-canonicalizes slug→typed since Slice C (`18680afa`), making a slug-stored FK unrepresentable on UPDATE. **kg + the Hub parent table converged to typed (Slice A, 2026-06-05)** — the old "Hub kg still slug-format / local re-key never propagated" justification is OBSOLETE; Hub kg is now a detached store post-P4 (gate's Hub-kg checks are WARN-only). Was a P2 `aa85c71b` half-migration (write flipped to typed PK, reads never migrated → ~20 tasks rendered unlinked + sync silently broken); fixed 2026-06-05 (browser read) + Slice C 2026-06-09 (sync wire). ⚠️ Do NOT "fix" `projectsByPid` to key by `p.id`, and do NOT run `scripts/p2_hub_rekey_apply.py` (parent-table rekey already converged in prod). Decisions: PB `Context/Decisions/2026-06-05-tasks-project-id-store-typed-present-slug.md` + `2026-06-05-project-identity-single-machine-identity.md` (Slice C wire flip).
- `notes` (brain.db) vs `description` (D1, team-visible). **DECISION MADE — Model A:** `notes` becomes **brain.db-local-only**; the bidirectional `notes`↔`description` sync is a privacy regression to be **removed in M5** (activity-timeline + comments build). The old bidirectional path is STILL in code (outbox `_LOCAL_TO_HUB_FIELD_MAP`, pull-back in `hub.py`, create-leaks in `query.py`/`hub_payload.py`) until M5 executes — do NOT treat current bidirectional behavior as intended. Plan: `docs/superpowers/plans/2026-05-26-m5-timeline-build-plan.md`.
- Task deletion uses soft-delete (`deleted_at` column). `GET /api/tasks?include_deleted=1` surfaces them for the sync module.
- `completed` field is bidirectional — Hub can reopen tasks.
- Hub task/project **updates** mirror into brain.db `d1_task_updates` / `d1_project_updates` (append-only, read-only). (`d1_task_comments` exists in schema but is inert/0-rows; task *comments* are not mirrored.) M5 (activity-timeline + comments) reconciles the update-mirror vs unified-Activity-timeline overlap.
- Hub-originated projects flow into brain.db — `category` (MNCCORE/CLIF/Peripheral Brain) maps onto brain.db `domain`.

**Implementation:** `scripts/db/sync/` (drivers/hub.py + boundary + payload). Decision: `Context/Decisions/2026-04-21-sync-extraction-COMPLETE.md` in PB.

### Wrangler / D1 auth — ALWAYS go through the sanctioned entry point (2026-05-24)

`secrets.ps1` exports `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`. Those are
Pages-deploy-scoped and **lack D1 scope**; when present they SHADOW the OAuth
creds at `~/.wrangler/config/default.toml` (which DO have `d1 (write)`). Result:
401 / 403 / 7403 / "Authentication error code 10000" on any `wrangler d1` call —
misdiagnosed as "blocked" **four times** across sessions despite a standing
memory rule. The fix is now a primitive, not a note (codex ethos #4).

**ALL wrangler D1 calls go through the sanctioned entry point. Never raw
`npx wrangler d1`.** Both forms unconditionally `unset CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID` and run wrangler from the repo root:

- **Shell / command line:** `scripts/wrangler-d1 d1 execute mnccore-lab --remote --command "SELECT 1"`
- **Python (incl. PB's `sync.py`):** `from wrangler_d1 import run_d1; run_d1(command="SELECT 1", json=True)`

The DB is `mnccore-lab` (no dash). Enforced by `.githooks/pre-commit`: any staged
raw d1 execute/export call outside `.github/workflows/` (CI uses a proper
D1-scoped secret) or the wrapper files is blocked. Escape hatch for docs:
put `wrangler-d1-allowed` on the line.

Memory rule cross-reference: `~/.claude/.../memory/feedback_wrangler-home-auth-works.md`
("ANY wrangler D1 auth failure = strip env first"). This wrapper makes that rule
structural so it can't be forgotten a fifth time.

### Cross-repo Schema Coordination (rule from R10 incident)

Any change to a shared field (schema.sql DEFAULTs, D1 migration SQL, taxonomy reshuffles) must be **coordinated with Peripheral Brain** before deploying.

**Process for any shared-field change:**
1. Write a decision doc in `C:/Users/ingra107/Peripheral-Brain/Context/Decisions/`
2. Update `C:/Users/ingra107/Peripheral-Brain/scripts/db/enums.py` with canonical + legacy alias FIRST
3. Update `C:/Users/ingra107/Peripheral-Brain/Context/Topics/shared-schema-registry.md`
4. Ship changes to BOTH repos in lockstep — never deploy data migration ahead of dependent code
5. Run `python C:/Users/ingra107/Peripheral-Brain/scripts/db/health.py --check` to verify no drift

**Registered shared fields:**
- `projects.status`: `active / waiting_external / blocked / done`
- `tasks.status`: `todo / in_progress / done / blocked / waiting_external`
- `projects.stage`: `idea / data_collection / data_analysis / writing / submitted / revisions / accepted / published` (lowercase canonical; map via `enums.canonicalize_project_stage()`)
- `projects.category`: `MNCCORE / CLIF / Peripheral Brain` (Hub-authoritative; 3-bucket design per 2026-05-08 decision)
- `tasks.priority`: `low / medium / high / urgent`

Anti-pattern: deploying a data migration while the frontend still expects the old schema. Data-on-new-schema + code-on-old-schema corrupts.

## Hermes (AI Research Assistant)

Live since 2026-04-09. Team members @mention `@hermes` in Ask the Lab, task comments, or project comments. Responses appear with gold sparkle badge (timing depends on ai-request queue; placeholder "Thinking about this..." shown immediately, real response via polling).

- **Detection:** `/@(hermes|claude)\b/i` regex in `api/routes/questions.ts` and `api/routes/projects.ts`
- **Author slug:** `claude-ai` (display name "Hermes" via `src/data/team.ts`)
- **Backend:** `hub_ai_listener.py` on home laptop polls `GET /api/ai-requests?status=pending` every 60s. ⚠️ Hub list endpoints return `{data, count}` — the listener read a nonexistent `requests` key from its FIRST commit until 2026-06-11 (PB `b794fddf`), so this lane fetched 0 forever. When adding a PB consumer of a Hub route, verify the response key against the route source, and fail loud when `count>0` parses to 0 rows.
- **Artifacts (v1, 2026-06-11):** responses >1500 chars OR explicit document asks become versioned artifact pages at `/portal/artifacts/:id` (md stored in `artifacts`, schema v79) + a short feed teaser with the link; short answers stay inline. Comment-driven revisions: artifact comments live in `activity_entries` (`entity_type='artifact'`), `@hermes` on an artifact → `ai_requests` `source_type='artifact_comment'` → listener regenerates + POST `/:id/revise` (version++, history in `artifact_versions`). Design: `docs/superpowers/plans/2026-06-11-hermes-artifacts-design.md`.
- **Auth:** Bearer token via `PB_API_KEY` (Cloudflare Pages secret)
- **Docs:** `docs/hermes.md`

## Critical Rules

1. **Content visible by default.** `.fade-in-up` starts at opacity:1. NEVER hide content behind animations.
2. **Hero cards use `<a>` tags**, not React Router `<Link>`. AnimatePresence + useCountUp conflict.
3. **initialData as factory functions.** `initialData: () => data`, never `initialData: data`.
4. **Avatar:** Container `overflow-hidden`, img `w-full h-full`.
5. **`getPersonInfo()` from `src/data/team.ts`** — never create local copies.
6. **Date formatting from `src/lib/dateUtils.ts`** — never create local formatters.
7. **@mentions use `MentionInput`** — not raw `<textarea>`.
8. **Dedup action items** — normalize "[Carried forward]" prefix.
9. **NEVER deploy from a worktree.** Commit to branch + PR only.
10. **Batch deploys where practical.** Workers Paid plan (10M req/day) — prefer batching unrelated edits to reduce KV write churn.
11. **`formatBrandName()`** for any text that might contain "MNCCORE".
12. **Tailwind v4:** `@import` syntax, not `@tailwind`. No `group-hover:` with arbitrary values — use CSS rules.
13. **Build verification after batch edits.** After editing 3+ files or any shared module/type, run `npm run build` and fix all TypeScript errors before continuing. Do not commit code that doesn't build.
14. **`--ink-bright` is WHITE in BOTH modes.** It is a white-fill-on-dark token. Setting it to black in light mode breaks 84 call sites. It exists for white text/icons on dark accent surfaces regardless of page theme.
15. **Row height CSS must be `@media (min-width: 768px)` scoped.** Mobile uses `height: auto; min-height`. Unscoped fixed heights break stacked card layout on mobile.
16. **TaskGridView wrapper has NO minHeight reservation.** Container sizes to content. CLS is bounded by loading skeleton. If re-introducing a minHeight, apply it only during loading.
17. **Data pages vs dashboard pages taxonomy.** See taxonomy section above. Never mix.
18. **Detail panels must subscribe to cache, not parent state.** TaskDetailPanel and any future detail panel MUST look up fresh data from the React Query cache (`queryClient.getQueryCache().subscribe(...)`). Parent `useState<TaskRow | null>` snapshot goes stale after mutations. Reference: `src/components/tasks/TaskDetailPanel.tsx` post-GH#7 fix (commit `087ba42`).
19. **`refetchIntervalInBackground: true` on `/api/version` polling.** `useRealtimeSync` polls /api/version every 15s. Without this flag, polling pauses on background tabs and team members miss each other's edits. Ref: `src/hooks/useRealtimeSync.ts`.
20. **Task mutation endpoints validate assignee + project_id.** `POST /api/tasks`, `POST /api/tasks/:id`, and `POST /api/tasks/batch` action='assign' all reject unknown assignee slugs (except `claude-ai`). `project_id` resolved (id OR slug); unknown → NULL. Ref: `api/routes/tasks.ts`.
21. **Project slug collision auto-resolves.** `handleCreateProject` loops appending `-2/-3/...` if the desired slug exists. Ref: `api/routes/projects.ts`.
22. **Project delete cascades.** `handleDeleteProject` clears `comments`, `project_updates`, and sets active tasks' `project_id = NULL` before removing the project row. Ref: `api/routes/projects.ts`.
23. **All gated routes live under `/portal/*`. Public routes stay at root.** ALL internal navigation goes through `src/constants/paths.ts` — import `PATHS`. Tests use `tests/helpers/paths.ts`. Adding a new gated route: add under `/portal/*` in `App.tsx` + export from `paths.ts` + add to `tests/helpers/paths.ts`. Public `/team/:slug` stays for the marketing site.
24. **`actorSlug(email)` is a LUT, not a derive.** `EMAIL_PREFIX_TO_SLUG` in `api/helpers.ts` maps email-prefix → canonical team slug. New members post-Phase-39 are auto-provisioned via `ensureTeamMember()` on first login — manual 3-step provisioning only needed for custom slug or non-@umn.edu members.
25. **`/api/version` is edge-cached for 10s.** Don't shorten the TTL. Don't add `Set-Cookie` (defeats cache).
26. **JWT `importKey` is cached per `kid` at module scope.** `importedKeyCache: Map<string, CryptoKey>` in `api/jwt-verify.ts`. Don't replace with per-request import.
27. **Hover-only badges must be `visibility: hidden`, not `opacity: 0`.** `opacity: 0` keeps the element in the AT tree — screen readers announce phantom badges. Apply to any future hover-revealed content.
28. **Sidebar nav links carry `aria-current="page"` on the active route.** New navigation surfaces must set `aria-current` for screen reader navigation.
29. **Brand primitives live in `src/components/` — use them, don't reinvent.** `HeartbeatLine` / `HeartbeatDivider` (ECG motif), `HermesMark` (AI assistant), `CategoryIcon` (lungs/flask/heartbeat/cap), `EmptyStateArt` (8 illustrations), `PhaseReleaseBanner`, `RequireAuth`. Never use lucide `<Sparkles />` for Hermes or a 6px dot for categories. **Generic UI primitives (distinct from brand) live in `src/components/ui/` (P5, `4a21efce`):** `Button` (variant primary/secondary/ghost/danger × sm/md/lg), `Chip`, `Field`, `Modal` (createPortal + focus-trap + escape, no backdrop blur per Rule 45) — they codify the dominant existing patterns with design tokens baked in. Prefer them for new buttons/pills/labeled-fields/modals; adoption is incremental (existing ad-hoc instances migrate piecemeal).
30. **`/api/bug-report` gates on `REQUIRE_AUTH=1`, not a standalone check.** Bug-report piggybacks on the same `REQUIRE_AUTH` flag that gates writes. Don't add a separate auth check.
31. **Per-route OG share cards at `/og/<type>/<slug>`.** `functions/og/[type]/[slug].ts` generates SVG cards. `public/_headers` forces `image/svg+xml`. Use `usePageMeta()` with `ogImage`. Cached 1h at edge.
32. **Pulse Kiosk (`src/pages/Pulse.tsx`) hex-pins its colors deliberately.** Renders without `.dark` class so CSS vars would resolve wrong. Hex-pinned (`#0b1017`, `#f5efe2`, `#dcb355`, `#5cbcb4`, `#f0737e`). Don't "fix" to CSS vars.
33. **Capture specs for Claude Design — run on demand via `scripts/regen-design-bundle.sh`.** Six specs, ~25 min end-to-end. Output gitignored. Don't add to default test run. Full spec detail in `docs/design-system.md` and `docs/archived/CLAUDE.md-history-2026-05-15.md`.
34. **Email prefix → slug via `emailToSlug`, never raw `split('@')[0]`.** `src/lib/emailSlug.ts` exports `emailToSlug(email)` backed by the `EMAIL_PREFIX_TO_SLUG` LUT. Adding a new team member requires updating the LUT on BOTH sides (frontend + backend) in lockstep.
35. **UI stage labels are 6; API canonical is 7. Map on submit via `toApiStage()`.** `src/lib/stageNormalize.ts` owns both directions. `normalizeStage()` for display, `toApiStage()` for submit. The API rejects non-canonical values with 400; in optimistic-update flows this manifests as a silent revert.
36. **`getAuthUser()` reads JWT from either the header OR the `CF_Authorization` cookie.** Header = CF Access proxied requests (portal only). Cookie = sent by browser on all same-domain requests. Without the cookie fallback every authed POST from `/api/*` would 401. Keep BOTH paths working.
37. **Google Fonts `<link>` tags need `crossorigin="anonymous"`.** Without it, axe-core's contrast checker trips CORS preflight — 3 console errors per page in audit runs. Same for any new cross-origin stylesheet.
38. **Every `<select>` must have `aria-label` or a matching `<label htmlFor>`/`<select id>` pair.** Bare `<select>` trips axe `select-name` critical.
39. **`role="switch"` with `aria-checked` must use string `"true"`/`"false"`, not boolean.** `aria-checked={myBool ? "true" : "false"}`. Only `aria-checked` on role=switch/checkbox/radio is strict; `aria-expanded`/`aria-pressed` boolean bindings are fine.
40. **Overlap detector (`scripts/massive-audit/lib/overlap-detector.ts`) skips semantic landmarks.** `<nav>`/`<header>`/`<aside>` + `role="navigation|banner|complementary"` are treated as chrome. Don't remove the tag-based filter.
41. **Stage-bar fills use `--stage-fill-*` tokens, not `--slate/--teal/--gold`.** The accent tokens flip to light dark-mode variants where `#fff` text fails ~2:1. Use `--stage-fill-{idea,data-collection,analysis,writing,review,submitted,published}` — dark hex values stable across themes.
42. **Gold pill bg + gold text uses `--gold-on-emphasis`, not `--gold`.** `--gold` light on `--gold-emphasis` bg = 4.25:1 fail. `--gold-on-emphasis` pins to `#5a4518` light / `#dcb355` dark for AA on both.
43. **Parent `opacity` on a card multiplies with child colored spans.** See compound-opacity section above. Never dim whole cards for state.
44. **Mount animations must use transform-only, not opacity: 0 → 1.** Axe-core's contrast checker catches elements mid-transition. Animate via `y` / `scale` only.
45. **Dropdowns use fully-opaque bg, not semi-transparent + backdrop-filter.** Band bleed-through on pages with dark headers. Use `#ffffff` / `#0f1923` (full opaque) with `box-shadow` for depth.
46. **Flex-col pages with canvas children need `height: 100vh`, not `minHeight: 100vh`.** `minHeight` doesn't give `flex-1` children a determined size. Canvas elements fall back to intrinsic 300×150. Use `height: 100vh` when intent is "fill the viewport".
47. **URL classification + linkification go through shared util.** `src/lib/urlClassify.ts` exports `classifyUrl(url)` + `shortLabelForUrl(url)`. Don't duplicate the classification regex. Non-http links: `mnccore://open/<path>` + clipboard copy + toast as fallback.
48. **Legacy slug canonicalization belongs at the write path, not the read path.** `hub_payload.py` applies `canonicalize_team_slug()` at every outbound assignee write. Hub's `src/lib/emailSlug.ts` does NOT re-canonicalize on reads — visible drift signal if `nick` appears in D1 again.
49. **Presence is entity-scoped but WS-room-global.** `src/hooks/usePresence(entityType, entityId)` subscribes to the single shared `mnccore` WS room, filters client-side. 15s heartbeat + 45s staleness. Don't shard rooms per entity. Extend by adding `<PresenceAvatars slugs={usePresence(type, id)} />` — hook is entity-agnostic. Unmount sends `presence-leave`; intent unmount sends `intent-leave`.
50. **Landing cards use 2-col grid for action density.** ProjectDetail Overview: `grid-cols-1 md:grid-cols-3` — left `md:col-span-2` = primary action, right `md:col-span-1` = reference, bottom full-width = compose. Replicate for any new "detail page Overview."
51. **Search covers 14 entity types — extend on future entity adds.** `api/routes/search.ts` queries 14 tables in parallel (artifacts added 2026-06-11; `action_items` leg retired 2026-07-16, #552 — the table's full content already surfaces via the unconditional `tasks` leg, backfilled 1:1 by id in schema-v96). When adding a new entity: add SELECT, push block, `TYPE_PRIORITY` entry, and `typeConfig` in `src/pages/portal/SearchPage.tsx`.
52. **One shared PartySocket per (room, party) — use `realtimeBus`.** `src/lib/realtimeBus.ts` module-singleton. `useRealtimeSync`, `usePresence`, `useTyping`, `useIntentBroadcast` all subscribe through the bus. Don't `new PartySocket(...)` directly — use `getRealtimeBus().subscribe(listener)` + `.send(payload)`.
53. **DD-1 mode toggle + DD-2 saved views.** Saved views (`useSavedViews(page)`, LS key `mnccore.savedViews.v1.<page>`, 25-view cap) wired into MyTasks (`src/pages/MyTasks/index.tsx`) via `<SavedViewsMenu>`. URL state round-trips through `?filter=<quickFilter>&view=<columns|lanes|list>`.
54. **T-29 Manuscripts "Needs your attention".** `GET /api/manuscripts/attention?review_days=&stale_days=`. Thresholds from `useLabPrefs()` (LS key `mnccore.labprefs.v1`). `NeedsAttentionDashboard` = 3 collapsible subgroups + amber count pill. Thresholds surfaced in Settings → Lab tab.
55. **Mobile compose pattern.** ProjectDetail mobile: tap trigger → `position: fixed` bottom overlay via `useComposeSheet(open, onClose)`. TaskDetailPanel: `position: sticky; bottom: 0` + `env(safe-area-inset-bottom)`. `useIsMobile()` is the canonical breakpoint check — **1024 since UX-9 (2026-06-09)**: 768–1023 (iPad portrait) gets MOBILE-NAV (tab bar `lg:hidden`, bottom sheets, FAB lift) with tablet paddings; sidebar only ≥1024. Row-STACKING stays content-driven at 768 (Rule 15) — deliberately independent axes.
56. **Row-level swipe on TaskGridRow — inside the virtualizer.** `useSwipeAction({onSwipeLeft, onSwipeRight})`. Wire the `motion.div` INSIDE the virtualizer's translateY outer wrapper. The hook disables drag on desktop (`window.innerWidth >= 768`). Right-swipe = complete (with undo); left-swipe = long-press context menu.
57. **Today landing model.** `/portal/dashboard` = TodayPage (operating-day surface). `/portal/overview` = Dashboard.tsx (Lab Overview, weekly-planning card grid). Don't reintroduce a card-grid Dashboard at `/portal/dashboard`. Sidebar label: "Today" / "Lab Overview". URL alias `/dashboard` redirects to `/portal/dashboard`.
58. **Three click semantics on Today/MyTasks rows: NEVER conflate.** (a) Clicking the body = expands TaskDetailDrawer inline; does NOT promote. (b) Dragging `⋮⋮` handle = plans the task. (c) Explicit `▶ Work on this now` = promotes to Right Now. Three independent affordances.
59. **Three accent colors with assigned meaning on Today/MyTasks surfaces.** `#c9a84c` gold = user-driven action / planned / Hermes / Right Now glow. `#5cbcb4` teal = meetings / mentees / system / navigation. `#f0737e` coral = overdue / stalled / warnings. `#6ee89a` green = done / healthy sync. Don't repurpose.
60. **MyTasks view picker far-left of filter row — order List | Lanes | Columns, List = cold-load default (Nick 2026-06-10).** Bare arrival ALWAYS opens List; URL `?view=` deep-links + saved views win; the old `localStorage.mt_view` read was removed so a stale persisted choice can't override the default. Three views share ONE toolbar. List view uses right-side drawer (cursor-stable j/k nav); Columns and Lanes use inline expand. Source: `src/pages/MyTasks/index.tsx`.
61. **Right Now is a promoted slot, not a fixed task.** Subtle gold glow only here (`box-shadow: 0 0 24px rgba(201,168,76,0.06)`); nothing else gets a glow. Mark-done unplans, sinks to bottom with strikethrough, auto-promotes next planned task. Source: `useTodayState` in `src/pages/portal/TodayPage.tsx`.
62. **Group sort within a TaskGroup: planned → active → done.** Don't re-sort by priority/due_date within a group — that fights the operating-day mental model. Source: `TaskGroup` in `TodayPage.tsx` (also applies to the MyTasks Lanes view).
63. **`tasks.group_override` is the explicit Hub-authored bucket choice; `getGroupForTask()` checks it FIRST.** Schema v50. Groups: `'deep' | 'priorities' | 'quick' | 'pb' | 'etl' | NULL`. Pulls to brain.db (tasks are Hub-first written; D1 canonical). `generate_today_markdown.py::_GROUP_OVERRIDE_TO_SECTION` honors it. API guard: `VALID_GROUP_OVERRIDES` rejects non-canonical values with 400. Decision: `Context/Decisions/2026-04-25-tasks-group-override.md`.
63b. **The Today day-plan is synced task columns, NOT localStorage (Workstream B, 2026-06-09).** Schema v75: `tasks.planned_for` (civil date) / `plan_slot` (`'right_now' | 'strip' | 'between-<n>'`, API value-guarded 400) / `plan_rank` (REAL). `src/lib/todayPlan.ts` is the only write path (enforces the `right_now` singleton); `useTodayState` derives plan state from the task rows (same TodayStateApi); MyTasks plan actions route through the same primitive — do NOT reintroduce raw `today_state_*` localStorage writes (a one-time LS migration + the LS `thoughts` stowaway are the only remaining LS uses). Synced to brain.db via the generic pull-back (pb-schema 0.3.3); TODAY.md pins `right_now` (`📌▶`) + planned (`📌`) via `v_section_assignments`. Decision: PB `Context/Decisions/2026-06-09-today-plan-task-columns.md`. The PB-Sector `daily_plans` planner is **RETIRED** (IA-1, 2026-06-10, commit `433b2083`): `/portal/pb` page + 8 plan routes removed; `daily_plans`/`daily_reflections` table DROP pending the 24h dogfood window (decision: PB `Context/Decisions/2026-06-10-daily-plans-retirement.md`; I37 matrix `Context/Topics/substrate-swaps/daily-plans-retirement.yaml`). Kept: `/api/pb/capture`+`/defer`, dispatch lane, `pb/sessions*` (pomodoro telemetry), `pb-today` (today_md artifact).
63c. **Manuscripts = projects with canonical stage ≥ writing** (`writing/submitted/revisions/accepted/published`, via `stageNormalize.ts`; decision 2026-06-09 — the old status-filter was a tautology rendering every project). Stage display everywhere uses the canonical `stageLabel()`/`stageColor()` from `stageNormalize.ts` — don't fork new stage maps.
63d. **Quick-add shortcut is `q`** (single key, suppressed while typing). Cmd/Ctrl+N is browser-reserved and can NEVER fire in Chrome/Edge/Firefox — don't rebind it. The ⌘K quick-add modal (`GlobalQuickAddModal` + `openGlobalQuickAdd()`) is the ONE canonical capture; QuickCaptureBar/Personal capture are triggers into it, not separate capture UIs (P2-10).
63e. **Entity deep-links: every surface consumes `?open=`/`?openTask=` via `useOpenParam`** (`src/hooks/useOpenParam.ts`) — fires once when data is ready, then strips the param. Generators (search, ⌘K, copy-link, context menu) rely on it; when adding a new detail-capable page, add the consumer. ⚠️ **`useOpenParam` is for ARRIVING at a page with a target, NOT for a click on the page you are already on** — it fires once *per distinct value*, so a second click on the same entity after closing the panel does nothing. A link on a surface that already mounts its own detail panel must open it DIRECTLY: pass an `onOpenTask(id) => boolean` down and have the `<a>`'s onClick `preventDefault()` only when it returns true (#111, `taskLinkClickHandler` in `activityRender.tsx`; wired ProjectDetail → ActivityStream). Keep the `href` — it is what makes ⌘-click / middle-click / copy-link work and is the fallback when the id isn't in the surface's loaded rows; never intercept a modified click. Other generators of the same `/portal/my-tasks?openTask=` link (`HermesResponse`, `ArtifactPage`, `MyItems`) still navigate — that is fine where the surface has no panel of its own, but **if a second surface needs open-in-place, extract the handler into a shared hook rather than re-deriving it a third time.**
64. **Personal calendar feeds are iCal pull, not OAuth.** Schema v52. Users paste private iCal URLs into `/portal/profile` or `/portal/settings#integrations`. Hub polls lazily, parses via `api/lib/ics-parser.ts`, upserts to `user_calendar_events`. UI: `src/components/CalendarFeedsPanel.tsx` (shared TanStack cache key `calendar-feeds`). Tests: 24 vitest unit tests at `api/lib/ics-parser.test.ts`; run via `npm run test:api`.
65. **CF Access auth uses Generic OIDC `Google UMN`, not the preset Google IdP.** `Auth URL = https://accounts.google.com/o/oauth2/auth?prompt=select_account&hd=umn.edu`. Don't revert to the preset Google IdP — it loses the account chooser.
66. **`ensureTeamMember()` runs on every authed request — auto-create + claim.** Schema v53. Four-branch logic: (1) direct email match → no-op; (2) slug match via LUT → CLAIM existing row, backfill email+photo; (3) slug match via raw email-prefix → same; (4) no match → INSERT auto_created=1 row (PENDING REVIEW badge). `PUT /api/team/:slug` is owner-or-PI gated; role + member_type are PI-only.
67. **`/portal/profile` is the self-service profile + integrations entry.** Inline-on-blur edit for self-edit fields. Embeds `<CalendarFeedsPanel />`. Any save invalidates both `['team']` and `['team-raw']`.
68. **One shared task row — `src/components/tasks/TaskRow.tsx`. Don't fork it (Round 6, 2026-06-01).** Today / My Hub / My Tasks (Columns + Lanes) all render through this one component via thin adapters (`today/TaskRow`, `MyTasksRow` in `MyTasks/views/ColumnsView.tsx`, `HubTaskRow` in `PersonalPage.tsx`). Contract: square = complete everywhere (never select/promote), body-click = expand, shift-click / long-press = select, full non-truncating titles on one fixed left edge, urgency rail (Rule 76 — the old reserved priority dot is DELETED, don't reinstate it). Need a behavior a surface lacks? **Add a prop to the shared row — never re-fork a per-surface renderer** (that divergence was the exact problem this replaced). **My Tasks List view is the deliberate exception** (protected power grid — j/k/e/x nav + inline-edit columns, Rule 60). Done-ness = `isTaskDone(t)` (`= status === 'done'`, `lib/taskGrouping.ts`); `completed`/`completed_at` still written but UI branches on status. Standard-palette due labels = `<DueLabel>` (`src/components/DueLabel.tsx`); overdue checks = `dateUtils.isOverdue()` — never hand-roll `new Date(due+'T23:59:59') < new Date()`. **Row display uses `short_title || title`** (curated concise title; full title lives in the detail drawer only — NOT on hover: the on-hover title tooltip was removed 2026-07-09 per Nick, "i don't need the long title when i hover over tasks") — `short_title` is a synced field (brain.db→D1, in `TASK_SELECT_COLS`, returned by `/api/tasks`), generated daily by PB `generate-today` Phase 1b (not a cron); a complete short title is not a truncation, so the non-truncating contract still holds. Added `4d17036f` (2026-06-04) after long RO3 titles (219–365 chars) dominated rows post-Round-6 even though short_titles already existed in D1 — the field was simply never read by the frontend.
69. **`mnccore://` is a verb router for local launch on the machine Nick is using (2026-06-10).** Three verbs handled by `scripts/mnccore-handler.bat`: `open/<path>` (Explorer), `workon/<folder>` (launches `<folder>\Start Claude.bat` — the hardcoded basename IS the security allowlist; refuses unless the folder exists + contains that bat), `process` (runs `~/Peripheral-Brain/Quick_Process.bat`). UI never builds these URIs by hand — use `buildWorkOnUri` / `buildOpenFolderUri` / `MNCCORE_PROCESS_URI` from `src/lib/urlClassify.ts` and fire them through the **`useProtocolLaunch`** hook (protocol-nav + clipboard-copy + toast fallback, one chokepoint). Surfaces: ProjectDetail Overview + TaskDetailPanel (`<WorkOnActions>` when `project.primary_folder` exists) and the Today header **PI-only "⚙ Process" button** (gated on `useAuth().user.isPi` — a local-protocol trigger, NO server route). `primary_folder` is a schema-v71 column returned by `SELECT *` from `/api/projects` (surfaced via `rowToProject`). Register the handler per-machine with `scripts/setup-mnccore-protocol.bat` (HKCU, path from `%~dp0`). The PB `/process` collector (`scripts/process_hub_comments.py`) reads `GET /api/task-comments/recent?since=` (ASC cursor, joins `task_title`).
70. **All task/project human messages go through `postActivityEntry()` (`api/lib/activity-entry.ts`) into `activity_entries` (schema v77, 2026-06-10).** ONE entity-generic store (Design C; spec `docs/superpowers/specs/2026-06-10-activity-entries-unified-timeline-design.md`). Stored kinds `comment|update|completion|system` live ONLY in `shared/activityKinds.ts` (API + UI import it; project feeds render DERIVED `task-*` kinds — never stored). `@me ` body prefix (or the composer lock toggle, which just prepends it) → `visibility='author'`, SQL-gated at every read (`visibility='team' OR actor_slug=current`; PI/API-key sees all — PB is Nick's own surface). Old endpoints (`/comments`, `/updates`, both `/recent` feeds) are PROJECTIONS over `activity_entries` with byte-preserved shapes — retarget aliases, not clients. New unified reads: `GET /api/tasks/:id/activity` + `GET /api/projects/:slug/activity` (whole-picture: project rows ∪ task rows by `project_id`). Hermes responses (`pb-sector.ts`) land in the same stream and INHERIT `@me` visibility. Task/project delete cascades clear `activity_entries`. **P2-A (2026-06-10): project composers retargeted too** — project notes/comments write `activity_entries` keyed by the canonical typed `proj_*` id (the `projectSlug` input preserves the legacy `/projects/<slug>` mention-link shape); GET comments/updates are projections; `comments` (backfilled, ids preserved) + `project_updates` (0 rows) are FROZEN like the task twins; ActivityStream renders the unified feed only — re-adding the legacy merge double-renders every entry. NEVER: write `task_comments`/`task_updates`/`comments`/`project_updates` directly, put HUMAN messages in `activity_log`, or fork a kind map in a component. (`activity_log` disposition SETTLED N7 2026-06-11: KEEP — it is the LIVE telemetry/event log, 71 `logActivity()` write sites + ~12 analytics readers (heatmap/digest/PI dashboard/cadence), 22K+ rows still growing; deliberately complementary to activity_entries, NOT a frozen legacy table.) Phase 2 remaining: activity_log backfill DONE 2026-06-10 (30 real completions recovered; rest is telemetry/stubs — `docs/superpowers/plans/2026-06-10-activity-log-backfill-report.md`). Physical drops DONE 2026-06-10 (schema-v78; `task_comments`/`task_updates`/`comments`/`project_updates` removed; cascade SQL + seeds retargeted). Still open: description-line migration + PB breadcrumb-writer retarget (then delete `descriptionLog.ts`), questions.ts Hermes copy (Ask the Lab).
71. **Title-click opens the full editor on My Tasks (all 3 views) via the shared row's `onOpenEditor` prop (Nick 2026-06-10).** The TITLE text is its own click target → TaskDetailPanel; body-click elsewhere keeps expand; shift-click/selection-mode/long-press still select (they bubble). Today + My Hub deliberately NOT wired — their Rule-58 body-click-expand contract is unchanged. Extend via the prop; never fork the row (Rule 68).
72. **Composer-on-top + single Activity tab (Nick 2026-06-11; design doc `2026-06-11-composer-placement-design.md`).** Every task expand surface puts the composer FIRST under the action bar with the newest-first feed directly beneath (chat-inverse): TaskDetailDrawer + InlineDetail reordered; TaskDetailPanel lifts `OverviewQuickAdd` ABOVE the tab bar (visible on every tab; mobile keeps sticky-bottom) with Status/Priority/Project/Due as inline dropdowns on one row above the tabs. The panel has ONE Activity tab (filter pills carry the notes/comments split; `TaskComments.tsx`/`TaskUpdateFeed.tsx` DELETED — legacy `?tab=notes|comments` remap to `activity` in `resolveTab()`); Overview ends with a 3-entry recent-activity peek + "view all →". The description-derived "Why this matters"/💡 callouts are REMOVED (server `why` key deleted) — the slot is a quiet NEXT STEP line = first open subtask, rendering nothing when none. Descriptions clamp to 3 lines on drawer surfaces ("more" expands); never machine-rewrite human description prose.
73. **Attention signals + Slack-style seen model (Nick 2026-06-11; canon in `docs/design-system.md` "Attention & Notification Canon").** TWO distinct signals, rendered ONLY via `AttentionChip`: gold ✦ NEW = assignment never opened (`acknowledged_at IS NULL`; auto-ack fires on any detail-open via `useAutoAcknowledge` — the explicit Acknowledge button is GONE; reassignment resets it in `applyPatch`; self-created tasks are born acknowledged in `applyInsert`); teal ● n NEW = new activity by others on a task/project you've seen (`entity_seen` v81, marked on detail-open/ProjectDetail-visit, read via `GET /api/seen/unseen`). Badge honesty: a nav count must be what it claims, drain on interaction, and click through to its list (My Tasks badge = unseen → My Items "New for You"; bell = notifications, mark-all-read on dropdown CLOSE). Every notification/attention click opens the actionable entity (in-place `TaskDetailPanel` or `?open=` deep-link); ALL legacy redirects are `NavigateKeepSearch` — never add a plain `<Navigate>` shim (drops `?open=`/`?create=`; 209 notification links were silently dead from this class). Owner re-notification: team-visible comments/updates on a task notify the assignee sans @mention (`postActivityEntry`), skipping @me/self/already-mentioned.
74. **Icon discipline (Nick 2026-06-11: "pixely ≠ premium").** Icons at ≤20px use `strokeWidth={1.5} absoluteStrokeWidth` (lucide's default 2-on-24 scales fuzzy) and contained glyphs (`SquareCheck`, not overflowing `CheckSquare`). Pattern: `ICON_PROPS` const in `src/lib/iconProps.ts`. **Site-wide sweep DONE 2026-06-13** (static + dynamic prop-passed + classifyUrl-util icons via `scripts/icon-props-codemod*.cjs`; `CheckSquare`→`SquareCheck` glyph swap) — 0 ≤20px lucide icons remain without the recipe. Apply it on any NEW icon you add; re-run a codemod to catch drift.
75. **Every fix CLOSES its GitHub issue in the SAME turn — with the commit ref in the close comment.** `gh issue close <n> --comment "Fixed in <sha> (<one-line what>). Verified present at HEAD <sha>."` the moment the fix lands (or is confirmed already-present via Fix-Gate). Clearing the in-app `bug_reports` queue is NOT closing the GitHub issue — they are two separate surfaces, and a green `bug_reports` queue says nothing about issue state. The 2026-06-24 bug sweep marked every `bug_reports` row resolved but left #80–#92 false-open on GitHub; they got wastefully re-dispatched for fixing on 2026-07-02 before Fix-Gate caught the prior art. **A fix wave is not done while its issues sit open.** Feature-request or deferred issues stay OPEN with a triage comment (e.g. #87 ORCID publications, #93 activity-log provenance) — never close what wasn't actually fixed.
76. **One signal, one channel on the task row (Nick 2026-07-22, #99).** The left rail = **urgency** (`urgent`→coral, `high`→orange, nothing else; selection's teal 3px still wins). The due text = **when** (`DueChip` already renders overdue coral/600 with a worded label — the rail deliberately does NOT restate it). `AttentionChip` = **what's new**. `DoneBox` = **done**. The 7px priority/progress dot is **DELETED**, along with its 9px gap — do not reinstate it "for alignment": it multiplexed two orthogonal axes through one channel with a precedence rule (an in-progress high task rendered orange and its progress vanished; teal meant "in progress AND not urgent/high", not an invertible encoding), it was `aria-hidden` with no legend, and two of its four colours were unreachable. Adding a signal? Give it its own channel or replace one — never overload an existing one. Any colour-only signal needs a text equivalent (the rail carries `sr-only` urgency).
77. **Threaded replies are ONE level, and the PARENT owns identity (#98, schema v100 `activity_entries.parent_id`).** Replies ride `postActivityEntry({ parentId })` — the same write primitive as roots, so mentions/notifications/artifact-links/@hermes dispatch cannot drift between them; do NOT add a second reply writer. `entity_type`/`entity_id`/`project_id` are copied from the parent and caller values ignored (a client must not be able to graft a reply onto another entity). Replying to a reply is a **400**, never a silent re-parent — `parent_id IS NULL` must stay a reliable root test for every feed. Lifecycle rows (`system`/`completion`) are not conversational roots. Visibility inherits **downward only**: an `@me` root forces author-only children; a team root still accepts a private reply. Feeds return **roots only** with a **viewer-specific** `reply_count` (never stored — an `@me` reply is visible only to its author + PI, so one global counter would leak or lie). Reply reads use `activityVisibilityGate(request, env, alias, rootAlias)`; the root-author arm is what lets a thread owner read Hermes's author-only answer. Two gate calls, one per alias — **never regex-rewrite one clause into another alias** (the documented footgun that corrupted the task-project subquery). Root delete cascades to replies explicitly (v100 has no FK by design). Replies come back **oldest-first**; root feeds stay newest-first — both deliberate.
78. **`ai_requests` is REQUESTER-SCOPED on read, and has no privacy model of its own (2026-07-22).** `GET /api/ai-requests` returns the full prompt AND response; it was gated only by `auth: 'authed'` with no requester filter, so any teammate could read anyone's Hermes history on a task. It now filters on `requested_by` (matching email OR canonical slug); PI/API-key callers still see everything because the PB listener polls this endpoint. ⚠️ Unlike `activity_entries` this table has **no `visibility` column**, so it structurally cannot express `@me` — requester identity is the only privacy it has. Any new read of this table must scope by requester, and any feature needing per-row privacy belongs in `activity_entries` instead. Hermes answers on a task are surfaced to the attention system by a dedicated arm in `GET /api/seen/unseen` (LEFT JOIN + 30-day bound, `HERMES_UNSEEN_CAP_DAYS`) — the typed `@hermes` prefix writes `ai_requests`, NOT `activity_entries`, so the seen system cannot see it any other way.
79. **Dismiss/hide is a per-THREAD frontend verb that RETAINS every row (Hermes wave Phase 2, schema v102 `activity_entries.hidden_at`/`hidden_by`).** `POST /api/activity/:id/hide { hidden }` hides (dismisses) or restores a thread ROOT + all its replies in one cascade UPDATE — author-or-PI, root-only (a reply → 400). Hidden ≠ deleted: dismissed threads stay searchable AND reachable by Hermes's own transcript ("remember this morning" survives a dismiss). ONE shared predicate — `activityHiddenClause(alias, include)` in `api/lib/activity-entry.ts`, next to `activityVisibilityGate` — must AND into EVERY `activity_entries` read that feeds a timeline/queue/badge/score/search, enforced by the executable gate `scripts/check-activity-reads.mjs` (wired into `deploy:pages:gated`; a read is guarded by `hidden_at IS NULL`/the helper, or carries an `// activity-hidden-exempt: <reason>` marker — auth lookups, write-path read-backs, the Hermes transcript, and the reveal-affordance `hidden_count` COUNT are the legit exemptions). `postActivityEntry` INHERITS `hidden_at` from the parent (bound LAST so `phase4-correctness.test.ts` positional asserts hold) — a reply to a dismissed root is born hidden, no leak. `?include_hidden=1` (the "Show hidden" toggle) + a `hidden_count` ride the three per-entity feeds (task/project/artifact) + the day feed. UI: `ShowHiddenToggle` + the eye affordance on the shared `ActivityThread` root (never dim a whole card for hidden state — compound-opacity rule; use a dashed spine).
80. **The `day` entity — Today-bar conversations, no `days` table (Hermes wave Phase 3, `EntityType 'day'`).** A `day` is a civil-date bucket (`entity_id` = `YYYY-MM-DD`); the SHAPE check IS the existence check (fail-closed, no namespace invention), `project_id` is ALWAYS NULL (a Today-bar ask must never move a project score). `GET/POST /api/days/:date/activity` (`api/routes/days.ts`) are shape-identical to the task feed so the frontend reuses `ActivityThread` (`DayActivityFeed` on `TodayPage`). Day threads default **PRIVATE** (`visibility='author'`) — preserving the pre-wave privacy of morning thoughts. `dispatchHermes` for a day reuses the listener-safe `source_type='daily_thought'` + **`context = NULL`** (never `"day: <date>"` — the external `hub_ai_listener` has never parsed that token) and DAY-SCOPED memory (today's roots + replies, requester-scoped, hidden included). The `ai_requests` response-writeback source_type allowlist is GONE — `_postHermesResponse` routes by the TRIGGERING ENTRY's own `entity_type`, self-gating on "source_id resolves to an activity_entries row". The Today-bar composer (`MorningThoughtCompose` Route 1) KEEPS the `@hermes` token in the body (the stored body is what `HERMES_DETECT_RE` fires on — stripping it is a silent no-op).
81. **A PB session note can be posted to a TASK, and both note routes share ONE idempotency rule (#103).** `POST /api/tasks/:id/updates` accepts `source_table`/`source_id` exactly as `POST /api/projects/:slug/updates` has since 2026-06-23, and both read the pair through **`sourceKeyFrom()`** (`api/lib/activity-entry.ts`) — pair-or-neither, because a half-set stores a non-NULL `source_table` against a NULL `source_id`, which sits outside the partial `UNIQUE(source_table, source_id)` index and dedups nothing. Never inline that check again: PB posts the SAME session note to both lanes, so two copies of the rule are two things that drift. Why it matters: PB's session-close applies its note immediately AND the overnight Inbox flush re-emits it as a backstop, so every note is written twice by design — the project lane survived that on the index; the task lane had no key, which is the actual reason only projects ever got session summaries. PB side: `apply_updates` `task_notes` lane + `BrainDB.add_progress_note_to_task` (kept separate from `add_note_to_task`, which is the brain.db-local private log). The task key is namespaced (`task:` prefix) so a task note that repeats the project note word-for-word still lands — that duplication is the requested behaviour, not a bug.
82. **Hermes's thread transcript uses the THREE-arm visibility gate, not two (#98).** `dispatchHermes` assembles the prior exchange with `visibility='team' OR actor_slug=<requester> OR (root.visibility='author' AND root.actor_slug=<requester>)` — the same predicate `activityVisibilityGate` builds for a reply read. A two-arm gate silently dropped **Hermes's own prior answers**: since threads went private-by-default those rows are `visibility='author'` with `actor_slug='claude-ai'`, matching neither arm, so follow-ups arrived with the user's questions and none of the assistant's replies — exactly the multi-turn memory the feature exists for. The root arm widens nothing (an author-private root is already invisible to everyone else, so its children are too) and a private reply under someone else's TEAM root still fails all three. Regression tests in `api/lib/activity-entry.test.ts` include the leak case; the test double reads the root arm off the SQL, so deleting the arm fails the suite.
83. **Meeting origin is TWO questions, and conflating them is why five surfaces rendered nothing (#108).** *Did this come from a meeting?* is answered by `source`/`meeting_id`, which always exist. *Can I link to it?* is answered by `meeting_ref`, the canonical `meetings.id` the server resolved. Both live in `src/lib/meetingOrigin.ts`; render through `<MeetingOriginTag>` (icon + label are ONE link target). ⚠️ **`tasks.meeting_id` and `meetings.id` are DIFFERENT ID SPACES** — meetings are `mtg-YYYY-MM-DD-<hash>`, tasks carry `cal-<ts>-<slug>` (extraction) or `mtg_<ts>` (approval), so the plain `LEFT JOIN meetings ON t.meeting_id = m.id` matched only 8 of 152 rows and every badge gated on the joined `meeting_title` silently disappeared. `api/lib/meeting-ref.ts` bridges by the date + truncated title-slug embedded in those ids (109/152, prod-measured 2026-08-03) and `decorateMeetingRefs` applies it in the tasks read path. **NEVER** let `meetingHrefFor` fall back to `meeting_id` (dead links, ~43 rows), and **NEVER** rewrite `meeting_id` on the wire (PB replicates it). Retiring the bridge = **#109**.


## Known Gotchas (active traps only)

| Problem | Fix |
|---------|-----|
| Hero cards render loop | Use `<a>` tags, not Router Link |
| initialData flash | Use factory functions: `() => data` |
| Meeting ID collision | IDs include random suffix. `normalizeMeetingTitle()` lowercases+trims. UNIQUE index enforced. |
| Tailwind v4 group-hover | Use CSS rule in index.css, not arbitrary value |
| `--border-light` vs `--border-subtle` | Gold=semantic, Neutral=structural. Don't mix. |
| TaskCard status cycling | todo→in_progress→done (skips blocked) |
| Network chunk 1.3MB | Expected (three.js). Code-split via React.lazy |
| CF Access blocks all | Restrict to portal paths only |
| Duplicate action items | Dedup by normalizing "[Carried forward]" |
| `team_members.email` column | Read `email` column; fall back to slug derivation only if NULL. Non-UMN collaborators get a real address. |
| Mobile swipe on TaskDetailPanel | Implemented via framer-motion `drag="x"`. `touch-action: pan-y` lets vertical scroll through. `edgeGuardRef` blocks drag within 32px of viewport left (iOS Safari edge-swipe-back). Dismiss: offset > 30% OR velocity > 500px/s. Don't revert to raw touch handlers. |
| Virtualizer skeleton rows | Must match TableContainer + header + rows at `var(--row-height)` pixel-for-pixel to avoid CLS. |
| FAB positioning | Use `--fab-stack-{1,2,3}` CSS vars. NEVER `max(24px, 72px)`. Mobile override via `<768px` media query in index.css. |
| react-grid-layout v2.x is a breaking rewrite | Stay on `1.5.3`. `DashboardGrid.tsx` depends on `WidthProvider(Responsive)` HOC pattern. |
| Dark mode localStorage key | `mn-ccore-theme`, NOT `theme`. Playwright tests must set the right key. |
| `@formkit/auto-animate` import drift | If you see `Cannot find module 'X'`, grep the imports vs package.json before assuming it's installed. |
| Project status legacy values | `src/data/projects.ts` static fallbacks use `'Active'`. `normalizeProjectStatus()` in `lib/taskConstants.ts` folds them. Don't delete the helper. |
| Grant status taxonomy | 7 values in `useGrantTimeline.ts:GRANT_STATUS_OPTIONS`. `Active` is legacy. |
| WebSocket stub | `tests/setup/websocket-stub.ts` kept for local tests (Miniflare can't run the DO). |
| Folder links silent on Windows | `mnccore://` needs a per-machine Windows URL-handler registration. Until registered, the browser silently no-ops — so all surfaces (`KeyLinksEditor`, `LinkifiedText`, `WorkOnActions` via the `useProtocolLaunch` hook) copy the raw path to the clipboard + show a toast as the reliable fallback. Don't revert to direct href. The handler (`scripts/mnccore-handler.bat`) is now a **verb router** (open / launch / workon / process); register it with `scripts/setup-mnccore-protocol.bat` (HKCU, derives the path from `%~dp0` so it works on work + home). The old `.reg` is superseded. |
| PresenceAvatars visible when alone | By design. Peer list excludes self. Verify: open same ProjectDetail in two browsers as two auth identities. |
| A timeline gap rendered at a non-linear height | **`pxForGap` MUST stay `minutes × PX_PER_MIN`.** A gap's interior is a coordinate system, not whitespace: six sites convert pointer pixels to minutes by dividing by the global constant — list-drop (`TodayDndContext`), block move + resize (`useTaskBlockDrag`, `useTaskBlockGesture`), block placement (`packTaskBlocks`), drop preview + in-unit now-line (`TimelineGrid`). Render a gap at any other height and **a task dropped near the bottom of a long gap is SAVED AT THE WRONG TIME.** Confirmed empirically 2026-08-03 (sub-linear gap compression tried, measured, reverted). Guarded by a comment + a linearity test; making it structural is **#110**. Compressing gaps is still the right way to shorten the timeline — it needs a PER-GAP scale threaded through all six sites, not a change to `pxForGap` alone. |
| Styled tooltip clipped in a row/overflow container | Styled tooltips render through **`TooltipLayer`** (`src/components/TooltipLayer.tsx`) — one delegated listener → a `position:fixed` chip in a **body portal**, so it escapes every `overflow:hidden` ancestor + dynamically anchors bottom-right of the pointer. Give an element a **`data-tip`** attribute (keep `aria-label`). NEVER reintroduce a CSS `.tip::after` pseudo-tooltip — it clips inside overflow containers (showed only its top sliver, Nick 2026-07-09). `.tip`/`.tip-end` classes are now inert markers. Self-evident icons (Gmail/email) get NO tooltip; named links use `.link-affordance` (hover-underline) not a "Jump to X" tip. **Put `data-tip` on the TEXT, never on a layout wrapper** — `TooltipLayer` resolves targets with `closest('[data-tip]')`, so the attribute's element IS the hover zone. A `flex:1` wrapper (the common "push the trailing badges right" idiom) spans the whole column, so a tip on it fires anywhere in the row (Nick 2026-07-21: "hover should only be if i am ON the title... not the whole box"). Moving the attribute is not enough if the text element is `display:block` — it still fills the width; make the wrapper `display:flex` so the text shrink-wraps. ⚠️ Any comment claiming a tip must sit on a non-clipping ancestor is STALE — that dodged the old CSS `::after`; the portal escapes overflow. |

## Testing

**Run:** `bash scripts/run-tests.sh all` (quick/ui/sync/all modes)

**Config variants:**

| Config | Target | Use case |
|--------|--------|----------|
| `playwright.config.prod.ts` | live prod | Inspection + post-deploy regression |
| `playwright.config.dogfood.ts` | ungated preview (`DOGFOOD_BASE_URL=https://<hash>...` + fake auth; N6 2026-06-11 — pointed at gated prod it just tests the CF sign-in interstitial) | Page-health + mobile spot checks |
| `playwright.config.local.ts` | Miniflare local | Unshipped changes |

**Test DB isolation:** Tests run against `mnccore-lab-test` (separate D1). Canonical test prefix: `_TEST_DELETE_`. See `TESTING.md`.

**Playwright MCP vs CLI:** CLI default (fast, cheap). MCP only for debugging a specific failing test after CLI doesn't give enough context — each `browser_snapshot` costs ~2K tokens.

**API field protection:**
- Tasks: `status`, `priority`, `assignee` — can never be null
- Projects: `status`, `stage`, `category` — can never be null

## Peripheral Brain Connection

- **Project folder:** `Projects/mn-ccore-lab-hub/` — PROJECT.md + hub-future-ideas.md
- **Sync scripts:** PB `scripts/db/sync/` module — `python scripts/db/sync.py {pull|push|sync|status}`
- **Decision:** `Context/Decisions/2026-04-21-sync-extraction-COMPLETE.md`
- **Accessibility:** WCAG 2.1 AA clean (axe 29 pages × 2 schemes = 0 findings, r7 2026-04-23).

## Hub Specialist Agents (added 2026-05-02)

User-level agents at `~/.claude/agents/`. Persistent memory in `agent_knowledge.category='<name>'` (brain.db).

| Nick says / situation | Specialist |
|----------------------|------------|
| Hub frontend bug / React component / Tailwind / accessibility / Playwright UI test | **hub-frontend** (Sonnet) |
| Worker deploy / D1 query / mutations.ts / KV / R2 / hub_ai_listener / wrangler | **hub-backend** (Sonnet) |
| Schema drift between brain.db ↔ D1 / pending change-spec from Builder / type generation | **hub-schema-sync** (Sonnet) |

**Cross-system handoff (updated 2026-07-04 — the jsonl handoff file below is retired; F1, 2026-06-02):** field-authority changes originate in PB's `scripts/db/schema_dsl.py` (SSOT), flow through `schema_dsl_codegen.py` + `pb-schema/sync_from_pb.py` into the `pb-schema` submodule's generated artifacts, and reach Hub when `mn-ccore-lab` bumps the submodule pointer + deploys — `mutations.ts` imports `TABLE_FIELDS` from the generated package rather than an inline literal. D1 schema migrations (CREATE TABLE / ALTER) are still a separate `hub-schema-sync` step per the standard schema-change workflow (decision doc → migration → pb-schema regen).

**Depth-2 limit:** Hub specialists cannot dispatch other agents directly — return "next: dispatch X" to COO.

Full architecture: `C:/Users/ingra107/Peripheral-Brain/Context/Decisions/2026-05-02-context-diet-and-managers.md`.

## Session Notes
<!-- COO writes session updates here. Synced by SessionEnd hook or Start Day backup. -->

## Pending Sync
<!-- When this session ends, the SessionEnd hook syncs this to Peripheral Brain. -->
