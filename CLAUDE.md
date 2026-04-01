# MN-CCORE Lab Hub -- Claude Operating Guide

## Vision

The MN-CCORE Lab Hub is the **team's operating surface** -- where research gets managed, meetings get run, and information flows between Nick's CLI system and every team member's browser.

## Quick Reference

| Thing | Value |
|-------|-------|
| Live site | mn-ccore-lab.pages.dev |
| Repo | github.com/ingra107/mn-ccore-lab (360+ commits) |
| Deploy | `cd /c/Users/ingra/mn-ccore-lab && npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab` |
| Stack | React 19 + Vite 8 + Tailwind v4 + Framer Motion 12 + TypeScript |
| Data | TanStack Query v5 + Cloudflare D1 (19 tables, 60+ endpoints) -- ALL LIVE |
| D1 database | `b8453e9b-7c5f-4029-b07d-dd89c05d00cf` (ENAM) |
| Deploy mode | Manual via wrangler -- NO auto-deploy |
| PB project | `Projects/mn-ccore-lab-hub/` -- PROJECT.md, living plan, future ideas |
| Reference | `REFERENCE.md` in this repo -- D1 tables, API endpoints, key files, feature list |

## Design System

### Design Ethos: Operational, Not Editorial (Decision: 2026-04-01)

The Hub is a **research operations center**, not a magazine. Every design choice prioritizes usability and data clarity over decoration. Read `Context/Decisions/2026-04-01_hub-design-ethos-pivot.md` (PB repo) for full rationale.

**Core principles (NEVER violate):**
1. **Dark-first design.** Optimize for dark mode. Light must also be great, but dark is primary.
2. **Data tables in bordered containers.** Every table sits inside a visible bordered rectangle. No floating rows.
3. **Inline editability.** Status, stage, priority editable directly in table rows. Detail panel for deeper edits.
4. **Zero monospace in content.** JetBrains Mono is for code displays ONLY. Project slugs, meeting names, metadata use DM Sans. NEVER render user-facing text in monospace.
5. **One accent color per view.** Teal for interactive elements. Everything else neutral.
6. **Restraint > decoration.** Fewer visual layers, more whitespace. The loudest thing on the page is the data.
7. **List view as default** for data-heavy pages (>10 items). Kanban/pipeline as opt-in toggle.

### Fonts
- **Portal titles:** DM Sans (clean, operational)
- **Public website titles:** Fraunces (editorial, brand voice)
- **Body text:** DM Sans everywhere
- **Code only:** JetBrains Mono
- **CSS:** `--font-sans` and `--font-body` both resolve to DM Sans. `--font-display` = Fraunces (public pages only).

