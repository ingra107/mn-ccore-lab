# MN-CCORE Lab Hub -- Claude Operating Guide

## 🚨 First read on every session — in this order

Before writing any code or answering any question about this project, read:

1. **`SESSION-HANDOFF.md`** — current gate state, what-to-do-first, git HEADs, gotchas. One-page. Always.
2. **`PROJECT.md`** — frontmatter has canonical `next_action` + `primary_folder`.
3. **`LAUNCH-CHECKLIST.md`** — section 0 is the blocker for team launch (flip auth flags). Read if Nick mentions team / launch / go-live.
4. **`REFERENCE.md`** — API endpoints + D1 table list when you need one.
5. **`CHANGELOG.md`** — top entry = most recent phase; jump here when asked "what changed."
6. **`docs/OBSERVABILITY.md`** — `/api/health` runbook.

These six plus this file are authoritative. Historical material lives
in `docs/archived/` (and PB-side `Projects/mn-ccore-lab-hub/_archived/`) —
safe to ignore unless explicitly spelunking history.

## Current state (2026-04-19)

- **Phase 35 shipped.** Full WCAG 2.1 AA + Hub↔brain.db sync parity + consultant-review launch blockers closed + `/api/health` observability.
- **Quality gate: 🟢 GREEN.** Preflight 97 pass / 0 fail. Deep-audit 14/14 suites clean. Axe clean across 29 pages × 2 color schemes (58 scans).
- **Not yet live for the team.** Nick is the only active user. Going live requires flipping `REQUIRE_AUTH` + `VITE_REQUIRE_AUTH` + `TEST_MODE_KEY` — steps in `LAUNCH-CHECKLIST.md` section 0.
- **Current HEAD:** `bd2a7cc` on `main`, pushed.

## Vision

The MN-CCORE Lab Hub is the **team's operating surface** -- where research gets managed, meetings get run, and information flows between Nick's CLI system and every team member's browser.

## Quick Reference

| Thing | Value |
|-------|-------|
| Live site | mn-ccore-lab.pages.dev (PI-only; team not yet onboarded) |
| Repo | github.com/ingra107/mn-ccore-lab (650+ commits) |
| Current deploy | `eb361fd` (2026-04-19) |
| Quality gate | 🟢 GREEN — 97 preflight pass, 14/14 deep-audit clean, 0 axe findings |
| Deploy | `cd /c/Users/ingra/mn-ccore-lab && npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab` |
| Stack | React 19 + Vite 8 + Tailwind v4 + Framer Motion 12 + TypeScript |
| Testing | Playwright 1.59 (E2E, 214+ inspection tests) + Vitest 4.1 (component, browser mode) |
| Data | TanStack Query v5 + Cloudflare D1 (61 tables, 190+ endpoints) + Recharts -- ALL LIVE |
| D1 database (prod) | `b8453e9b-7c5f-4029-b07d-dd89c05d00cf` (ENAM), binding: `DB` |
| D1 database (test) | `a30fe84d-0891-4035-9358-f7813b5f5807` (mnccore-lab-test), binding: `DB_TEST` |
| D1 tables | 61 (live count via `/api/health`; +d1_task_comments in Phase 35) |
| Deploy mode | Manual via wrangler -- NO auto-deploy |
| PB project | `Projects/mn-ccore-lab-hub/` -- PROJECT.md, living plan, future ideas |
| Reference | `REFERENCE.md` in this repo -- D1 tables, API endpoints, key files, feature list |

## Design System

### Design Ethos: Operational, Not Editorial (Decision: 2026-04-01)

The Hub is a **research operations center**, not a magazine. Every design choice prioritizes usability and data clarity over decoration. Read `Context/Decisions/2026-04-01_hub-design-ethos-pivot.md` (PB repo) for full rationale.

