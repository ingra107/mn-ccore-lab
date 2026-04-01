# MN-CCORE Lab Hub -- Claude Operating Guide

## Vision

The MN-CCORE Lab Hub is the **team's operating surface** -- where research gets managed, meetings get run, and information flows between Nick's CLI system and every team member's browser.

## Quick Reference

| Thing | Value |
|-------|-------|
| Live site | mn-ccore-lab.pages.dev |
| Repo | github.com/ingra107/mn-ccore-lab (370+ commits) |
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
1. **Dark-first design.** Dark bg is deep neutral (#0b1017), NOT blue-tinted. Text is #e2e8f0 (not pure white — less glare). Light mode secondary.
2. **Columnar tables, not card stacks.** Data pages use fixed-column tables with headers (Title|Assignee|Due|Status|Priority). Cards are for dashboards only. Fixed row height for vertical scanning.
3. **Inline editability with visible affordance.** Every editable field shows "▾" dropdown indicator. Click cell → dropdown/picker by type. Auto-save on blur. No explicit save button. (Research: Pattern 4)
4. **Typography: light weight, three opacity tiers.** Body font-weight: 400. Active text: 100% opacity. Normal: 70% (--ink = #e2e8f0). Muted: 40% (--slate = #94a3b8). NEVER 500+ weight for body text.
5. **One accent color per view.** Teal for interactive. Everything else neutral. Max 2 non-neutral colors per view.
6. **More info, more readable.** Density ≠ clutter. LabSync puts 20 sidebar items that are MORE readable than our 17. The secret: font-weight 400, grouped sections with rhythm, consistent icon opacity.
7. **Zero monospace in content.** JetBrains Mono for `<kbd>` only. ALL other text is DM Sans.
8. **Optimistic UI + undo.** State changes are instant. Undo toast for 5 seconds. Never show spinners for actions. (Research: Pattern 9)
9. **Click targets must be precise.** Clicking a task row opens detail panel. ONLY clicking the status circle changes status. Hover actions hidden until hover (pointer-events:none at opacity:0).

### Fonts
- **Portal titles:** DM Sans (clean, operational)
- **Public website titles:** Fraunces (editorial, brand voice)
- **Body text:** DM Sans everywhere
- **Code only:** JetBrains Mono
- **CSS:** `--font-sans` and `--font-body` both resolve to DM Sans. `--font-display` = Fraunces (public pages only).

### Palette
- **Light:** bg white `#ffffff` / ink `#0f1923` / slate `#2c3e50`
- **Dark:** bg `#0b1017` / ink `#e2e8f0` / slate `#94a3b8` (neutral, not blue-tinted)
- **Accents:** gold `#c9a84c` / teal `#2d8a8a` / maroon `#7a0019` / orange `#c2410c` / green `#16a34a`
- **Containers:** light `#f5f5f5` / dark `#111820`
- Category dots: 6px, 0.7 opacity -- maroon=CLIF, teal=Lab, gold=Mesfin

### Table Pattern (apply to ALL data pages)
- Bordered container with subtle border and small radius
- Column headers: uppercase, 11px, 0.5 opacity, 0.06em letter-spacing
- Stage group headers: quiet uppercase labels with extending rule line
- Row hover: gold-tinted `rgba(201, 168, 76, 0.06)`, active at `0.10`
- Inline controls: status/priority dropdowns editable in-row
- Ghost-style action buttons (outline, not filled)

### Micro-interactions
- Background: 120ms ease-out. Shadows: 250ms ease. Card hover: -1px lift.

### Sidebar
- Font-weight 400 for nav items, 500 for active only
- Active: teal bg fill, no left border. Inactive: --slate color, icon opacity 0.7.
- Section labels: 10px uppercase, opacity 0.5. Divider lines between groups.
- Row height: py-2.5 (generous). Gap: gap-3. Items within groups are tight; groups are separated.
- Reference: LabSync sidebar — more items, more readable. The secret is lighter weight + grouped rhythm.

### Borders & Spacing
- `--border-light` (gold tint) = semantic. `--border-subtle` (neutral) = structural. Don't mix.
- Spacing: 4, 8, 12, 16, 20, 24, 32px grid. No off-grid values.

### UX Research Patterns (from task-management-ux-patterns-research.md)

Must-reference before building ANY new feature. Key implementable patterns:
- **Pattern 4 (Inline Editing):** Click any field → edit mode by type (dropdown/picker/text). Auto-save on blur.
- **Pattern 7 (List View):** Fixed row height. Column headers. Grouping with collapsible headers. Density toggle.
- **Pattern 9 (Optimistic UI):** Instant state changes. Undo toast for 5 seconds. Never show spinners.
- **Pattern 10 (Micro-interactions):** Completion animation. Status color transitions. Progressive disclosure.
- **Pattern 3 (Three depth levels):** Peek (Space) → Side Panel (click) → Full Page (Enter). Decision tree in research doc.

Reference: `Projects/mn-ccore-lab-hub/task-management-ux-patterns-research.md` (PB repo)
Competitive reference: LabSync (JC Rojas) — friend, learn from, never compete.

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

**Phases 1-13: COMPLETE** (360+ commits). See `REFERENCE.md` for details.

**Phase 14: COMPLETE** (7 commits). Design ethos pivot — palette, containers, inline editing, fonts, monospace, colors.

**Phase 15: COMPLETE** (1 commit). Project detail → tabbed workspace.

**Phase 16: COMPLETE** (10 commits). LabSync parity push — foundation + tables:
- Dark bg deepened #0b1017, text softened #e2e8f0, body weight 400
- TaskGridView: columnar table (Title|Assignee|Due|Status|Priority) with inline editing
- Deadlines + Ideas: converted to columnar tables
- SectionHeader, ToggleButton, MetricCard, BentoCard: lighter weights
- Undo toast system, workload visibility, task click bug fix
- CLAUDE.md: 9 design principles from LabSync + UX research

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
