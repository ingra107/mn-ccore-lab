# MN-CCORE Lab Hub

**Live:** [mnccore.org](https://mnccore.org) (alias: [mn-ccore-lab.pages.dev](https://mn-ccore-lab.pages.dev))

Lab management platform for the MN-CCORE research group at UMN. Runs meetings,
tracks projects/tasks/grants/manuscripts, hosts the team directory, publishes
the public research presence, and integrates AI via Hermes (`@hermes` mentions
in comments).

## Stack

- **Frontend:** React 19 + Vite 8 + TypeScript + Tailwind v4 + Framer Motion 12
- **API:** Hono v4.12 router on Cloudflare Workers (Phase 36)
- **Data:** TanStack Query v5 → Cloudflare D1 (75 tables, 236 route registrations)
- **Testing:** Playwright (568+ tests, 4 suites) + Vitest (component, browser mode)
- **Realtime:** Cloudflare Durable Objects + PartySocket (`hub-realtime` worker)
- **AI assistant:** Hermes via `hub_ai_listener.py` (Peripheral Brain)

## Start here if you're a fresh Claude session

1. **`SESSION-HANDOFF.md`** — current gate, last commit, what to do first.
   Always read this before writing any code.
2. **`CLAUDE.md`** — operating guide. Design system, architecture, 28 critical
   rules, known gotchas. Source of truth for how this codebase is organized.
3. **`CHANGELOG.md`** — phase-by-phase build history. Phase 37 (portal URL
   migration + team launch 2026-04-21) is the current phase. Earlier: 36e
   (Claude Design handoff), 36d (design sprint), 36c (4-auditor deep audit),
   36b (slug rename), 36 (consultant close-out + mobile swipe), 35 (a11y + sync).
4. **`Archive/2026-10-11-launch-docs/LAUNCH-CHECKLIST.md`** — launch work complete 2026-04-21. Only
   `RESEND_API_KEY` (daily digest email, optional) remains.

## Run locally

```bash
npm install
npm run dev              # Vite dev server on :5173
npm run test:local:setup # Miniflare local D1 + schema + seed
npm run test:local       # Playwright against local D1
```

## Run the audit

```bash
npm run preflight         # persona walk-throughs against prod (scripts/pre-flight/)
```

Output goes to `review/preflight/<run id>/<persona>/`: screenshots and findings.

## Design assets for Claude Design

```bash
# Paste the brand brief into Claude Design (opens web app):
cat scripts/claude-design-brief.txt | clip.exe          # Windows
cat scripts/claude-design-brief.txt | pbcopy            # macOS

# Capture fresh full-page screenshots of every hero surface:
npx playwright test --config=playwright.config.design-capture.ts

# Capture 15 signature interactions as WebM videos + PNG keyframes:
npx playwright test --config=playwright.config.interactions-capture.ts
```

Outputs go to `review/claude-design-<ts>/` and `review/interactions-<ts>/`
(gitignored). Upload the folder to Claude Design alongside the brief
to ground pitch decks / posters / brand assets in the current state
of the product. Source brand DNA is in `CLAUDE.md` "Design System" +
"Design Ethos" sections.

## Deploy

```bash
npm run build
bash /c/Users/ingra107/Peripheral-Brain/scripts/utils/safe_deploy.sh \
  pages deploy dist --project-name mn-ccore-lab
```

`safe_deploy.sh` blocks deploys from untracked directories (see
`Peripheral-Brain/memory/feedback_orphaned-worker-sources.md`).

## Repo map

```
api/                 Cloudflare Workers API (190+ endpoints)
  schema.sql         D1 table definitions
  schema-v*.sql      Migrations (apply via POST /api/admin/migrate)
  routes/            Per-resource route handlers
src/
  components/        Shared components (KeyLinksEditor, InlineSelect, etc.)
  pages/             Page-level components (portal/ + public/)
  data/              Static team/project/grant data + types
  hooks/             Custom hooks (useApiData, useMutations, useTheme, etc.)
  lib/               Utilities (dateUtils, nameUtils, api)
tests/               Playwright + Vitest specs
scripts/
  pre-flight/        Persona audit scripts (npm run preflight*)
  seed/              Data seeding + cleanup SQL
workers/
  hub-realtime/      Durable Object for PartySocket realtime updates
docs/
  archived/          Historical session logs + superseded specs
```

## Launch status

**LIVE 2026-04-21.** CF Access gates `mnccore.org/portal/*` (and `www.mnccore.org`, `mn-ccore-lab.pages.dev`)
via @umn.edu policy. All 4 server secrets + client-side
`VITE_REQUIRE_AUTH=1` set. GitHub Actions secrets for schema-drift CI
set. Remaining optional: `RESEND_API_KEY` for daily digest email
cron. See `Archive/2026-10-11-launch-docs/LAUNCH-CHECKLIST.md` for the full status table. Living
launch plan in the Peripheral Brain repo:
`Projects/mn-ccore-lab-hub/plans/april-21-launch-readiness.md`.

## License

Internal lab tool — not open-source.
