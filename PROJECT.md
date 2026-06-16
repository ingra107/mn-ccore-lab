---
record_id: rec6HYkDBk4di5ncw
slug: mn-ccore-lab-hub
created: 2026-03-25
status: active
domain: Research
tier: 2-Biweekly
next_action: FINISH the session-handoff redesign — needs a healthy shell (MSYS fork crash; serialize bash / UMN IT exclusion — PB memory feedback_msys-bash-fork-crash). DONE this session: `scripts/gen-session-header.mjs` (built + hardened, codex-audited) + plan v2 `docs/superpowers/plans/2026-06-15-session-handoff-shrink-generate.md` (read §7 phases + §9). DECISION: NO new agent-backlog substrate — steer from `projects.next_action` + existing `hub-future-ideas.md` + tasks-when-committed (TODAY-leak dissolves). PENDING (shell-gated): (1) re-run generator clean; (2) apply shrink (SESSION-HANDOFF 1291→~45 lines, old preserved in git); (3) wire `--check` into `.githooks/pre-commit` + CI + `session-close`. ⚠️ NOTHING COMMITTED YET — commit/push the new files first thing once shell is up (uncommitted = wipeable). Lower-priority prior pending: Today-cockpit IA consolidation (`docs/superpowers/plans/2026-06-09-today-cockpit-ia-consolidation-plan.md`). Deferred items listed in SESSION-HANDOFF.md ▶ NEXT.
primary_folder: C:/Users/ingra107/mn-ccore-lab
---

# MN-CCORE Lab Hub

React 19 + Vite 8 + Tailwind v4 + Cloudflare Pages/D1 lab management
platform for Nick's critical-care research group at UMN.

**Live:** https://mn-ccore-lab.pages.dev  (LIVE for team — CF Access gates `/portal/*` via @umn.edu)
**Repo:** https://github.com/ingra107/mn-ccore-lab  (720+ commits)
**Current HEAD:** `fd5182da` (author ingra107). **Live deploy = `8c5b8950` on `0f3d09a8`** (2026-06-09 evening) — the full A+B+C workstream round live on pages.dev. Schema **v75**. Verify the live deploy with `wrangler pages deployment list --project-name mn-ccore-lab`. See SESSION-HANDOFF.md top + CHANGELOG.md top for the round's record.
**Quality gate:** 🟢 GREEN — build clean, inspection 149/149 post-simplify, smoke 27/27 (pre-simplify baseline), deep-audit 14/14 clean, axe WCAG 2.1 AA clean across 29 pages × 2 color schemes, schema-drift CI green.

## 🚨 Read these FIRST every session

1. **`SESSION-HANDOFF.md`** — one-page current state, gotchas, next action, git HEADs, key files touched. Always read this before writing any code.
2. **`LAUNCH-CHECKLIST.md`** — section 0 is the gate for going live. If Nick mentions the team or launch, read this.
3. **`CLAUDE.md`** — full operating guide (design system, palette, sync model, file map).
4. **`REFERENCE.md`** — API endpoints, D1 table list, conventions.
5. **`CHANGELOG.md`** — top entry is the most recent phase; jump there for "what changed recently."
6. **`docs/OBSERVABILITY.md`** — /api/health runbook + how to wire external uptime monitoring.

## Phase 37 COMPLETE — Portal URL Migration + Team Launch (2026-04-21)

**Status:** ✓ Shipped. Merged to `main` as `8600c32`; HEAD `143c1db`.
Prod deploy: `c5e46630.mn-ccore-lab.pages.dev`. **Hub is LIVE for
the team.**

All 27 gated Hub routes moved under a `/portal/*` URL prefix so a
single Cloudflare Access application destination
(`mn-ccore-lab.pages.dev/portal/*`) gates the entire authenticated
surface. Public marketing routes stay at root. `src/constants/paths.ts`
is the single source of truth; `tests/helpers/paths.ts` mirrors it.
Legacy root paths (`/dashboard`, `/projects/:slug`, ...) redirect via
`<Navigate>` shims in `src/App.tsx` placed outside `RequireAuth` so
bookmark bounces happen pre-auth. 14 subagent-driven tasks; 13 commits
on `feat/portal-url-migration`.

**CF Access configured** for `mn-ccore-lab.pages.dev/portal/*` with
policies: `UMN Team` (@umn.edu), `Nick Only`
(nicholas.ingraham@gmail.com), `Audit Service Token` (service auth).

