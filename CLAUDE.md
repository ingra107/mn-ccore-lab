# MN-CCORE Lab Hub — Claude Operating Guide

## Vision

This is the **MN-CCORE Lab Hub** — not just a website, but the central project management and public face of the Minnesota Critical Care Outcomes & Research Effort. It will grow to include team management, project tracking, publications, and eventually a D1-backed data layer.

## Quick Reference

| Thing | Value |
|-------|-------|
| Live site | mn-ccore-lab.pages.dev |
| Repo | github.com/ingra107/mn-ccore-lab |
| Deploy | `cd /c/Users/ingra107/mn-ccore-lab && npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab` |
| Stack | React 19 + Vite 8 + Tailwind v4 + Framer Motion 12 + TypeScript |
| Deploy mode | Manual via wrangler — NO auto-deploy |

## Design System

- **Fonts:** Fraunces (display) / DM Sans (body) / JetBrains Mono (mono)
- **Palette:** ink / gold / cream / maroon / teal (see `src/styles/`)
- **Centering:** All containers use `.content-container` (max-width: 1440px, margin: 0 auto) — do NOT add custom centering
- **Inner page paddingTop:** 90px (navbar height)

## Architecture

- **Now:** Static React SPA, all data in `src/data/*.ts` files
- **Next:** Cloudflare D1 replaces static data files (decision: `Context/Decisions/2026-03-23_mn-ccore-lab-architecture.md` in Peripheral Brain)
- **Auth future:** Cloudflare Access for team-facing project management features

## Key Files

| File | Purpose |
|------|---------|
| `src/data/team.ts` | All team members, photos, roles |
| `src/data/publications.ts` | Nick + Nate publications (~28 papers) |
| `src/data/types.ts` | TypeScript interfaces |
| `src/components/PublicationCard.tsx` | Author formatting logic (>10 author truncation) |
| `src/components/LabPageLayout.tsx` | Shared lab page shell + section components |
| `src/pages/NickLab.tsx` | Nick's individual page |
| `src/pages/NateLab.tsx` | Nate's individual page |
| `src/pages/Team.tsx` | Full team roster |

## Author Formatting Rules (PublicationCard.tsx)

- ≤10 authors: show all, **bold** MNCCORE/CLIF members
- >10 authors: first 3, `...`, **bold** MNCCORE members in order, `...`, last author
- `mnccoreMembers` array includes: Ingraham NE, Mesfin N, Eddington C, Bromley E, Collins C, Shyu D, Fitzgerald B, Pendleton KM, Chipman JG, Dudley RA, Wacker D, Trujeque J, McEachron K, Safadi S

## Roadmap (Hub Evolution)

1. **Phase 1 — Done:** Public face (team, publications, lab pages)
2. **Phase 2 — Next:** D1 backend, dynamic data, project tracker visible to team
3. **Phase 3:** Authenticated team portal (project management, meeting notes, task board)

## Peripheral Brain Connection

- **Project record:** `MN-CCORE Lab Hub` (type: Nick_Lab) in SQLite/Airtable
- **Learnings memory:** `memory/project_mnccore-website-redesign.md` in Peripheral Brain
- **Design plan:** `Scratch/plans/mnccore-lab-website.md` in Peripheral Brain

## Known Patterns / Gotchas

- UMN bio photo pages return 403 (Cloudflare) — use Playwright to scrape faculty listing pages, not individual bio pages
- Wrangler deploy from bash: must use `cd /c/Users/...` path (not Windows path)
- `npm run build` before every deploy — wrangler doesn't auto-build
- Tailwind v4 uses `@import` syntax, not `@tailwind` directives
