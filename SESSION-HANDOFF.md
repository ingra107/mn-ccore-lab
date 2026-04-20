# Session Handoff — 2026-04-20

> Last worked: Phase 36c (4-auditor deep audit + 11 P0/P1 fixes).
> Next session picks up here. One-glance state + what to do first.

## 📖 Session bootstrap — read these in order before writing anything

1. **This file** (you're here). Current gate, gotchas, commit, next action.
2. **`PROJECT.md`** — frontmatter `next_action` is canonical.
3. **`LAUNCH-CHECKLIST.md`** — sections 0 + 1 are the remaining work before the team gets the link.
4. **`CLAUDE.md`** — operating guide. Design system + palette + sync model + rules.
5. **`REFERENCE.md`** — API endpoints + D1 table list.
6. **`CHANGELOG.md`** top entry — Phase 36c full record.
7. **`docs/OBSERVABILITY.md`** — `/api/health` + runbook.

## Gate — all green as of commit `0ea632c`

| Check | Result |
|---|---|
| `/api/health` (live prod) | 200 ok, 601 tasks / 64 projects / 19 team / **64ms** (was 100ms before schema-v46 indexes) |
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

## What's new since the previous handoff (Phase 36)

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

1. If Nick's about to share the Hub URL with the team → follow
   `LAUNCH-CHECKLIST.md` sections 0 + 1. Four secrets + CF Access config
   + one rebuild. Post-launch, swipe-dismiss + JWT sig verify both
   activate with no extra deploys.
2. If Nick wants to keep improving → consultant nice-to-haves are closed,
   audit P0/P1 are closed. P2 backlog in audit reports under
   `review/audit-newteammate/` and `review/a11y-deep/` (gitignored — run
   the audits again to regenerate). Or pull from
   `Projects/mn-ccore-lab-hub/hub-future-ideas.md`.
3. If Nick reports a bug → reproduce with a deep-audit suite before
   fixing.

## Things that WILL surprise you if you don't know

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
- **Deploy is manual via wrangler.** No git push → deploy webhook.
  `npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab`
- **brain.db ↔ D1 sync is bidirectional.** `sync_d1_push` translates
  canonical `task_{ulid}` PKs back to Hub hex IDs via `entity_aliases`.

## Closed: consultant + audit "P0/P1" lists

- All 5 consultant nice-to-haves: Phase 36 (`CHANGELOG.md`).
- All 11 deep-audit P0/P1: Phase 36c (`CHANGELOG.md`).
- All Phase 35 launch blockers: Phase 35 (`CHANGELOG.md`).

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

Hub: `main` at `0ea632c` (pushed to origin).
PB: `main` at `432042d2` (pushed to origin).

Re-check before modifying: `git status --short` should be empty in both repos.