**Server secrets set in Cloudflare Pages:**
`CF_ACCESS_TEAM_DOMAIN=peripheral-brain.cloudflareaccess.com`,
`CF_ACCESS_AUD=47b7d48e...40139c`, `REQUIRE_AUTH=1`, `TEST_MODE_KEY`
(32-char hex). JWT signature verification now ACTIVE via JWKS. Plus
client-side `VITE_REQUIRE_AUTH=1` in `.env.production` — branded
`RequireAuth` splash for unauthenticated users.

**GitHub Actions secrets set** for schema-drift CI:
`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.

**Audit Service Token** active (`mn-ccore-lab-audit`); local env vars
`HUB_TEST_MODE_KEY`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`
set on work + home.

**Optional follow-up:** `RESEND_API_KEY` not yet set. Daily digest
email cron is dormant until signed up. Skippable indefinitely.

See `CHANGELOG.md` "Phase 37 — Portal URL Migration" for full record.

## Phase 36e — Claude Design Handoff Imported (2026-04-20)

**Not a code phase — backlog import.** Nick ran the Hub through
Anthropic's Claude Design (launched 2026-04-17) against HEAD
`ef604db`. Returned a prioritized 33-ticket implementation backlog
imported to `docs/design-handoff-2026-04-20/`:

- `TICKETS.md` — **next session works top-to-bottom**. 8 P1 ship-
  blockers, 14 P2 polish, 11 P3 new surfaces.
- `Audit.html` — interactive annotated screenshots.
- `screenshots/` — 30 captures referenced by tickets.
- `reference/` — token mirror + UI kit mocks (visual direction, not
  production code).

**P1 targets Tuesday 11am demo.** Headline issues:
- Test-fixture titles (`test_delete_*` / `deep-audit-sync-*`) leaking
  into Personal / Calendar / Mentee Milestones / Activity
- `undefined '23` chart labels on PI Dashboard
- Team Engagement attribution bug (`anonymous=13,410`)
- Duplicate meeting action items
- Persistent tooltip; unlabeled public-Home hero numbers; empty
  Mentee Milestones; empty Senior Mentors section

See `CHANGELOG.md` Phase 36e for the full list.

## Phase 36d COMPLETE — Design Sprint (2026-04-20)

**Status:** ✓ Shipped at `ef604db` on origin/main. 12 brand-level design
improvements in one sprint: cinematic Pulse Kiosk, branded sign-in
splash, Hermes avatar, category icons, heartbeat-line motif system,
empty-state illustrations, lab-aesthetic generated avatars, mobile logo,
dynamic per-route OG share cards, phase-release banner, chart palette
verified, favicon notification badge fixed post-slug-rename.

**New reusable primitives** (all in `src/components/`):
- `HeartbeatLine` — animated ECG trace; variants live/slow/static, BPM
  configurable. Used in Pulse, sign-in splash, release banner. The
  lab's brand signature.
- `HeartbeatDivider` — quiet section divider wrapper.
- `HermesMark` — Mercury alchemical glyph avatar for the AI assistant.
  icon + avatar variants. Replaces generic lucide Sparkles.
- `CategoryIcon` — distinct glyphs (lungs / flask / heartbeat / cap)
  for CLIF / Lab / Nate / Mentee; replaces 6px colored dots.
- `EmptyStateArt` — 8 lab-aesthetic line illustrations (clipboard /
  lightbulb / notebook / clock / papers / folder-stamp / magnifier /
  flask).
- `PhaseReleaseBanner` — "what shipped" banner with heartbeat thread,
  dismissible, localStorage persistence.
- `RequireAuth` — branded sign-in splash (extracted from App.tsx).
  Inline wordmark, gold CTA, heartbeat ambient trace,
  `?redirect_url=` preserves deep-link.
- `pulse/PulseScene`, `PulseMetric`, `PulseSparkline` — kiosk
  primitives for Ken Burns + hero typography.

**New Cloudflare Pages Function** — `functions/og/[type]/[slug].ts`
generates per-route SVG share cards (project / team / meeting /
default) from D1 data. Edge-cached 1h via `public/_headers`. Wired into
`usePageMeta` options.

**Capture infrastructure for Claude Design** (new):
- `scripts/claude-design-brief.txt` — brand brief (tokens, motif path,
  ethos, repo link). Paste into Claude Design.
- `tests/capture-for-design.spec.ts` +
  `playwright.config.design-capture.ts` — full-page screenshots of
  every hero surface (desktop 1440×900 + Pixel 5 mobile). Pre-scrolls
  each page to trigger lazy loads before the snap.
- `tests/capture-interactions.spec.ts` +
  `playwright.config.interactions-capture.ts` — 15 signature
  interactions as WebM videos + PNG keyframe triplets (status change
  + undo, detail slide-in, tab switch, swipe-dismiss, hover badges,
  Cmd+K, assignee picker, date picker, subtask expand, Kanban drag,
  Hermes mention, Pulse rotation, dashboard drag-reorder, keyboard
  nav, quick-add NLP).
