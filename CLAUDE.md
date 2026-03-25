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
| Scholar CSV | `C:\Users\ingra107\Downloads\citations (3).csv` — ground truth for publications |

## Design System

- **Fonts:** Fraunces (display) / DM Sans (body) / JetBrains Mono (mono)
- **Palette:** ink / gold / cream / maroon / teal (see `src/index.css`)
- **Centering:** ALL containers use `.content-container` — no custom max-width
- **Dark mode:** CSS variables invert via `.dark` class. Use CSS classes (not inline styles) for dark-mode-adaptive colors.

## Architecture

- **Now:** Static React SPA, all data in `src/data/*.ts` files
- **Next:** Cloudflare D1 replaces static data files
- **Auth future:** Cloudflare Access for team-facing features
- **Visibility:** Types have `visibility?: 'public' | 'internal'` — use this to hide in-progress items from public site

## Key Files

| File | Purpose |
|------|---------|
| `src/data/team.ts` | All team members + photos + slugs + authorNames + scholarIds |
| `src/data/publications.ts` | 63 papers (56 published, PubMed-verified). Scholar CSV is ground truth. |
| `src/data/grants.ts` | Active + Pending grants with status field |
| `src/data/types.ts` | TypeScript interfaces (Publication, Grant, Project, TeamMember) |
| `src/components/PublicationCard.tsx` | Author formatting + dark mode topic chips |
| `src/components/LabPageLayout.tsx` | Shared lab page shell + section components |
| `src/components/CollaborationNetwork.tsx` | Canvas co-authorship graph (core trio: Nick/Nate/Casey) |
| `src/components/ResearchImpact.tsx` | Publication timeline + journal distribution |
| `src/pages/MemberPage.tsx` | Dynamic `/team/:slug` for any team member |
| `src/pages/NickLab.tsx` | Nick's page: Grants → Lab → CLIF → Trainees → Pubs |
| `src/pages/NateLab.tsx` | Nate's page |
| `src/hooks/useCountUp.ts` | Animated counters — uses ref (not state) for trigger flag |
| `src/hooks/useScrollReveal.ts` | Scroll animations — visible by default, animation is enhancement |

## Author Formatting Rules (PublicationCard.tsx)

- ≤10 authors: show all, **bold** MNCCORE members (600), **semi-bold** CLIF members (500)
- >10 authors: first 3 + last 3 + all MNCCORE/CLIF members in between
- If >10 MNCCORE/CLIF in middle: focus on MNCCORE only
- `mnccoreMembers` and `clifMembers` arrays maintained in PublicationCard.tsx

## Critical Rules

1. **Content visible by default.** The `.fade-in-up` class starts at opacity:1. The scroll hook adds `.will-animate` only to below-viewport elements. NEVER hide content behind animations.
2. **Hero action cards use `<a>` tags** (full page load), not React Router `<Link>`. React Router v7 + AnimatePresence has a render loop bug with useCountUp.
3. **In-progress items are internal only.** Publications with `status: 'In Review'` or `'In Preparation'` show on the site. But pending grants must be clearly labeled "Pending Review". Use `visibility: 'internal'` for team-only items when the portal is built.
4. **PubMed is truth for publications.** Scholar CSV for completeness check, PubMed for exact titles/authors/DOIs.
5. **Grants: Active vs Pending.** Active grants have funding. Pending grants are under review. Display them separately with clear labels — don't let visitors think we're claiming unfunded grants.

## Roadmap

1. **Phase 1 — Done:** Public face, 63 publications, team pages, analytics, collaboration network
2. **Phase 2 — Next:** D1 backend, dashboard, network page, bento grid
3. **Phase 3:** Auth portal, project pipeline, grant tracker, meeting hub

## Peripheral Brain Connection

- **Project record:** `MN-CCORE Lab Hub` (type: Nick_Lab) in SQLite/Airtable
- **Living plan:** `Scratch/plans/mnccore-lab-website.md` — READ FIRST every session
- **Memory:** `memory/project_mnccore-website-redesign.md`
- **Architecture:** `Context/Decisions/2026-03-23_mn-ccore-lab-architecture.md`

## Known Gotchas

| Problem | Fix |
|---------|-----|
| UMN bio photos 403 | Use Playwright on faculty listing pages, not individual bios |
| Wrangler deploy path | `cd /c/Users/...` not `C:\...` |
| Tailwind v4 | `@import` syntax, not `@tailwind` directives |
| Hero cards don't navigate | Use `<a>` tags, not React Router Link (render loop with AnimatePresence) |
| Sections blank on mobile | Content must be visible by default — `.fade-in-up` starts at opacity:1 |
| useCountUp infinite loop | Use `useRef` for trigger flag, not `useState` in effect deps |
| Ghost publications | Always validate against Scholar CSV before adding papers |
