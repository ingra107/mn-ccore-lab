---
record_id: rec6HYkDBk4di5ncw
slug: mn-ccore-lab-hub
created: 2026-03-25
status: active
domain: Research
tier: 2-Biweekly
next_action: Run the PB #1126 author_slugs backfill FIRST — measured on prod 2026-08-18, 622 of 652 rows still carry exactly ONE slug, so the backfill has NOT landed and the previous next_action asserting it had was wrong. scripts/backfill-author-slugs-report.ts is the read-only report; the UPDATE does not exist yet. Only AFTER it lands, add the authorship check to PUT /api/team/:slug/featured-publications — adding it today would reject legitimate coauthors on every pre-fix row, which is exactly what the handler's own comment says to avoid.
primary_folder: C:/Users/ingra107/mn-ccore-lab
---

# MN-CCORE Lab Hub

React 19 + Vite 8 + Tailwind v4 + Cloudflare Pages/D1 lab management
platform for Nick's critical-care research group at UMN.

**Live:** https://mnccore.org  (alias: https://mn-ccore-lab.pages.dev; LIVE for team, CF Access gates `/portal/*` via @umn.edu)
**Repo:** https://github.com/ingra107/mn-ccore-lab  (720+ commits)
**Latest round (2026-09-03):** bug sweep #118–#120 (armed "Delete?" state on the activity trash, Meetings panel actions moved to the top; #119 triaged as a PB listener feature). **Do NOT read HEAD / live-deploy / schema-version off this line** — all three went stale here before (the schema field sat 19 migrations behind and nearly caused a migration to be misnumbered). Derive them: HEAD = `git log -1`; live deploy = `wrangler pages deployment list --project-name mn-ccore-lab` (Source column); schema = the highest-numbered `api/schema-v*.sql`, enforced by `python scripts/check-schema-versions.py`. See SESSION-HANDOFF.md top + CHANGELOG.md top for the round's record.
**Quality gate:** 🟢 GREEN — build clean, inspection 149/149 post-simplify, smoke 27/27 (pre-simplify baseline), deep-audit 14/14 clean, axe WCAG 2.1 AA clean across 29 pages × 2 color schemes, schema-drift CI green.

## 🚨 Read these FIRST every session

1. **`SESSION-HANDOFF.md`** — one-page current state, gotchas, next action, git HEADs, key files touched. Always read this before writing any code.
2. **`CLAUDE.md`** — full operating guide (design system, palette, sync model, file map).
3. **`REFERENCE.md`** — API endpoints, D1 table list, conventions.
4. **`CHANGELOG.md`** — top entry is the most recent phase; jump there for "what changed recently."
5. **`docs/OBSERVABILITY.md`** — /api/health runbook + how to wire external uptime monitoring.

## Phase history

Phases 35-37 (April 2026) are in `CHANGELOG.md`. The long-form notes cut from this file on 2026-10-11 are in
`Archive/2026-10-11-launch-docs/PROJECT-phase-35-37-history.md`. The launch checklist, including the CF Access
secret commands (sections 0 and 1), is `Archive/2026-10-11-launch-docs/LAUNCH-CHECKLIST.md`.
