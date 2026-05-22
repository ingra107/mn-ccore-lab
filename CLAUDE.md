# MN-CCORE Lab Hub -- Claude Operating Guide

## First read on every session — in this order

Before writing any code or answering any question about this project, read:

1. **`SESSION-HANDOFF.md`** — current gate state, what-to-do-first, git HEADs, gotchas. One-page. Always. If the session starts in AUTO MODE or AUDIT MODE, that file's top section is the prescriptive ticket queue. Execute it in order without re-triaging.
2. **`PROJECT.md`** — frontmatter has canonical `next_action` + `primary_folder`.
3. **`REFERENCE.md`** — API endpoints + D1 table list when you need one.
4. **`CHANGELOG.md`** — top entry = most recent phase; jump here when asked "what changed."
5. **`docs/OBSERVABILITY.md`** — `/api/health` runbook.

Historical material in `docs/archived/` — safe to ignore unless explicitly spelunking history. Detailed design reference in `docs/design-system.md`.

## Vision

The MN-CCORE Lab Hub is the **team's operating surface** — where research gets managed, meetings get run, and information flows between Nick's CLI system and every team member's browser.

## Quick Reference

| Thing | Value |
|-------|-------|
| Live site | mn-ccore-lab.pages.dev (LIVE — CF Access gated via @umn.edu policy on `/portal/*`) |
| Repo | github.com/ingra107/mn-ccore-lab (720+ commits) |
| Today landing | `/portal/dashboard` → `src/pages/portal/TodayPage.tsx` |
| Lab Overview | `/portal/overview` → `src/pages/Dashboard.tsx` |
| MyTasks | `/portal/my-tasks` → `src/pages/portal/UnifiedMyTasks.tsx` (3 views, shared toolbar) |
| Deploy | **Manual only** (pushing to `origin/main` does NOT deploy). From repo root: `npm run deploy:pages:gated` (= `npm run build` + `wrangler pages deploy dist --project-name mn-ccore-lab --branch main`). Auth: load `CLOUDFLARE_API_TOKEN` from PB `scripts/scheduled/secrets.ps1` — do NOT `wrangler login`. |
| Stack | React 19 + Vite 8 + Tailwind v4 + Framer Motion 12 + TypeScript + Hono v4.12 |
| Testing | Playwright 1.59 (568+ tests, 4 suites) + Vitest 4.1 (component, browser mode) |
| Data | TanStack Query v5 + Cloudflare D1 (75 tables, sqlite_master excl. internal; ~225 endpoints via Hono) + Recharts |
| D1 database (prod) | `b8453e9b-7c5f-4029-b07d-dd89c05d00cf` (ENAM), binding: `DB`. Schema v68. |
| D1 database (test) | `a30fe84d-0891-4035-9358-f7813b5f5807` (mnccore-lab-test), binding: `DB_TEST` |
| Schema drift CI | `.github/workflows/schema-drift.yml` — nightly 03 CT. Guardrail against silent prod migrations. |
| Deploy mode | **Manual via `wrangler pages deploy` ONLY — no auto-deploy** (no Pages CI workflow exists; verified 2026-05-22 — pushed commits did NOT trigger a deployment). `pages.dev` = production (serves frontend + `/api/*`); `wrangler deploy` → a SEPARATE, unused `workers.dev`. Verify the live commit: `wrangler pages deployment list --project-name mn-ccore-lab` (Source col). |
| PB project | `Projects/mn-ccore-lab-hub/` -- PROJECT.md, living plan, future ideas |

## Design System

### Design Ethos: Operational, Not Editorial (Decision: 2026-04-01)

The Hub is a **research operations center**, not a magazine. Full rationale: `Context/Decisions/2026-04-01_hub-design-ethos-pivot.md` (PB repo). Detailed design reference in `docs/design-system.md`.

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

**Data pages** — columnar table rules apply (ColumnHeader + TableContainer, inline editing, density toggle, row separators):
- Tasks, MyTasks, Projects, Manuscripts, Deadlines, Grants, Ideas, Decisions, Settings team directory

**Dashboard pages** — exempt from columnar table rules (charts + metric cards + panels):
- Dashboard, Analytics, PI Analytics, Personal, Meetings (split-panel), Calendar, Home (public)

A page is a "data page" if its primary content is a scrollable record list. Never mix.

### Shared Utilities
- `src/lib/dateUtils.ts` — all date formatting
- `src/data/team.ts:getPersonInfo()` — team member lookup
- `formatBrandName()` from `BrandName.tsx` — any text that might contain "MNCCORE"

## Architecture

```
brain.db ←LWW→ D1 (mnccore-lab) ←API→ React + TanStack Query
   ↑                    ↑
Nick's CLI         Team's Hub
(single user)   (20+ team members)
```

(Airtable retired 2026-04-21. `entity_aliases.alias_kind='airtable_legacy'` rows resolve forever for historical lookups.)