### Palette (evolving -- cream is NOT sacred)
- ink `#0f1923` / gold `#c9a84c` / teal `#2d8a8a` / maroon `#7a0019` / slate
- Background: moving toward clean white (light) / ink (dark). Cream (#faf8f3) may be replaced.
- Warm containers: `#f5f3ee` for pipeline columns (not cool `--ice`)
- Category encoding: small dots (6px, 0.7 opacity) -- maroon=CLIF, teal=Lab, gold=Mesfin

### Table Pattern (apply to ALL data pages)
- Bordered container with subtle border and small radius
- Column headers: uppercase, 11px, 0.5 opacity, 0.06em letter-spacing
- Stage group headers: quiet uppercase labels with extending rule line
- Row hover: gold-tinted `rgba(201, 168, 76, 0.06)`, active at `0.10`
- Inline controls: status/priority dropdowns editable in-row
- Ghost-style action buttons (outline, not filled)

### Micro-interactions
- Background: 120ms ease-out. Shadows: 250ms ease. Card hover: -1px lift.

### Sidebar (needs improvement)
- Sections need clear whitespace separation (not just a heading)
- Reference: LabSync sidebar for section separation quality

### Borders & Spacing
- `--border-light` (gold tint) = semantic. `--border-subtle` (neutral) = structural. Don't mix.
- Spacing: 4, 8, 12, 16, 20, 24, 32px grid. No off-grid values.

### Shared Utilities
- `src/lib/dateUtils.ts` (formatters), `src/data/team.ts:getPersonInfo()`, `formatBrandName()` from BrandName.tsx

## Architecture

```
Nick's CLI (brain.db)  ←sync→  D1 (mnccore-lab)  ←API→  React + TanStack Query
```

- **Data:** TanStack Query v5 → D1 API (prod), static TS fallback (dev)
- **API:** Cloudflare Worker, 60+ endpoints, auth-gated writes
- **Auth:** Open now. Cloudflare Access for April 7 launch (@umn.edu)
- **Email:** Worker cron + SendGrid (dormant -- needs API key)
- **Sync:** `sync_d1_push.py` / `sync_d1_pull.py` in PB, scheduled

## Critical Rules

1. **Content visible by default.** `.fade-in-up` starts at opacity:1. NEVER hide content behind animations.
2. **Hero cards use `<a>` tags**, not React Router `<Link>`. AnimatePresence + useCountUp conflict.
3. **initialData as factory functions.** `initialData: () => data`, never `initialData: data`.
4. **Avatar:** Container `overflow-hidden`, img `w-full h-full`.
5. **`getPersonInfo()` from `src/data/team.ts`** -- never create local copies.
6. **Date formatting from `src/lib/dateUtils.ts`** -- never create local formatters.
7. **@mentions use `MentionInput`** -- not raw `<textarea>`.
8. **Dedup action items** -- normalize "[Carried forward]" prefix.
9. **NEVER deploy from a worktree.** Commit to branch + PR only.
10. **ONE deploy per session.** KV free tier limit. Batch all work, deploy once.
11. **`formatBrandName()`** for any text that might contain "MNCCORE".
12. **Tailwind v4:** `@import` syntax, not `@tailwind`. No `group-hover:` with arbitrary values -- use CSS rules.

## Roadmap

**Phases 1-13: COMPLETE** (360+ commits). Public website, D1 backend, team portal, sync, 28 portal features, task system, PB Sector v2, visual polish. See `REFERENCE.md` for details.

**Phase 14 -- IN PROGRESS: Design Ethos Pivot**
- [x] LabSync study (10 patterns), 3 design audit rounds
- [x] Projects + Manuscripts pages redesigned (list-first, category dots, warm palette)
- [x] `--font-sans` defined globally (was undefined -- 44 files in wrong font)
- [ ] Palette shift: cream → white/neutral, dark-first optimization
- [ ] Bordered table containers on all data pages
- [ ] Inline status/stage editing in table rows
- [ ] Sidebar section separation improvement
- [ ] Font split: DM Sans for portal titles, Fraunces for public only
- [ ] Project detail → operational workspace
- [ ] Apply to all portal pages (Tasks, Ideas, Dashboard, etc.)
- [ ] Kill remaining monospace in content (Tasks page)

## Meeting Cadence

Biweekly Tuesdays 3pm CT. Anchor: Apr 7, Apr 21. Automation runs Monday mornings.

## Known Gotchas

| Problem | Fix |
|---------|-----|
| Hero cards render loop | Use `<a>` tags, not Router Link |
| initialData flash | Use factory functions: `() => data` |
| Meeting ID collision | IDs include random suffix |
| Tailwind v4 group-hover | Use CSS rule in index.css, not arbitrary value |
| --border-light vs --border-subtle | Gold=semantic, Neutral=structural. Don't mix. |
| TaskCard status cycling | todo→in_progress→done (skips blocked) |
| Network chunk 1.3MB | Expected (three.js). Code-split via React.lazy |
| CF Access blocks all | Restrict to portal paths only |
| Duplicate action items | Dedup by normalizing "[Carried forward]" |

## Peripheral Brain Connection

- **Project folder:** `Projects/mn-ccore-lab-hub/` -- PROJECT.md, living plan, vision, future ideas
- **Memory:** `memory/project_mnccore-website-redesign.md`
- **Design decision:** `Context/Decisions/2026-04-01_hub-design-ethos-pivot.md`
- **Sync:** `scripts/db/sync_d1_push.py` / `sync_d1_pull.py`
- **Meeting automation:** `scripts/scheduled/meeting_automation.py`
