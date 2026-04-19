# Session Handoff — 2026-04-19

> Last worked: Phase 36 (consultant close-out + mobile swipe + data cleanup).
> Next session picks up here. One-glance state + what to do first.

## 📖 Session bootstrap — read these in order before writing anything

1. **This file** (you're here). Current gate, gotchas, commit, next action.
2. **`PROJECT.md`** — frontmatter `next_action` is canonical.
3. **`LAUNCH-CHECKLIST.md`** — sections 0 + 1 are the remaining work before the team gets the link. Read if Nick mentions launch / team / go-live.
4. **`CLAUDE.md`** — operating guide. Design system + palette + sync model + rules. Skip sections you don't need but have it open.
5. **`REFERENCE.md`** — reach for this when you need an API endpoint or D1 table name.
6. **`CHANGELOG.md`** top entry — "Phase 36" is the full record of what shipped this round.
7. **`docs/OBSERVABILITY.md`** — `/api/health` + runbook if anything looks broken.

**Where historical docs live (don't treat as driving):**
- `docs/archived/` — all superseded Hub docs.
- PB side: `Projects/mn-ccore-lab-hub/_archived/` — superseded plans, specs, and audit checklists. The main PB project folder has only current reference docs (vision, future ideas, competitive research).

## Gate — all green as of commit `ed40e39`

| Check | Result |
|---|---|
| Preflight | 🟢 GREEN — 97 pass / 0 fail / 0 findings (from Phase 35; not re-run after Phase 36, see note) |
| Deep-audit (14 suites) | 0 bugs across all (from Phase 35) |
| Axe WCAG 2.1 AA (dark + light) | 29 pages × 2 schemes, 0 findings (from Phase 35) |
| `/api/health` (live prod) | 200 `{ok: true}` — 599 tasks, 62 projects, 19 team members (verified post-deploy) |
| Mobile smoke (Pixel 5) | 2/2 — tasks page loads clean, detail panel opens + closes |
| API smoke (post-Hono-deploy) | /api/health 200, /api/version 200, /api/auth/me 200, /api/tasks 200, /api/pb/* 403 |

**Preflight re-run recommendation:** Hono + async-auth + batched pb-sector
touched the whole API surface. Running `npx tsx scripts/pre-flight/00-orchestrator.ts`
is strongly suggested before going live with the team — Phase 35 baseline
was 97 pass, anything below that is a regression.

Rerun axe light: `npx tsx scripts/pre-flight/persona-axe.ts --light`
Rerun all deep-audits: `for f in scripts/deep-audit/0*-*.ts scripts/deep-audit/1[0-5]-*.ts; do npx tsx "$f" 2>&1 | tail -2; done`
Rerun mobile smoke: `npx playwright test --config=playwright.config.mobile.ts`

## What's new since the previous handoff (Phase 35)

**Phase 36 shipped** — see `CHANGELOG.md` for the full record. Three tracks:

1. **Consultant close-out.** Five "nice-to-have" items from the pre-launch
   review all shipped: Hono router, JWT sig verify, `team_members.email`
   column (v43), `lab_settings.pi_emails` (v44), `pb-sector` batch. See
   `CLAUDE.md` Architecture section for the new Hono middleware chain.
2. **Mobile swipe-to-dismiss** on `TaskDetailPanel`. Below 768px, swipe
   right past 30% panel width → onClose. Axis-locked so vertical scroll
   still works. Respects `prefers-reduced-motion`.
3. **Data cleanup.** 1 duplicate project merged in prod D1 (`clif-pf-sf`
   → `pf-v-sf-oxygenation-severity`). Slug sanitizer added server-side
   so the paren-slug class can't come back.

## What to do FIRST in the next session

Read the state above, then:

1. If Nick's about to share the Hub URL with the team → follow
   `LAUNCH-CHECKLIST.md` sections 0 + 1. Four secrets + CF Access config
   + one rebuild. Post-launch, swipe-dismiss + JWT sig verify both
   activate with no extra deploys.
2. If Nick wants to keep improving → the consultant "nice-to-have" list is
   closed. `Projects/mn-ccore-lab-hub/_archived/HUB-AUDIT-CHECKLIST.md` (PB
   repo) has the Tier A-E roadmap; `hub-future-ideas.md` has the full
   feature backlog (3 items still NOT BUILT, mostly peripheral).
3. If Nick reports a bug → reproduce with a deep-audit suite before
   fixing; Hono's declarative routing makes it easy to locate + patch a
   specific handler now.

## Things that WILL surprise you if you don't know

- **`getAuthUser()` + `isPiRequest()` are now async.** Every caller must
  `await`. The verifier lives in `api/jwt-verify.ts` and fetches CF Access
  JWKS with a module-level 1h cache. Without `CF_ACCESS_TEAM_DOMAIN` set,
  it falls back to decode-only (with a one-time cold-start warn) so
  pre-launch PI-only mode keeps working.
- **`PI_EMAILS` no longer lives in code.** `getPiEmails(env)` reads from
  `lab_settings.pi_emails` (JSON array) with a 5-min cache and falls back
  to `PI_EMAILS_FALLBACK` constant if the row is missing. To add a PI,
  write SQL to `lab_settings`, not code. Client gets `isPi: boolean` from
  `/api/auth/me` — do NOT reintroduce client-side PI_EMAILS arrays.
- **`api/index.ts` is Hono now.** Do NOT add routes with
  `url.pathname === '...'` comparisons — use `app.get/post('/api/...',
  handler)`. Middleware chain runs in order: OPTIONS → test-mode swap →
  API-key → authed-user resolve → PI gate (scoped `/api/pb/*` GET) →
  REQUIRE_AUTH (scoped writes) → version-bump-on-success (post-handler).
- **TaskDetailPanel has mobile touch handlers.** Don't add nested
  touch-gesture elements inside without checking axis-lock in
  `handleTouchMove` — the guard `target.closest('input, textarea, select,
  button, [contenteditable="true"], .ProseMirror, [role="listbox"]')`
  prevents input elements from triggering swipe.
- **`--slate`, `--teal`, `--gold`, `--maroon`, `--orange`, `--green`** are
  all literal sRGB hex (NOT OKLCH) in both light and dark mode. Don't
  "restore" them to OKLCH without reading CLAUDE.md Palette section.
- **`VITE_REQUIRE_AUTH`** env var gates the client-side sign-in wall.
  Default off. Flipping it ON without Cloudflare Access configured will
  lock everyone out including Nick.
- **`REQUIRE_AUTH` server secret** gates write endpoints. Same caveat.
- **`/api/pb/*` returns 403 to non-PI** — this is intentional. If you get
  403 during testing, it's the PI gate, not a regression. API keys +
  `lab_settings.pi_emails` bypass.
- **Deploy is manual via wrangler.** There's no git push → deploy webhook.
  `npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab`
- **brain.db ↔ D1 sync is bidirectional.** Changing a task in the Hub
  eventually lands in brain.db and vice versa. `sync_d1_push` translates
  canonical `task_{ulid}` PKs back to Hub hex IDs via `entity_aliases`.

## Closed: consultant-review "nice-to-have" list (Phase 36)

All five items shipped across commits `30f0bf7` (items 2/3/4/5) and
`2a92225` (item 1). Details in `CHANGELOG.md`.

## Scaffolded — not yet live

None at the moment. Everything that's in the codebase is deployed.

## Key files touched Phase 36

- `api/index.ts` — full rewrite to Hono (`hono@4.12.14`). 1875 → 1329 lines.
- `api/helpers.ts` — `getAuthUser` + `isPiRequest` → async; new `getPiEmails(env)`; `PI_EMAILS` → `PI_EMAILS_FALLBACK`.
- `api/jwt-verify.ts` (new) — CF Access JWT signature verification via JWKS.
- `api/types.ts` — `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` env vars; `TeamMemberRow.email`.
- `api/schema.sql` — `team_members.email TEXT`.
- `api/schema-v43.sql` (new) — team_members.email column + backfill.
- `api/schema-v44.sql` (new) — lab_settings.pi_emails row seed.
- `api/routes/projects.ts` — slug sanitizer applied to client-supplied `body.slug`.
- `api/routes/pb-sector.ts` — `handleCommandCenter` now uses `env.DB.batch([...])`.
- `api/routes/tasks.ts` — email column lookup; slug-derive as fallback.
- `api/routes/digest-email.ts` — email column lookup; slug-derive as fallback.
- `src/hooks/useAuth.ts` — `AuthUser.isPi` field; always-fetch API to hydrate `isPi`.
- `src/lib/roleDefaults.ts` — `getUserRoleFromAuth(user)` replaces `getUserRole(email)`; `PI_EMAILS` deleted.
- `src/pages/Dashboard.tsx`, `src/pages/portal/Tasks.tsx`, `src/pages/ProjectDetail.tsx`, `src/pages/portal/AnalyticsPage.tsx`, `src/components/Sidebar.tsx` — consume `user.isPi`.
- `src/components/tasks/TaskDetailPanel.tsx` — touch-handler state + axis-locked swipe-right dismissal.
- `scripts/merge-pf-sf-duplicate.sql` (new) — DI-4 merge SQL, executed on prod.
- `tests/mobile-swipe-smoke.spec.ts` (new) — Pixel 5 post-deploy smoke.
- `playwright.config.mobile.ts` (new) — mobile smoke config.
- `LAUNCH-CHECKLIST.md` — section 1 CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD secrets.
- `CLAUDE.md` — Hono rule, async auth rule, email column rule, swipe gotcha, slug fix.

## Git state

Hub: `main` at `ed40e39` (pushed to origin).
PB: `main` at `dd375854` (unchanged this session).

Re-check before modifying: `git status --short` should be empty in both repos.