- First run output at `review/claude-design-20260420/` (31 full-page
  screenshots + INDEX.md), gitignored.

Plus hotfix: `/api/bug-report` no longer returns 401 pre-launch —
auth gate now piggybacks on `REQUIRE_AUTH=1`, auto-engages at team
launch.

## Phase 36c COMPLETE — Deep Audit Fixes (2026-04-20)

**Status:** ✓ Shipped at `0ea632c` on origin/main. Live on prod
(`https://mn-ccore-lab.pages.dev`, preview `3fbafba0`). 4-auditor deep
audit (UX, code efficiency, accessibility, data integrity) ran in
parallel; all 11 P0 + P1 findings fixed in one sprint.

**Highlights (full detail in `CHANGELOG.md`):**

- **Routing:** `/portal/team/:slug` added under PortalLayout. Logged-in
  users clicking a teammate from sidebar/CommandPalette now keep portal
  chrome instead of dropping into the public marketing site (bug live
  since 2026-03-24). Public `/team/:slug` retained for marketing visitors.
- **Mobile:** Tab-bar buffer bumped 1rem → 3rem so calendar's today
  row + project detail's Description text clear the bar comfortably.
  ProjectDetail switched to 100dvh + safe-area-inset-bottom.
- **Data:** 13 leftover Phase 36b old slugs cleaned (7 nick in
  tasks.assignee, 6 in projects.pi, 2 nathan-mesfin in ideas, +
  variants). ~160 `test_delete_*` rows wiped from 6 tables that lack
  soft-delete (ideas, hub_decisions, meetings, digest_comments,
  lab_questions, publications).
- **D1 perf:** schema-v46 — 7 missing indexes (activity_log, comments,
  milestones, task_updates, projects.title, notifications composite,
  tasks composite). 50-200ms drop on hot endpoints.
- **Server perf:** `/api/version` edge-cached for 10s (was polled every
  15s by every user; cuts ~95% of polling traffic). JWT `importKey`
  result cached per `kid` (saves 5-15ms per authed request).
- **Code bug:** `pi-dashboard.ts` was filtering `status='Active'` (caps);
  R10 standardized to lowercase. Silently returned 0 rows. Fixed.
- **A11y:** TaskDetailPanel focus trap re-queries focusables per Tab
  AND snaps focus back when it drifts into async-mounted regions.
  Restores focus to opener element on close. `.hover-badge` becomes
  `visibility: hidden` until hover/focus so screen readers don't read
  ~120 phantom badges per /tasks visit. Sidebar links get
  `aria-current="page"` (pattern was already in MobileTabBar).
- **UX:** PageTooltip drops `whiteSpace: nowrap` and uses
  `max-width: min(92vw, 480px)`. WelcomeBanner auto-stales after 7
  days from startDate.
- **Bundle:** Dead `EnhancedCollaborationNetwork.tsx` (654 lines, no
  runtime importer) deleted. `TaskBoardView`/`TaskStandUpView`/
  `TaskTimelineView` now `lazy()` in Tasks + MyTasks (~30-50KB off
  initial chunk).
- **Render perf:** `CalculationsRow` runs single pass over tasks via
  `useMemo` instead of 4 .filter() chains per render with 600+ tasks.

## Phase 36b COMPLETE — Team Slug Rename (2026-04-19)

All 19 team_members slugs converged on `preferred_name-last_name`
(`nick-ingraham`, `emma-bromley`, ...). 2,312 D1 row changes, 239 code
replacements. brain.db side updated (1,144 rows + sync script default).
`actorSlug(email)` in `api/helpers.ts` maps email-prefix → canonical
slug via `EMAIL_PREFIX_TO_SLUG`. Nick's real UMN address `ingra107@umn.edu`
wired into PI allowlist (was `ningraha@`/`sandb029@` — wrong people).

## Phase 36 COMPLETE — Consultant Close-out + Mobile Swipe + Data Cleanup (2026-04-19)

**Status:** ✓ Shipped at `ed40e39` on origin/main. Deployed to
`https://mn-ccore-lab.pages.dev` (preview `e7046581`). D1 migrations v43 +
v44 applied to prod. Post-deploy API smoke green (health/version/auth/me/
tasks/pb-gate), mobile smoke green (2/2 on Pixel 5 emulation).

### What shipped

- **Hono router** (`api/index.ts` 1875 → 1329 lines, ~225 routes). Replaces
  flat if/else dispatcher with declarative path + method. Route-ordering
  bug class eliminated. `hono@4.12.14` added.
