---
record_id: rec6HYkDBk4di5ncw
slug: mn-ccore-lab-hub
created: 2026-03-25
status: active
domain: Research
tier: 2-Biweekly
next_action: Configure CF Access (Zero Trust) for @umn.edu, then set `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` + `REQUIRE_AUTH` + `TEST_MODE_KEY` secrets, then `VITE_REQUIRE_AUTH=1` + rebuild. See LAUNCH-CHECKLIST.md sections 0 + 1.
primary_folder: C:/Users/ingra107/mn-ccore-lab
---

# MN-CCORE Lab Hub

React 19 + Vite 8 + Tailwind v4 + Cloudflare Pages/D1 lab management
platform for Nick's critical-care research group at UMN.

**Live:** https://mn-ccore-lab.pages.dev  (PI-only; team not yet onboarded)
**Repo:** https://github.com/ingra107/mn-ccore-lab  (670+ commits)
**Current deploy:** `0ea632c` (2026-04-20) — Phase 36c close (post-audit fixes)
**Quality gate:** 🟢 GREEN — inspection 213/213 vs prod, deep-audit 14/14 clean, axe WCAG 2.1 AA clean across 29 pages × 2 color schemes, mobile smoke 2/2, desktop journey 1/1, /api/health 64ms (was 100ms after schema-v46 indexes).

## 🚨 Read these FIRST every session

1. **`SESSION-HANDOFF.md`** — one-page current state, gotchas, next action, git HEADs, key files touched. Always read this before writing any code.
2. **`LAUNCH-CHECKLIST.md`** — section 0 is the gate for going live. If Nick mentions the team or launch, read this.
3. **`CLAUDE.md`** — full operating guide (design system, palette, sync model, file map).
4. **`REFERENCE.md`** — API endpoints, D1 table list, conventions.
5. **`CHANGELOG.md`** — top entry is the most recent phase; jump there for "what changed recently."
6. **`docs/OBSERVABILITY.md`** — /api/health runbook + how to wire external uptime monitoring.

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
  soft-delete (ideas, decision_log, meetings, digest_comments,
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
   `d1_task_comments`) + Hub-originated projects now flow back via
   `sync_d1_pull --task-comments` + `--hub-projects`. Suite 15 asserts
   both hard-pass.
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