- **API:** Cloudflare Worker, 225+ route registrations via Hono v4.12 (`api/index.ts`). Middleware chain: OPTIONS preflight → test-mode DB swap → API-key auth → authed-user resolve → PI gate for `/api/pb/*` GETs → REQUIRE_AUTH gate for POST/PUT → version-bump-on-success. Do NOT add routes with raw `url.pathname === ...` comparisons — use `app.get/post('/api/...', handler)`.
- **Auth:** CF Access gates `mn-ccore-lab.pages.dev/portal/*` (single destination). JWT via JWKS in `api/jwt-verify.ts`. `REQUIRE_AUTH=1` + `VITE_REQUIRE_AUTH=1` both active. `/api/*` is NOT gated by CF Access (auth via X-API-Key + `REQUIRE_AUTH` + JWT server-side). `getAuthUser()` and `isPiRequest()` are `async` — callers must `await`.
- **Email:** Resend (`api/lib/email.ts`) + daily digest (`api/routes/digest-email.ts`). Preview: `/api/digest-preview?member=nick`
- **Sync:** `scripts/db/sync/` module in PB, invoked via `python scripts/db/sync.py {pull|push|sync|status}`. Scheduled + /process-triggered.

### Sync Architecture

brain.db is the **primary store**. D1 (Hub) is the primary UI + write target. Sync model: field-level last-write-wins (LWW) with timestamps. Conflicts logged to `sync_log`.

**Key rules:**
- Brain.db tasks use canonical `task_{ulid}` IDs. Hub-created tasks use typed ULIDs (e.g., `task_01KP...`). Both reachable via `entity_aliases` (hub_slug alias).
- `notes` (brain.db) is private. `description` (D1) is team-visible. They do NOT sync bidirectionally.
- Task deletion uses soft-delete (`deleted_at` column). `GET /api/tasks?include_deleted=1` surfaces them for the sync module.
- `completed` field is bidirectional — Hub can reopen tasks.
- Hub `task_comments` mirror into brain.db `d1_task_comments` (read-only).
- Hub-originated projects flow into brain.db — `category` (MNCCORE/CLIF/Peripheral Brain) maps onto brain.db `domain`.

