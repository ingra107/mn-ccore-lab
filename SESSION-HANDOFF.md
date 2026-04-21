# Session Handoff — 2026-04-21

> Last worked: **Phase 37 — Portal URL Migration shipped + CF Access
> configured + launch secrets set. Hub is LIVE for the team as of
> 2026-04-21.** All 27 gated routes now live under `/portal/*`; legacy
> root paths redirect via `<Navigate>` shims. CF Access app gates
> `mn-ccore-lab.pages.dev/portal/*` with `UMN Team` + `Nick Only` +
> `Audit Service Token` policies. Server secrets set:
> `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `REQUIRE_AUTH=1`,
> `TEST_MODE_KEY`. Client-side `VITE_REQUIRE_AUTH=1` in
> `.env.production`. GitHub Actions secrets (`CLOUDFLARE_API_TOKEN` +
> `CLOUDFLARE_ACCOUNT_ID`) set for schema-drift CI. Prior session also
> landed round-2 design (43 tickets) + schema-drift CI reconciliation
> (v48 + v49). Current HEAD `143c1db`. See CHANGELOG.md Phase 37 for
> full record.

## 📖 Session bootstrap — read these in order before writing anything

1. **This file** (you're here). Current gate, gotchas, commit, next action.
2. **`PROJECT.md`** — frontmatter `next_action` is canonical.
3. **`LAUNCH-CHECKLIST.md`** — launch work complete; only RESEND_API_KEY (optional) remains.
4. **`CLAUDE.md`** — operating guide. Design system + palette + sync model + rules.
5. **`REFERENCE.md`** — API endpoints + D1 table list.
6. **`CHANGELOG.md`** top entry — Phase 37 full record.
7. **`docs/OBSERVABILITY.md`** — `/api/health` + runbook.

## Gate — all green as of commit `143c1db` (deployed `c5e46630`)

| Check | Result |
|---|---|
| `/api/health` (live prod) | 200 ok, 601 tasks / 64 projects / 19 team / ~74ms |
| `/og/team/nick-ingraham` | 200 `image/svg+xml`, Cache-Control `max-age=3600` (per-route OG cards live) |
| `/api/version` Cache-Control | `public, max-age=10, s-maxage=10` (edge-cached) |
| `/api/pi/analytics` projectsByStage | 5 rows (was silently 0 before 'Active' fix) |
| Mobile smoke (Pixel 5) | 2/2 ✓ |
| Desktop journey | 1/1 ✓ |
| Inspection (full suite vs prod) | 213/213 (Phase 36b baseline) |
| Deep-audit (14 suites) | 14/14 clean, 0 bugs (Phase 36 baseline) |
| Axe WCAG 2.1 AA | 29 pages × 2 schemes, 0 findings (Phase 35 baseline) |

Rerun gate: `npx tsx scripts/pre-flight/00-orchestrator.ts`
Rerun axe light: `npx tsx scripts/pre-flight/persona-axe.ts --light`
Rerun deep-audits: `for f in scripts/deep-audit/0*-*.ts scripts/deep-audit/1[0-5]-*.ts; do npx tsx "$f" 2>&1 | tail -2; done`
Rerun mobile smoke: `npx playwright test --config=playwright.config.mobile.ts`
Rerun journey smoke: `npx playwright test --config=playwright.config.phase36.ts`

## What's new since the previous handoff

**Phase 37 — Portal URL Migration + launch go-live.** All 27 gated Hub
routes migrated under `/portal/*` prefix so a single Cloudflare Access
app destination (`mn-ccore-lab.pages.dev/portal/*`) gates the entire
authenticated surface. Public marketing stays at root. `src/constants/
paths.ts` is the single source of truth (`PATHS.dashboard`,
`PATHS.project(slug)`, etc.); mirrored at `tests/helpers/paths.ts`.
Legacy root paths redirect via `<Navigate>` shims in `src/App.tsx`
placed outside `RequireAuth` so bookmark bounces happen pre-auth. 14
tasks, subagent-driven; merged to `main` as `8600c32`. Prod deploy:
`c5e46630.mn-ccore-lab.pages.dev` (HEAD `143c1db`).

**Cloudflare Access configured.** App targets
`mn-ccore-lab.pages.dev/portal/*`. Policies: `UMN Team` (allow
@umn.edu), `Nick Only` (allow nicholas.ingraham@gmail.com), `Audit
Service Token` (service auth for `scripts/hub-audit.ts`). Public
routes (`/`, `/team`, `/publications*`, etc.) remain open. `/api/*` is
NOT gated by CF Access — X-API-Key + server-side `REQUIRE_AUTH` + JWT
verify handle API auth.

**Launch secrets set** (Cloudflare Pages):
`CF_ACCESS_TEAM_DOMAIN=peripheral-brain.cloudflareaccess.com`,
`CF_ACCESS_AUD=47b7d48e...40139c`, `REQUIRE_AUTH=1`,
`TEST_MODE_KEY=<32-char hex>`. JWT signature verification is now
active (no longer decode-only). Client-side `VITE_REQUIRE_AUTH=1` in
`.env.production` — unauthenticated users see branded RequireAuth
splash. **GitHub Actions** secrets set for schema-drift CI:
`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`. **Audit Service
Token** active (`mn-ccore-lab-audit`) — local env vars
`HUB_TEST_MODE_KEY`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`
set on both work + home machines.

**Phase 36e — Claude Design handoff (round 1 + round 2 complete).**
Nick ran the Hub through Claude Design against HEAD `ef604db`; it
returned 33 tickets in round 1, then 43 more in round 2. 32/33 round-1
tickets shipped (P2-14 Post-Award Milestones is a data-entry ask).
43/43 round-2 tickets shipped across `ff7b766a` → `36e0ca34` →
`cfc00ab0`. Bundle still at `docs/design-handoff-2026-04-20/`.

**Phase 36d — design sprint.** 12 brand-level improvements shipped in
one session after reviewing Anthropic's new Claude Design product
(launched 2026-04-17). Added reusable primitives for the Hub's visual
identity: `HeartbeatLine` (animated ECG trace as the brand signature),
`HeartbeatDivider`, `HermesMark` (Mercury alchemical glyph for the AI
assistant), `CategoryIcon` (lungs / flask / heartbeat / cap — one per
category), `EmptyStateArt` (8 lab-aesthetic line illustrations),
`PhaseReleaseBanner` (what-shipped card), `RequireAuth` (branded sign-
in splash, extracted from App.tsx). Rewrote `Pulse.tsx` as a cinematic
6-scene kiosk with Ken Burns zooms + ambient heartbeat. New
`functions/og/[type]/[slug].ts` Cloudflare Function generates per-
route SVG OG share cards for project / team / meeting routes (edge-
cached 1h via `public/_headers`). Hermes peer-avatar swapped into
`Avatar` via `slug='claude-ai'`; generated geometric portraits replace
plain colored initials for members without photos. Mobile top bar
shows the 28×28 brand mark.

**Plus:** hotfix for `/api/bug-report` so it no longer returns 401
pre-launch (gate now piggybacks on `REQUIRE_AUTH=1`, auto-engages at
team launch).

**Capture infrastructure for Claude Design** (all gitignored output):
- `scripts/claude-design-brief.txt` — brand brief (tokens, motif path,
  ethos, voice). Paste into Claude Design to set up the design system.
- `tests/capture-for-design.spec.ts` +
  `playwright.config.design-capture.ts` — full-page screenshots, pre-
  scrolls every page to trigger lazy loads. Run:
  `CAPTURE_DEVICE=desktop npx playwright test --config=playwright.config.design-capture.ts --project=desktop`
- `tests/capture-interactions.spec.ts` +
  `playwright.config.interactions-capture.ts` — 15 signature
  interactions as WebM video + PNG keyframe triplets. Ready for when
  we want real-time demos for Claude Design. Run:
  `npx playwright test --config=playwright.config.interactions-capture.ts`

**Phase 36c — 4-auditor deep audit + 11 P0/P1 fixes.** `/portal/team/:slug`
routing (logged-in users keep portal chrome), mobile tab-bar buffer,
schema-v46 indexes, `/api/version` edge-cache, JWT `importKey` cache,
TaskDetailPanel focus trap + opener restore, `.hover-badge` a11y,
sidebar `aria-current`, PageTooltip overflow, welcome banner auto-
stale, dead code + lazy bundle, `pi-dashboard` 'Active' bug, slug
cleanup, test_delete_* residue.

**Phase 36b** — team slug rename. All 19 members → `preferred_name-last_name`.
2,312 D1 row updates + 239 code replacements + brain.db side updates +
EMAIL_PREFIX_TO_SLUG LUT in `api/helpers.ts`. Nick's real UMN address
(`ingra107@umn.edu`) replaced wrong guesses (`ningraha@`, `sandb029@`)
in PI allowlist.

**Phase 36c** — 4-auditor deep audit (UX / code / a11y / data). 11 P0+P1
fixes shipped in one sprint:

- Routing: `/portal/team/:slug` keeps logged-in users in portal chrome
  (clicking a teammate dropped them into public marketing site since
  2026-03-24).
- Mobile: tab-bar buffer 1rem→3rem so calendar/project-detail bottom rows
  clear the bar.
- Data: 13 leftover Phase 36b old slugs cleaned. ~160 `test_delete_*`
  rows wiped from 6 tables that lack soft-delete.
- D1 perf: schema-v46 added 7 missing indexes (50-200ms drop on hot
  endpoints).
- Server perf: `/api/version` edge-cached (10s) — drops ~95% polling
  traffic. JWT `importKey` cached per kid — saves 5-15ms per auth.
- Code bug: `pi-dashboard.ts` filtered `status='Active'` (caps) —
  silently empty post-R10. Fixed.
- A11y: TaskDetailPanel focus trap re-queries focusables per Tab + snaps
  back when async-mounted regions leak focus + restores opener focus on
  close. `.hover-badge` now `visibility: hidden` (no phantom SR
  announcements). Sidebar links get `aria-current="page"`.
- UX: PageTooltip `nowrap` removed → max-width clamp. WelcomeBanner
  auto-stales after 7 days.
- Bundle: dead `EnhancedCollaborationNetwork.tsx` (654 lines) deleted.
  TaskBoard/StandUp/Timeline views lazy-loaded in Tasks + MyTasks.
- Render: `CalculationsRow` runs single pass via `useMemo`.

## What to do FIRST in the next session

**The Hub is live. The big open work is done.** Design handoffs
(round 1 + round 2) are shipped. CF Access is configured. Portal URL
migration is deployed. All launch secrets are set. The only
outstanding *blocker* is that Nick still needs to share the URL with
the team — that's a Nick action, not a code action.

**If Nick wants to actually tell the team:** send an email/slack
announcing `mn-ccore-lab.pages.dev` + the sign-in flow. First-time
visitors to `/portal/*` will hit CF Access → @umn.edu login. Public
marketing pages (`/`, `/team`, `/publications*`) stay open.

**Small optional follow-ups, in roughly decreasing order of value:**

1. **RESEND_API_KEY** (optional, postponable indefinitely). Signing up
   at [resend.com](https://resend.com) + adding `RESEND_API_KEY` to
   Cloudflare Pages env vars activates the daily coordinator email
   digest cron (`api/routes/digest-email.ts`). Without it the preview
   endpoint `/api/digest-preview?member=nick` still works.
2. **Post-launch monitoring.** Watch `/api/health` + schema-drift CI.
   External uptime monitor is wired but optional (see
   `docs/OBSERVABILITY.md`).
3. **Round-1 P2-14 — Post-Award Milestones populated state.** Data-
   entry ask: seed `grant_milestones` rows for Funded grants. Not a
   code task.
4. **30-90 days post-launch:** evaluate dropping the legacy root-path
   redirect shims in `src/App.tsx` once analytics confirm no traffic
   on legacy paths. Remove `LEGACY_REDIRECTS` from `paths.ts`.

**If Nick reports a bug** → reproduce with a deep-audit suite before
fixing (`scripts/deep-audit/*.ts`).

**If Nick wants to use Claude Design for more assets** (pitch deck,
poster, one-pager) — brief at `scripts/claude-design-brief.txt`; 31
fresh page screenshots at `review/claude-design-20260420/`
(gitignored, regen via capture config); 15 signature interactions
ready to capture via `tests/capture-interactions.spec.ts` when
needed.

## Things that WILL surprise you if you don't know

- **All gated routes now live under `/portal/*`.** `src/constants/
  paths.ts` (+ `tests/helpers/paths.ts` mirror for tests) is the single
  source of truth. Internal nav uses `PATHS.dashboard`,
  `PATHS.project(slug)`, etc. Legacy root paths (`/dashboard`,
  `/projects/:slug`, ...) redirect via `<Navigate>` shims in
  `src/App.tsx` placed outside `RequireAuth` so bookmark bounces
  happen pre-auth. Don't add new gated routes at root — always
  `/portal/<path>` and extend `paths.ts`.
- **CF Access gates `/portal/*` only.** Public marketing (`/`,
  `/team`, `/publications*`, etc.) remains open. `/api/*` is NOT gated
  by CF Access — auth is enforced server-side via X-API-Key + JWT
  verify + `REQUIRE_AUTH=1`.
- **JWT signature verification is ACTIVE.** `CF_ACCESS_TEAM_DOMAIN` +
  `CF_ACCESS_AUD` are set in prod, so `api/jwt-verify.ts` validates
  CF Access JWTs against JWKS. No longer decode-only.
- **`REQUIRE_AUTH=1` and `VITE_REQUIRE_AUTH=1` are BOTH ACTIVE.**
  Server rejects unauth POST/PUT with 401; client shows branded
  `RequireAuth` splash for unauthenticated users on `/portal/*`.
- **Brand primitives live in `src/components/` — use them, don't roll
  your own.** `HeartbeatLine` / `HeartbeatDivider` for the lab's ECG
  motif. `HermesMark` for any AI-assistant surface (icon + avatar
  variants). `CategoryIcon` for any project-category indicator (replaces
  6px dots). `EmptyStateArt` for lab-aesthetic empty states. Passing
  a `slug` prop to `Avatar` triggers HermesMark auto-swap when slug
  === 'claude-ai'.
- **Per-route OG cards at `/og/<type>/<slug>`.** `functions/og/[type]/
  [slug].ts` generates SVG cards from D1. Set `ogImage: '/og/project/
  ...'` when calling `usePageMeta` for any page that wants a branded
  share preview. `public/_headers` forces `image/svg+xml` content-type.
- **`getAuthUser()` + `isPiRequest()` are async.** Every caller must
  `await`. JWT signature verification via JWKS in `api/jwt-verify.ts`
  with module-level 1h JWKS cache + per-kid CryptoKey cache. Without
  `CF_ACCESS_TEAM_DOMAIN` env var, falls back to decode-only with one-
  shot warn — keeps pre-launch PI-only mode working.
- **PI allowlist lives in `lab_settings.pi_emails`** (JSON array in D1),
  read via `getPiEmails(env)` with 5-min cache + `PI_EMAILS_FALLBACK`
  constant in `api/helpers.ts`. To add a PI: SQL UPDATE on
  `lab_settings.pi_emails` row, no deploy.
- **`actorSlug(email)` maps via `EMAIL_PREFIX_TO_SLUG` LUT.** Adding a
  new team member requires THREE updates: D1 `team_members` row,
  `src/data/team.ts` static fallback, and `EMAIL_PREFIX_TO_SLUG` entry.
- **All 19 team slugs are `preferred_name-last_name`** (`nick-ingraham`,
  `emma-bromley`, etc.). Phase 36b D1 + brain.db migration. Don't
  reintroduce the old short forms.
- **`/portal/team/:slug` is the in-portal route**; `/team/:slug` stays
  for the public marketing site. Sidebar + CommandPalette navigate to
  the portal one. MemberPage + TrajectoryPage detect context via
  `useLocation`.
- **`api/index.ts` is Hono.** Do NOT add routes via `url.pathname === ...`
  comparisons — use `app.get/post('/api/...', handler)`. Middleware
  chain: OPTIONS → test-mode swap → API-key → authed-user → PI gate
  (`/api/pb/*` GET) → REQUIRE_AUTH (POST/PUT) → version-bump-on-success.
- **`/api/version` is edge-cached for 10s.** Cross-tab realtime
  invalidation latency is ~25s end-to-end (poll interval 15s + cache
  TTL 10s) — acceptable, but don't shorten the cache TTL without
  understanding the Workers-quota tradeoff.
- **TaskDetailPanel has touch handlers (mobile swipe-to-dismiss) AND a
  focus trap that snaps focus back into the panel.** Don't add nested
  touch-gesture elements OR auto-focusing async-mounted children
  without re-checking these.
- **`--slate`, `--teal`, `--gold`, `--maroon`, `--orange`, `--green`**
  are literal sRGB hex (NOT OKLCH) in both modes. Don't restore to
  OKLCH without reading CLAUDE.md Palette section.
- **`VITE_REQUIRE_AUTH`** env var gates client sign-in wall.
  **`REQUIRE_AUTH`** server secret gates writes. Flipping either ON
  without CF Access configured locks everyone out.
- **`/api/pb/*` returns 403 to non-PI** — intentional. API keys +
  `lab_settings.pi_emails` bypass.
- **`/api/bug-report` is open pre-launch.** Gate piggybacks on
  `REQUIRE_AUTH=1` — same flag that locks writes. Auto-engages at
  team launch so strangers can't spam GitHub Issues. Don't add a
  standalone gate here.
- **Deploy is manual via wrangler.** No git push → deploy webhook.
  `npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab`
- **brain.db ↔ D1 sync is bidirectional.** `sync_d1_push` translates
  canonical `task_{ulid}` PKs back to Hub hex IDs via `entity_aliases`.

## Closed: consultant + audit "P0/P1" lists

- All 5 consultant nice-to-haves: Phase 36 (`CHANGELOG.md`).
- All 11 deep-audit P0/P1: Phase 36c (`CHANGELOG.md`).
- All Phase 35 launch blockers: Phase 35 (`CHANGELOG.md`).
- Round-1 design handoff: 32/33 tickets shipped (P2-14 is a data-entry ask).
- Round-2 design handoff: 43/43 tickets shipped (`CHANGELOG.md` round-2 entry).
- Phase 37 Portal URL Migration: 14/14 tasks shipped (`CHANGELOG.md` Phase 37).
- Launch secrets + CF Access config: all set 2026-04-21.

## Scaffolded — not yet live

None. Everything in the codebase is deployed.

## Open audit P2/P3 (not blocking, queued for later)

From the 4-auditor deep audit (full reports were generated under
`review/audit-newteammate/` + `review/a11y-deep/` — gitignored, regen
via the audit specs in `tests/`):

- **Server perf:** `tasks.project_id` storage canonicalization (always
  store slug, drop `slug OR id` join) — saves ~80-150ms on
  pb-sector.handleCommandCenter. `LIKE '%' || slug || '%'` joins on
  pi-dashboard need a `publication_authors` join table. SQLite FTS5 on
  tasks/projects/ideas/comments for /api/search. `RETURNING *` on all
  single-row writes to drop the post-write SELECT round-trip.
- **A11y:** dashboard drag-to-reorder is mouse-only (no keyboard
  alternative for RGL grid). Subtask "checkboxes" are `<div onClick>`
  (no role=checkbox).
- **Data integrity:** brain.db `entity_aliases` has zero live `hub_slug`
  rows (all retired same-day) — `sync_d1_pull_new` is the suspect.
  brain.db has prefix-mismatch on 33/62 projects (`clif-pf-v-sf-...` vs
  D1 `pf-v-sf-...`) — sync may dup. brain.db `d1_tasks` mirror is 13
  days stale; `d1_action_items` 24 days. Airtable push has been
  returning 422 all day (`INVALID_MULTIPLE_CHOICE_OPTIONS … "Mentees"`
  / `… "CLIF"`).
- **UX:** dashboard `<h1>` is "Good evening" (decorative, not
  informative). 11+ touch targets <44px on mobile (CLAUDE.md says 36px
  is the floor — already below WCAG 2.5.5 AAA).
- **Misc:** 22 stale `nick-ingraham` test slug refs in spec files (now
  CORRECT after rename — but test descriptions reference old context).

## Key files touched Phase 37

New path constants:
- `src/constants/paths.ts` — single source of truth for every gated URL (`PATHS.dashboard`, `PATHS.project(slug)`, etc.) + `LEGACY_REDIRECTS`.
- `tests/helpers/paths.ts` — plain-string mirror so tests don't import the prod bundle.

Routing:
- `src/App.tsx` — 29 new `/portal/*` canonical routes under `RequireAuth + PortalLayout`; `<Navigate>` redirect shims outside `RequireAuth` for legacy root paths; `NavigateWithParams` helper for parametric redirects.

Nav + links migrated through `PATHS`:
- `src/components/Sidebar.tsx`, `MobileTabBar.tsx`, `CommandPalette.tsx` (22 nav sites).
- `src/hooks/useKeyboardShortcuts.ts`, `src/hooks/useProjectKeyboardNav.ts`.
- ~50 `<Link>` + template-literal refs across 30+ components.
- `src/hooks/useRecentlyViewed.ts` — pathname pattern-matching.
- `api/routes/search.ts` — backend search link URLs.

Client env:
- `.env.production` — `VITE_REQUIRE_AUTH=1`.

Tests + audits:
- 16 test specs + 5 journey specs + 27 audit scripts migrated via `tests/helpers/paths.ts` or hardcoded `/portal/` prefix.

## Key files touched Phase 36d

New reusable primitives:
- `src/components/HeartbeatLine.tsx` — animated ECG motif (live/slow/static).
- `src/components/HeartbeatDivider.tsx` — quiet section divider wrapper.
- `src/components/HermesMark.tsx` — Mercury glyph for AI assistant.
- `src/components/CategoryIcon.tsx` — lungs/flask/heartbeat/cap glyphs.
- `src/components/EmptyStateArt.tsx` — 8 line illustrations.
- `src/components/PhaseReleaseBanner.tsx` — dismissible shipped-list banner.
- `src/components/RequireAuth.tsx` — branded sign-in splash (extracted from App.tsx).
- `src/components/pulse/PulseScene.tsx`, `PulseMetric.tsx`, `PulseSparkline.tsx` — kiosk primitives.

Rewrites + wiring:
- `src/pages/Pulse.tsx` — cinematic 6-scene kiosk with Ken Burns + ambient heartbeat.
- `src/components/Avatar.tsx` — `slug` prop triggers HermesMark for `claude-ai`; generated portrait for no-photo members.
- `src/components/ProjectCard.tsx`, `ProjectComments.tsx` — use CategoryIcon + HermesMark.
- `src/components/PortalLayout.tsx` — 28×28 brand mark in mobile top bar.
- `src/hooks/useFavicon.ts` — email-prefix → canonical slug LUT so badge fires post-Phase-36b.
- `src/hooks/usePageMeta.ts` — accepts `ogType` + `ogImage` options.
- `src/pages/ProjectDetail.tsx`, `MemberPage.tsx`, `MeetingDetail.tsx` — per-page `ogImage` pointing at `/og/...`.
- `src/pages/Dashboard.tsx` — renders `<PhaseReleaseBanner />` above WelcomeBanner.

New Pages Functions + capture infra:
- `functions/og/[type]/[slug].ts` — per-route SVG OG cards from D1.
- `public/_headers` — forces `image/svg+xml` on `/og/*`.
- `scripts/claude-design-brief.txt` — brand brief for Claude Design.
- `tests/capture-for-design.spec.ts` + `playwright.config.design-capture.ts`.
- `tests/capture-interactions.spec.ts` + `playwright.config.interactions-capture.ts`.

Hotfix: `api/index.ts` — `/api/bug-report` gate now piggybacks on `REQUIRE_AUTH=1`.

## Key files touched Phase 36c

- `src/App.tsx` — `/portal/team/:slug` + trajectory routes added.
- `src/components/Sidebar.tsx` — `aria-current="page"`, `/portal/team/...` link.
- `src/components/CommandPalette.tsx` — `/portal/team/...` navigate.
- `src/components/PortalLayout.tsx` — main pad-bottom 1rem → 3rem.
- `src/components/PageTooltip.tsx` — drop nowrap, max-width, larger X.
- `src/components/tasks/TaskDetailPanel.tsx` — focus trap fix + opener restore + title region tabIndex=-1.
- `src/components/tasks/TaskGridView.tsx` — `.hover-badge { visibility: hidden }`, `CalculationsRow` memoized.
- `src/components/NetworkSidebar.tsx` — type import switched to CollaborationGraph.
- `src/components/EnhancedCollaborationNetwork.tsx` — DELETED (654 lines).
- `src/pages/MemberPage.tsx`, `src/pages/TrajectoryPage.tsx` — `useLocation` for portal-vs-public link context.
- `src/pages/ProjectDetail.tsx` — 100dvh + safe-area-inset-bottom.
- `src/pages/portal/Tasks.tsx`, `src/pages/portal/MyTasks.tsx` — `lazy()` Board/StandUp/Timeline + Suspense.
- `src/hooks/useOnboarding.ts` — `dismissed` auto-stales after 7 days.
- `api/lib/version.ts` — Cache-Control: public, max-age=10.
- `api/jwt-verify.ts` — importedKeyCache map.
- `api/routes/pi-dashboard.ts` — `'Active'` → `'active'`.
- `api/schema-v46.sql` (new) — 7 missing indexes.
- `scripts/phase36b-slug-cleanup.sql` (new) — 13 slug leftovers + 4 commitments fix.
- `scripts/test-residue-cleanup.sql` (new) — ~160 test_delete_* rows across 6 tables.

## Git state

Hub: `main` at `143c1db` (pushed to origin; clean).
PB: unchanged this session — see PB-side `work_status.md` for PB-specific state.

Re-check before modifying: `git status --short` should be empty in both repos.