**Core principles (NEVER violate):**
1. **Dark-first design.** Dark bg is deep neutral (#0b1017), NOT blue-tinted. Text is #e2e8f0 (not pure white — less glare). Light mode secondary.
2. **Columnar tables, not card stacks.** Data pages use fixed-column tables with headers (Title|Assignee|Due|Status|Priority). Cards are for dashboards only. Fixed row height for vertical scanning.
3. **Inline editability with visible affordance.** Every editable field shows "▾" dropdown indicator. Click cell → dropdown/picker by type. Auto-save on blur. No explicit save button. Dropdowns with 5+ options show typeahead filter input + arrow key navigation (Airtable pattern). (Research: Pattern 4)
4. **Typography: 3-tier weight, 5-tier opacity.** Weights: `--weight-body` (400, reading), `--weight-ui` (500, interactive/nav/badges), `--weight-heading` (600, titles/emphasis), `--weight-metric` (700, dashboard numbers only). Opacity: `--ink-primary` (1.0), `--ink-muted` (0.7), `--ink-label` (0.55), `--ink-hint` (0.4), `--ink-disabled` (0.3). NEVER opacity below 0.3 on readable dark-mode text.
5. **One accent color per view.** Teal for interactive. Everything else neutral. Max 2 non-neutral colors per view.
6. **More info, more readable.** Density ≠ clutter. LabSync puts 20 sidebar items that are MORE readable than our 17. The secret: font-weight 400, grouped sections with rhythm, consistent icon opacity.
7. **Zero monospace in content.** JetBrains Mono for `<kbd>` only. ALL other text is DM Sans.
8. **Optimistic UI + undo.** State changes are instant. Undo toast for 5 seconds. Never show spinners for actions. (Research: Pattern 9)
9. **Click targets must be precise.** Clicking a task row opens detail panel. ONLY clicking the status circle changes status. Hover actions hidden until hover (pointer-events:none at opacity:0).

### Fonts
- **Portal titles:** DM Sans (clean, operational)
- **Public website titles:** Fraunces (editorial, brand voice)
- **Body text:** DM Sans everywhere
- **Code only:** JetBrains Mono
- **CSS:** `--font-sans` and `--font-body` both resolve to DM Sans. `--font-display` = Fraunces (public pages only).

### Palette (Phase 35 hex-pinned, 2026-04-18 axe AA)

All text-carrying color tokens are **literal sRGB hex**, not OKLCH.
axe-core 4.11's OKLCH parser resolves to darker sRGB than Chromium renders,
which failed contrast even when the visual rendering was fine. Hex stays.
OKLCH remains only on pure-bg tokens (`--cream`, `--ice`, `--gold-light`).

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

- `--teal-solid` + `--maroon-solid` are for solid button/badge bg where
  white text sits on top (6-7:1 with #fff). Separate token from `--teal`
  because a button bg has opposite contrast needs than same-color text.
- Sidebar-bg: `color-mix(in oklch, var(--cream), black 12%)` — pulse bg:
  `var(--ink)` (inverts between modes).
- Category dots: 6px, 0.7 opacity — maroon=CLIF, teal=Lab, gold=Mesfin

### Opacity policy (dark mode AA on near-black bg)

Inline `opacity: 0.30-0.55` on slate/teal/maroon/gold text fails AA with
our hex-pinned colors. Codemod run 2026-04-18 bumped 640+ sites to 0.85.
Use 0.85 as the floor for secondary text; reserve 0.55-0.70 for decorative
(borders, inactive dots). Never go below 0.30 on readable text.

### On gold buttons (both themes)

Gold bg is identical across themes. `color: var(--ink)` flips bright/dark
with theme, so use a fixed literal dark color like `#1a1a1a` for text on
gold backgrounds.

### Table Pattern (apply to ALL data pages)
- Shared `ColumnHeader` + `TableContainer` components (`src/components/table/`)
- Column headers: uppercase, 11px, 0.55 opacity, 0.06em letter-spacing — shared across Tasks, Projects, Manuscripts, Deadlines
- Column resize: drag handles on right edge, min widths, persisted via `useTableConfig`
- Column reorder: drag headers horizontally, persisted to localStorage
- Cell focus: 2px teal outline, Tab/Shift+Tab between editable cells
- Multi-sort: Shift+Click for secondary sort, ①② rank indicators
- Frozen columns: checkbox + title sticky at ≤1024px viewport
- Table config persistence: `useTableConfig(id)` hook saves sort/widths/order to localStorage, Reset View button
- Stage group headers: quiet uppercase labels with extending rule line
- Row hover: neutral `rgba(255,255,255,0.02)` (dark), barely-there luminance shift
- Row separators: use `var(--row-separator)` token (dark: `rgba(255,255,255,0.03)`, light: `rgba(0,0,0,0.04)`) — structure felt not seen
- Inline controls: status/priority dropdowns editable in-row
- Hover-only badges: age/project badges hidden until row hover (`.hover-badge` CSS class)
- Ghost-style action buttons (outline, not filled) + Pin-to-Focus button on MyTasks

### Data-Pages vs Dashboard-Pages Taxonomy (GC-6)

**Data pages — columnar table rules apply (ColumnHeader + TableContainer, inline editing, density toggle, row separators):**
- Tasks, MyTasks, Projects, Manuscripts, Deadlines, Grants, Ideas, Decisions, Settings team directory

**Dashboard pages — exempt from columnar table rules (charts + metric cards + panels, no forced table layout):**
- Dashboard, Analytics, PI Analytics, Personal, Meetings (split-panel), Calendar, Home (public)

This taxonomy closes ambiguity: a page is a "data page" if its primary content is a scrollable record list. Dashboard pages may contain embedded tables but are not required to follow the full table pattern.

### Animation Timing (5 durations + 2 easings)
- `--duration-instant: 0ms` — state toggles, checkbox
- `--duration-fast: 100ms` — tooltips, button press
- `--duration-normal: 150ms` — hover, row highlight (alias: `--transition-fast`)
- `--duration-moderate: 200ms` — dropdowns, panels (alias: `--transition-panel`)
- `--duration-slow: 300ms` — sidebar, modals, page transitions
- `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` — entering elements
- `--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)` — moving elements
- Card hover: -1px lift. Respects `prefers-reduced-motion` (all durations → 0ms).

### Sidebar
- **3-plane depth**: sidebar DARKER than content via `--sidebar-bg: color-mix(in oklch, var(--cream), black 12%)` in both light and dark mode. The sidebar must always recede behind content, matching Linear. Phase 31.5 briefly tried an elevated (lighter) sidebar (`#ebebeb` light / `white 10%` dark); reverted 2026-04-12 — darker-than-content is the canonical pattern.
- Font-weight 400 for nav items, 500 for active only
- Active: `--teal-subtle` bg fill (desaturated), full teal on text/icon. No left border.
- Inactive: --slate color, icon opacity 0.7.
- Borders: `--border-subtle` (neutral), NOT `--border-light` (gold)
- Section labels: 10px uppercase, opacity 0.5. Divider lines between groups.
- Row height: py-2 (compact). Font: 12px. Group gap: 4px. Section divider margin: 6px/8px.
- Logo: mark uses CSS filter for dark mode (`invert(1) brightness(1.5)`), text logo swaps to dark variant.

### Borders & Spacing
- `--border-light` (gold tint) = ONLY for filter toggle inactive states and intentional brand accents. `--border-subtle/default/strong` (neutral, 3 tiers) = ALL structural borders. 222 structural borders migrated in Phase 30.
- Spacing: `--sp-xs` (4) / `--sp-sm` (8) / `--sp-md` (12) / `--sp-lg` (16) / `--sp-xl` (24) / `--sp-2xl` (32). Strict 8px grid.
- Radius: `--radius-sm` (4) / `--radius-md` (6) / `--radius-lg` (8) / `--radius-xl` (12) / `--radius-2xl` (16) / `--radius-full` (9999) / `--radius-circle` (50%). All borderRadius MUST use tokens.
- Typography scale: `--text-micro` (10, was 9 — eliminated all 9px text) / `--text-caption` (10) / `--text-label` (11) / `--text-small` (12) / `--text-body` (13) / `--text-base` (14) / `--text-md` (16) / `--text-lg` (18) / `--text-xl` (24) / `--text-2xl` (32).

### Z-Index Hierarchy (Phase 31)
- `--z-base` (1) / `--z-sticky` (10) / `--z-dropdown` (50) / `--z-sidebar` (100) / `--z-modal-backdrop` (400) / `--z-modal` (500) / `--z-toast` (9999). All zIndex MUST use tokens.

### Semantic Hover/Overlay Tokens (Phase 31)
- Accent hovers: `--gold-hover/active/emphasis`, `--teal-hover/active/emphasis`, `--maroon-hover/emphasis`, `--orange-hover`, `--green-hover`
- Neutral overlays: `--hover-subtle/light/medium`, `--overlay-light/medium/heavy` (with dark mode overrides — light uses black-based, dark uses white-based for hovers)
- Standardized opacity tiers: 0.03 / 0.06 / 0.10 / 0.15 / 0.40 / 0.70. Snap to nearest tier.

### Surface Elevation (Linear pattern)
- `--surface-0` (page bg) / `--surface-1` 3% (panels) / `--surface-2` 6% (cards, sidebar, dropdowns) / `--surface-3` 10% (hover, active)
- Dark mode: luminance stepping via `rgba(255,255,255, 0.03→0.10)` — 10% total range (Linear-equivalent)
- Light mode: `--page-bg: #f5f5f5` (off-white), cards `#ffffff` with 3-layer box-shadow (Vercel pattern)
- Card borders: `box-shadow: 0 0 0 1px var(--border-subtle)` technique (not CSS border)
- Dark cards: `inset 0 1px 0 rgba(255,255,255,0.03)` top-edge highlight
- Shadows: `--shadow-flat/card/card-hover/elevated/menu`. All boxShadow MUST use tokens.
- `--muted`: derived from `--ink` via `color-mix(in oklch, var(--ink) 70%, transparent)` in dark mode

### Table Density (user-controlled)
- 3 modes via `DensityToggle` component: Compact (36px) / Default (44px) / Relaxed (52px)
- CSS vars: `--row-height`, `--row-padding-y`, `--cell-font-size`. Applied to all 7 data table pages.
- Persisted per-user in localStorage. Numeric columns right-aligned, `tabular-nums` on dates.

### UX Research Patterns (from task-management-ux-patterns-research.md)

Must-reference before building ANY new feature. Key implementable patterns:
- **Pattern 4 (Inline Editing):** Click any field → edit mode by type (dropdown/picker/text). Auto-save on blur.
- **Pattern 7 (List View):** Fixed row height. Column headers. Grouping with collapsible headers. Density toggle.
- **Pattern 9 (Optimistic UI):** Instant state changes. Undo toast for 5 seconds. Never show spinners.
- **Pattern 10 (Micro-interactions):** Completion animation. Status color transitions. Progressive disclosure.
- **Pattern 3 (Three depth levels):** Peek (Space) → Side Panel (click) → Full Page (Enter). Decision tree in research doc.

Reference: `Projects/mn-ccore-lab-hub/task-management-ux-patterns-research.md` (PB repo)
Competitive reference: LabSync (JC Rojas) — friend, learn from, never compete.

### Shared Utilities
- `src/lib/dateUtils.ts` (formatters), `src/data/team.ts:getPersonInfo()`, `formatBrandName()` from BrandName.tsx

## Architecture

```
Airtable ←CRDT→ brain.db ←LWW→ D1 (mnccore-lab) ←API→ React + TanStack Query
                   ↑                    ↑
            Nick's CLI              Team's Hub
          (single user)          (20+ team members)
```

- **Data:** TanStack Query v5 → D1 API (prod), static TS fallback (dev)
- **API:** Cloudflare Worker, 225+ route registrations via Hono v4.12 (`api/index.ts`). Middleware chain: OPTIONS preflight → test-mode DB swap → API-key auth → authed-user resolve → PI gate for `/api/pb/*` GETs → REQUIRE_AUTH gate for POST/PUT → version-bump-on-success (post-handler). Test isolation: `X-Test-Mode: true` header + `DB_TEST` binding + matching `TEST_MODE_KEY` secret swaps `env.DB` to `env.DB_TEST` so tests never touch production. **Pre-Hono contributors:** the old flat if/else router was replaced 2026-04-19. Do not add routes with raw `url.pathname === ...` comparisons — use `app.get/post('/api/...', handler)`.
- **Auth:** Open now. Cloudflare Access for April 21 launch (@umn.edu). JWT signature verification via JWKS lives in `api/jwt-verify.ts` — reads `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` secrets; without them, falls back to decode-only (logs a warning once per cold start) so pre-launch PI-only mode keeps working. `getAuthUser()` and `isPiRequest()` are `async` — any new caller must `await` them.
- **Email:** Resend (`api/lib/email.ts`) + daily digest (`api/routes/digest-email.ts`). Needs `RESEND_API_KEY` Cloudflare secret. Preview: `/api/digest-preview?member=nick`
- **Sync:** `sync_d1_push.py` / `sync_d1_pull.py` in PB, scheduled + /process-triggered

### Sync Architecture (Decision: 2026-04-06)

brain.db is the **sync hub**. Airtable and D1 never talk directly — changes propagate through brain.db.

**Sync model:** Field-level last-write-wins (LWW) with timestamps. Both D1 and brain.db are authoritative — whoever changed a field last wins. Conflicts logged to `sync_log`.

**Sync triggers:**
- /process: push to D1 (step 4b) + pull from D1 (step 0c)
- Scheduled: 2:35 AM push, 2:40 AM pull, 12:05 PM push+pull
- Machine swap: Airtable only (not D1)

**Key rules:**
- Brain.db tasks use canonical `task_{ulid}` (post-migration 030, 2026-04-15). Hub-created tasks have 32-char hex IDs. Both are reachable via `entity_aliases` — brain.db keeps the ulid PK, stores the hex id as a `hub_slug` alias.
- On push, brain.db ↔ D1 id translation goes through `hub_slug` alias so upserts land on the same D1 row (fix 2026-04-18 — was creating duplicates).
- Hub-created tasks pull to brain.db but do NOT push to Airtable (Airtable is Nick-only).
- `notes` (brain.db) is private. `description` (D1) is team-visible. They do NOT sync bidirectionally.
- Task deletion uses soft-delete (`deleted_at` column). `GET /api/tasks?include_deleted=1` surfaces them for sync_d1_pull to mirror into brain.db.
- `completed` field is bidirectional — Hub can reopen tasks, brain.db accepts it.
- `task_key_link_{1,2,3}(_desc)` fields: accepted on `POST /api/tasks` create + bi-directionally synced (2026-04-18).

**Phase 35 sync-parity additions (2026-04-18):**
- Hub `task_comments` mirror into brain.db's **`d1_task_comments`** table (read-only). Pull via `sync_d1_pull --task-comments`. Hub stays authoritative for composition; brain.db uses the mirror for search + /process context.
- Hub-originated **projects** now flow into brain.db. Pull via `sync_d1_pull --hub-projects`. Hub `category` (clif/nate/mentee/lab) maps onto brain.db `domain` (CLIF/Mentees/Research).

**Implementation:** See plan at `~/.claude/plans/graceful-meandering-thimble.md`
**Peripheral Brain sync scripts:** `scripts/db/sync_d1_push.py`, `sync_d1_pull.py`

**Test coverage:** `scripts/deep-audit/15-pb-sync-deep.ts` round-trips the
full payload across both directions every run.

### ⚠️ Cross-repo schema coordination (after R10 incident 2026-04-14)

Hub and brain.db **share vocabulary** for status/stage/type/etc. Any change to a shared field in the Hub repo (schema.sql DEFAULTs, migration SQL against prod D1, taxonomy reshuffles like R10) must be **coordinated with Peripheral Brain** before deploying.

**The R10 incident:** On 2026-04-13 a migration in this repo (`scripts/round9/r10-projects-status-migration.sql`, commit `145ed8e`) lowercased all project statuses in D1. The Peripheral Brain side was never updated. `sync_d1_push.py`'s pull-back path silently wrote the new lowercase values into brain.db, corrupting 38 projects on Nick's home machine. TODAY.md filter stopped showing R01s. Airtable push failed with 422s. 4-hour debug session the next morning. Full postmortem: `/c/Users/ingra107/Peripheral-Brain/Context/Decisions/2026-04-14-r10-taxonomy-cross-repo-cascade.md`

**Process for any shared-field change:**
1. Write a decision doc in `/c/Users/ingra107/Peripheral-Brain/Context/Decisions/`
2. Update `/c/Users/ingra107/Peripheral-Brain/scripts/db/enums.py` with the new canonical + legacy alias FIRST
3. Update `/c/Users/ingra107/Peripheral-Brain/Context/Topics/shared-schema-registry.md` with the new field info
4. Ship the code changes to BOTH repos in lockstep — never deploy data migration ahead of dependent code
5. Run `python /c/Users/ingra107/Peripheral-Brain/scripts/db/health.py --check` to verify no drift

**Registered shared fields** (see `shared-schema-registry.md` for full list):
- `projects.status`: `active / waiting_external / blocked / done`
- `tasks.status`: `todo / in_progress / done / blocked / waiting_external`
- `projects.stage`: `Idea / Data Collection / Data Analysis / Writing / Submitted / Accepted / Published` (brain.db granular, Hub R10 used `Analysis`/`Review` — map via `enums.canonicalize_project_stage()`)
- `projects.category`: `clif / lab / nate / mentee` (Hub-authoritative)
- `projects.type`: `R01 / R03 / K / CLIF / Nick_Lab / Friends / Mentees / Admin / Personal` (brain.db-only)
- `tasks.priority`: `low / medium / high / urgent`

**Anti-pattern to avoid:** "we can deploy the frontend next week when Workers cap resets" while the data migration is already live. Data-on-new-schema with code-on-old-schema is how things corrupt.

## Hermes (AI Research Assistant)

Live since 2026-04-09. Team members @mention `@hermes` in Ask the Lab, task comments, or project comments. Responses appear with gold sparkle badge in 20-40 seconds.

- **Detection:** `/@(hermes|claude)\b/i` regex in `api/routes/questions.ts` and `api/routes/projects.ts`
- **Author slug:** `claude-ai` (display name "Hermes" via `src/data/team.ts`)
- **Backend:** `hub_ai_listener.py` on home laptop polls `GET /api/ai-requests?status=pending` every 10s
- **Auth:** Bearer token via `PB_API_KEY` (Cloudflare Pages secret)
- **Docs:** `docs/hermes.md`

## Critical Rules

1. **Content visible by default.** `.fade-in-up` starts at opacity:1. NEVER hide content behind animations.
2. **Hero cards use `<a>` tags**, not React Router `<Link>`. AnimatePresence + useCountUp conflict.
3. **initialData as factory functions.** `initialData: () => data`, never `initialData: data`.
4. **Avatar:** Container `overflow-hidden`, img `w-full h-full`.
5. **`getPersonInfo()` from `src/data/team.ts`** -- never create local copies.
6. **Date formatting from `src/lib/dateUtils.ts`** -- never create local formatters.
7. **@mentions use `MentionInput`** -- not raw `<textarea>`.
8. **Dedup action items** -- normalize "[Carried forward]" prefix.
9. **NEVER deploy from a worktree.** Commit to branch + PR only.
10. **ONE deploy per session.** KV free tier limit. Batch all work, deploy once.
11. **`formatBrandName()`** for any text that might contain "MNCCORE".
12. **Tailwind v4:** `@import` syntax, not `@tailwind`. No `group-hover:` with arbitrary values -- use CSS rules.
13. **Build verification after batch edits.** After editing 3+ files or any shared module/type, run `npm run build` and fix all TypeScript errors before continuing. After fixing test failures, re-run the full affected test suite (`npx playwright test tests/<suite>`) to confirm zero regressions. Do not commit code that doesn't build.
14. **`--ink-bright` is WHITE in BOTH modes.** It is a white-fill-on-dark token, NOT a "stronger than ink" token. Setting it to black in light mode breaks 84 call sites. It exists for white text/icons on dark accent surfaces (teal buttons, maroon pills) regardless of page theme.
15. **Row height CSS must be `@media (min-width: 768px)` scoped.** Mobile uses `height: auto; min-height`. Unscoped fixed heights break stacked card layout on mobile.
16. **TaskGridView `parentRef` minHeight must be STABLE.** Use `calc(100vh - 320px)` unconditionally — not conditional on data state. Conditional minHeight causes CLS flip when data arrives.
17. **Data pages vs dashboard pages taxonomy.** Data pages (Tasks, MyTasks, Deadlines, Projects, Manuscripts, Ideas, Decisions, Grants, Meetings, Publications) use columnar `TableContainer` + `ColumnHeader`. Dashboard pages (Dashboard, Personal, PIAnalytics, Analytics) use card layouts. Never mix.
18. **Detail panels must subscribe to cache, not parent state.** TaskDetailPanel and any future detail panel that receives a row object as prop MUST look up fresh data from the React Query cache using `queryClient.getQueryCache().subscribe(...)`. Parent pages hold `selectedTask` as `useState<TaskRow | null>` — that snapshot goes stale after any mutation updates the `['tasks']` cache, and the panel shows old assignee/priority/status. **Reference implementation:** `src/components/tasks/TaskDetailPanel.tsx` post-GH#7 fix (commit `087ba42`). Apply the same pattern to any ProjectDetailPanel, IdeaDetailPanel, DecisionDetailPanel that takes a full row as prop.
19. **`refetchIntervalInBackground: true` on `/api/version` polling.** `useRealtimeSync` polls /api/version every 15s for cross-user realtime. React Query's default pauses polling when the tab isn't focused — which is constant for real users who park the Hub in background tabs. Without this flag, team member A edits a task and team member B doesn't see it until they refocus the tab. Deep-audit Suite 7 uncovered this. Ref: `src/hooks/useRealtimeSync.ts`.
20. **Task mutation endpoints validate assignee + project_id.** `POST /api/tasks`, `POST /api/tasks/:id`, and `POST /api/tasks/batch` action='assign' all reject unknown assignee slugs (except `claude-ai`). `project_id` on create/update is resolved (accepting id OR slug); unknown → NULL. Keeps dangling refs out of the DB. Ref: `api/routes/tasks.ts`. Pattern found via deep-audit Suite 8 + propagated to every write path.
21. **Project slug collision auto-resolves.** `handleCreateProject` loops appending `-2/-3/...` if the desired slug already exists. Two projects with the same title get distinct slugs; no silent overwrite. Ref: `api/routes/projects.ts`. Found via Suite 8.
22. **Project delete cascades.** `handleDeleteProject` clears `comments`, `project_updates`, and sets active tasks' `project_id = NULL` before removing the project row. Tasks are never orphaned with dangling refs. Ref: `api/routes/projects.ts`.

## Roadmap

**Phases 1-13: COMPLETE** (360+ commits). See `REFERENCE.md` for details.

**Phase 14: COMPLETE** (7 commits). Design ethos pivot — palette, containers, inline editing, fonts, monospace, colors.

**Phase 15: COMPLETE** (1 commit). Project detail → tabbed workspace.

**Phase 16: COMPLETE** (10 commits). LabSync parity push — foundation + tables:
- Dark bg deepened #0b1017, text softened #e2e8f0, body weight 400
- TaskGridView: columnar table (Title|Assignee|Due|Status|Priority) with inline editing
- Deadlines + Ideas: converted to columnar tables
- SectionHeader, ToggleButton, MetricCard, BentoCard: lighter weights
- Undo toast system, workload visibility, task click bug fix
- CLAUDE.md: 9 design principles from LabSync + UX research

**Phase 20: COMPLETE** (12 commits + simplify). UX polish & interaction:
- HoverCard: preview cards on hover (project/member/task), wired to 6 surfaces
- TaskContextMenu: right-click for quick actions with submenus
- Toast system: success confirmations for 8 key mutations + timeout cleanup
- ActivityHeatmap on MemberPage, stagger animations (Dashboard + Projects)
- J/K keyboard nav on Projects page, role-based dashboard views (PI/Fellow/Coordinator)
- Design ethos enforcement: heading weights fixed across 57 files
- Simplify: shared constants (lib/taskConstants.ts, lib/animations.ts), memoized Personal.tsx

**Phase 20.5: Mobile Responsive** (1 commit from home laptop, d65d71c):
- Stacked card layout on mobile, columnar grid on desktop (Projects, Manuscripts, Deadlines, Ideas)
- InlineSelect larger touch targets, global CSS 36px min touch targets

**Phase 20.6: Quick Fixes** (2026-04-03):
- Fixed: Portal h1 fonts changed from Fraunces to DM Sans (Dashboard, Projects)
- Fixed: Duplicate action item empty states on Meetings page

**Phase 21: COMPLETE** (13 commits + expert playbook). Visual perfection:
- Blocks 0-5: Spring physics, progressive disclosure (F key), column sort, empty states, transition constants, welcome banner, meeting prep view
- Tier 1.5: TaskDetailPanel split, Sidebar perf, dynamic import cleanup, fontFamily purge (1107 across 131 files), loading skeletons (9 pages), taskConfig consolidation, inline editing expansion, undo toast expansion, J/K nav (5 pages), HoverCards (6 surfaces), stagger animations (4 pages)
- Hardcoded white audit: confirmed correct (white-on-accent), no changes needed

**Post-Phase 21: Showcase Features** (2026-04-04, 5 deploys):
- **Inline subtask expand/collapse** (81da23b): Linear-style chevrons on TaskGridView. AnimatePresence expand with progress bar, inline toggle, add input. Keyboard: → expand, ← collapse (directional, not toggle). Auto-focus input on expand.
- **Meeting NLP action items** (ce04ebf): Inline quick-add on MeetingDetail. Type `@nick Review draft p2 Friday` → parses assignee, priority, due date, project via `parseQuickAddInput`. Token preview chips. Creates task linked to meeting with `meeting_id`. Invalidates meeting query for instant refresh.
- **Accessibility** (be80679): CommandPalette focus trapping + aria-modal. CreateTaskModal focus trapping + aria-modal. UndoToast `role="status"` + `aria-live="polite"`. ShortcutHelp spring animation + aria-modal.
- **Dashboard 6-card default** (b502053): Default role showed 2 cards (upcoming+stats). Now shows 6 (action-board, upcoming, project-health, pipeline, activity, stats). localStorage version key resets stale preferences.
- **Meeting dedup** (6a1fd06): API dedup by date+title before INSERT. UNIQUE index on meetings(date, title). Cleaned 123 duplicates from D1 (139→16).

**Phase 23: COMPLETE** (14 commits, 2026-04-06). UX depth + a11y + undo-everywhere sprint:
- **Clickable task titles everywhere**: clicking title opens TaskDetailPanel on Tasks, MyTasks, Personal, Deadlines, ProjectDetail
- **Undo on EVERY status change**: TaskGridView, TaskStandUpView, TaskDetailPanel, Tasks, MyTasks, Personal, Deadlines, Dashboard ActionBoard, MeetingDetail, ProjectDetail, MyItems, Meetings
- **TaskDetailPanel wired to all views**: Grid, Board, StandUp, Timeline views on both Tasks and MyTasks pages, plus Personal, Deadlines, ProjectDetail
- Hover actions moved to own grid column (no longer overlaps priority)
- Project notes system: Notes section reads from project_updates table (timestamped, auto-author)
- Deadlines: InlineSelect for task status, clickable task titles, TaskDetailPanel
- Focus trapping + Escape key on all 6 modals
- J/K keyboard nav on 5 more pages (Grants, Search, MeetingNotes, Narratives + Enter on Search)
- Stagger animations on Analytics, PIAnalytics, Settings
- EmptyState on Settings workflow templates
- PageHeader: aria-live on count/subtitle for screen readers
- Success toasts on task creation, idea capture, answer submission
- Removed 366 redundant fontFamily declarations across 77 files
- TaskStandUpView: separated status circle from title click with undo
- TaskTimelineView: bar click opens detail panel instead of cycling status

**Phase 24: COMPLETE** (database alignment, 2026-04-06). brain.db ↔ D1 full sync:
- **Phase A** (bulk load): 537 brain.db tasks → D1 via `POST /api/tasks/sync-bulk`. `scripts/sync-brain-tasks.ts` with `--api`/`--sql` modes. recXXX IDs preserved. `assignee` column added to brain.db.
- **Phase B** (ongoing sync): schema-v22 (`updated_at` + `deleted_at`), all 5 write paths set `updated_at`, batch delete → soft-delete, `updated_since` delta filter. `sync_d1_push.py` and `sync_d1_pull.py` rewritten for field-level LWW from main tasks table. `crdt.py` monotonic constraint relaxed for task reopening.
- **Sync flow:** `/process` runs push+pull. Scheduled 2:35 AM push, 2:40 AM pull. Delta sync via `updated_at` timestamps.
- **Admin endpoint:** `POST /api/admin/migrate` for schema changes without wrangler D1 access.

**Phase 25: COMPLETE** (2026-04-06). Showcase + academic workflow features:
- Virtual scrolling on TaskGridView (@tanstack/react-virtual) — 537 tasks performant
- AI autofill on CreateTaskModal — heuristic project/priority/assignee suggestions
- **Paper Revision Tracker** (schema-v23): per-round reviewer comments, progress bars, ProjectDetail tab
- **Mentee Milestone Dashboard** (schema-v24): /mentee-milestones page, MemberPage integration, PI overview
- **Deadline Cascade View** (schema-v25): dependency graph, impact simulation, /deadline-cascade page
- **Paper Submission Lifecycle** (schema-v26): submission events timeline, active submissions widget
- **IRB/Regulatory Tracking** (schema-v27): regulatory items, expiration alerts on Personal page

**Phase 26: COMPLETE** (2 commits, 2026-04-07). UX audit from LabSync comparison — 14 issues:
- Dark mode sidebar logo fix (filter + dark SVG variant)
- Remove "Join" nav tab, rethink hero pathway cards (Collaborate→/network, Meet Our Team→/team)
- Default task sort changed from priority → due_date (TaskGridView + MyTasks)
- MyTasks: showCompleted toggle, useAuth() hook (replaces manual JWT parsing)
- --muted opacity raised 0.4→0.55, dark mode contrast audit across 22 files
- Sidebar compactness: py-2, 12px font, tighter group gaps
- Task click fix in MyTasks grouped view (virtualizer minHeight)
- Projects: PI + Group columns inline-editable (InlineSelect), sortable column headers
- Projects: stage group headers only show when sorted by stage
- All Tasks: "My Tasks" filter toggle
- **TaskDetailPanel**: restructured to 4-tab layout (Overview/Details/Files/Comments)
- **Link Paper to Project**: search modal on ProjectLiterature with publication picker
- **Publication Library View**: horizontal scrolling journal cover cards (scroll-snap)

**Phase 26b-aq: COMPLETE** (44 commits, 2026-04-07/08). Massive feature sprint across all pages:

*Interaction & Keyboard:*
- Keyboard shortcuts: Z (snooze +1d), A (assign), P (pin project), N (new idea/decision), T (calendar today), arrow keys (calendar nav)
- Task context menu: snooze submenu (+1d/+3d/+1w/+2w), open in new tab
- Bulk action toolbar: snooze button (+1 day)
- InlineDatePicker: relative labels ("2d ago", "in 3d"), quick presets (Today/Tomorrow/Next Mon/+1 Week/Clear)
- Command palette: task/project counts in footer, Due Today quick filter, Log Decision action
- ShortcutHelp: updated with all new shortcuts (P pin, calendar section, N decisions)
- N key opens create modal on Ideas + Decisions pages

*Dashboard & Personal:*
- Time-of-day greeting, today's progress summary
- WeeklyProgressCard: 7-day bar chart with trend indicator
- QuickWinsCard: top 4 actionable tasks scored by urgency
- Overdue alert banner on Dashboard
- CURRENT_DEFAULTS_VERSION bumped to 4 (6 default cards)
- Personal: quick actions row, priority distribution bar, weekly completion count

*Task System:*
- MyTasks: QuickFilter pills (Today/This Week/Overdue/No Date), Focus Next smart scoring, completion streak counter, status distribution bar, StandUp view, prev/next in detail panel
- TaskDetailPanel: copy link button, task age badge, source/recurrence chips, prev/next navigation (Alt+Up/Down)
- TaskGridView: calculations row shows completion percentage
- Dynamic page titles on Tasks, MyTasks, Ideas, Decisions, Deadlines, Manuscripts, Projects

*Data Pages:*
- Projects: task count badges, "Needs Attention" filter (health < 50), dynamic title
- Manuscripts: category filter (CLIF/Lab/Mesfin/Mentee), sortable columns, stage progress dots, dynamic title
- Ideas: sort toggle (Newest/Most Voted/A-Z), vote bounce animation, N-key create
- Decisions: search filter, N-key create, dynamic title
- Deadlines: urgent countdown banner, Export to .ics, dynamic title
- Grants: days remaining on progress bars, maroon when >80% elapsed

*Analytics & PI:*
- AnalyticsPage: 8-week task velocity chart, task age histogram, workload per person, lab health summary, Copy Report button
- PIAnalytics: Copy Report + Print buttons

*Activity & Search:*
- ActivityPage: person filter dropdown, "Most active: X" in subtitle
- SearchPage: recent searches (localStorage, max 5, click to re-search, clear all)
- SessionHistory: search filter on summaries

*Meetings & Digest:*
- Meetings: action item completion rate in subtitle
- MeetingDetail: Copy Summary button (markdown to clipboard)
- MeetingPrep: Print button, meeting countdown badge
- MeetingNotes: search filter, 20 results
- Digest: reading progress bar, Copy Reading List export

*Publications & Network:*
- Publications: year distribution mini-chart (clickable), Copy bibliography button
- Network: stats bar (author count, connections, avg, hub node)

*Team & Member:*
- Team: member count + active-this-week count, green activity dots on directors
- CVPage: Copy as Text button, word count badge

*Settings & Infrastructure:*
- Settings: theme preview cards (light/dark), Reset Dashboard + Clear Searches buttons
- Narratives: search filter on arc titles/projects/topics
- ScrollToTop: floating button on all portal pages
- Favicon: notification badge overlay (red circle with count)
- Sidebar: next meeting countdown hint
- CalendarPage: keyboard arrow nav, T for today
- Print CSS: enhanced @media print rules
- Ctrl+. theme cycle on PortalLayout

*Pending:* Schema v35 migration (recurrence + recurrence_parent_id) — planned but not yet needed. No code depends on it.

**Phase 27: COMPLETE** (4 commits, 2026-04-08). Task notes/updates + activity tab:
- **Schema v36**: `task_updates` table (mirrors `project_updates` pattern) with task_id, author_slug, content, update_type, created_at
- **TaskUpdateFeed**: append-only notes with type badges (progress/blocker/result/question/session), textarea input, reactions
- **TaskActivityFeed**: merged temporal timeline of notes + comments + system events with visual delineation (teal=notes, gold=comments, dot=system)
- **TaskDetailPanel restructured** to 5 tabs: Overview | Notes | Comments | Activity | Details
- Files tab merged into Details as CollapsibleSection
- Status click bug fixed: guard against clicking already-active status pill
- API: GET/POST /api/tasks/:id/updates with @mention notifications and activity logging

**Phase 28: COMPLETE** (6 commits, 2026-04-08). Next-gen infrastructure + polish:
- **Optimistic mutations** (`useMutations.ts`): instant UI for task/project/manuscript updates, rollback on error
- **R2 file uploads** (`FileUpload.tsx`, `api/routes/uploads.ts`): drag-drop file attachments with R2 storage
- **Tiptap rich text** (`RichTextEditor.tsx`): rich text editor for task descriptions (bold/italic/headings/lists/links)
- **WebSocket real-time** (`useRealtimeSync.ts`): PartySocket → Durable Object at `hub-realtime.nicholas-ingraham.workers.dev`, with polling fallback + BroadcastChannel tab sync
- **Smart polling**: 60s with WS, 10s without, version-based invalidation
- **Resend email** (`api/lib/email.ts`): email integration ready, needs API key
- **Design polish**: dark bg contrast improvements, text softening
- **InlineSelect portal fix**: dropdown renders via `createPortal` to escape table overflow, z-index resolved
- **Version bump fix**: Pages Functions must await async work directly (no ctx)

**Phase 22: COMPLETE** (5 commits, 5 deploys, 2026-04-05). Design research + polish:
- Transition standardization: 10 inline durations → 150ms/250ms constants
- CreateProjectModal: focus trapping + aria-modal (a11y gap closed)
- Mobile responsive TaskGridView: stacked card layout below 768px
- Button secondary variant: CSS vars for light mode compat
- Calculations row: Notion-style count/status summary on Tasks, Projects, Deadlines tables
- Status badge pills: 12% opacity tinted backgrounds (Kraken/Notion pattern, STATUS_BG map)
- CSS polish (Linear/Raycast research): luminance-stepping elevation, +0.01em dark letter-spacing, --muted 4th opacity tier, semi-transparent white borders
- Design patterns reference saved: `Projects/mn-ccore-lab-hub/design-patterns-reference.md`

**Phase 19: COMPLETE** (4 commits). Differentiation features:
- Trainee Development Trajectories: per-member page with pub curve, project velocity, task metrics, activity heatmap
- Decision Replay System: tags, similar decisions search, outcomes tracking, project linking, timeline view
- Evidence-Based PI Dashboard: commitment scorecard, response time, team engagement, mentee pub velocity, grant pipeline
- Expertise tags on team profiles (teal pills, clickable, filterable on Team page)

**Phase 18: COMPLETE** (2 commits). Functional depth:
- Blocker flagging: blocked_by field, Link2 chain icons, B keyboard shortcut, auto-status
- Project Health: real algorithm (activity/velocity/overdue/milestones), colored bars, health dots
- Dashboard card type badges, view toggle standardization

**Phase 17: COMPLETE** (7 commits). UX interaction layer + visual consistency:
- PageHeader: standardized across all 18 portal pages (LabSync Pattern 3)
- EmptyState: consistent empty states with icon+title+subtitle+CTA
- LoadingSkeleton: Table/Card/Text skeletons replacing all loading spinners
- Task keyboard shortcuts: J/K nav, Space peek, S status cycle, X select, Enter detail
- TaskPeekOverlay: Linear-style right-side panel (400px, slide-in)
- InlineAssigneePicker: avatar dropdown for assignee editing in grid
- InlineDatePicker: date editing with overdue detection
- CollapsibleSection: progressive disclosure in TaskDetailPanel
- Board enhancements: column collapse + swimlanes (group by status/priority/assignee)
- Status color transitions (150ms), task completion animation (Todoist-style)
- Hover row actions (Edit/Archive/Add to Meeting ghost buttons)
- Portal heading weights reduced (h1:600, h2:500, h3:400)
- Card hover stabilized (no layout-shifting translateY)
- Density toggle verified across data pages

## Meeting Cadence

Biweekly Tuesdays 3pm CT. Anchor: Apr 21, May 5. Automation runs Monday mornings.

## Component Coverage (verified 2026-04-15 Everything Sprint v2)

**Re-verified via Playwright runtime + source audit (2026-04-15).** Journey B's 2026-04-13 "false claim" warning was incorrect — all rows are TRUE. N-key works on both Ideas + Decisions (`DecisionsPage.tsx:834`). Copy bibliography works on Publications (`Publications.tsx:234`). Only stale item was CVPage (removed — page was deleted per `project_hub-cv-removed.md`).

| Component | Coverage | NOT Used On |
|-----------|----------|-------------|
| LoadingSkeleton | ALL 19 portal pages | -- |
| EmptyState | 15 pages (Tasks, MyTasks, Deadlines, Decisions, Ideas, Activity, Calendar, Search, Grants, MeetingNotes, Narratives, AskTheLab, Manuscripts, Digest, Settings) | Analytics, PBSector, Personal, PIAnalytics |
| PageHeader | 17 of 19 portal pages (all with aria-live on count/subtitle) | PBSector (custom PlannerHeader) |
| J/K keyboard nav | 11 pages (Tasks, Projects, Meetings, Ideas, Decisions, Deadlines, Manuscripts, Grants, Search, MeetingNotes, Narratives) | Calendar (arrow keys), Analytics, Settings |
| HoverCard | 8 surfaces (TaskDetail, TaskPeek, MeetingDetail, AssigneePicker, ProjectHealth, MenteeDashboard, Projects list, Activity) | Team (cards already detailed) |
| UndoToast | ALL task surfaces (TaskGridView, StandUp, Timeline, Board, Detail, Tasks, MyTasks, Personal, Deadlines, Dashboard ActionBoard, MeetingDetail, ProjectDetail, MyItems, Meetings) + Ideas, Manuscripts, Decisions, Grants (R10) | Settings (uses saved indicator) |
| Stagger animations | 12 pages (Projects, Personal, Ideas, Decisions, Deadlines, Meetings, MeetingPrep, MeetingNotes, Search, Calendar, Analytics, PIAnalytics, Settings) | -- |
| InlineSelect | Tasks (grid), Projects (list+detail), Manuscripts, Ideas, Decisions, Deadlines, **Grants (R10 — status only)** | Grants (title / dates / agency / PI still not inline) |
| Focus trapping | ALL 6 modals (CreateTask, CreateProject, CreateIdea, CreateQuestion, CreateDecision, TranscriptModal) | -- |
| Escape key close | ALL 6 modals + CommandPalette + GlobalQuickAdd + ShortcutHelp | -- |
| Dynamic page title | 7 pages (Tasks, MyTasks, Ideas, Decisions, Deadlines, Manuscripts, Projects) | Other portal pages use static usePageMeta |
| Search/filter input | 8 pages (Tasks, AskTheLab, SessionHistory, Narratives, MeetingNotes, Decisions, Search, Digest) | -- |
| N-key create | Ideas, Decisions | Tasks uses C key |
| Copy to clipboard | PIAnalytics, Publications, Digest, MeetingDetail, AnalyticsPage | -- |
| ScrollToTop | All portal pages (via PortalLayout) | Public pages |
| Draggable + resizable grid cards | Dashboard (R9-9 via react-grid-layout v1.5.3, drag handle + SE resize, per-user localStorage) | -- |

## Accessibility Requirements

Currently good: aria-hidden on icons, aria-label on interactive elements, aria-pressed on toggles, skip-to-content link, focus-visible styling, prefers-reduced-motion in 5 locations, all modals have focus trapping + Escape key + aria-modal.

**All major gaps closed as of Phase 23:**
- ~~UndoToast needs `role="alert"` and `aria-live="polite"`~~ DONE (be80679)
- ~~CommandPalette needs focus trapping~~ DONE (81da23b)
- ~~CreateTaskModal needs focus trapping~~ DONE (be80679)
- ~~CreateProjectModal needs focus trapping~~ DONE
- ~~CreateIdeaModal, CreateQuestionModal, CreateDecisionModal, TranscriptModal need focus trapping~~ DONE (Phase 23)
- ~~No `aria-live` regions for dynamic content updates~~ DONE — PageHeader count/subtitle have aria-live
- ~~Toast notifications not announced to screen readers~~ DONE — UndoToast container has role="status" + aria-live, success toasts share same container

## Known Gotchas

| Problem | Fix |
|---------|-----|
| Hero cards render loop | Use `<a>` tags, not Router Link |
| initialData flash | Use factory functions: `() => data` |
| Meeting ID collision | IDs include random suffix. R10-5 `normalizeMeetingTitle()` lowercases+trims+collapses whitespace before dedup compare. UNIQUE index enforced. |
| Tailwind v4 group-hover | Use CSS rule in index.css, not arbitrary value |
| --border-light vs --border-subtle | Gold=semantic, Neutral=structural. Don't mix. |
| TaskCard status cycling | todo→in_progress→done (skips blocked) |
| Network chunk 1.3MB | Expected (three.js). Code-split via React.lazy |
| CF Access blocks all | Restrict to portal paths only |
| Duplicate action items | Dedup by normalizing "[Carried forward]" |
| Duplicate project slugs in D1 | Some projects have both `(prefix)-slug` and `prefix-slug` variants from old migration. Fix via D1 merge; track via `scripts/projects-dedupe.sql` when written. |
| MeetingDetail Rules of Hooks | useState/useMemo must come BEFORE early returns on loading/not-found branches. Phase 31.5 perf pass introduced a variant of this bug; R6 hotfixed. |
| `team_members.email` column | Added 2026-04-19 (schema-v43). Backfilled to `slug || '@umn.edu'` for existing rows. Read `email` column; fall back to the slug derivation only if NULL. Non-UMN collaborators get a real address. |
| Mobile swipe on TaskDetailPanel | `onTouchStart/Move/End` on panel div; only active below 768px. Axis-locked (disengages on vertical scroll so page still scrolls). Drag >30% panel width → onClose. Respects `prefers-reduced-motion` (instant dismiss, no transform animation). Don't add any element with its own touch handler inside the panel without re-evaluating axis lock. |
| Virtualizer skeleton rows must match actual layout | TableSkeleton component was generic; pages with virtualizers need inline skeletons that match TableContainer + header + rows at `var(--row-height)` pixel-for-pixel to avoid CLS. |
| Cloudflare Workers 100K/day cap | Free tier. Hermes polling at 10s = 8.6K/day baseline. Don't run parallel Playwright audits against deployed site — use `localhost` + dev server instead. $5/mo Paid plan = 10M/day. |
| FAB positioning | Use `--fab-stack-{1,2,3}` CSS vars in `:root` (R9-1). NEVER `max(24px, 72px)` — that always returns 72. Mobile override is a `<768px` media query in index.css. |
| react-grid-layout v2.x is a breaking rewrite | Stay on `1.5.3`. DashboardGrid.tsx depends on the `WidthProvider(Responsive)` HOC pattern. RGL measures container width, not window — `DASHBOARD_GRID_BREAKPOINTS` must account for the sidebar. |
| Dark mode localStorage key | `mn-ccore-theme`, NOT `theme`. Playwright tests must set the right key. |
| Playwright X-Test-Mode header | DEPRECATED — Miniflare local test harness replaces this. `X-Test-Mode: true` routes API calls to `mnccore-lab-test` (empty DB). Prior inspection passes on data-rich pages may be inflated. Phase 3 Miniflare rework removes the header from prod config. |
| `@formkit/auto-animate` import drift | Imported in `TaskGridView.tsx` but was missing from `package.json` — blocked the first build 2026-04-13. If you see `Cannot find module 'X'`, grep the imports. |
| Project status legacy values | `src/data/projects.ts` static fallbacks still use `'Active'`. `normalizeProjectStatus()` in `lib/taskConstants.ts` folds them. Don't delete the helper. |
| Grant status taxonomy | R10: 7 values in `useGrantTimeline.ts:GRANT_STATUS_OPTIONS`. Only K23 provider practice variation in mechvent is `funded`. Anything else marked `Active` is legacy — see migration SQL in `scripts/round9/r10-grants-status-migration.sql`. |
| hub-realtime WebSocket namespace | FIXED (commit `46f53c4`). Was HTTP 400 for 7 days — `routePartykitRequest` maps binding `NOTIFICATION_HUB` → namespace `notification-hub`, but PartySocket client defaulted to `main`. Fix: added `party: 'notification-hub'` to `useRealtimeSync.ts`. Source now at `workers/hub-realtime/` in this repo. WebSocket stub kept in `tests/setup/websocket-stub.ts` for local tests (Miniflare can't run the DO). |

## Peripheral Brain Connection

- **Project folder:** `Projects/mn-ccore-lab-hub/` -- PROJECT.md + hub-future-ideas.md (88 features tracked)
- **Research:** `Projects/mn-ccore-lab-hub/competitive-landscape-lab-management-2026.md` + `task-management-ux-patterns-research.md`
- **Design decision:** `Context/Decisions/2026-04-01_hub-design-ethos-pivot.md`
- **Memory:** `memory/project_mnccore-website-redesign.md`
- **Sync scripts:** `scripts/db/sync_d1_push.py` / `sync_d1_pull.py` -- push/pull brain.db ↔ D1
- **Sync plan:** `~/.claude/plans/graceful-meandering-thimble.md` -- full database alignment (Phase 24)
- **CRDT engine:** `scripts/db/crdt.py` -- field-level LWW for Airtable sync (extend to D1)
- **Meeting automation:** `scripts/scheduled/meeting_automation.py`
- **Archived plans:** `Projects/mn-ccore-lab-hub/_archived/` + `Archive/Scratch/hub-plans-consolidated/`

## Office of Inspection (Testing Infrastructure)

**568+ tests** across 4 suites. Self-updating via feature registry + scanner.

| Suite | Tests | File |
|-------|-------|------|
| Inspection | 214 | `tests/inspection.spec.ts` |
| Workflows | 167 | `tests/inspection-workflows.spec.ts` |
| Daily Super-User | 131 | `tests/daily-superuser.spec.ts` |
| Sync Pipeline | 58 | `tests/sync-pipeline.test.py` |

**Run:** `bash scripts/run-tests.sh all` (quick/ui/sync/all modes)

### Test Database Isolation

Tests run against a **separate D1 database** (`mnccore-lab-test`), not production. The production DB is never touched by Playwright tests.

**How it works:**
1. `playwright.config.ts` sends `X-Test-Mode: true` header on all requests
2. Middleware in `api/index.ts` detects the header and swaps `env.DB` to `env.DB_TEST`
3. `DB_TEST` binding configured in both `wrangler.toml` and Cloudflare Dashboard
4. `api/types.ts` and `functions/api/[[route]].ts` include `DB_TEST` in the `Env` interface

**Canonical test prefix:** `_TEST_DELETE_` -- used in `tests/test-cleanup.ts` for test data identification and cleanup.

**Cleanup:** Test data lives in the isolated test DB and does not pollute production. The `tests/test-cleanup.ts` handles cleanup of `_TEST_DELETE_`-prefixed records. The manual cleanup commands below are for **legacy test data** that was created in production before isolation was implemented, and for sync pipeline tests that operate on brain.db directly:
```bash
# Legacy production cleanup (only needed for pre-isolation test data)
# Tasks (soft delete)
npx wrangler d1 execute mnccore-lab --remote --command="UPDATE tasks SET deleted_at=datetime('now') WHERE title LIKE 'SYNCTEST%'"
npx wrangler d1 execute mnccore-lab --remote --command="UPDATE tasks SET deleted_at=datetime('now') WHERE title LIKE 'INSPECTION%' OR title LIKE 'EDGE%' OR title LIKE 'JOURNEY%' OR title LIKE 'DAILYTEST%'"
npx wrangler d1 execute mnccore-lab --remote --command="UPDATE tasks SET deleted_at=datetime('now') WHERE title LIKE 'SYNC-%'"
# Non-task tables (hard delete — no deleted_at column)
npx wrangler d1 execute mnccore-lab --remote --command="DELETE FROM ideas WHERE title LIKE 'INSPECTION%' OR title LIKE 'EDGE%'"
npx wrangler d1 execute mnccore-lab --remote --command="DELETE FROM lab_questions WHERE question LIKE 'INSPECTION%' OR question LIKE 'EDGE%'"
npx wrangler d1 execute mnccore-lab --remote --command="DELETE FROM decision_log WHERE title LIKE 'INSPECTION%' OR title LIKE 'EDGE%'"
npx wrangler d1 execute mnccore-lab --remote --command="DELETE FROM notifications WHERE body LIKE 'SYNCTEST%'"
# brain.db (sync pipeline tests still touch brain.db directly)
python -c "import sqlite3; conn=sqlite3.connect('C:/Users/ingra107/Peripheral-Brain/data/brain.db'); conn.execute(\"UPDATE tasks SET status='deleted', completed=1, sync_status='synced' WHERE name LIKE 'SYNCTEST%' OR name LIKE 'INSPECTION%' OR name LIKE 'EDGE%' OR name LIKE 'DAILYTEST%' OR name LIKE 'JOURNEY%' OR name LIKE 'SYNC-%' OR name LIKE 'AAAA%' OR name LIKE 'TEST-%'\"); conn.commit(); print(f'Cleaned {conn.total_changes} test tasks from brain.db'); conn.close()"
```
**Scan for gaps:** `python scripts/inspection-scanner.py --commits 5`
**Registry:** `tests/feature-registry.json` (369 features, 318 covered = 86.2%)
**Guide:** `TESTING.md`
**Skill:** `/test-hub` (scan, run, generate, update, report)

## Phase History (29-32 + R8/R9/R10) → see CHANGELOG.md

> **321 lines of phase-by-phase build history moved to `CHANGELOG.md`** to keep this file operational. Includes: Phase 29 features (9 new), Phase 30 visual QA marathon (14 commits), Phase 31 token compliance (11 commits), Phase 31.5 expert polish (22 commits), Phase 32 final launch polish (60+ commits, 7.18→9.44 aggregate, 10 consultant rounds), Nick-Review Polish R8/R9/R10 (grants taxonomy, dashboard resizable cards, 11-bug session).
>
> **Key decisions in that history:** sidebar darker-than-content is NEVER-violate (GC-1). Framer Motion scoped to page transitions only (GC-2). Ideas + Decisions are columnar tables not cards (GC-3). Data-pages vs dashboard-pages taxonomy (GC-6). Grant + project status taxonomies locked (R10). Research Digest = Model B. Dashboard cards resizable via RGL (R9-9).

**Still open (from R8/R9/R10 handoff):**
- ~~R13 Research Digest Model B~~ DONE (2026-04-16). Save+link already existed; added inline comments (schema-v40, 3 API endpoints, UI with count badges). Actual scope ~2h not ~8h.
- DI-4 duplicate projects (other session)
- DI-6 dangling task project_id (330 rows)
- ~~Hermes polling 10→60s~~ DONE (2026-04-16). POLL_INTERVAL 20→60s in hub_ai_listener.py.

## Everything Sprint v2 (2026-04-15) — R11/R12 + Miniflare

Single-day sprint closing R11 interaction gaps + R12 mobile + replacing X-Test-Mode with Miniflare local test harness + prod dogfood seeding.

**R11 fixes shipped:**
- R11-4 Deadlines: `InlineDatePicker` on due_date cells (task rows; milestones stay read-only)
- R11-5 Manuscripts: `InlineSelect` on PI + Category cells (Avatar preserved as sibling for visual parity)
- R11-6 Ideas: `expandedId` + inline detail panel (DecisionsPage already had the pattern; Ideas now matches)
- R11-8 Grants: `expandedId` + inline detail panel (rows were inert — no Link nav, no onClick, fixed with role=button + Enter/Space keyboard open)

**R12 mobile fixes shipped:**
- R12-H3 typography floor 10→11px via `@media (max-width: 767px)` on `--text-micro`/`--text-caption` + utility-class override
- R12-H4 Calendar prev/next: raised to 44×44 hit target (were 30×44 — width gap caught by Playwright runtime, source audit had missed the existence entirely)
- R12-H2 Dashboard grip + Customize pin button: raised to 44×44
- R12-H2 MyTasks focus-row pin button: raised to 44×44
- R12-H5 MobileTabBar: added "More" overflow drawer exposing 18 portal routes grouped Work/Research/Lab

**Phase 0 prod seed**: ~90 `test_delete_*` rows across 13 tables via `scripts/seed/phase0-seed.ts` (API path) + `scripts/seed/phase0-direct-sql.ts` (grants/milestones/manuscript_revisions/research_digest). Cleanup SQL at `scripts/seed/phase0-cleanup.sql`, verifier at `scripts/seed/phase0-verify.ts` — both gate deploy.

**Phase 3 Miniflare harness**: Replaces `X-Test-Mode` header with local workerd + local D1 + `tests/local/data-validation.spec.ts` + schema-drift CI. Shipped on `miniflare/local-test-infra` branch by a parallel subagent, merged into main for Phase 4. See `TESTING.md` for the local-first flow.

**Plan corrections discovered during audit** (for future reference):
- R11-6 "model after DecisionsPage" — correct. DecisionsPage.tsx already has the pattern; source audit searched wrong filename (`Decisions.tsx` doesn't exist).
- R12-H4 Calendar buttons — EXISTED at CalendarPage.tsx:153-165, not missing. Real gap was size, not existence.
- CLAUDE.md "false claims" — both `N-key on Decisions` and `Copy bibliography on Publications` are actually TRUE features. Only stale item was `CVPage` reference (removed earlier).
- R11-8 Grants — rows were inert, not `<Link>` navigators. Bug was worse than the plan said.

## Pending Sync
<!-- When this session ends, the SessionEnd hook syncs this to Peripheral Brain. -->


## Next Session Playbook — April 21 Launch Readiness

**Living plan:** `Projects/mn-ccore-lab-hub/plans/april-21-launch-readiness.md` (PB repo) — the single checklist for everything remaining. Each session checks off items + adds new todos discovered during work.

**2 sessions remaining:**
1. ~~**Session 1 (Apr 16-17):** Miniflare interactions audit~~ DONE (2026-04-16 overnight). 6 journey specs green. R13 Digest comments shipped. Hermes polling reduced 20s->60s. Deployed at `bc51305`.
2. **Session 2 (Apr 18-19):** Prod data population + full pipeline validation — seed real data, watch sync chain flow through brain.db -> Airtable -> mobile. Verify the whole system works.
3. **Session 3 (Apr 20 Mon):** MNCCORE agenda prep + final polish + last deploy.

**Nick must do (CF dashboard):** CF Access @umn.edu, RESEND_API_KEY, GitHub secrets. Checklist in the living plan.

**System state (2026-04-17 evening):** Hub deployed at `b9644c75`. D1 schema v42 applied (projects.key_link_1/_desc..._3/_desc added). Schema v41 applied earlier (team_members.full_name + preferred_name). Dogfood 14/14 page health, 0 console errors. Workers Paid. Audit framework live (see below). Hermes polling 60s.

## Audit Infrastructure (2026-04-17)

**Canonical interaction audit.** Every interaction the Hub must support is
enumerated in `Projects/mn-ccore-lab-hub/HUB-AUDIT-CHECKLIST.md` (PB repo).
The audit script `scripts/hub-audit.ts` mirrors that checklist — each section
exercises real user actions (click, type, select) with `test_delete_` prefixed
content, screenshots every state, asserts inline updates without page reload,
and cleans up via API at the end.

**Usage:**
```bash
npx tsx scripts/hub-audit.ts                    # full run (14 sections, ~8 min)
npx tsx scripts/hub-audit.ts --section=tasks    # single section
npx tsx scripts/hub-audit.ts --cleanup          # delete test_delete_* rows
npx tsx scripts/hub-audit.ts --list             # list sections
```

**Output:** `review/audit/YYYYMMDDTHHMM/` per run — per-section screenshots +
findings.md with PASS/FAIL/FRICTION/INFO tagging.

**Trajectory (7 runs, 2 days):** 40% pass → 75% → 90% → 95% → 30+ asserted
flows → UX bug found + fixed → key_link editor shipped. Four real product bugs
fixed through the audit: Decisions Ctrl+Enter stale-closure (`76b1c15`),
InlineCellSelect scroll-close race (`3901300`), InlineAssigneePicker missing
ARIA (`9abd563`), sync_d1_push reading wrong task_key_link column (PB commit
`aaaaecdc`).

**Next-steps roadmap** (Tiers A-E with scope + time estimates) is maintained in
the checklist's "Next-steps roadmap" section. A session opening this cold can
pick any tier and ship it.

## Test Results (2026-04-15, post-Everything Sprint v2)

**213+ inspection passed, 0 failed, 1 skipped. All 14 pages load with 0 console errors.**

| Suite | Config | Status |
|-------|--------|--------|
| inspection.spec.ts | playwright.config.prod.ts | 213+ passed (post-sprint, all 6 regressions fixed) |
| data-validation.spec.ts | playwright.config.local.ts (Miniflare) | 5/5 passed |
| dogfood-phase0.spec.ts | playwright.config.dogfood.ts | 14/14 page health, 0 console errors |

**Testing infrastructure:** Miniflare local harness replaces X-Test-Mode (which routed to empty DB_TEST). `npm run test:local` boots wrangler dev + runs local specs. `npm run test:prod` runs smoke + inspection against prod. See `TESTING.md`.

### Known Issues
| # | Issue | Severity | Notes |
|---|-------|----------|-------|
| 1 | Project slugs with parentheses break routing | LOW | e.g. `(mceachron)-...`; test skips these |
| 2 | Subtasks, ideas, decisions are Hub-only | BY DESIGN | No brain.db sync needed |

### Sync Pipeline Field Coverage (all bidirectional)
| Field | brain.db | D1 | Push | Pull |
|-------|----------|-----|------|------|
| Title | `name` | `title` | yes | yes |
| Notes | `notes` | `description` | yes | yes (create) |
| Due date | `due_date` | `due_date` | yes | yes |
| Status | `status`+`completed` | `status`+`completed` | yes (smart null) | yes |
| Priority | `priority` | `priority` | yes (priority > effort > null) | yes |
| Assignee | `assignee` | `assignee` | yes | yes |
| Key links | `task_key_link_*` | `key_link_*` | yes | yes |
| Project | `project_id` (recXXX) | `project_id` (slug) | yes (slug map) | yes (reverse map) |

### D1 Schema Versions Applied
v1-v16 (original), v18 (handoffs), v21 (decision_log, project_dependencies, task_subtasks), v22 (lab_questions/answers column renames)

## Architecture Notes

### Mutations (src/hooks/mutations/)
71 mutations split into 9 domain files. `useMutations.ts` re-exports everything — no import changes needed.
- `useTaskMutations.ts` (5), `useSubtaskMutations.ts` (3), `useProjectMutations.ts` (6), `useMeetingMutations.ts` (4), `useDecisionMutations.ts` (3), `useIdeaMutations.ts` (3), `usePBMutations.ts` (13), `useOtherMutations.ts` (34)

### Testing
- **Playwright** (E2E): 546 tests, 4 suites. `reducedMotion: 'reduce'` in config.
- **Vitest** (component): Browser mode with Playwright provider. `vitest.config.ts`.
- **data-testid**: 28 attributes on key interactive elements. Use in tests over CSS selectors.

### When to Use Playwright MCP vs CLI (token budget)

**Use Playwright CLI** (default — cheap, fast):
- Running test suites: `npx playwright test tests/...`
- Batch test runs: `bash scripts/run-tests.sh all`
- Any run where you just need pass/fail counts

**Use Playwright MCP** (expensive — real browser control, burns tokens on snapshots):
- Debugging a SPECIFIC failing test that you can't figure out from the error message
- Investigating what the page actually looks like (DOM structure, visibility)
- Testing a fix interactively before committing
- When you need to inspect the accessibility tree or console errors live

**Rule of thumb:** Run tests via CLI first. If a test fails and the error context isn't enough, THEN use the MCP to navigate to that page and inspect. Never use the MCP for batch test runs — a single `browser_snapshot` call returns the full accessibility tree which costs ~2K tokens.

### API Field Protection
Update handlers protect required fields from null:
- Tasks: `status`, `priority`, `assignee` — can never be null
- Projects: `status`, `stage`, `category` — can never be null

### Removed Features
- **CV Page** (`/team/:slug/cv`): Cut 2026-04-09. PB cv-export skill handles Nick's CV.

## Session Notes
<!-- COO writes session updates here. Synced by SessionEnd hook or Start Day backup. -->