**Implementation:** `scripts/db/sync/` (drivers/hub.py + boundary + payload). Decision: `Context/Decisions/2026-04-21-sync-extraction-COMPLETE.md` in PB.

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
- **Backend:** `hub_ai_listener.py` on home laptop polls `GET /api/ai-requests?status=pending` every 60s
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
29. **Brand primitives live in `src/components/` — use them, don't reinvent.** `HeartbeatLine` / `HeartbeatDivider` (ECG motif), `HermesMark` (AI assistant), `CategoryIcon` (lungs/flask/heartbeat/cap), `EmptyStateArt` (8 illustrations), `PhaseReleaseBanner`, `RequireAuth`. Never use lucide `<Sparkles />` for Hermes or a 6px dot for categories.
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
51. **Search covers 14 entity types — extend on future entity adds.** `api/routes/search.ts` queries 14 tables in parallel. When adding a new entity: add SELECT, push block, `TYPE_PRIORITY` entry, and `typeConfig` in `src/pages/portal/SearchPage.tsx`.
52. **One shared PartySocket per (room, party) — use `realtimeBus`.** `src/lib/realtimeBus.ts` module-singleton. `useRealtimeSync`, `usePresence`, `useTyping`, `useIntentBroadcast` all subscribe through the bus. Don't `new PartySocket(...)` directly — use `getRealtimeBus().subscribe(listener)` + `.send(payload)`.
53. **DD-1 mode toggle + DD-2 saved views.** Saved views (`useSavedViews(page)`, LS key `mnccore.savedViews.v1.<page>`, 25-view cap) wired into `UnifiedMyTasks` via `<SavedViewsMenu>`. URL state round-trips through `?filter=<quickFilter>&view=<columns|lanes|list>`.
54. **T-29 Manuscripts "Needs your attention".** `GET /api/manuscripts/attention?review_days=&stale_days=`. Thresholds from `useLabPrefs()` (LS key `mnccore.labprefs.v1`). `NeedsAttentionDashboard` = 3 collapsible subgroups + amber count pill. Thresholds surfaced in Settings → Lab tab.
55. **Mobile compose pattern.** ProjectDetail `<768px`: tap trigger → `position: fixed` bottom overlay via `useComposeSheet(open, onClose)`. TaskDetailPanel: `position: sticky; bottom: 0` + `env(safe-area-inset-bottom)`. `useIsMobile()` is the canonical breakpoint check.
56. **Row-level swipe on TaskGridRow — inside the virtualizer.** `useSwipeAction({onSwipeLeft, onSwipeRight})`. Wire the `motion.div` INSIDE the virtualizer's translateY outer wrapper. The hook disables drag on desktop (`window.innerWidth >= 768`). Right-swipe = complete (with undo); left-swipe = long-press context menu.
57. **Today landing model.** `/portal/dashboard` = TodayPage (operating-day surface). `/portal/overview` = Dashboard.tsx (Lab Overview, weekly-planning card grid). Don't reintroduce a card-grid Dashboard at `/portal/dashboard`. Sidebar label: "Today" / "Lab Overview". URL alias `/dashboard` redirects to `/portal/dashboard`.
58. **Three click semantics on Today/MyTasks rows: NEVER conflate.** (a) Clicking the body = expands TaskDetailDrawer inline; does NOT promote. (b) Dragging `⋮⋮` handle = plans the task. (c) Explicit `▶ Work on this now` = promotes to Right Now. Three independent affordances.
59. **Three accent colors with assigned meaning on Today/MyTasks surfaces.** `#c9a84c` gold = user-driven action / planned / Hermes / Right Now glow. `#5cbcb4` teal = meetings / mentees / system / navigation. `#f0737e` coral = overdue / stalled / warnings. `#6ee89a` green = done / healthy sync. Don't repurpose.
60. **MyTasks view picker far-left of filter row, persisted in `localStorage.mt_view`.** Three views share ONE toolbar. List view uses right-side drawer (cursor-stable j/k nav); Columns and Lanes use inline expand. Source: `src/pages/portal/UnifiedMyTasks.tsx`.
61. **Right Now is a promoted slot, not a fixed task.** Subtle gold glow only here (`box-shadow: 0 0 24px rgba(201,168,76,0.06)`); nothing else gets a glow. Mark-done unplans, sinks to bottom with strikethrough, auto-promotes next planned task. Source: `useTodayState` in `src/pages/portal/TodayPage.tsx`.
62. **Group sort within a TaskGroup: planned → active → done.** Don't re-sort by priority/due_date within a group — that fights the operating-day mental model. Source: `TaskGroup` in `TodayPage.tsx` (also applies to UnifiedMyTasks Lanes view).
63. **`tasks.group_override` is the explicit Hub-authored bucket choice; `getGroupForTask()` checks it FIRST.** Schema v50. Groups: `'deep' | 'priorities' | 'quick' | 'pb' | 'etl' | NULL`. Syncs to brain.db via LWW. `generate_today_markdown.py::_GROUP_OVERRIDE_TO_SECTION` honors it. API guard: `VALID_GROUP_OVERRIDES` rejects non-canonical values with 400. Decision: `Context/Decisions/2026-04-25-tasks-group-override.md`.
64. **Personal calendar feeds are iCal pull, not OAuth.** Schema v52. Users paste private iCal URLs into `/portal/profile` or `/portal/settings#integrations`. Hub polls lazily, parses via `api/lib/ics-parser.ts`, upserts to `user_calendar_events`. UI: `src/components/CalendarFeedsPanel.tsx` (shared TanStack cache key `calendar-feeds`). Tests: 24 vitest unit tests at `api/lib/ics-parser.test.ts`; run via `npm run test:api`.
65. **CF Access auth uses Generic OIDC `Google UMN`, not the preset Google IdP.** `Auth URL = https://accounts.google.com/o/oauth2/auth?prompt=select_account&hd=umn.edu`. Don't revert to the preset Google IdP — it loses the account chooser.
66. **`ensureTeamMember()` runs on every authed request — auto-create + claim.** Schema v53. Four-branch logic: (1) direct email match → no-op; (2) slug match via LUT → CLAIM existing row, backfill email+photo; (3) slug match via raw email-prefix → same; (4) no match → INSERT auto_created=1 row (PENDING REVIEW badge). `PUT /api/team/:slug` is owner-or-PI gated; role + member_type are PI-only.
67. **`/portal/profile` is the self-service profile + integrations entry.** Inline-on-blur edit for self-edit fields. Embeds `<CalendarFeedsPanel />`. Any save invalidates both `['team']` and `['team-raw']`.

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
| Folder links silent on Windows | `mnccore://open/<path>` has no Windows handler. `KeyLinksEditor` + `LinkifiedText` copy raw path to clipboard + show toast. Don't revert to direct href. |
| PresenceAvatars visible when alone | By design. Peer list excludes self. Verify: open same ProjectDetail in two browsers as two auth identities. |

## Testing

**Run:** `bash scripts/run-tests.sh all` (quick/ui/sync/all modes)

**Config variants:**

| Config | Target | Use case |
|--------|--------|----------|
| `playwright.config.prod.ts` | live prod | Inspection + post-deploy regression |
| `playwright.config.dogfood.ts` | prod + thorough | Visual audit default |
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

**Cross-system handoff:** Builder writes change-specs to `C:/Users/ingra107/Peripheral-Brain/data/shared/hub-schema-changes.jsonl`. On next Hub session, dispatch `hub-schema-sync` to apply pending specs.

**Depth-2 limit:** Hub specialists cannot dispatch other agents directly — return "next: dispatch X" to COO.

Full architecture: `C:/Users/ingra107/Peripheral-Brain/Context/Decisions/2026-05-02-context-diet-and-managers.md`.

## Session Notes
<!-- COO writes session updates here. Synced by SessionEnd hook or Start Day backup. -->

## Pending Sync
<!-- When this session ends, the SessionEnd hook syncs this to Peripheral Brain. -->
