# MN-CCORE Lab Hub -- Claude Operating Guide

## 🚨 First read on every session — in this order

Before writing any code or answering any question about this project, read:

1. **`SESSION-HANDOFF.md`** — current gate state, what-to-do-first, git HEADs, gotchas. One-page. Always.
2. **`PROJECT.md`** — frontmatter has canonical `next_action` + `primary_folder`.
3. **`LAUNCH-CHECKLIST.md`** — historical record of launch prerequisites + verification runbook. All prereqs shipped 2026-04-21; re-read if revisiting auth config, CF Access policies, or digest email setup.
4. **`REFERENCE.md`** — API endpoints + D1 table list when you need one.
5. **`CHANGELOG.md`** — top entry = most recent phase; jump here when asked "what changed."
6. **`docs/OBSERVABILITY.md`** — `/api/health` runbook.

These six plus this file are authoritative. Historical material lives
in `docs/archived/` (and PB-side `Projects/mn-ccore-lab-hub/_archived/`) —
safe to ignore unless explicitly spelunking history.

## Current state (2026-04-23 late evening)

- **🎉 LIVE FOR THE TEAM as of 2026-04-21.** CF Access gates `mn-ccore-lab.pages.dev/portal/*` with policies `UMN Team` (@umn.edu), `Nick Only` (nicholas.ingraham@gmail.com), `Audit Service Token`. All 4 server secrets set. JWT signature verification active. Client-side `VITE_REQUIRE_AUTH=1` in `.env.production`. See CHANGELOG.md Phase 37.
- **GH bug sweep + Overview refocus + Slack-parity (2026-04-23 late evening).** 7 bugs closed (#26-#27, #29-#33), 5 deploy rounds, 30+ commits. Highlights: (1) **Revisions** project-stage (cross-repo w/ brain.db, 8 canonical values, blue-purple `#5b4fa8`); (2) **ProjectDetail Overview refocus** — killed Project Timeline, new 2-col landing card (Open Tasks left always visible + `+ Add task`, Key Links + Recent Activity right, Quick compose bottom); (3) **Notes/Comments restructure** — Overview | Tasks | Notes | Comments | Files | Activity | Revisions | Literature (8 tabs, matches TaskDetailPanel shape); (4) **MyTasks TodayHero** — 2-col Overdue | Due Today above Focus Next; (5) **CreateTaskModal + GlobalQuickAdd** default assignee via `emailToSlug(user.email)`, plain `<select>` → `InlineAssigneePicker`; (6) **Legacy-slug root-cause fix** — `hub_payload.py` canonicalizes assignee on outbound sync (brain.db 532 `nick` → `nick-ingraham`), Hub read-side bandaid reverted; (7) **Unified search 14 entity types** (was 6) — notes / task-notes / task-comments / decisions / files / action-items / publications / grants added; (8) **Files tab** on ProjectDetail (`FileUpload` reused at `entity_type='project'`); (9) **Live presence** — `usePresence()` hook broadcasts 15s pings on hub-realtime `mnccore` WS room, `<PresenceAvatars>` avatar stack + green live dot wired into ProjectDetail header.
- **Whole-hub /simplify sweep (2026-04-23 evening).** Two parallel agents merged into main: **-5,353 lines net, 22 files deleted, 24 commits**. Pruned 17 unused mutation hooks + 18 `lib/api.ts` fetch helpers + 22 dead components (all 0-caller verified). Perf: AuthContext + UndoToast context memo, `env.DB.batch()` @mention inserts, `/api/digest?with_relevance=true` N+1 fix (20→1), cached `isProductionVisible` localStorage read. Dropped `tailwindcss-motion` + `@tiptap/extension-mention`. Build + inspection 149/2/0 green.
- **Audit r7 + GH-issue sweep (2026-04-23).** Massive-audit B-visual contrast **37 → 0 violations** across 204 page×viewport×theme combos (six iteration rounds). Closed 14 in-app GH bug reports (#8, #10, #14-22, #23, #24, #25). New CSS tokens: `--stage-fill-*` family (theme-agnostic dark fills), `--gold-on-emphasis` (gold text on gold pills). `--ink-hint` light bumped 0.62→0.68. Transform-only mount animations across `animations.ts`, `.fade-in-up`, PageTooltip, Deadlines/MenteeMilestones/DeadlineCascadePage. Bulk reassigned 602 tasks → `nick-ingraham`. CLIFMap rewritten as regional card grid. Rule 16 superseded (TaskGridView minHeight removed).
- **Phase 37 shipped — portal URL migration.** All 27 gated routes now live under `/portal/*`. `src/constants/paths.ts` + `tests/helpers/paths.ts` are single source of truth. Legacy root paths redirect via `<Navigate>` shims.
- **Round-2 design shipped + schema-drift CI now useful.** Claude Design's round-2 review (43 tickets) shipped across three deploys (`ff7b766a` → `36e0ca34` → `cfc00ab0`). Schema-drift CI reconciled via v48 (27 indexes) + v49 (13 tables + 2 unique indexes + 9 columns).
- **Phase 36d shipped.** Design sprint — 12 reusable brand primitives + cinematic Pulse Kiosk rewrite + per-route OG share cards + capture infrastructure for Claude Design. Plus Phase 36c audit fixes, Phase 36b slug rename, Phase 36 consultant close-out.
- **Quality gate: 🟢 GREEN.** Massive-audit B-visual 204/204 PASS / 0 BUGS (r7), inspection 149/149 post-simplify (was 213 pre-simplify — drop reflects deleted features wired into tests, not regressions), deep-audit 14/14 (0 bugs), axe 29 pages × 2 schemes (0 findings), mobile smoke 2/2, desktop journey 1/1, `/api/health` ~74ms.
- **Team slugs:** all 19 members use `preferred_name-last_name` format (`nick-ingraham`, `emma-bromley`, ...). `actorSlug(email)` in `api/helpers.ts` maps email prefix → canonical slug via `EMAIL_PREFIX_TO_SLUG`. Adding a new team member = D1 row + team.ts entry + LUT entry. All 602 tasks currently assigned to `nick-ingraham` (r7 bulk reassign).
- **Routing:** all gated routes under `/portal/*` (Phase 37). `/portal/team/:slug` keeps logged-in users in portal chrome; `/team/:slug` stays for the public marketing site. Sidebar avatar routes to `/portal/my-items` (workspace) not team profile. Use `PATHS` constant from `src/constants/paths.ts` in any new internal nav.
- **Brand primitives** live in `src/components/` — use them instead of rolling your own: `HeartbeatLine` / `HeartbeatDivider` (the lab's ECG motif), `HermesMark` (AI assistant avatar, replaces lucide Sparkles), `CategoryIcon` (lungs/flask/heartbeat/cap for CLIF/Lab/Nate/Mentee), `EmptyStateArt` (8 illustrations), `PhaseReleaseBanner` (what-shipped card), `RequireAuth` (sign-in splash).
- **Current HEAD:** `2ef6cc4` on `main`, pushed (GH bug sweep + Overview refocus + Slack-parity round).
- **Current deploy:** `d76a60a0.mn-ccore-lab.pages.dev`.
- **Claude Design round-3 handoff packaged (2026-04-23 late evening).** Brief at `docs/design-briefs/2026-04-23-first-landing-utility.md`. Captures at `review/post-track-a-2026-04-23/` (174 PNGs + 30 WebM = 204 artifacts). Awaiting CD ticket list.

## Vision

The MN-CCORE Lab Hub is the **team's operating surface** -- where research gets managed, meetings get run, and information flows between Nick's CLI system and every team member's browser.

## Quick Reference

| Thing | Value |
|-------|-------|
| Live site | mn-ccore-lab.pages.dev (LIVE — CF Access gated via @umn.edu policy on `/portal/*`) |
| Repo | github.com/ingra107/mn-ccore-lab (720+ commits) |
| Current deploy | `d76a60a0.mn-ccore-lab.pages.dev` (2026-04-23 late evening, GH sweep + Overview refocus + Slack-parity; HEAD `2ef6cc4`) |
| Quality gate | 🟢 GREEN — massive-audit B-visual 204/204 PASS / 0 BUGS (r7, pre-simplify), inspection 149/149 post-simplify, build clean, deep-audit 14/14, axe 29×2 = 0, mobile smoke 2/2, desktop journey 1/1. |
| Deploy | `cd /c/Users/ingra/mn-ccore-lab && npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab` |
| Stack | React 19 + Vite 8 + Tailwind v4 + Framer Motion 12 + TypeScript + **Hono v4.12 (API router)** |
| Testing | Playwright 1.59 (E2E, 213+ inspection + mobile smoke + desktop journey) + Vitest 4.1 (component, browser mode) |
| Data | TanStack Query v5 + Cloudflare D1 (60 tables, ~225 endpoints via Hono) + Recharts -- ALL LIVE |
| D1 database (prod) | `b8453e9b-7c5f-4029-b07d-dd89c05d00cf` (ENAM), binding: `DB`. 601 tasks, 64 projects, 19 team_members (schema v49). |
| D1 database (test) | `a30fe84d-0891-4035-9358-f7813b5f5807` (mnccore-lab-test), binding: `DB_TEST` |
| D1 tables | 60 (live count via `/api/health`; +d1_task_comments in Phase 35) |
| D1 schema versions applied to prod | v1-v44 + v45 (projects.deleted_at, Phase 36) + v46 (7 missing indexes, Phase 36c) + v47 (5 cols for Airtable funeral, 2026-04-20) + v48 (27-index reconcile, 2026-04-21) + v49 (13 tables + 2 unique indexes reconcile, 2026-04-21) |
| Schema drift CI | `.github/workflows/schema-drift.yml` — nightly 03 CT. Dumps prod sqlite_master, diffs against committed bundle. Guardrail against silent prod migrations. Requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets. |
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
| `--stage-fill-idea` | `#4b5563` (both) | — |
| `--stage-fill-data-collection` | `#0d6f68` (both) | — |
| `--stage-fill-analysis` | `#6b5420` (both) | — |
| `--stage-fill-writing` | `#a23d08` (both) | — |
| `--stage-fill-review` | `#8a1f2e` (both) | — |
| `--stage-fill-submitted` | `#0d6f68` (both) | — |
| `--stage-fill-published` | `#066e2f` (both) | — |
| `--gold-on-emphasis` | `#5a4518` | `#dcb355` |

- `--teal-solid` + `--maroon-solid` are for solid button/badge bg where
  white text sits on top (6-7:1 with #fff). Separate token from `--teal`
  because a button bg has opposite contrast needs than same-color text.
- `--stage-fill-*` tokens are for ANY bar/pill/button fill where white
  text sits on top and the color should not flip between themes.
  `--slate`/`--teal`/`--gold` flip to LIGHT dark-mode variants where
  `#fff` text fails ~2:1. r7 2026-04-22.
- `--gold-on-emphasis` — gold text on `--gold-emphasis` pill. `--gold`
  light (`#6b5420`) on `#efebdf` = 4.25:1 fail; pinned to darker `#5a4518`
  (5.8:1). Used on streak badges etc. r7 2026-04-22.
- Sidebar-bg: `color-mix(in oklch, var(--cream), black 12%)` — pulse bg:
  `var(--ink)` (inverts between modes).
- Category dots: 6px, 0.7 opacity — maroon=CLIF, teal=Lab, gold=Mesfin

### Opacity policy (dark mode AA on near-black bg)

Inline `opacity: 0.30-0.55` on slate/teal/maroon/gold text fails AA with
our hex-pinned colors. Codemod run 2026-04-18 bumped 640+ sites to 0.85.
Use 0.85 as the floor for secondary text; reserve 0.55-0.70 for decorative
(borders, inactive dots). Never go below 0.30 on readable text.

### Opacity policy (light mode AA on white card bg)

`--ink-label` light = 0.70, `--ink-hint` light = 0.68 (bumped from 0.62
2026-04-23 after r7 audit — 0.62 × slate on white = 4.35:1 fail).
`--muted` light = `#5a6370` (bumped from `#6b7280` 2026-04-22 — 4.2:1 on
grey panels was edge failure). Avoid `opacity <= 0.70` on slate text
when the bg is white or near-white; prefer `color: var(--muted)` which
passes AA without opacity math.

### Compound-opacity is forbidden

Parent `opacity` multiplies with children. A card with `opacity: 0.85`
(for "read" or "done" visual state) + a child green/maroon span with
`--ink-label` (0.70) compounds to effective alpha 0.595, dropping
contrast below AA. Never dim a whole card for state — use
`borderLeft: transparent`, strikethrough, or `color: var(--muted)` on
the title. See CLAUDE.md Rule 43.

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
- **Auth:** LIVE 2026-04-21. Cloudflare Access gates `mn-ccore-lab.pages.dev/portal/*` (single destination). JWT signature verification via JWKS lives in `api/jwt-verify.ts` — `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` are set in prod so verification is active (no longer decode-only). `REQUIRE_AUTH=1` + `VITE_REQUIRE_AUTH=1` both active. `/api/*` is NOT gated by CF Access (auth via X-API-Key + `REQUIRE_AUTH` + JWT server-side). `getAuthUser()` and `isPiRequest()` are `async` — any new caller must `await` them.
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
10. **Batch deploys where practical.** Workers Paid plan ($5/mo, 10M req/day) as of 2026-04-17 removes the hard free-tier deploy ceiling — multi-deploy sessions are fine when each one fixes something verifiable (post-Phase-37 bug-fix sprint ran 5 deploys in one day). Still: prefer batching unrelated edits into one deploy to reduce KV write churn + cache-miss cost on edge.
11. **`formatBrandName()`** for any text that might contain "MNCCORE".
12. **Tailwind v4:** `@import` syntax, not `@tailwind`. No `group-hover:` with arbitrary values -- use CSS rules.
13. **Build verification after batch edits.** After editing 3+ files or any shared module/type, run `npm run build` and fix all TypeScript errors before continuing. After fixing test failures, re-run the full affected test suite (`npx playwright test tests/<suite>`) to confirm zero regressions. Do not commit code that doesn't build.
14. **`--ink-bright` is WHITE in BOTH modes.** It is a white-fill-on-dark token, NOT a "stronger than ink" token. Setting it to black in light mode breaks 84 call sites. It exists for white text/icons on dark accent surfaces (teal buttons, maroon pills) regardless of page theme.
15. **Row height CSS must be `@media (min-width: 768px)` scoped.** Mobile uses `height: auto; min-height`. Unscoped fixed heights break stacked card layout on mobile.
16. **TaskGridView wrapper has NO minHeight reservation.** Short task lists no longer leave 100+ px of dead space — container sizes to content. CLS is bounded by the loading skeleton's placeholder height (skeleton → content swap is atomic). Prior rule required a stable `calc(100vh - Npx)` to avoid flip; removed 2026-04-23 (GH #23). If re-introducing a minHeight, make sure it's either larger than typical content OR only applied during loading.
17. **Data pages vs dashboard pages taxonomy.** Data pages (Tasks, MyTasks, Deadlines, Projects, Manuscripts, Ideas, Decisions, Grants, Meetings, Publications) use columnar `TableContainer` + `ColumnHeader`. Dashboard pages (Dashboard, Personal, PIAnalytics, Analytics) use card layouts. Never mix.
18. **Detail panels must subscribe to cache, not parent state.** TaskDetailPanel and any future detail panel that receives a row object as prop MUST look up fresh data from the React Query cache using `queryClient.getQueryCache().subscribe(...)`. Parent pages hold `selectedTask` as `useState<TaskRow | null>` — that snapshot goes stale after any mutation updates the `['tasks']` cache, and the panel shows old assignee/priority/status. **Reference implementation:** `src/components/tasks/TaskDetailPanel.tsx` post-GH#7 fix (commit `087ba42`). Apply the same pattern to any ProjectDetailPanel, IdeaDetailPanel, DecisionDetailPanel that takes a full row as prop.
19. **`refetchIntervalInBackground: true` on `/api/version` polling.** `useRealtimeSync` polls /api/version every 15s for cross-user realtime. React Query's default pauses polling when the tab isn't focused — which is constant for real users who park the Hub in background tabs. Without this flag, team member A edits a task and team member B doesn't see it until they refocus the tab. Deep-audit Suite 7 uncovered this. Ref: `src/hooks/useRealtimeSync.ts`.
20. **Task mutation endpoints validate assignee + project_id.** `POST /api/tasks`, `POST /api/tasks/:id`, and `POST /api/tasks/batch` action='assign' all reject unknown assignee slugs (except `claude-ai`). `project_id` on create/update is resolved (accepting id OR slug); unknown → NULL. Keeps dangling refs out of the DB. Ref: `api/routes/tasks.ts`. Pattern found via deep-audit Suite 8 + propagated to every write path.
21. **Project slug collision auto-resolves.** `handleCreateProject` loops appending `-2/-3/...` if the desired slug already exists. Two projects with the same title get distinct slugs; no silent overwrite. Ref: `api/routes/projects.ts`. Found via Suite 8.
22. **Project delete cascades.** `handleDeleteProject` clears `comments`, `project_updates`, and sets active tasks' `project_id = NULL` before removing the project row. Tasks are never orphaned with dangling refs. Ref: `api/routes/projects.ts`.
23. **All gated routes live under `/portal/*`. Public routes stay at root.** Migration 2026-04-21 (Phase 37) — single Cloudflare Access application destination (`mn-ccore-lab.pages.dev/portal/*`) gates the authenticated surface. Legacy root paths (`/dashboard`, `/projects/:slug`, etc.) redirect to their `/portal/*` equivalents via `<Navigate>` shims in `src/App.tsx` (kept indefinitely for bookmark compatibility). ALL internal navigation goes through `src/constants/paths.ts` — import `PATHS` and use `PATHS.dashboard`, `PATHS.project(slug)`, etc. Tests use `tests/helpers/paths.ts` (the `P` object with plain strings). Adding a new gated route: add under `/portal/*` in `App.tsx` + export from `paths.ts` + add to `tests/helpers/paths.ts`. Never add a new route at root unless it's a public marketing page. Public `/team/:slug` still exists for the marketing site; portal users get `/portal/team/:slug` via `useLocation`-aware navigation in MemberPage + TrajectoryPage.
24. **`actorSlug(email)` is a LUT, not a derive.** `EMAIL_PREFIX_TO_SLUG` in `api/helpers.ts` maps email-prefix → canonical team slug (post-Phase-36b rename). Adding a team member requires THREE updates in lockstep: D1 `team_members` row, `src/data/team.ts` static fallback, and `EMAIL_PREFIX_TO_SLUG` entry. Skipping the LUT means writes attribute to email-prefix instead of canonical slug.
25. **`/api/version` is edge-cached for 10s.** `Cache-Control: public, max-age=10, s-maxage=10` in `api/lib/version.ts`. Drops ~95% of polling traffic without breaking cross-tab realtime invalidation (effective latency ~25s end-to-end with 15s poll interval). Don't shorten the TTL without understanding the Workers-quota tradeoff. Don't add `Set-Cookie` to this response (would defeat the cache).
26. **JWT `importKey` is cached per `kid` at module scope.** `importedKeyCache: Map<string, CryptoKey>` in `api/jwt-verify.ts`. Don't replace with a per-request import unless you've measured the cold-start trade.
27. **Hover-only badges must be `visibility: hidden`, not just `opacity: 0`.** Phase 36c a11y fix in `TaskGridView.tsx` `.hover-badge` CSS. `opacity: 0` keeps the element in the AT tree, so screen readers announce ~120 phantom badges per /tasks visit. Apply same pattern to any future hover-revealed content.
28. **Sidebar nav links carry `aria-current="page"` on the active route.** `Sidebar.tsx` follows the same pattern `MobileTabBar.tsx:91` already uses. New navigation surfaces must set `aria-current` for screen reader navigation.
29. **Brand primitives live in `src/components/` — use them, don't reinvent.** `HeartbeatLine` + `HeartbeatDivider` for the ECG motif (the lab's visual signature). `HermesMark` for ANY AI-assistant surface — icon variant for badges, avatar variant for peer avatars. `CategoryIcon` for project-category indicators (lungs / flask / heartbeat / cap). `EmptyStateArt` for empty-state slots. `PhaseReleaseBanner` for shipped-announcement moments. Passing `slug='claude-ai'` to `Avatar` auto-swaps to HermesMark. Never use a generic lucide `<Sparkles />` for Hermes or a 6px colored dot for categories — the primitives carry the brand.
30. **`/api/bug-report` gates on `REQUIRE_AUTH=1`, not a standalone check.** Before Phase 36d the endpoint always required auth, which locked Nick out pre-launch because CF Access wasn't configured. Fix: bug-report now piggybacks on the same `REQUIRE_AUTH` flag that gates writes. Don't add a separate auth check here.
31. **Per-route OG share cards at `/og/<type>/<slug>`.** `functions/og/[type]/[slug].ts` generates SVG cards from D1 for project / team / meeting / default. `public/_headers` forces `image/svg+xml` (Pages was auto-coercing to `text/html` pre-fix). Set `ogImage: '/og/project/<slug>'` when calling `usePageMeta()` on any page that should have a branded share preview. Cached 1h at the edge.
32. **Pulse Kiosk (`src/pages/Pulse.tsx`) hex-pins its colors deliberately.** Kiosk renders without the `.dark` class so `var(--ink)` would resolve to the blue-tinted light value. Hex-pinned (`#0b1017`, `#f5efe2`, `#dcb355`, `#5cbcb4`, `#f0737e`) matches the design-ethos deep-neutral and stays axe-stable. Don't "fix" these to CSS vars.
33. **Capture specs for Claude Design — run on demand via `scripts/regen-design-bundle.sh`.** Six specs now, seven pipeline steps, ~25 min end-to-end. Output to `review/claude-design-*` / `review/interactions-*` (gitignored). Don't add to default test run — only useful when building design assets.

    **Specs (all wired into `playwright.config.design-capture.ts`):**
    - `capture-for-design.spec.ts` — 41 hero surfaces desktop + 6 mobile, full-page + scroll-through for lazy-load.
    - `capture-focus-asks.spec.ts` — round-specific spot captures (Quick Add, task-row focus outline, inline ▾ density).
    - `capture-scroll-chunks.spec.ts` — 12 long pages broken into viewport-sized chunks so designer can review 900px bands instead of one fullPage blob.
    - `capture-theme-light.spec.ts` — 8 key pages via `test.use({ colorScheme: 'light' })`; dark/light side-by-side review.
    - `capture-rich-states.spec.ts` — Network WebGL multi-state, 6 modals, Publications carousel, Dashboard customize.
    - `capture-interactions.spec.ts` — 15 signature interactions as WebM (converted to MP4 + GIF via ffmpeg) + PNG keyframes.

    **Post-launch auth workarounds (required after 2026-04-21 launch):**
    - **CF Access gates prod `/portal/*`.** Pass an ungated preview deploy via `BASE_URL=https://<hash>.mn-ccore-lab.pages.dev bash scripts/regen-design-bundle.sh <name>`. The script plumbs this through as `CAPTURE_BASE_URL` on all specs.
    - **`VITE_REQUIRE_AUTH=1` shows a branded sign-in splash.** Every spec calls `injectFakeAuth(context, BASE)` (from `tests/helpers/capture-auth.ts`) in a `test.beforeEach` to set a fake `CF_Authorization` JWT cookie. `useAuth` decodes client-side only (no signature verify), so this flips `isAuthenticated` → true. Backend writes stay gated by real JWKS verify in `api/jwt-verify.ts`; captures are read-only so that's fine.
    - Without both, every `/portal/*` capture is either a Google Sign-in page (CF Access) or a `RequireAuth` splash (app).

    **Known flakes (non-blocking — keyframes still capture):** `01-status-change-undo` (dropdown option-click race), `08-date-picker` (cell click doesn't always open picker). Leave for now; the interactions themselves work in the product.

    **Video copy is a fallback block in `regen-design-bundle.sh`, NOT the spec's `afterEach`.** Playwright videos finalize after `context.close()`, so `testInfo.attachments` is often empty when `afterEach` runs. Script reads `test-results/capture-interactions-*/video.webm` by numeric prefix post-run.
34. **Email prefix → slug via `emailToSlug`, never raw `split('@')[0]`.** `src/lib/emailSlug.ts` exports `emailToSlug(email)` backed by the `EMAIL_PREFIX_TO_SLUG` LUT — the client-side mirror of the same-named map in `api/helpers.ts`. Deriving a team slug by slicing the email prefix is a class bug: `ingra107@umn.edu → ingra107`, but the canonical slug is `nick-ingraham`. Every site that turns an email into a slug (profile links, MyTasks filter, dashboard card filters, notification routing, CommandPalette "my tasks" toggle) must route through `emailToSlug`. Adding a new team member requires updating the LUT on BOTH sides in lockstep.
35. **UI stage labels are 6; API canonical is 7. Map on submit via `toApiStage()`.** `src/lib/stageNormalize.ts` owns both directions. Display paths call `normalizeStage()` to fold API values back to UI labels; submit paths call `toApiStage()` to map `'Analysis' → 'Data Analysis'` and `'Review' → 'Submitted'` before hitting the API. The API's `PROJECT_STAGE_VALUES` guard rejects non-canonical values with 400, which in an optimistic-update flow manifests as a silent revert (state flips then snaps back onError). Four call sites are wired: ProjectDetail stage strip click+confirm, ProjectDetail inline stage select, Projects list inline selects (2x). Don't bypass the mapper on any new stage mutation path.
36. **`getAuthUser()` reads JWT from either the header OR the `CF_Authorization` cookie.** `api/helpers.ts` tries `Cf-Access-Jwt-Assertion` header first, then falls back to the `CF_Authorization` cookie. The header is only set by CF Access on proxied requests — and CF Access is scoped to `/portal/*` only, so `/api/*` requests bypass the proxy and never get the header. The cookie is sent by the browser on all same-domain requests regardless of proxy scope. Without the cookie fallback every authed POST from the browser (bug-report, project edits, task mutations) would 401. Keep BOTH paths working when modifying auth flow.
37. **Google Fonts `<link>` tags need `crossorigin="anonymous"`.** `index.html` preconnect + preload + stylesheet refs to `fonts.googleapis.com` all carry `crossorigin="anonymous"`. Without it, axe-core's contrast checker fetch()es the cross-origin stylesheet and trips CORS preflight — 3 console errors per page in every audit run. Real users never see it (browsers load stylesheets in no-cors mode), but audit signal-to-noise tanks. Same rule applies to any new cross-origin stylesheet.
38. **Every `<select>` must have `aria-label` or a matching `<label htmlFor>`/`<select id>` pair.** Bare `<select>` adjacent to a bare `<label>` trips axe `select-name` critical. Class sweep 2026-04-22 found 13 unlabeled selects across MenteeMilestones, SessionHistory, Meetings, CreateProjectModal, CreateDecisionModal, AskTheLab, MeetingNotesPage, Grants — all fixed with `id`/`htmlFor` pairing. Same applies to new form selects going forward. (FilterChip.tsx was deleted 2026-04-23.)
39. **`role="switch"` with `aria-checked` must use string `"true"`/`"false"`, not boolean.** React normally coerces booleans to the right attribute value, but axe-core `aria-valid-attr-value` flags `aria-checked={showDebugItems}` where `showDebugItems` is a JS boolean. Fix: `aria-checked={showDebugItems ? "true" : "false"}`. `aria-expanded`/`aria-pressed` boolean bindings are fine — only `aria-checked` (on role=switch/checkbox/radio) is strict about string form.
40. **Overlap detector (`scripts/massive-audit/lib/overlap-detector.ts`) skips semantic landmarks.** `<nav>`/`<header>`/`<aside>` tags + `role="navigation|banner|complementary"` are treated as chrome — they legitimately overlay content, so intersection with page content never counts as a bug. Don't remove the tag-based filter; without it MobileTabBar spams a fake overlap hit on every mobile page.
41. **Stage-bar fills use `--stage-fill-*` tokens, not `--slate/--teal/--gold`.** The accent tokens flip to LIGHT dark-mode variants (`--teal` dark = `#5cbcb4`, `--gold` dark = `#dcb355`, `--slate` dark = `#b0b5b9`), so `#fff` text on those fails ~2:1 in dark mode. Use `--stage-fill-{idea,data-collection,analysis,writing,review,submitted,published}` — dark hex values stable across themes, 5.4-7.5:1 with white. Applies to AnalyticsPage + PIAnalytics stage bars, member workload bars, Dashboard active tab, Meetings save/filter/view buttons. r7 2026-04-22.
42. **Gold pill bg + gold text uses `--gold-on-emphasis`, not `--gold`.** `--gold-emphasis` (rgba 201,168,76,0.15) resolves to `#efebdf` in light, `#2a2618` in dark. `--gold` light (`#6b5420`) on `#efebdf` = 4.25:1 fail. `--gold-on-emphasis` pins to `#5a4518` light / `#dcb355` dark for AA on both. Used on MyTasks streak badge + any future gold-on-gold pill.
43. **Parent `opacity` on a card multiplies with child colored spans.** A card wrapper with `opacity: 0.85` (e.g. "read" or "done" visual) + a green/maroon/gold child span with its own opacity compounds to fail AA (0.85 × 0.70 = 0.595 effective alpha → ratio ~3.3:1). Don't dim whole cards for state. Use `borderLeft: transparent` / strikethrough / `color: var(--muted)` on the title instead. Fixed across `MetricCard`, `Deadlines` stat row, `DecisionsPage` stat row, `MyItems` NotificationCard + CommitmentCard (r7 2026-04-22).
44. **Mount animations must use transform-only, not opacity: 0 → 1.** Axe-core's contrast checker catches elements mid-transition and reports false-positive contrast fails. `staggerItem.hidden` (`animations.ts`), `.fade-in-up.will-animate` CSS, PageTooltip AnimatePresence, and several Deadlines / MenteeMilestones / DeadlineCascadePage motion.div variants all animate via `y` / `scale` only now. CLAUDE.md Rule 1 ("content visible by default") applies to animation entry states too.
45. **Dropdowns use fully-opaque bg, not semi-transparent + backdrop-filter.** 98%/95% opacity + `backdrop-filter: blur(Npx)` looks clean against uniform bg, but when a page has a dark header band behind the dropdown, the band bleeds through as a horizontal shadow. Use `#ffffff` / `#0f1923` (full opaque) with `box-shadow` for depth. Ref: Research dropdown fix (Layout.tsx, GH #17).
46. **Flex-col pages with canvas children need `height: 100vh`, not `minHeight: 100vh`.** `minHeight` lets the container match content height, which doesn't give `flex-1` children a determined size to stretch into. Canvas elements (reagraph GraphCanvas, three.js, etc.) fall back to their intrinsic 300×150. Use `height: 100vh` when the intent is "fill the viewport". Ref: Network.tsx fix (GH #16).
47. **URL classification + linkification go through shared util.** `src/lib/urlClassify.ts` exports `classifyUrl(url)` + `shortLabelForUrl(url)`. `src/components/LinkifiedText.tsx` consumes them for auto-linkify in description/note content; `src/components/KeyLinksEditor.tsx` consumes for the project Key Links editor. Don't duplicate the classification regex — one truth. For non-http links (folder / `.bat` script), the rewritten `href` is `mnccore://open/<path>` which no Windows handler resolves by default; the click handler also copies the raw path to clipboard + shows toast as the reliable fallback.
48. **Legacy slug canonicalization belongs at the write path, not the read path.** brain.db's `scripts/db/sync/hub_payload.py` imports `canonicalize_team_slug()` from `scripts/db/enums.py` (PB-side) and applies at every outbound assignee write. The Hub's `src/lib/emailSlug.ts` does NOT re-canonicalize on reads. Rationale (PI 2026-04-23): "read-side bandaid masks write-side leaks and hides future drift." If `nick` ever appears in D1 again, `getPersonInfo('nick')` returns `{name: 'nick'}` literally — visible signal that sync broke. Keep the asymmetry.
49. **Presence is entity-scoped but WS-room-global.** `src/hooks/usePresence(entityType, entityId)` subscribes to the single shared `mnccore` WS room (hub-realtime Durable Object) and filters incoming messages by `{entityType, entityId}` client-side. 15s heartbeat ping + 45s staleness. Don't shard rooms per entity — keeps DO cost flat and cross-entity broadcast (Nick's global notifications) still works. Small team (~20) makes the broadcast-to-all overhead trivial. `<PresenceAvatars>` renders nothing when peer list empty, so there's no "0 viewing" noise. Extend to new entities by dropping `<PresenceAvatars slugs={usePresence(type, id)} />` next to the header — hook is entity-agnostic.
50. **Landing cards use 2-col grid for action density.** ProjectDetail Overview's inline landing card (`src/pages/ProjectDetail.tsx`) is a `grid grid-cols-1 md:grid-cols-3`: left `md:col-span-2` = primary action (Open Tasks ALWAYS visible with `+ Add task` CTA), right `md:col-span-1` = Key Links + Recent Activity stacked, bottom full-width = Quick compose with top border. Pattern exists because PI 2026-04-23 called the previous single-column layout a "waste of space given its vertical." Replicate this shape for any new "detail page Overview" — actions left-primary, reference right-secondary, compose bottom.
51. **Search covers 14 entity types — extend on future entity adds.** `api/routes/search.ts` queries 14 tables in parallel: tasks, projects, meetings, ideas, project_updates (notes), task_updates (task notes), comments, task_comments, decisions (decision_log), files (file_attachments), action_items, publications, nih_grants, activity_log. Return cap 50. Each type has a `TYPE_PRIORITY` score + `recencyBoost` + `titleMatchBonus`. When adding a new entity table, (a) add a parallel SELECT with LIKE on the narrative fields, (b) add a push block with a scored result, (c) add a type entry to `TYPE_PRIORITY`, (d) extend `typeConfig` in `src/pages/portal/SearchPage.tsx` with an icon + label. Otherwise search silently misses the new surface.

## Roadmap

**Phase 37: COMPLETE** (2026-04-21). Portal URL migration — all 27 gated routes moved under `/portal/*` prefix so a single Cloudflare Access destination gates the authenticated surface. `src/constants/paths.ts` + `tests/helpers/paths.ts` single source of truth. Legacy root paths redirect via `<Navigate>` shims. Merged as `8600c32`; deployed `c5e46630`. Launch secrets set same day. See CHANGELOG.md.

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

*Pending:* ~~Schema v35 migration (recurrence + recurrence_parent_id) — planned but not yet needed. No code depends on it.~~ **Removed 2026-04-21** during schema-drift reconciliation — migration file deleted from repo since it was never applied to prod and no code depended on it.

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
- TaskPeekOverlay: Linear-style right-side panel (400px, slide-in) — *removed 2026-04-23 during /simplify sweep; was 0-caller*
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
| Duplicate project slugs in D1 | Fixed 2026-04-19: D1 is clean (0 paren slugs in prod). `POST /api/projects` now sanitizes `body.slug` server-side via `[^a-z0-9]+ → -`, so a client passing `(mceachron)-...` can't reintroduce the class. |
| MeetingDetail Rules of Hooks | useState/useMemo must come BEFORE early returns on loading/not-found branches. Phase 31.5 perf pass introduced a variant of this bug; R6 hotfixed. |
| `team_members.email` column | Added 2026-04-19 (schema-v43). Backfilled to `slug || '@umn.edu'` for existing rows. Read `email` column; fall back to the slug derivation only if NULL. Non-UMN collaborators get a real address. |
| Mobile swipe on TaskDetailPanel | `onTouchStart/Move/End` on panel div; only active below 768px. Axis-locked (disengages on vertical scroll so page still scrolls). Drag >30% panel width → onClose. Respects `prefers-reduced-motion` (instant dismiss, no transform animation). Don't add any element with its own touch handler inside the panel without re-evaluating axis lock. |
| Virtualizer skeleton rows must match actual layout | TableSkeleton component was generic; pages with virtualizers need inline skeletons that match TableContainer + header + rows at `var(--row-height)` pixel-for-pixel to avoid CLS. |
| Cloudflare Workers request cap | **On Workers Paid plan** (10M/day) as of 2026-04-17 — the old 100K/day free-tier cliff no longer applies. Hermes polling at 60s + normal team use well under cap. Parallel Playwright audits against prod are acceptable; Miniflare local (`npm run test:local`) still preferred for dev iteration. |
| FAB positioning | Use `--fab-stack-{1,2,3}` CSS vars in `:root` (R9-1). NEVER `max(24px, 72px)` — that always returns 72. Mobile override is a `<768px` media query in index.css. |
| react-grid-layout v2.x is a breaking rewrite | Stay on `1.5.3`. DashboardGrid.tsx depends on the `WidthProvider(Responsive)` HOC pattern. RGL measures container width, not window — `DASHBOARD_GRID_BREAKPOINTS` must account for the sidebar. |
| Dark mode localStorage key | `mn-ccore-theme`, NOT `theme`. Playwright tests must set the right key. |
| Playwright X-Test-Mode header | DEPRECATED — Miniflare local test harness replaces this. `X-Test-Mode: true` routes API calls to `mnccore-lab-test` (empty DB). Prior inspection passes on data-rich pages may be inflated. Phase 3 Miniflare rework removes the header from prod config. |
| `@formkit/auto-animate` import drift | Imported in `TaskGridView.tsx` but was missing from `package.json` — blocked the first build 2026-04-13. If you see `Cannot find module 'X'`, grep the imports. |
| Project status legacy values | `src/data/projects.ts` static fallbacks still use `'Active'`. `normalizeProjectStatus()` in `lib/taskConstants.ts` folds them. Don't delete the helper. |
| Grant status taxonomy | R10: 7 values in `useGrantTimeline.ts:GRANT_STATUS_OPTIONS`. Only K23 provider practice variation in mechvent is `funded`. Anything else marked `Active` is legacy — see migration SQL in `scripts/round9/r10-grants-status-migration.sql`. |
| hub-realtime WebSocket namespace | FIXED (commit `46f53c4`). Was HTTP 400 for 7 days — `routePartykitRequest` maps binding `NOTIFICATION_HUB` → namespace `notification-hub`, but PartySocket client defaulted to `main`. Fix: added `party: 'notification-hub'` to `useRealtimeSync.ts`. Source now at `workers/hub-realtime/` in this repo. WebSocket stub kept in `tests/setup/websocket-stub.ts` for local tests (Miniflare can't run the DO). |
| `npm run test:local` fails on fresh bootstrap | FIXED 2026-04-23 late evening. `schema-v43.sql` ALTER TABLE conflicts with base `schema.sql` which already declares `team_members.email`. `schema-v48-index-reconcile.sql` creates indexes on `action_items.category` / `.parent_task_id` that v49 hadn't yet added. Both are now in `FRESH_BOOTSTRAP_SKIP` in `scripts/local-db-bootstrap.ts`. Local test harness unblocked (5/5 data-validation pass). |
| Folder links silent on Windows | `mnccore://open/<path>` custom protocol has no registered Windows handler so clicks do nothing. KeyLinksEditor + LinkifiedText both copy raw path to clipboard on click + show toast "Path copied — paste in Win+R or Explorer." Protocol nav still fires fire-and-forget. Don't revert to direct `mnccore://` href — users without the handler see silent failure. |
| Legacy team slugs in brain.db | FIXED 2026-04-23 late evening. 532 `tasks.assignee='nick'` canonicalized to `nick-ingraham`. `scripts/db/sync/hub_payload.py` imports `canonicalize_team_slug()` from `scripts/db/enums.py` (PB-side) and applies at both outbound assignee sites so brain.db shorthand never leaks to D1 again. Hub read-side `canonicalSlug()` was reverted — root fix means UI renders `nick` literally if it reappears (visible drift signal, not silent fix). |
| PresenceAvatars visible when alone | By design. Peer list excludes self (partyserver broadcasts skip sender). If you want local verification, open the same ProjectDetail in two browsers as two different auth identities — each should see the other's avatar within ~15s. |

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

## Phase History (29-37 + R8/R9/R10) → see CHANGELOG.md

> **Phase-by-phase build history in `CHANGELOG.md`** to keep this file operational. Latest: **Phase 37** (2026-04-21) — Portal URL migration. All 27 gated routes under `/portal/*`. Single CF Access destination. Launch secrets set same day. **Phase 36e** — Claude Design round-1 handoff imported; 32/33 shipped. **Phase 36d** — design sprint (12 brand primitives + cinematic Pulse Kiosk + per-route OG share cards + capture infrastructure). **Phase 36c** — 4-auditor deep audit + 11 P0/P1 fixes. **Phase 36b** — slug rename. **Phase 36** — consultant close-out + mobile swipe. Earlier: 29 features, 30 visual QA, 31 token compliance, 31.5 expert polish, 32 final launch polish (10 consultant rounds), Nick-Review R8/R9/R10, 34 audit framework, 35 a11y + sync parity.
>
> **Key decisions in that history:** sidebar darker-than-content is NEVER-violate (GC-1). Framer Motion scoped to page transitions only (GC-2). Ideas + Decisions are columnar tables not cards (GC-3). Data-pages vs dashboard-pages taxonomy (GC-6). Grant + project status taxonomies locked (R10). Research Digest = Model B. Dashboard cards resizable via RGL (R9-9). Hono router declarative — no raw `url.pathname` routing (Phase 36).

**Still open:**
- ~~DI-4 duplicate projects~~ DONE Phase 36 (2026-04-19). 1 duplicate merged (`clif-pf-sf` → `pf-v-sf-oxygenation-severity`). SQL at `scripts/merge-pf-sf-duplicate.sql`.
- ~~DI-6 dangling task project_id~~ RESOLVED 2026-04-19: live D1 verified at 0 dangling rows (ran `SELECT COUNT(*) FROM tasks t WHERE t.project_id IS NOT NULL AND t.project_id NOT IN ...`).
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
| 1 | ~~Project slugs with parentheses break routing~~ | RESOLVED 2026-04-19 | D1 has 0 paren slugs; `POST /api/projects` sanitizes on create. |
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

