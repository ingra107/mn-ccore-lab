# MN-CCORE Lab Hub -- Claude Operating Guide

## Vision

The MN-CCORE Lab Hub is the **team's operating surface** -- where research gets managed, meetings get run, and information flows between Nick's CLI system and every team member's browser.

## Quick Reference

| Thing | Value |
|-------|-------|
| Live site | mn-ccore-lab.pages.dev |
| Repo | github.com/ingra107/mn-ccore-lab (400+ commits) |
| Deploy | `cd /c/Users/ingra/mn-ccore-lab && npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab` |
| Stack | React 19 + Vite 8 + Tailwind v4 + Framer Motion 12 + TypeScript |
| Data | TanStack Query v5 + Cloudflare D1 (33 tables, 90+ endpoints) -- ALL LIVE |
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
4. **Typography: light weight, three opacity tiers.** Body font-weight: 400. Active text: 100% opacity. Normal: 70% (--ink = #e2e8f0). Muted: 40% (--slate = #94a3b8). NEVER 500+ weight for body text. Weight hierarchy: body=400, label/subtitle=500, card metrics=700, heading h1=600.
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

### Micro-interactions (standardize to 2 constants)
- `--transition-fast: 150ms` — hover, toggle, status change, row highlight
- `--transition-panel: 250ms` — sidebar, detail panel, modal, card shadow
- Card hover: -1px lift.
- NOTE: Currently 7+ different durations exist inline (120/150/200/250/300ms). Standardize to these 2.

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
- **API:** Cloudflare Worker, 90+ endpoints, auth-gated writes
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

**Phase 20: COMPLETE** (12 commits + simplify). UX polish & interaction:
- HoverCard: preview cards on hover (project/member/task), wired to 6 surfaces
- TaskContextMenu: right-click for quick actions with submenus
- Toast system: success confirmations for 8 key mutations + timeout cleanup
- ActivityHeatmap on MemberPage, stagger animations (Dashboard + Projects)
- J/K keyboard nav on Projects page, role-based dashboard views (PI/Fellow/Coordinator)
- Design ethos enforcement: heading weights fixed across 57 files
- Simplify: shared constants (lib/taskConstants.ts, lib/animations.ts), memoized Personal.tsx

**Phase 20.5: Mobile Responsive** (1 commit from home laptop, d65d71c):
- Stacked card layout on mobile, columnar grid on desktop (Projects, Manuscripts, Deadlines, Ideas)
- InlineSelect larger touch targets, global CSS 36px min touch targets

**Phase 20.6: Quick Fixes** (2026-04-03):
- Fixed: Portal h1 fonts changed from Fraunces to DM Sans (Dashboard, Projects)
- Fixed: Duplicate action item empty states on Meetings page

**Phase 21: Visual Perfection** (audit-verified + expert playbook 2026-04-03):

> **SELF-EXECUTING SESSION INSTRUCTIONS:**
> When `/work-on MN-CCORE Lab Hub` loads this file, execute Phase 21 blocks in order.
> DO NOT ask questions. All decisions have been made. All file paths are specified.
> Read `Projects/mn-ccore-lab-hub/phase21-implementation-playbook.md` (PB repo) for full details.
> Also read: `expert-code-review-2026-04-03.md` for spring physics code + detailed specs.
> Also read: `nicks-vision-and-priorities.md` for design philosophy and priorities.
> Start with **Block 0** (expert quick wins), then Block 1, etc.
> Deploy once at end of session. Commit at natural checkpoints.
>
> **AFTER EVERY BLOCK/FEATURE:** Update docs per the Documentation Protocol in the playbook.
> Minimum: mark item BUILT in hub-future-ideas.md, strikethrough in CLAUDE.md, update PROJECT.md next_action.
> This keeps the stream of consciousness alive across sessions.

**Block 1 (2.5 hrs): Progressive Disclosure + Column Sort**
- Collapse SavedViewsBar + TaskFilters behind F key toggle on Tasks page
- Make column headers clickable for sort (ascending -> descending -> clear), remove sort pill row
- Filter panel: AnimatePresence height 0->auto, 250ms. Active filter: teal dot on button
- Sticky control row. Files: Tasks.tsx, TaskFilters.tsx, TaskGridView.tsx, useTaskKeyboardShortcuts.ts
- New: FilterToggleButton.tsx
- Layout: [Title] / [ViewToggles | Filter(count)] / [F reveals: SavedViews + Filters] / [Column headers] / [Data]

**Block 2 (30 min): Empty State Personality**
- String-only edits across 10 files. Copy in playbook. No component changes.

**Block 3 (30 min): Transition Constants**
- Add --transition-fast (150ms) and --transition-panel (250ms) to index.css
- New: src/lib/transitions.ts with FAST/PANEL/STAGGER exports
- Normalize inline durations as files are touched

**Block 4 (1.5 hrs): Welcome Banner + First Visit**
- New: WelcomeBanner.tsx on Dashboard (teal bg, progress ring, dismissible)
- New: PageTooltip.tsx (single-use contextual tooltips, localStorage "seen" state)
- Wire onboarding checklist as top card on Personal Hub

**Block 5 (3-4 hrs): Meeting Prep View — Demo Showpiece**
- New route: /meetings/:id/prep
- New: functions/api/meetings/[id]/prep.ts (aggregate: prev meeting action items + activity + deadlines)
- New: MeetingPrep.tsx (facilitator view: action items, project updates, upcoming deadlines, suggested agenda)
- Add "Prep View" button on MeetingDetail.tsx

**Remaining Phase 21 items (after Blocks 1-5):**
6. Hardcoded white: ~50 instances → CSS variable
7. Extract shared taskConfig.ts (4+ duplicate config files)
8. Loading skeletons: 10 pages
9. Inline editing expansion: Ideas, Decisions + "▾"
10. Undo toast expansion
11. J/K keyboard nav expansion (6+ pages)
12. HoverCard expansion (5+ surfaces)
13. Stagger animations expansion
14. Accent color discipline

**Phase 19: COMPLETE** (4 commits). Differentiation features:
- Trainee Development Trajectories: per-member page with pub curve, project velocity, task metrics, activity heatmap
- Decision Replay System: tags, similar decisions search, outcomes tracking, project linking, timeline view
- Evidence-Based PI Dashboard: commitment scorecard, response time, team engagement, mentee pub velocity, grant pipeline
- Expertise tags on team profiles (teal pills, clickable, filterable on Team page)

**Phase 18: COMPLETE** (2 commits). Functional depth:
- Blocker flagging: blocked_by field, Link2 chain icons, B keyboard shortcut, auto-status
- Project Health: real algorithm (activity/velocity/overdue/milestones), colored bars, health dots
- Dashboard card type badges, view toggle standardization

**Phase 17: COMPLETE** (7 commits). UX interaction layer + visual consistency:
- PageHeader: standardized across all 18 portal pages (LabSync Pattern 3)
- EmptyState: consistent empty states with icon+title+subtitle+CTA
- LoadingSkeleton: Table/Card/Text skeletons replacing all loading spinners
- Task keyboard shortcuts: J/K nav, Space peek, S status cycle, X select, Enter detail
- TaskPeekOverlay: Linear-style right-side panel (400px, slide-in)
- InlineAssigneePicker: avatar dropdown for assignee editing in grid
- InlineDatePicker: date editing with overdue detection
- CollapsibleSection: progressive disclosure in TaskDetailPanel
- Board enhancements: column collapse + swimlanes (group by status/priority/assignee)
- Status color transitions (150ms), task completion animation (Todoist-style)
- Hover row actions (Edit/Archive/Add to Meeting ghost buttons)
- Portal heading weights reduced (h1:600, h2:500, h3:400)
- Card hover stabilized (no layout-shifting translateY)
- Density toggle verified across data pages

## Meeting Cadence

Biweekly Tuesdays 3pm CT. Anchor: Apr 7, Apr 21. Automation runs Monday mornings.

## Component Coverage Gaps (Verified 2026-04-03)

Track which shared components are used where. Expand coverage as Phase 21 progresses.

| Component | Used On | NOT Used On |
|-----------|---------|-------------|
| LoadingSkeleton | Tasks, MyTasks, Deadlines, Manuscripts, Decisions, Ideas, Activity, Calendar, Search | Analytics, PIAnalytics, Personal, Settings, Grants, MeetingNotes, Narratives, PBSector, AskTheLab |
| EmptyState | Tasks, MyTasks, Deadlines, Decisions, Ideas, Activity, Calendar, Search, Grants, MeetingNotes, Narratives, AskTheLab | Analytics, Settings, PBSector, Personal, PIAnalytics. Digest has local duplicate. |
| PageHeader | 17 of 19 portal pages | PBSector (has custom PlannerHeader) |
| InlineSelect | Tasks (grid), Projects (list+detail), Manuscripts | Ideas, Decisions, Deadlines, Meetings, Grants |
| J/K keyboard nav | Tasks, Projects | All other list pages |
| HoverCard | TaskDetail, TaskPeek, MeetingDetail, AssigneePicker, ProjectHealth, MenteeDashboard | Projects list, Team, Meetings list, Activity |
| UndoToast | TaskCard, TaskGridView | All other status-changing surfaces |
| Stagger animations | Projects, Personal | All other list pages |

## Accessibility Requirements

Currently good: aria-hidden on icons, aria-label on interactive elements, aria-pressed on toggles, skip-to-content link, focus-visible styling, prefers-reduced-motion in 5 locations.

**Gaps to fix:**
- UndoToast needs `role="alert"` and `aria-live="polite"`
- CommandPalette and CreateProjectModal need focus trapping
- No `aria-live` regions for dynamic content updates
- Toast notifications not announced to screen readers

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

- **Project folder:** `Projects/mn-ccore-lab-hub/` -- PROJECT.md + hub-future-ideas.md (88 features tracked)
- **Research:** `Projects/mn-ccore-lab-hub/competitive-landscape-lab-management-2026.md` + `task-management-ux-patterns-research.md`
- **Design decision:** `Context/Decisions/2026-04-01_hub-design-ethos-pivot.md`
- **Memory:** `memory/project_mnccore-website-redesign.md`
- **Sync:** `scripts/db/sync_d1_push.py` / `sync_d1_pull.py`
- **Meeting automation:** `scripts/scheduled/meeting_automation.py`
- **Archived plans:** `Projects/mn-ccore-lab-hub/_archived/` + `Archive/Scratch/hub-plans-consolidated/`