- **JWT signature verification** (`api/jwt-verify.ts`) — RS256 via CF Access
  JWKS, exp/nbf/iss/aud checks. Activates when `CF_ACCESS_TEAM_DOMAIN` +
  `CF_ACCESS_AUD` secrets are set. Until then, decode-only with one-shot
  cold-start warn (no lockout risk). `getAuthUser()` + `isPiRequest()` are
  now async.
- **`team_members.email` column** (schema-v43 applied prod) — real column,
  backfilled to `slug || '@umn.edu'` for all 19 existing rows. Three
  derivation sites now read the column (with slug-derive as fallback).
- **`lab_settings.pi_emails`** (schema-v44 applied prod) — PI allowlist
  moved from hardcoded `Set` into DB-backed JSON. `getPiEmails(env)` reads
  with 5-min cache + fallback. Client-side `PI_EMAILS` arrays (4 files)
  deleted — client reads `user.isPi` from `/api/auth/me`.
- **`pb-sector.handleCommandCenter` batched** — 11 parallel `Promise.all`
  queries → single `env.DB.batch([...])` RPC.
- **Mobile swipe-right-to-dismiss** on `TaskDetailPanel` (below 768px).
  Axis-locked touch handlers, backdrop fade, >30% width threshold,
  respects `prefers-reduced-motion`.
- **Slug sanitizer** on `POST /api/projects` — `[^a-z0-9]+ -> -` applied to
  client-supplied `body.slug`, not just title-derived fallback. Closes
  the paren-slug class.
- **DI-4 cleanup** — merged duplicate `CLIF: PF-v-SF Oxygenation Severity`
  project (2 rows in D1 collapsed to 1). SQL at
  `scripts/merge-pf-sf-duplicate.sql`.
- **Mobile smoke test infra** — `tests/mobile-swipe-smoke.spec.ts` +
  `playwright.config.mobile.ts` (Pixel 5 emulation, post-deploy).

Post-launch follow-ups (not blocking):
- Nick must configure CF Access (Zero Trust > Access > Applications) and
  set the 4 secrets — see `LAUNCH-CHECKLIST.md` sections 0 + 1.
- Real-device swipe verification on Nick's phone (Playwright's synthetic
  touch doesn't reproduce gesture velocity).

## Phase 35 — A11y + Sync Parity + Launch Readiness (2026-04-18/19)

**Status:** ✓ Shipped at `bd2a7cc` on origin/main.

### Three tracks this phase

1. **Full WCAG 2.1 AA accessibility** — color tokens pinned to literal
   sRGB hex (axe-core 4.11 mis-parses OKLCH); opacity codemod (640+
   sites) bumped 0.30-0.55 → 0.85; 29 pages × 2 color schemes clean.
2. **Hub ↔ brain.db sync parity** — `task_comments` mirror (read-only
   `d1_task_comments`) + Hub-originated projects now flow back via PB's
   `scripts/db/sync/` module's task-comments + hub-projects pulls
   (legacy `sync_d1_pull --task-comments` / `--hub-projects` extracted
   2026-04-21). Suite 15 asserts both hard-pass.
3. **Consultant-review launch blockers closed** — `/api/pb/*` PI-gated
   (403 to non-PI), `/api/bug-report` requires auth (401), `X-Test-Mode`
   requires `TEST_MODE_KEY` secret, `REQUIRE_AUTH` + `VITE_REQUIRE_AUTH`
   flags wire full hard-auth, `/api/health` observability + runbook.

### Consultant nice-to-haves (shipped 2026-04-19)

All five closed:
- ✅ Hono router — `api/index.ts` rewritten with `hono@4.12.14`, 1875 → 1330 lines.
- ✅ `lab_settings.pi_emails` — schema-v44 seeded; `getPiEmails(env)` reads with 5-min cache + fallback. Client-side PI_EMAILS duplicates removed; client reads `user.isPi` from `/api/auth/me`.
- ✅ Server-side JWT signature verification — `api/jwt-verify.ts` (RS256 via CF Access JWKS, exp/nbf/iss/aud checks). Needs `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` secrets to enforce. See LAUNCH-CHECKLIST section 1.
- ✅ `team_members.email` — schema-v43, column + backfill; three derivation sites now read the column.
- ✅ `pb-sector.handleCommandCenter` — 11 parallel D1 queries → single `env.DB.batch([...])` RPC.

---

**See the PB-side project folder** for research/strategy docs, competitive
analysis, and the HUB-AUDIT-CHECKLIST:
`C:/Users/ingra/Peripheral-Brain/Projects/mn-ccore-lab-hub/`
