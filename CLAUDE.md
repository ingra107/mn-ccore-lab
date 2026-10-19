# MN-CCORE Lab Hub -- Claude Operating Guide

## First read on every session

1. **`SESSION-HANDOFF.md`** — current gate state, what to do first, gotchas. Always. If the session starts in AUTO or AUDIT MODE, its top section is the ticket queue: execute it in order.
2. **`docs/design-system.md`** — its top section **"Design Principles (Nick's bar)"** (the 10 standing UI rules) BEFORE building any component.
3. On demand: `REFERENCE.md` (API endpoints + D1 tables), `CHANGELOG.md` (what changed), `docs/OBSERVABILITY.md` (`/api/health` runbook), `PROJECT.md` (`next_action`).

`docs/archived/` and `Archive/` hold retired material: ignore unless spelunking history.

## Vision

The MN-CCORE Lab Hub is the **team's operating surface** — where research gets managed, meetings get run, and information flows between Nick's CLI system and every team member's browser.

The Hub is a research operating system, not a task list.
Every page passes the 5-second test: a newcomer knows what to do next without asking.

## Quick Reference

| Thing | Value |
|-------|-------|
| Live site | mnccore.org (LIVE — CF Access gated via @umn.edu policy on `/portal/*`; `mn-ccore-lab.pages.dev` is the alias, `www.mnccore.org` 301s to the apex) |
| Repo | github.com/ingra107/mn-ccore-lab (720+ commits) |
| Today landing | `/portal/dashboard` → `src/pages/portal/TodayPage.tsx` |
| Lab Overview | `/portal/overview` → `src/pages/Dashboard.tsx` |
| MyTasks | `/portal/my-tasks` → `src/pages/MyTasks/` (`App.tsx` lazy-imports the dir directly). Views = `VIEW_MODES` in `src/pages/MyTasks/constants.ts` (List, Table, Lanes, Columns, Board; one shared toolbar); count them there, not here |
| Deploy | **Manual, and CLAUDE RUNS IT — do NOT ask Nick to deploy.** Pushing to `origin/main` does NOT deploy. From repo root, in the **Bash tool**: `npm run deploy:pages:gated` (identity gate, activity-reads lint, API typecheck, build, member page sweep, `wrangler pages deploy`, prod probe). Wrangler is already authenticated at the system level (`npx wrangler whoami` confirms); do NOT `wrangler login`, call `powershell.exe` from Bash, or grep the token out of `secrets.ps1` (auto-mode-DENIED). That ban covers `CLOUDFLARE_API_TOKEN` only: the app key `PB_API_KEY` is already in the Bash env, so verify a gated `/api/*` endpoint with `curl -H "Authorization: Bearer $PB_API_KEY" https://mn-ccore-lab.pages.dev/api/...`. Get Nick's go first only if the change is risky. Why: asking Nick to deploy, or hunting for the token, wastes a turn. Detail: `docs/claude-md-detail.md` "Quick Reference: Deploy row". |
| Stack | React 19 + Vite 8 + Tailwind v4 + Framer Motion 12 + TypeScript + Hono v4.12 |
| Testing | Playwright 1.59 (4 suites) + Vitest 4.1. **Never quote a test count from this file — run `npm run test:api`.** (1263 on 2026-07-25, and every number previously written here went stale.) |
| Data | TanStack Query v5 + Cloudflare D1 + Recharts. **Table + route counts are DERIVED, not documented** — see the row below. |
| D1 database (prod) | `b8453e9b-7c5f-4029-b07d-dd89c05d00cf` (ENAM), binding: `DB`. **Schema version = the highest-numbered `api/schema-v*.sql`**, enforced by `python scripts/check-schema-versions.py` (also a commit gate). Do not re-add a changelog here; read `ls api/schema-v*.sql` for the number. Why: a hand-written list sat 18 migrations stale and nearly got a new migration misnumbered. Detail: `docs/claude-md-detail.md` "Quick Reference: D1 database (prod) row". |
| Counting things | Don't trust prose for counts — derive them: **tables** `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'` via `scripts/wrangler-d1` (75 on 2026-07-22); **routes** = the pin in `api/routes/route-contract.generated.test.ts` (271 on 2026-09-16), which fails the build when it drifts; **tests** = the run. |
| D1 database (test) | `a30fe84d-0891-4035-9358-f7813b5f5807` (mnccore-lab-test), binding: `DB_TEST` |
| Schema drift CI | `.github/workflows/schema-drift.yml` — nightly 03 CT. Guardrail against silent prod migrations. |
| Deploy mode | **THREE surfaces, one repo — deploy each deliberately.** (1) `mn-ccore-lab.pages.dev` = production site (frontend + `/api/*`): `npm run deploy:pages:gated` ONLY, no CI auto-deploy; its bindings live in the Pages project, NOT wrangler.toml. (2) `mn-ccore-lab-api` worker = the **CRON engine** (calendar poller / pulse / digest): `npm run deploy:worker`. Only a change to the `scheduled()` export needs it; every Pages deploy already ships non-cron routes. wrangler.toml's top level is deliberately INERT (prod bindings + crons live under `[env.production]`). Do not re-retire this worker without `substrate-swap` (#137 deleted it as "zero consumers" and the crons were its consumers). (3) `mn-ccore-artifacts.pages.dev` = the **COOKIELESS artifact origin**: `artifacts-site/`, `npm run deploy:artifacts`, serves only `GET /a/:id`. Keep it minimal (no `/api/*`, SPA, secrets, crons or Access app); `scripts/check-artifacts-origin-minimal.mjs` enforces that at commit and deploy. A normal Pages deploy does NOT update it. Why: untrusted user HTML must never run on the host that scopes `CF_Authorization`. Verify live commits: `wrangler pages deployment list --project-name mn-ccore-lab` (or `mn-ccore-artifacts`); worker: `wrangler deployments list`. Detail: `docs/claude-md-detail.md` "Quick Reference: Deploy mode row". |
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

**The anchored band edge is UNIVERSAL (Nick 2026-06-10) — the width exemption is DEAD.** The taxonomy governs CONTENT rules only, not page WIDTH. Every page (data, dashboard and operating surfaces) shares ONE centered `.content-container` band (max-width `--content-band`, 1440px) with the primary column left-anchored at `--col-main`; full-height flex surfaces (My Tasks) use `.mt-band`; Today's `.b2-grid` uses `--content-band` with `--col-main`/`--col-rail`. No `maxWidth:'100%'` override, no full-bleed, and NEVER a page-wide background tint around an operating surface. Why: one shared left edge is what makes the pages read as one product. Detail: `docs/claude-md-detail.md` "Design System: the anchored band edge".

### Shared Utilities
- `src/lib/dateUtils.ts` — all date formatting
- `src/lib/time.ts` — canonical time chokepoint: store instants UTC, display viewer-local (`nowInstant()`, `formatLocal()`, `todayCivil()`). Lint R20/R21 (`local/time-discipline` in `eslint.config.js`, ENFORCE) flags raw `new Date().toISOString()`; a reasoned exception is `// eslint-disable-next-line local/time-discipline -- <why>`. `dateUtils.ts` stays in use alongside it. Detail: `docs/claude-md-detail.md` "Shared Utilities: time.ts".
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

- **API:** Cloudflare Worker, Hono v4.12 (`api/index.ts`); route count is pinned by `route-contract.generated.test.ts` (267 on 2026-09-08 — read the pin, not this sentence). Middleware chain: OPTIONS preflight → test-mode DB swap → API-key auth → authed-user resolve → PI gate for `/api/pb/*` GETs → write-auth gate (fail-closed, `api/lib/auth-mode.ts`) → version-bump-on-success. Do NOT add routes with raw `url.pathname === ...` comparisons — use `app.get/post('/api/...', handler)`.
- **Auth:** CF Access gates `/portal/*` on `mn-ccore-lab.pages.dev`, `mnccore.org` and `www.mnccore.org` (www 301s to the apex). JWT via JWKS in `api/jwt-verify.ts`. `/api/*` is NOT gated by CF Access (auth via X-API-Key + JWT server-side). Server auth fails closed: `authEnforced()` in `api/lib/auth-mode.ts` is the only reader, a missing flag enforces sign-in, and only `HUB_LOCAL_DEV=1` (in `wrangler.local.toml`, never prod) opens it. `VITE_REQUIRE_AUTH=1` gates the client. `getAuthUser()` and `isPiRequest()` are `async` — callers must `await`.
- **Email:** Resend (`api/lib/email.ts`) + daily digest (`api/routes/digest-email.ts`). Preview: `/api/digest-preview?member=nick`
- **Sync:** `scripts/db/sync/` module in PB, invoked via `python scripts/db/sync.py {pull|push|sync|status}`. Scheduled + /process-triggered.

### Sync Architecture

**Tasks & projects: D1 (Hub) is canonical; brain.db is a disposable pull-cache.** Every hub-synced tasks/projects write goes through BrainDB **Hub-first** writers (POST `/api/mutations`, then mirror the accepted row into brain.db): no outbox lane, no `local_modified`, no dirty-push for tasks/projects edits; the pull is LWW-gated (Hub wins when strictly newer). The outbox is still load-bearing for PB-local semantic tables + `inbox_events`. `tasks.sync_status` / `projects.sync_status` no longer exist (mig-094); never reference them. Why: one arbiter, a rebuildable cache. Detail: `docs/claude-md-detail.md` "Sync Architecture: Tasks & projects".

**Key rules:**
- Brain.db tasks use canonical `task_{ulid}` IDs. Hub-created tasks use typed ULIDs (e.g., `task_01KP...`). Both reachable via `entity_aliases` (hub_slug alias).
- **`tasks.project_id` (+ all project-FK columns) STORE the typed `proj_*` PK.** Storage and sync wire are typed; the browser `/api/tasks` display is the SLUG, resolved at ONE chokepoint (`COALESCE(... p.slug ...) AS project_id` inside `TASK_SELECT_COLS`, `api/lib/task-cols.ts`). Do NOT "fix" `projectsByPid` to key by `p.id` (it is slug-keyed despite its name), do NOT reintroduce the `.replace(/\bt\./g,'')` strip in `meetings.ts`, and do NOT run `scripts/p2_hub_rekey_apply.py`. Why: a half-migrated read once left ~20 tasks unlinked and broke sync silently. Detail: `docs/claude-md-detail.md` "Sync Architecture: tasks.project_id".
- `notes` (brain.db) vs `description` (D1, team-visible): `notes` is **brain.db-local-only** (Model A, executed in M5, 2026-06-14); the team-visible body is `description`. Do not treat the old bidirectional `notes`↔`description` sync as intended. Detail: `docs/claude-md-detail.md` "Sync Architecture: notes vs description".
- Task deletion uses soft-delete (`deleted_at` column). `GET /api/tasks?include_deleted=1` surfaces them for the sync module.
- `completed` field is bidirectional — Hub can reopen tasks.
- Hub task/project **updates** mirror into brain.db `d1_task_updates` / `d1_project_updates` (append-only, read-only). (`d1_task_comments` exists in schema but is inert/0-rows; task *comments* are not mirrored.) M5 (activity-timeline + comments) reconciles the update-mirror vs unified-Activity-timeline overlap.
- Hub-originated projects flow into brain.db — `category` (MNCCORE/CLIF/Peripheral Brain) maps onto brain.db `domain`.

**Implementation:** `scripts/db/sync/` (drivers/hub.py + boundary + payload). Decision: `Context/Decisions/2026-04-21-sync-extraction-COMPLETE.md` in PB.

### Wrangler / D1 auth — ALWAYS go through the sanctioned entry point (2026-05-24)

**Never raw `npx wrangler d1`.** Use `scripts/wrangler-d1 d1 execute mnccore-lab --remote --command "SELECT 1"` (shell) or `from wrangler_d1 import run_d1; run_d1(command="SELECT 1", json=True)` (Python). Both unset `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` first. The DB is `mnccore-lab` (no dash). `.githooks/pre-commit` blocks a raw d1 execute/export outside `.github/workflows/` and the wrapper files (put `wrangler-d1-allowed` on a docs line to exempt it). Why: the Pages-scoped env token lacks D1 scope and shadows the OAuth creds, which read as "blocked" four times. Detail: `docs/claude-md-detail.md` "Wrangler / D1 auth: the sanctioned entry point".

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
- Stage: `projects.stage` is retired (contract phase, schema-v130). A project's stage is its home product's (`products.kind` + `products.stage`, rungs in `product_stages`); the API refuses a `stage` write on a project (RETIRED_FIELDS).
- `projects.category`: `MNCCORE / CLIF / Peripheral Brain` (Hub-authoritative; 3-bucket design per 2026-05-08 decision)
- `tasks.priority`: `low / medium / high / urgent`

Anti-pattern: deploying a data migration while the frontend still expects the old schema. Data-on-new-schema + code-on-old-schema corrupts.

## Hermes (AI Research Assistant)

Live since 2026-04-09. Team members @mention `@hermes` in Ask the Lab, task comments, or project comments. Responses appear with gold sparkle badge (timing depends on ai-request queue; placeholder "Thinking about this..." shown immediately, real response via polling).

- **Detection:** `/@(hermes|claude)\b/i` regex in `api/routes/questions.ts` and `api/routes/projects.ts`
- **Author slug:** `claude-ai` (display name "Hermes" via `src/data/team.ts`)
- **Backend:** `hub_ai_listener.py` on home laptop polls `GET /api/ai-requests?status=pending` every 60s. ⚠️ Hub list endpoints return `{data, count}` — the listener read a nonexistent `requests` key from its FIRST commit until 2026-06-11 (PB `b794fddf`), so this lane fetched 0 forever. When adding a PB consumer of a Hub route, verify the response key against the route source, and fail loud when `count>0` parses to 0 rows.
- **Artifacts (v1, 2026-06-11):** responses >1500 chars OR explicit document asks become versioned artifact pages at `/portal/artifacts/:id` (md stored in `artifacts`, schema v79) + a short feed teaser with the link; short answers stay inline. Comment-driven revisions: artifact comments live in `activity_entries` (`entity_type='artifact'`), `@hermes` on an artifact → `ai_requests` `source_type='artifact_comment'` → listener regenerates + POST `/:id/revise` (version++, history in `artifact_versions`). Design: `docs/superpowers/plans/2026-06-11-hermes-artifacts-design.md`.
- **Peripheral Brain access + a two-tier disclosure policy (2026-09-08, GH #121).** `pb_access_policy(requested_by)` appends a per-request section to the system prompt: Nick's asks = no restrictions; anyone else = project-level material only plus a named deny list. An unattributed request falls to the RESTRICTED tier. ⚠️ The fence is the model following instructions (Nick's call); only `team_members` rows can use the Hub. Tighten the deny list first if anything leaks. Detail: `docs/claude-md-detail.md` "Hermes: Peripheral Brain access and two-tier disclosure".
- **Owner-tier Google Workspace (2026-09-08, GH #119).** When the asker is Nick the spawn carries his Gmail/Calendar/Drive tools (PB's `google_workspace` surface minus send and destructive deletes); a teammate's ask loads zero MCP servers. Pass servers with `--mcp-config <FILE>`, never rely on `~/.claude.json`, never pass `--safe-mode` on an owner spawn, and keep `--strict-mcp-config`. Why: each of those failed silently as "no Gmail tool available". Detail: `docs/claude-md-detail.md` "Hermes: Owner-tier Google Workspace".
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
24. **Identity comes from `team_members.email`, never a prefix map.** The Worker resolves `user.slug` from the row whose `lower(email)` matches the login (#8945, 763df992). A UNIQUE index on `lower(email)` (v118) keeps that one row. A new member is added by a PI from the Team page (`POST /api/team`) BEFORE their first sign-in; nothing is auto-provisioned (ef69753e, 2026-10-08).
25. **`/api/version` is edge-cached for 10s.** Don't shorten the TTL. Don't add `Set-Cookie` (defeats cache).
26. **JWT `importKey` is cached per `kid` at module scope.** `importedKeyCache: Map<string, CryptoKey>` in `api/jwt-verify.ts`. Don't replace with per-request import.
27. **Hover-only badges must be `visibility: hidden`, not `opacity: 0`.** `opacity: 0` keeps the element in the AT tree — screen readers announce phantom badges. Apply to any future hover-revealed content.
28. **Sidebar nav links carry `aria-current="page"` on the active route.** New navigation surfaces must set `aria-current` for screen reader navigation.
29. **Brand primitives live in `src/components/` — use them, don't reinvent.** `HeartbeatLine`/`HeartbeatDivider`, `HermesMark`, `CategoryIcon`, `EmptyStateArt`, `PhaseReleaseBanner`, `RequireAuth`. Never use lucide `<Sparkles />` for Hermes or a 6px dot for categories. Generic UI primitives live in `src/components/ui/` (`Button`, `Chip`, `Field`, `Modal`); prefer them for new buttons/pills/fields/modals. An icon-only button MUST be `<Button size="icon" aria-label=...>` (24px box, 44px on touch; the type requires the label, and lint `icon/icon-button` refuses a raw one). Why: one look, one place to change it. Detail: `docs/claude-md-detail.md` "Rule 29".
30. **`/api/bug-report` gates on `authEnforced()`, not a standalone check.** Bug-report uses the same fail-closed rule that gates writes. Don't add a separate auth check.
31. **Per-route OG share cards at `/og/<type>/<slug>`.** `api/routes/og-card.ts` generates SVG cards (`functions/og/[type]/[slug].ts` is the wrapper). Logged-out callers get only public data (generic lab card, team name, published-artifact title); signed-in cards are `private, no-store`. `public/_headers` forces `image/svg+xml`. `usePageMeta()` sets `ogImage` client-side, so link unfurlers (no JS) never see these cards; they see index.html's static og-image.svg.
32. **Pulse Kiosk (`src/pages/Pulse.tsx`) hex-pins its colors deliberately.** Renders without `.dark` class so CSS vars would resolve wrong. Hex-pinned (`#0b1017`, `#f5efe2`, `#dcb355`, `#5cbcb4`, `#f0737e`). Don't "fix" to CSS vars.
33. **Capture specs for Claude Design — run on demand via `scripts/regen-design-bundle.sh`.** Six specs, ~25 min end-to-end. Output gitignored. Don't add to default test run. Full spec detail in `docs/design-system.md` and `docs/archived/CLAUDE.md-history-2026-05-15.md`.
34. **Email prefix → slug via `emailToSlug`, never raw `split('@')[0]`.** `src/lib/emailSlug.ts` exports `emailToSlug(email)`, and `api/helpers.ts`'s `actorSlug()` resolves the same way. Both read `EMAIL_PREFIX_TO_SLUG` from `shared/emailSlug.ts` — **one file, one edit** to add a team member. It used to be two hand-mirrored copies, and #906 is what a missed lockstep looked like: the edit button hid while the API still accepted the write.
35. **A stage belongs to a product, not a project.** `projects.stage` is retired (schema-v130): the API refuses a `stage` write on a project. Stage reads and writes go through `products` (`kind` + `stage`, the rungs of each kind in `product_stages`); the UI writes with `setProductStage()` in `src/lib/products.ts`, and compact displays use `compactStageLabel()` in `src/lib/projectStage.ts`. `src/lib/stageNormalize.ts` is legacy display mapping for old project-stage strings: do not use it for new work.
36. **`getAuthUser()` reads JWT from either the header OR the `CF_Authorization` cookie.** Header = CF Access proxied requests (portal only). Cookie = sent by browser on all same-domain requests. Without the cookie fallback every authed POST from `/api/*` would 401. Keep BOTH paths working.
37. **Google Fonts `<link>` tags need `crossorigin="anonymous"`.** Without it, axe-core's contrast checker trips CORS preflight — 3 console errors per page in audit runs. Same for any new cross-origin stylesheet.
38. **Every `<select>` must have `aria-label` or a matching `<label htmlFor>`/`<select id>` pair.** Bare `<select>` trips axe `select-name` critical.
39. **`role="switch"` with `aria-checked` must use string `"true"`/`"false"`, not boolean.** `aria-checked={myBool ? "true" : "false"}`. Only `aria-checked` on role=switch/checkbox/radio is strict; `aria-expanded`/`aria-pressed` boolean bindings are fine.
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
60. **MyTasks view picker far-left of the filter row: List | Table | Lanes | Columns | Board, List = cold-load default (Nick 2026-06-10).** Bare arrival ALWAYS opens List; `?view=` deep-links + saved views win (`parseViewMode` in `src/pages/MyTasks/constants.ts` is the one reader; `VIEW_MODES` there is the view list). Five views share ONE toolbar. List (the Today task-card list) and Table (the dense sortable grid) use the right-side drawer with cursor-stable j/k nav (`hooks/useListKeyboard.ts`); Lanes and Columns use inline expand; Board opens the drawer on card click. Columns and Board are desktop-only (a phone falls back to List). Source: `src/pages/MyTasks/index.tsx`.
61. **Right Now is a promoted slot, not a fixed task.** Subtle gold glow only here (`box-shadow: 0 0 24px rgba(201,168,76,0.06)`); nothing else gets a glow. Mark-done unplans, sinks to bottom with strikethrough, auto-promotes next planned task. Source: `useTodayState` in `src/pages/portal/TodayPage.tsx`.
62. **Group sort within a TaskGroup: planned → active → done.** Don't re-sort by priority/due_date within a group — that fights the operating-day mental model. Source: `TaskGroup` in `TodayPage.tsx` (also applies to the MyTasks Lanes view).
63. **`tasks.group_override` is the explicit Hub-authored bucket choice; `getGroupForTask()` checks it FIRST.** Schema v50. Groups: `'deep' | 'priorities' | 'quick' | 'pb' | 'etl' | NULL`. Pulls to brain.db (tasks are Hub-first written; D1 canonical). API guard: `VALID_GROUP_OVERRIDES` rejects non-canonical values with 400. Decision: `Context/Decisions/2026-04-25-tasks-group-override.md`.
63b. **The Today day-plan is synced task columns, NOT localStorage.** Schema v75: `tasks.planned_for` / `plan_slot` / `plan_rank`; `src/lib/todayPlan.ts` is the only write path (enforces the `right_now` singleton), and MyTasks plan actions route through it. Do NOT reintroduce raw `today_state_*` localStorage writes. The PB-Sector `daily_plans` planner and `/portal/pb` page are RETIRED (2026-06-10); `/api/pb/capture`, `pb/sessions*` and `pb-today` stay; the dispatch queue's routes are archived (2026-10-11). Why: a plan in localStorage never reached brain.db or TODAY.md. Detail: `docs/claude-md-detail.md` "Rule 63b".
63c. **The Manuscripts page lists PRODUCTS, not projects.** It shows the live products of the kinds in `MANUSCRIPTS_PAGE_KINDS` (manuscript, abstract, talk; `manuscriptsPageTabs()` / `productsOfKinds()` in `src/lib/products.ts`), each on its own kind's ladder. A project's stage is its home product's. Stage words come from `product_stages` labels and `projectStage.ts`; don't fork new stage maps.
63d. **Quick-add shortcut is `q`** (single key, suppressed while typing). Cmd/Ctrl+N is browser-reserved and can NEVER fire in Chrome/Edge/Firefox — don't rebind it. The ⌘K quick-add modal (`GlobalQuickAddModal` + `openGlobalQuickAdd()`) is the ONE canonical capture; QuickCaptureBar/Personal capture are triggers into it, not separate capture UIs (P2-10).
63e. **Entity deep-links: every surface consumes `?open=`/`?openTask=` via `useOpenParam`** (`src/hooks/useOpenParam.ts`) — it fires once when data is ready, then strips the param; add the consumer on every new detail-capable page. ⚠️ It is for ARRIVING at a page, NOT for a click on the page you are on (it fires once per distinct value): a link on a surface that mounts its own detail panel opens it directly via `onOpenTask(id) => boolean` + `taskLinkClickHandler` (`activityRender.tsx`), keeps the `href`, and never intercepts a modified click. If a second surface needs open-in-place, extract a shared hook. Detail: `docs/claude-md-detail.md` "Rule 63e".
64. **Personal calendar feeds are iCal pull, not OAuth.** Schema v52. Users paste private iCal URLs into `/portal/profile` or `/portal/settings#integrations`. Hub polls lazily, parses via `api/lib/ics-parser.ts`, upserts to `user_calendar_events`. UI: `src/components/CalendarFeedsPanel.tsx` (shared TanStack cache key `calendar-feeds`). Tests: 24 vitest unit tests at `api/lib/ics-parser.test.ts`; run via `npm run test:api`.
65. **CF Access auth uses Generic OIDC `Google UMN`, not the preset Google IdP.** `Auth URL = https://accounts.google.com/o/oauth2/auth?prompt=select_account&hd=umn.edu`. Don't revert to the preset Google IdP — it loses the account chooser.
66. **The Hub is members only (ef69753e, 2026-10-08).** `isTeamMember` (api/helpers.ts) = a `team_members` email or a PI email; a valid API key counts as a member. `bindRegistryToHono` (route-dsl.ts) is the one gate: a signed-in non-member gets 403 `not_a_member` on every non-public route, a public GET serves them its `anonShape`/`anonRows`, and only `/api/auth/me` (`servesNonMembers`) answers them, without slug or directory. The SPA shows a members-only wall with a Request access mailto. `ensureTeamMember` (ghost auto-create + prefix claim, schema v53) is DELETED; `auto_created` and the PENDING REVIEW badge are dead. `POST /api/team/:slug` is owner-or-PI gated; role, member_type and email are PI-only.
67. **`/portal/profile` is the self-service profile + integrations entry.** Inline-on-blur edit for self-edit fields. Embeds `<CalendarFeedsPanel />`. Any save invalidates both `['team']` and `['team-raw']`.
68. **One shared task row — `src/components/tasks/TaskRow.tsx`. Don't fork it (Round 6, 2026-06-01).** Today, My Tasks List and Columns render through it via thin adapters (`today/TaskRow`, `MyTasksRow` in `ColumnsView.tsx`). Contract: square = complete everywhere (never select/promote), body-click = expand, shift-click / long-press = select, full non-truncating titles on one fixed left edge, urgency rail (Rule 76). Need a behavior a surface lacks? **Add a prop to the shared row — never re-fork a per-surface renderer.** The dense My Tasks Table and Lanes (and the next pages: Projects, Deadlines, Manuscripts, Grants, Calendar agenda) render through the ONE sleek-row primitive `src/components/table/SleekRows.tsx` (cells in `components/tasks/taskSleekCells.tsx`), not through `TaskRow`; adopt that primitive rather than a new row. Done-ness = `isTaskDone(t)` (`lib/taskGrouping.ts`); due labels = `<DueLabel>`; overdue = `dateUtils.isOverdue()`, never a hand-rolled date compare. Row display uses `short_title || title`; the full title lives in the drawer only. Why: per-surface row forks were the divergence this replaced. Detail: `docs/claude-md-detail.md` "Rule 68".
69. **`mnccore://` is a verb router for local launch on the machine Nick is using.** Handled by `scripts/mnccore_handler.py` under pythonw.exe (verbs `open/<path>`, `workon/<folder>`, `process`). The UI never builds these URIs by hand: use `buildWorkOnUri` / `buildOpenFolderUri` / `MNCCORE_PROCESS_URI` from `src/lib/urlClassify.ts` and fire through the **`useProtocolLaunch`** hook (clipboard-copy + toast fallback). Register per machine with `python scripts\register_mnccore_protocol.py --apply` (`--revert-to-bat` rolls back). Why: the hardcoded `Start Claude.bat` basename is the security allowlist, and one chokepoint keeps it that way. Detail: `docs/claude-md-detail.md` "Rule 69".
70. **All task/project human messages go through `postActivityEntry()` (`api/lib/activity-entry.ts`) into `activity_entries` (schema v77).** Stored kinds live ONLY in `shared/activityKinds.ts`; `@me ` prefix → `visibility='author'`, SQL-gated at every read; the old comment/update endpoints are PROJECTIONS over `activity_entries`. NEVER write `task_comments`/`task_updates`/`comments`/`project_updates` (dropped, v78), put HUMAN messages in `activity_log` (live telemetry, KEEP), or fork a kind map in a component. Why: one store, one visibility rule. Detail: `docs/claude-md-detail.md` "Rule 70".
71. **Title-click opens the full editor on every My Tasks view (Nick 2026-06-10): the shared row's `onOpenEditor` prop (List, Columns), the sleek row's `onOpen` (Table, Lanes), and a card click on Board.** The TITLE text is its own click target → TaskDetailPanel; body-click elsewhere keeps expand; shift-click/selection-mode/long-press still select. Today deliberately does NOT wire it (its Rule-58 body-click-expand contract is unchanged). Extend via the prop; never fork the row (Rule 68).
72. **Composer-on-top + single Activity tab (Nick 2026-06-11).** Every task expand surface puts the composer FIRST with the newest-first feed beneath; TaskDetailPanel has ONE Activity tab (legacy `?tab=notes|comments` remap to `activity`); descriptions clamp to 3 lines on drawer surfaces; never machine-rewrite human description prose. Why: chat-inverse reading order. Detail: `docs/claude-md-detail.md` "Rule 72".
73. **Attention signals + Slack-style seen model (canon in `docs/design-system.md` "Attention & Notification Canon").** TWO signals, rendered ONLY via `AttentionChip`: gold ✦ NEW (assignment never opened; auto-acked on any detail-open via `useAutoAcknowledge`) and teal ● n NEW (new activity by others, `entity_seen`, `GET /api/seen/unseen`). A nav count must be what it claims, drain on interaction, and click through to its list. Every legacy redirect is `NavigateKeepSearch`, never a plain `<Navigate>` (209 notification links once died that way). Why: honest badges. Detail: `docs/claude-md-detail.md` "Rule 73".
74. **Icon discipline (Nick 2026-06-11: "pixely ≠ premium").** Icons at ≤20px use `strokeWidth={1.5} absoluteStrokeWidth` (lucide's default 2-on-24 scales fuzzy) and contained glyphs (`SquareCheck`, not overflowing `CheckSquare`). Pattern: `ICON_PROPS` const in `src/lib/iconProps.ts`. **Site-wide sweep DONE 2026-06-13** (static + dynamic prop-passed + classifyUrl-util icons via `scripts/icon-props-codemod*.cjs`; `CheckSquare`→`SquareCheck` glyph swap) — 0 ≤20px lucide icons remain without the recipe. Apply it on any NEW icon you add; re-run a codemod to catch drift.
75. **Every fix CLOSES its GitHub issue in the SAME turn, with the commit ref.** `gh issue close <n> --comment "Fixed in <sha> (<one-line what>). Verified present at HEAD <sha>."`. Clearing the in-app `bug_reports` queue does NOT close the GitHub issue. Feature-request or deferred issues stay OPEN with a triage comment. Why: #80–#92 sat false-open and were re-dispatched. Detail: `docs/claude-md-detail.md` "Rule 75".
76. **One signal, one channel on the task row (Nick 2026-07-22, #99).** Left rail = urgency (`urgent` coral, `high` orange); due text = when; `AttentionChip` = what's new; `DoneBox` = done. The priority/progress dot is DELETED; do not reinstate it. Adding a signal? Give it its own channel or replace one. Any colour-only signal needs a text equivalent. Why: the dot multiplexed two axes through one channel. Detail: `docs/claude-md-detail.md` "Rule 76".
77. **Threaded replies are ONE level, and the PARENT owns identity (#98, `activity_entries.parent_id`).** Replies ride `postActivityEntry({ parentId })`; do NOT add a second reply writer. A reply to a reply is a 400, never a silent re-parent. Visibility inherits downward only. Feeds return roots only with a viewer-specific `reply_count`; reply reads use `activityVisibilityGate(request, env, alias, rootAlias)`, never a regex-rewritten clause. Why: one writer keeps mentions/notifications from drifting, and a global counter would leak `@me` replies. Detail: `docs/claude-md-detail.md` "Rule 77".
78. **`ai_requests` is REQUESTER-SCOPED on read and has no privacy model of its own.** `GET /api/ai-requests` filters on `requested_by`; PI/API-key callers see all (the PB listener polls it). Any new read must scope by requester; per-row privacy belongs in `activity_entries`. Why: the table has no `visibility` column, so requester identity is its only privacy. Detail: `docs/claude-md-detail.md` "Rule 78".
79. **Dismiss/hide is a per-THREAD frontend verb that RETAINS every row (schema v102 `hidden_at`/`hidden_by`).** `POST /api/activity/:id/hide { hidden }` is author-or-PI, root-only. ONE predicate, `activityHiddenClause(alias, include)`, must AND into EVERY `activity_entries` read that feeds a timeline/queue/badge/score/search; `scripts/check-activity-reads.mjs` enforces it (exempt with `// activity-hidden-exempt: <reason>`). Never dim a whole card for hidden state; use a dashed spine. Why: hidden is not deleted, and a missed read leaks a dismissed thread. Detail: `docs/claude-md-detail.md` "Rule 79".
80. **The `day` entity — Today-bar conversations, no `days` table.** `entity_id` = `YYYY-MM-DD`, `project_id` ALWAYS NULL, threads default PRIVATE. `dispatchHermes` for a day uses `source_type='daily_thought'` and `context = NULL` (never `"day: <date>"`). The Today-bar composer KEEPS the `@hermes` token in the body. Why: the external listener has never parsed a `day:` context, and stripping the token silently disables Hermes. Detail: `docs/claude-md-detail.md` "Rule 80".
81. **A PB session note can be posted to a TASK, and both note routes share ONE idempotency rule (#103).** `POST /api/tasks/:id/updates` and `POST /api/projects/:slug/updates` read `source_table`/`source_id` through **`sourceKeyFrom()`** (`api/lib/activity-entry.ts`), pair-or-neither; never inline that check. Why: PB writes every note twice by design (immediate + overnight backstop), and a half-set key dedups nothing. Detail: `docs/claude-md-detail.md` "Rule 81".
82. **Hermes's thread transcript uses the THREE-arm visibility gate, not two (#98).** `visibility='team' OR actor_slug=<requester> OR (root.visibility='author' AND root.actor_slug=<requester>)`. Why: a two-arm gate dropped Hermes's own prior answers, so follow-ups lost their multi-turn memory. Tests in `api/lib/activity-entry.test.ts` run the real query. Detail: `docs/claude-md-detail.md` "Rule 82".
83. **Meeting origin is TWO questions.** *Did this come from a meeting?* = `source`/`meeting_id`; *Can I link to it?* = `meeting_ref` (canonical `meetings.id`). Both live in `src/lib/meetingOrigin.ts`; render through `<MeetingOriginTag>`. ⚠️ `tasks.meeting_id` and `meetings.id` are DIFFERENT ID SPACES; `api/lib/meeting-ref.ts` bridges them. NEVER let `meetingHrefFor` fall back to `meeting_id`, and NEVER rewrite `meeting_id` on the wire. Why: a plain join matched 8 of 152 rows and five surfaces rendered nothing. Retiring the bridge = #109. Detail: `docs/claude-md-detail.md` "Rule 83".


84. **The `meeting` entity — conversations on a meeting page (#124).** Fifth `activity_entries` entity type; `GET/POST /api/meetings/:id/activity`; `project_id` ALWAYS NULL; threads default TEAM; the meeting's facts ride in the PROMPT (`buildMeetingContextBlock`). Tasks match on `meeting_id IN (m.id, m.source_id)` (Rule 83). Adding a SIXTH entity type: `api/lib/activity-entry.ts` has FOUR ladders that branch on `entityType`; extend all four, or land #125. Why: #124 extended three and shipped a dead notification link. Detail: `docs/claude-md-detail.md` "Rule 84".
85. **Hermes answers render as MARKDOWN; human comments stay plain.** `HermesResponse` renders prose through `MarkdownView` (dependency-free, no `dangerouslySetInnerHTML`, plain runs still go to `LinkifiedText` so URL/portal chips are unchanged). Hermes emits numbered lists, `**bold**` and fenced code unprompted, and the feed used to show the raw markers. One caller (`activityRender.tsx`), so this covers every Hermes surface — task, project, day, meeting, artifact comments. Do NOT extend it to human comment bodies: people type asterisks without meaning bold. The fenced ```hermes tail still parses out to citation pills before rendering.
86. **A milestone is a task with `kind='milestone'` — the same row, a different rendering (#131/#132, schema-v109).** Vocabulary in `shared/taskKinds.ts` (`isMilestone`), guarded at the API routes. The shared `TaskRow` takes `variant="milestone"` (a prop, never a fork; no click-to-complete on the row, `MilestoneDrawer` owns Mark complete). Placement = `interleaveMilestones()` in `taskGrouping.ts`; milestones never enter `planned`. The empty `milestones` table is NOT this feature. Why: one row type keeps sync and sorting single-path. Detail: `docs/claude-md-detail.md` "Rule 86".
87. **`project_publications` is a project's PUBLISHED OUTPUT; `paper_project_links` is its READING list (#129).** Two tables, two questions; do not merge them. Citation facts live ONLY in `publications`. ⚠️ `paper_project_links` stores the TYPED project id in `project_slug`; read it with `projectRefToCanonical` + `id OR slug`, and join both `research_digest` and `publications` on `paper_id`. Why: the Literature modal's links never rendered before this was fixed. Detail: `docs/claude-md-detail.md` "Rule 87".

88. **The digest's three prose fields each mean what they are named (#136, schema-v112).** `summary` = TLDR, `significance` = Why This Matters, `abstract` = the REAL PubMed abstract (behind "Show abstract"). ⚠️ `POST /api/digest` is an `ON CONFLICT(id) DO UPDATE` with three column classes, each pinned by `api/routes/digest.upsert.test.ts`: reader state never appears, first-sight facts (`digest_date`) keep the stored value, paper facts take `COALESCE(excluded.x, stored)`. Absent must never mean cleared. Do NOT change the PB summarizer prompt over "Why This Matters" (80 of 80 carry one); group `Research/Digest.md` by `digest_date` before quoting a rate. Why: `INSERT OR REPLACE` reset saved papers, and a bare `excluded.summary` erased 74 stored TLDRs. Detail: `docs/claude-md-detail.md` "Rule 88".

89. **A byline renders through `AuthorColumn`, and the blank face is the signal (#133).** `resolveBylineAuthors()` (`src/lib/authorAvatars.ts`) returns every author; lab members get their photo + `/team/:slug` link, everyone else a flat neutral silhouette. Do NOT substitute `Avatar`'s generated portrait. Match on `authorName` substring; do not consult `authorSlugs`. Why: the silhouette is what makes a real photo read as a signal. Detail: `docs/claude-md-detail.md` "Rule 89".

90. **Visibility is project membership only, for everyone, the PI included (#145, schema-v120 + v121, 2026-10-08/09).** A request's D1 handle is viewer-bound (`api/lib/viewer-db.ts`); `api/lib/table-scope.ts` decides which project rows a viewer may read from `project_members`. Nobody sees all projects by default; Nick's "Show all projects (admin)" switch is the one override, off on load. v121 triggers refuse a project slug that spells a project id (`proj_*` or any existing id), because the read rule treats a visible project's id and slug both as references. Never add a query that reads project-keyed rows through an unscoped handle.

91. **Reply threads are summarized server-side (`replySummaryColumns()` in `api/lib/activity-entry.ts`, 2026-10-09).** Feed rows carry `reply_count`, `last_reply_at` and `last_reply_actor`; "last" orders by `COALESCE(answered_at, created_at)` so a Hermes reply sorts by when it landed, and Hermes's pending placeholder (body starting `HERMES_PENDING_PREFIX`) is excluded. Never fetch replies per row to count them (the N+1 the review removed).

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
| Mobile swipe on TaskDetailPanel | Implemented via framer-motion `drag="x"`. `touch-action: pan-y` lets vertical scroll through. framer's own listener is off (`dragListener={false}`); `startSwipe` starts the drag through `useDragControls` only for a touch/pen pointer that lands 32px or more from the viewport's left edge (iOS Safari edge-swipe-back owns the edge; the old `edgeGuardRef` read at render never blocked it). The panel portals itself to `<body>`, and on a phone it pushes one history entry so Back closes it. Dismiss: offset > 30% OR velocity > 500px/s. Don't revert to raw touch handlers. |
| Virtualizer skeleton rows | Must match TableContainer + header + rows at `var(--row-height)` pixel-for-pixel to avoid CLS. |
| FAB positioning | Use `--fab-stack-{1,2,3}` CSS vars. NEVER `max(24px, 72px)`. Mobile override via `<768px` media query in index.css. |
| Portal renders an empty `<div id="root">` — no console error, no `/api/*` request | A chunk URL is cached as HTML (Pages answers a missing asset with the SPA fallback and `/assets/*` is immutable). Fixed at `66ebd287` (`functions/assets/[[path]].ts` → `404 no-store`; `index.html` self-heals). Do NOT revert the deploy. Detail: `docs/claude-md-detail.md` "Known Gotchas: empty div#root". |
| A `position: fixed` panel clipped inside a dashboard widget | `DashboardGrid` items carry a CSS transform, which becomes the containing block. Render the panel through `createPortal(..., document.body)`. `TaskDetailPanel` does this itself (since 2026-10-14; virtualizer rows carry a translateY too), so its callers mount it anywhere. |
| react-grid-layout v2.x is a breaking rewrite | Stay on `1.5.3`. `DashboardGrid.tsx` depends on `WidthProvider(Responsive)` HOC pattern. |
| Dark mode localStorage key | `mn-ccore-theme`, NOT `theme`. Playwright tests must set the right key. |
| `@formkit/auto-animate` import drift | If you see `Cannot find module 'X'`, grep the imports vs package.json before assuming it's installed. |
| Project status legacy values | `src/data/projects.ts` static fallbacks use `'Active'`. `normalizeProjectStatus()` in `lib/taskConstants.ts` folds them. Don't delete the helper. |
| Grant status taxonomy | 7 values in `useGrantTimeline.ts:GRANT_STATUS_OPTIONS`. `Active` is legacy. |
| WebSocket stub | `tests/setup/websocket-stub.ts` kept for local tests (Miniflare can't run the DO). |
| Folder links silent on Windows | `mnccore://` needs per-machine URL-handler registration (Rule 69); until then the browser no-ops, so every surface copies the raw path + toasts. Don't revert to direct href. Detail: `docs/claude-md-detail.md` "Known Gotchas: folder links silent on Windows". |
| PresenceAvatars visible when alone | By design. Peer list excludes self. Verify: open same ProjectDetail in two browsers as two auth identities. |
| A timeline gap rendered at a non-linear height | **A gap's height MUST stay `minToPx(minutes)`.** Six sites convert pointer pixels to minutes through `pxToMin`; any other height saves a dropped task at the WRONG TIME. The guard is structural: `PX_PER_MIN` is module-private (`timelineModel.ts`). Shortening gaps needs a per-gap scale through all six sites (PB #1595). Detail: `docs/claude-md-detail.md` "Known Gotchas: timeline gap height". |
| Styled tooltip clipped in a row/overflow container | Render through **`TooltipLayer`** (`src/components/TooltipLayer.tsx`): give an element a **`data-tip`** attribute (keep `aria-label`). NEVER reintroduce a CSS `.tip::after` tooltip. Put `data-tip` on the TEXT, never a layout wrapper (the attribute's element IS the hover zone; make a `flex:1` wrapper `display:flex` so the text shrink-wraps). Detail: `docs/claude-md-detail.md` "Known Gotchas: styled tooltip". |

## Testing

**Run:** `bash scripts/run-tests.sh all` (quick/sync/all modes)

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
- Projects: `status`, `category` — can never be null

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
