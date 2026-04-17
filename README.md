# MN-CCORE Lab Hub

**Live:** [mn-ccore-lab.pages.dev](https://mn-ccore-lab.pages.dev)

Lab management platform for the MN-CCORE research group at UMN. Runs meetings,
tracks projects/tasks/grants/manuscripts, hosts the team directory, publishes
the public research presence, and integrates AI via Hermes (`@hermes` mentions
in comments).

## Stack

- **Frontend:** React 19 + Vite 8 + TypeScript + Tailwind v4 + Framer Motion 12
- **Data:** TanStack Query v5 → Cloudflare D1 (62+ tables, 190+ API endpoints)
- **Testing:** Playwright (214+ inspection tests) + Vitest (component)
- **Realtime:** Cloudflare Durable Objects + PartySocket (`hub-realtime` worker)
- **AI assistant:** Hermes via `hub_ai_listener.py` (Peripheral Brain)

## Start here if you're a fresh Claude session

1. **`CLAUDE.md`** — operating guide. Design system, architecture, 17 critical
   rules, known gotchas. Source of truth for how this codebase is organized.
2. **`Projects/mn-ccore-lab-hub/HUB-AUDIT-CHECKLIST.md`** (Peripheral Brain repo)
   — canonical 15-section interaction audit + methodology + Tier A-E next-steps
   roadmap. Drives `scripts/hub-audit.ts`.
3. **`CHANGELOG.md`** — phase-by-phase build history. Phase 34 is the current
   phase (audit framework + key-link editor, 2026-04-17).

## Run locally

```bash
npm install
npm run dev              # Vite dev server on :5173
npm run test:local:setup # Miniflare local D1 + schema + seed
npm run test:local       # Playwright against local D1
```

## Run the audit

```bash
npx tsx scripts/hub-audit.ts              # full 14-section audit (~8 min)
npx tsx scripts/hub-audit.ts --section=X  # one section
npx tsx scripts/hub-audit.ts --cleanup    # delete test_delete_* rows
npx tsx scripts/hub-audit.ts --list       # list sections
```

Output goes to `review/audit/YYYYMMDDTHHMM/` — screenshots + findings per
section.

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
  hub-audit.ts       Canonical interaction audit (see HUB-AUDIT-CHECKLIST.md)
  seed/              Data seeding + cleanup SQL
workers/
  hub-realtime/      Durable Object for PartySocket realtime updates
docs/
  archived/          Historical session logs + superseded specs
```

## Launch prerequisites

See `LAUNCH-CHECKLIST.md` for the Cloudflare Access + RESEND_API_KEY + GitHub
secrets that Nick needs to set before April 21. The living launch plan is in
the Peripheral Brain repo: `Projects/mn-ccore-lab-hub/plans/april-21-launch-readiness.md`.

## License

Internal lab tool — not open-source.
