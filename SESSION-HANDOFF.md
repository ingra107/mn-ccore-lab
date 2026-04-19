# Session Handoff — 2026-04-19

> Last worked: Phase 35 + consultant review (Apr 18-19). Next session picks
> up here. One-glance state + what to do first.

## 📖 Session bootstrap — read these in order before writing anything

1. **This file** (you're here). Current gate, gotchas, commit, next action.
2. **`PROJECT.md`** — frontmatter `next_action` is canonical.
3. **`LAUNCH-CHECKLIST.md`** — section 0 is the only remaining work before the team gets the link. Read if Nick mentions launch / team / go-live.
4. **`CLAUDE.md`** — operating guide. Design system + palette + sync model + rules. Skip sections you don't need but have it open.
5. **`REFERENCE.md`** — reach for this when you need an API endpoint or D1 table name.
6. **`CHANGELOG.md`** top entry — "Phase 35" has the full record of what shipped this round.
7. **`docs/OBSERVABILITY.md`** — `/api/health` + runbook if anything looks broken.

**Where historical docs live (don't treat as driving):**
- `docs/archived/` — all superseded Hub docs (QA checklist, team roster, old design plans, old QA checklists).
- PB side: `Projects/mn-ccore-lab-hub/_archived/` — superseded plans, specs, and audit checklists.
  The main PB project folder has only current reference docs (vision, future ideas, competitive research).

## Gate — all green as of commit `bd2a7cc`

| Check | Result |
|---|---|
| Preflight | 🟢 GREEN — 97 pass / 0 fail / 0 findings |
| Deep-audit (14 suites) | 0 bugs across all |
| Axe WCAG 2.1 AA (dark) | 29 pages, 0 findings |
| Axe WCAG 2.1 AA (light) | 29 pages, 0 findings |
| `/api/health` | 200 `{ok: true}` |

Rerun gate: `npx tsx scripts/pre-flight/00-orchestrator.ts`
Rerun axe light: `npx tsx scripts/pre-flight/persona-axe.ts --light`
Rerun all deep-audits: `for f in scripts/deep-audit/0*-*.ts scripts/deep-audit/1[0-5]-*.ts; do npx tsx "$f" 2>&1 | tail -2; done`

## What's new since the previous handoff (Phase 34)

**Phase 35 shipped** — see `CHANGELOG.md` for the full record. Three main
tracks:

1. **Full accessibility.** All color tokens pinned to sRGB hex (axe-core 4.11
   mis-parses OKLCH). Light + dark mode clean across 29 pages. See
   `CLAUDE.md` Palette section for the token table.
2. **Sync parity.** Hub `task_comments` + Hub-originated `projects` now flow
   back to brain.db. New pull paths: `sync_d1_pull --task-comments` and
   `--hub-projects`. Suite 15 asserts both.
3. **Consultant-review launch blockers closed.** `/api/pb/*` PI-gated,
   `/api/bug-report` requires auth, `X-Test-Mode` requires secret,
   `REQUIRE_AUTH` + `VITE_REQUIRE_AUTH` flags for full hard-auth enforcement,
   `/api/health` observability + runbook.

## What to do FIRST in the next session

Read the state above, then:

1. If Nick's about to share the Hub URL with the team → follow
   `LAUNCH-CHECKLIST.md` section 0. Three secrets + one rebuild.
2. If Nick wants to keep improving → the consultant "nice-to-have" list is
   closed. JWT signature verification (`api/jwt-verify.ts`, needs
   `CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD` secrets to enforce),
   `team_members.email` column (v43), PI emails in `lab_settings` (v44),
   `pb-sector.handleCommandCenter` batched D1 reads, and Hono router
   migration are all shipped. The remaining roadmap is in
   `Projects/mn-ccore-lab-hub/HUB-AUDIT-CHECKLIST.md` (PB repo) — Tier A-E.
3. If Nick reports a bug → Fix Gate first (see `.claude/rules/agent-dispatch.md`),
   then reproduce with a deep-audit suite before fixing.

## Things that WILL surprise you if you don't know

- **`--slate`, `--teal`, `--gold`, `--maroon`, `--orange`, `--green`** are
  all literal sRGB hex (NOT OKLCH) in both light and dark mode. Don't
  "restore" them to OKLCH without reading CLAUDE.md Palette section.
- **`VITE_REQUIRE_AUTH`** env var gates the client-side sign-in wall.
  Default off. Flipping it ON without Cloudflare Access configured will
  lock everyone out including Nick.
- **`REQUIRE_AUTH` server secret** gates write endpoints. Same caveat.
- **`/api/pb/*` returns 403 to non-PI** — this is intentional. If you get
  403 during testing, it's the PI gate, not a regression. API keys +
  `PI_EMAILS` in `api/helpers.ts` bypass.
- **Deploy is manual via wrangler.** There's no git push → deploy webhook.
  `npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab`
- **brain.db ↔ D1 sync is bidirectional.** Changing a task in the Hub
  eventually lands in brain.db and vice versa. `sync_d1_push` translates
  canonical `task_{ulid}` PKs back to Hub hex IDs via `entity_aliases`.

## Closed: consultant-review "nice-to-have" list (2026-04-19)

All five items shipped in commits `30f0bf7` + `<hono-sha>`:

- ✅ Hono router — `api/index.ts` now uses Hono v4.12 (1875 → 1330 lines,
  ~225 route registrations with declarative path + method). Route-ordering
  bugs structurally prevented.
- ✅ `lab_settings.pi_emails` — PI allowlist runtime-configurable via
  SQL; `getPiEmails(env)` reads with 5-min cache + hardcoded fallback.
  Client-side PI_EMAILS duplicates (4 files) deleted; Sidebar/ProjectDetail/
  AnalyticsPage/Dashboard/Tasks now read `user.isPi` from `/api/auth/me`.
- ✅ Server-side JWT signature verification (`api/jwt-verify.ts`) — RS256
  + JWKS + exp/nbf/iss/aud checks. Requires `CF_ACCESS_TEAM_DOMAIN` +
  `CF_ACCESS_AUD` secrets to enforce; until set, falls back to decode-only
  (logs warn once per cold start). See `LAUNCH-CHECKLIST.md` section 1.
- ✅ `team_members.email` (schema-v43) — real column, backfilled with
  `slug || '@umn.edu'`; three derivation sites read the column with the
  slug-derive as fallback.
- ✅ `pb-sector.handleCommandCenter` batched — 11 parallel `Promise.all`
  queries → single `env.DB.batch([...])` RPC (1 round trip instead of 11).

## Known ignorable items

- 15.E/15.F info lines in Suite 15 are gone now — those were the sync-gap
  acknowledgments. Both paths pass asserts now.
- The preflight `trainee` persona takes ~60s due to intentional wait; don't
  "optimize" it without checking why.

## Scaffolded — not yet live

None at the moment. Everything that's in the codebase is deployed.

## Key files touched this session

- `api/index.ts` — /api/health, PI gate, bug-report auth, X-Test-Mode secret, REQUIRE_AUTH flag
- `api/helpers.ts` — `PI_EMAILS`, `isPiRequest()`
- `api/routes/digest-email.ts` — to-domain allowlist
- `api/routes/notifications.ts` — `read_at` stamping
- `api/routes/revisions.ts` — accept project_slug + reviewer_comments
- `api/routes/tasks.ts` — key_link on create, acknowledge body.slug override
- `src/App.tsx` — `<RequireAuth>` wrapper
- `src/index.css` — all color tokens pinned to hex
- `src/pages/portal/*` + `src/components/**` — opacity codemod (640+ sites)
- `scripts/pre-flight/persona-axe.ts` — 14 → 29 pages + `--light` flag
- `scripts/pre-flight/persona-health.ts` (new)
- `scripts/pre-flight/persona-newcomer.ts` (new)
- `scripts/deep-audit/15-pb-sync-deep.ts` — hard asserts for sync parity
- `scripts/db/sync_d1_pull.py` (PB repo) — task_comments + hub_projects pull
- `LAUNCH-CHECKLIST.md` — section 0: flip auth flags
- `docs/OBSERVABILITY.md` (new)

## Git state

Hub: `main` at `bd2a7cc` (pushed to origin) — plus in-flight doc updates this session
PB: `main` at `dd375854` (pushed to origin) — plus in-flight doc updates this session

Re-check before modifying: `git status --short` should be empty in both repos.
