# MN-CCORE Lab Hub -- Claude Operating Guide

## Vision

The MN-CCORE Lab Hub is the **team's operating surface** -- where research gets managed, meetings get run, and information flows between Nick's CLI system and every team member's browser.

## Quick Reference

| Thing | Value |
|-------|-------|
| Live site | mn-ccore-lab.pages.dev |
| Repo | github.com/ingra107/mn-ccore-lab (590+ commits) |
| Deploy | `cd /c/Users/ingra/mn-ccore-lab && npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab` |
| Stack | React 19 + Vite 8 + Tailwind v4 + Framer Motion 12 + TypeScript |
| Testing | Playwright 1.59 (E2E, 214+ inspection tests) + Vitest 4.1 (component, browser mode) |
| Data | TanStack Query v5 + Cloudflare D1 (58 tables, 190+ endpoints) + Recharts -- ALL LIVE |
| D1 database (prod) | `b8453e9b-7c5f-4029-b07d-dd89c05d00cf` (ENAM), binding: `DB` |
| D1 database (test) | `a30fe84d-0891-4035-9358-f7813b5f5807` (mnccore-lab-test), binding: `DB_TEST` |
| D1 tables | 58 (added project_documents) |
| Deploy mode | Manual via wrangler -- NO auto-deploy |
| PB project | `Projects/mn-ccore-lab-hub/` -- PROJECT.md, living plan, future ideas |
| Reference | `REFERENCE.md` in this repo -- D1 tables, API endpoints, key files, feature list |

## Design System

### Design Ethos: Operational, Not Editorial (Decision: 2026-04-01)

The Hub is a **research operations center**, not a magazine. Every design choice prioritizes usability and data clarity over decoration. Read `Context/Decisions/2026-04-01_hub-design-ethos-pivot.md` (PB repo) for full rationale.

**Core principles (NEVER violate):**
1. **Dark-first design.** Dark bg is deep neutral (#0b1017), NOT blue-tinted. Text is #e2e8f0 (not pure white — less glare). Light mode secondary.
2. **Columnar tables, not card stacks.** Data pages use fixed-column tables with headers (Title|Assignee|Due|Status|Priority). Cards are for dashboards only. Fixed row height for vertical scanning.
3. **Inline editability with visible affordance.** Every editable field shows "▾" dropdown indicator. Click cell → dropdown/picker by type. Auto-save on blur. No explicit save button. Dropdowns with 5+ options show typeahead filter input + arrow key navigation (Airtable pattern). (Research: Pattern 4)
4. **Typography: 3-tier weight, 5-tier opacity.** Weights: `--weight-body` (400, reading), `--weight-ui` (500, interactive/nav/badges), `--weight-heading` (600, titles/emphasis), `--weight-metric` (700, dashboard numbers only). Opacity: `--ink-primary` (1.0), `--ink-muted` (0.7), `--ink-label` (0.55), `--ink-hint` (0.4), `--ink-disabled` (0.3). NEVER opacity below 0.3 on readable dark-mode text.
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
- **Dark:** bg `oklch(0.12 0 0)` true achromatic / ink `#e2e8f0` / slate `oklch(0.7 0.005 250)`
- **Accents:** gold `#c9a84c` / teal `oklch(0.65 0.07 190)` (desaturated for dark) / teal-subtle `oklch(0.55 0.04 190)` (ambient) / maroon `#7a0019` / orange `#c2410c` / green `#16a34a`
- **Containers:** light `#f5f5f5` page + `#ffffff` cards / dark uses surface tokens (no hardcoded hex)
- Category dots: 6px, 0.7 opacity -- maroon=CLIF, teal=Lab, gold=Mesfin

### Table Pattern (apply to ALL data pages)
- Shared `ColumnHeader` + `TableContainer` components (`src/components/table/`)
- Column headers: uppercase, 11px, 0.55 opacity, 0.06em letter-spacing — shared across Tasks, Projects, Manuscripts, Deadlines
- Column resize: drag handles on right edge, min widths, persisted via `useTableConfig`
- Column reorder: drag headers horizontally, persisted to localStorage
- Cell focus: 2px teal outline, Tab/Shift+Tab between editable cells
- Multi-sort: Shift+Click for secondary sort, ①② rank indicators
- Frozen columns: checkbox + title sticky at ≤1024px viewport
- Table config persistence: `useTableConfig(id)` hook saves sort/widths/order to localStorage, Reset View button
- Stage group headers: quiet uppercase labels with extending rule line
- Row hover: neutral `rgba(255,255,255,0.02)` (dark), barely-there luminance shift
- Row separators: `rgba(255,255,255,0.03)` (dark) — structure felt not seen
- Inline controls: status/priority dropdowns editable in-row
- Hover-only badges: age/project badges hidden until row hover (`.hover-badge` CSS class)
- Ghost-style action buttons (outline, not filled) + Pin-to-Focus button on MyTasks

### Animation Timing (5 durations + 2 easings)
- `--duration-instant: 0ms` — state toggles, checkbox
- `--duration-fast: 100ms` — tooltips, button press
- `--duration-normal: 150ms` — hover, row highlight (alias: `--transition-fast`)
- `--duration-moderate: 200ms` — dropdowns, panels (alias: `--transition-panel`)
- `--duration-slow: 300ms` — sidebar, modals, page transitions
- `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` — entering elements
- `--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)` — moving elements
- Card hover: -1px lift. Respects `prefers-reduced-motion` (all durations → 0ms).

### Sidebar
- **3-plane depth**: sidebar darker than content via `color-mix(in oklch, var(--cream), black 12%)` + `--surface-2` overlay
- Font-weight 400 for nav items, 500 for active only
- Active: `--teal-subtle` bg fill (desaturated), full teal on text/icon. No left border.
- Inactive: --slate color, icon opacity 0.7.
- Borders: `--border-subtle` (neutral), NOT `--border-light` (gold)
- Section labels: 10px uppercase, opacity 0.5. Divider lines between groups.
- Row height: py-2 (compact). Font: 12px. Group gap: 4px. Section divider margin: 6px/8px.
- Logo: mark uses CSS filter for dark mode (`invert(1) brightness(1.5)`), text logo swaps to dark variant.

### Borders & Spacing
- `--border-light` (gold tint) = ONLY for filter toggle inactive states and intentional brand accents. `--border-subtle/default/strong` (neutral, 3 tiers) = ALL structural borders. 222 structural borders migrated in Phase 30.
- Spacing: `--sp-xs` (4) / `--sp-sm` (8) / `--sp-md` (12) / `--sp-lg` (16) / `--sp-xl` (24) / `--sp-2xl` (32). Strict 8px grid.
- Radius: `--radius-sm` (4) / `--radius-md` (6) / `--radius-lg` (8) / `--radius-xl` (12) / `--radius-2xl` (16) / `--radius-full` (9999) / `--radius-circle` (50%). All borderRadius MUST use tokens.
- Typography scale: `--text-micro` (10, was 9 — eliminated all 9px text) / `--text-caption` (10) / `--text-label` (11) / `--text-small` (12) / `--text-body` (13) / `--text-base` (14) / `--text-md` (16) / `--text-lg` (18) / `--text-xl` (24) / `--text-2xl` (32).

### Z-Index Hierarchy (Phase 31)
- `--z-base` (1) / `--z-sticky` (10) / `--z-dropdown` (50) / `--z-sidebar` (100) / `--z-modal-backdrop` (400) / `--z-modal` (500) / `--z-toast` (9999). All zIndex MUST use tokens.

### Semantic Hover/Overlay Tokens (Phase 31)
- Accent hovers: `--gold-hover/active/emphasis`, `--teal-hover/active/emphasis`, `--maroon-hover/emphasis`, `--orange-hover`, `--green-hover`
- Neutral overlays: `--hover-subtle/light/medium`, `--overlay-light/medium/heavy` (with dark mode overrides — light uses black-based, dark uses white-based for hovers)
- Standardized opacity tiers: 0.03 / 0.06 / 0.10 / 0.15 / 0.40 / 0.70. Snap to nearest tier.

### Surface Elevation (Linear pattern)
- `--surface-0` (page bg) / `--surface-1` 3% (panels) / `--surface-2` 6% (cards, sidebar, dropdowns) / `--surface-3` 10% (hover, active)
- Dark mode: luminance stepping via `rgba(255,255,255, 0.03→0.10)` — 10% total range (Linear-equivalent)
- Light mode: `--page-bg: #f5f5f5` (off-white), cards `#ffffff` with 3-layer box-shadow (Vercel pattern)
- Card borders: `box-shadow: 0 0 0 1px var(--border-subtle)` technique (not CSS border)
- Dark cards: `inset 0 1px 0 rgba(255,255,255,0.03)` top-edge highlight
- Shadows: `--shadow-flat/card/card-hover/elevated/menu`. All boxShadow MUST use tokens.
- `--muted`: derived from `--ink` via `color-mix(in oklch, var(--ink) 70%, transparent)` in dark mode

### Table Density (user-controlled)
- 3 modes via `DensityToggle` component: Compact (36px) / Default (44px) / Relaxed (52px)
- CSS vars: `--row-height`, `--row-padding-y`, `--cell-font-size`. Applied to all 7 data table pages.
- Persisted per-user in localStorage. Numeric columns right-aligned, `tabular-nums` on dates.

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
Airtable ←CRDT→ brain.db ←LWW→ D1 (mnccore-lab) ←API→ React + TanStack Query
                   ↑                    ↑
            Nick's CLI              Team's Hub
          (single user)          (20+ team members)
```

- **Data:** TanStack Query v5 → D1 API (prod), static TS fallback (dev)
- **API:** Cloudflare Worker, 110+ endpoints, auth-gated writes. Test isolation middleware in `api/index.ts`: if `X-Test-Mode: true` header + `DB_TEST` binding exists, swaps `env.DB` to `env.DB_TEST` so tests never touch production.
- **Auth:** Open now. Cloudflare Access for April 21 launch (@umn.edu)
- **Email:** Resend (`api/lib/email.ts`) + daily digest (`api/routes/digest-email.ts`). Needs `RESEND_API_KEY` Cloudflare secret. Preview: `/api/digest-preview?member=nick`
- **Sync:** `sync_d1_push.py` / `sync_d1_pull.py` in PB, scheduled + /process-triggered

### Sync Architecture (Decision: 2026-04-06)

brain.db is the **sync hub**. Airtable and D1 never talk directly — changes propagate through brain.db.

**Sync model:** Field-level last-write-wins (LWW) with timestamps. Both D1 and brain.db are authoritative — whoever changed a field last wins. Conflicts logged to `sync_log`.

**Sync triggers:**
- /process: push to D1 (step 4b) + pull from D1 (step 0c)
- Scheduled: 2:35 AM push, 2:40 AM pull, 12:05 PM push+pull
- Machine swap: Airtable only (not D1)

**Key rules:**
- Brain.db tasks use `recXXX` IDs (Airtable). Hub-created tasks use hex IDs. Both coexist.
- Hub-created tasks pull to brain.db but do NOT push to Airtable (Airtable is Nick-only).
- `notes` (brain.db) is private. `description` (D1) is team-visible. They do NOT sync bidirectionally.
- Task deletion uses soft-delete (`deleted_at` column) to prevent zombie re-creation.
- `completed` field is bidirectional — Hub can reopen tasks, brain.db accepts it.

**Implementation:** See plan at `~/.claude/plans/graceful-meandering-thimble.md`
**Peripheral Brain sync scripts:** `scripts/db/sync_d1_push.py`, `sync_d1_pull.py`

## Hermes (AI Research Assistant)

Live since 2026-04-09. Team members @mention `@hermes` in Ask the Lab, task comments, or project comments. Responses appear with gold sparkle badge in 20-40 seconds.

- **Detection:** `/@(hermes|claude)\b/i` regex in `api/routes/questions.ts` and `api/routes/projects.ts`
- **Author slug:** `claude-ai` (display name "Hermes" via `src/data/team.ts`)
- **Backend:** `hub_ai_listener.py` on home laptop polls `GET /api/ai-requests?status=pending` every 10s
- **Auth:** Bearer token via `PB_API_KEY` (Cloudflare Pages secret)
- **Docs:** `docs/hermes.md`

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
13. **Build verification after batch edits.** After editing 3+ files or any shared module/type, run `npm run build` and fix all TypeScript errors before continuing. After fixing test failures, re-run the full affected test suite (`npx playwright test tests/<suite>`) to confirm zero regressions. Do not commit code that doesn't build.

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

**Phase 21: COMPLETE** (13 commits + expert playbook). Visual perfection:
- Blocks 0-5: Spring physics, progressive disclosure (F key), column sort, empty states, transition constants, welcome banner, meeting prep view
- Tier 1.5: TaskDetailPanel split, Sidebar perf, dynamic import cleanup, fontFamily purge (1107 across 131 files), loading skeletons (9 pages), taskConfig consolidation, inline editing expansion, undo toast expansion, J/K nav (5 pages), HoverCards (6 surfaces), stagger animations (4 pages)
- Hardcoded white audit: confirmed correct (white-on-accent), no changes needed

**Post-Phase 21: Showcase Features** (2026-04-04, 5 deploys):
- **Inline subtask expand/collapse** (81da23b): Linear-style chevrons on TaskGridView. AnimatePresence expand with progress bar, inline toggle, add input. Keyboard: → expand, ← collapse (directional, not toggle). Auto-focus input on expand.
- **Meeting NLP action items** (ce04ebf): Inline quick-add on MeetingDetail. Type `@nick Review draft p2 Friday` → parses assignee, priority, due date, project via `parseQuickAddInput`. Token preview chips. Creates task linked to meeting with `meeting_id`. Invalidates meeting query for instant refresh.
- **Accessibility** (be80679): CommandPalette focus trapping + aria-modal. CreateTaskModal focus trapping + aria-modal. UndoToast `role="status"` + `aria-live="polite"`. ShortcutHelp spring animation + aria-modal.
- **Dashboard 6-card default** (b502053): Default role showed 2 cards (upcoming+stats). Now shows 6 (action-board, upcoming, project-health, pipeline, activity, stats). localStorage version key resets stale preferences.
- **Meeting dedup** (6a1fd06): API dedup by date+title before INSERT. UNIQUE index on meetings(date, title). Cleaned 123 duplicates from D1 (139→16).

**Phase 23: COMPLETE** (14 commits, 2026-04-06). UX depth + a11y + undo-everywhere sprint:
- **Clickable task titles everywhere**: clicking title opens TaskDetailPanel on Tasks, MyTasks, Personal, Deadlines, ProjectDetail
- **Undo on EVERY status change**: TaskGridView, TaskStandUpView, TaskDetailPanel, Tasks, MyTasks, Personal, Deadlines, Dashboard ActionBoard, MeetingDetail, ProjectDetail, MyItems, Meetings
- **TaskDetailPanel wired to all views**: Grid, Board, StandUp, Timeline views on both Tasks and MyTasks pages, plus Personal, Deadlines, ProjectDetail
- Hover actions moved to own grid column (no longer overlaps priority)
- Project notes system: Notes section reads from project_updates table (timestamped, auto-author)
- Deadlines: InlineSelect for task status, clickable task titles, TaskDetailPanel
- Focus trapping + Escape key on all 6 modals
- J/K keyboard nav on 5 more pages (Grants, Search, MeetingNotes, Narratives + Enter on Search)
- Stagger animations on Analytics, PIAnalytics, Settings
- EmptyState on Settings workflow templates
- PageHeader: aria-live on count/subtitle for screen readers
- Success toasts on task creation, idea capture, answer submission
- Removed 366 redundant fontFamily declarations across 77 files
- TaskStandUpView: separated status circle from title click with undo
- TaskTimelineView: bar click opens detail panel instead of cycling status

**Phase 24: COMPLETE** (database alignment, 2026-04-06). brain.db ↔ D1 full sync:
- **Phase A** (bulk load): 537 brain.db tasks → D1 via `POST /api/tasks/sync-bulk`. `scripts/sync-brain-tasks.ts` with `--api`/`--sql` modes. recXXX IDs preserved. `assignee` column added to brain.db.
- **Phase B** (ongoing sync): schema-v22 (`updated_at` + `deleted_at`), all 5 write paths set `updated_at`, batch delete → soft-delete, `updated_since` delta filter. `sync_d1_push.py` and `sync_d1_pull.py` rewritten for field-level LWW from main tasks table. `crdt.py` monotonic constraint relaxed for task reopening.
- **Sync flow:** `/process` runs push+pull. Scheduled 2:35 AM push, 2:40 AM pull. Delta sync via `updated_at` timestamps.
- **Admin endpoint:** `POST /api/admin/migrate` for schema changes without wrangler D1 access.

**Phase 25: COMPLETE** (2026-04-06). Showcase + academic workflow features:
- Virtual scrolling on TaskGridView (@tanstack/react-virtual) — 537 tasks performant
- AI autofill on CreateTaskModal — heuristic project/priority/assignee suggestions
- **Paper Revision Tracker** (schema-v23): per-round reviewer comments, progress bars, ProjectDetail tab
- **Mentee Milestone Dashboard** (schema-v24): /mentee-milestones page, MemberPage integration, PI overview
- **Deadline Cascade View** (schema-v25): dependency graph, impact simulation, /deadline-cascade page
- **Paper Submission Lifecycle** (schema-v26): submission events timeline, active submissions widget
- **IRB/Regulatory Tracking** (schema-v27): regulatory items, expiration alerts on Personal page

**Phase 26: COMPLETE** (2 commits, 2026-04-07). UX audit from LabSync comparison — 14 issues:
- Dark mode sidebar logo fix (filter + dark SVG variant)
- Remove "Join" nav tab, rethink hero pathway cards (Collaborate→/network, Meet Our Team→/team)
- Default task sort changed from priority → due_date (TaskGridView + MyTasks)
- MyTasks: showCompleted toggle, useAuth() hook (replaces manual JWT parsing)
- --muted opacity raised 0.4→0.55, dark mode contrast audit across 22 files
- Sidebar compactness: py-2, 12px font, tighter group gaps
- Task click fix in MyTasks grouped view (virtualizer minHeight)
- Projects: PI + Group columns inline-editable (InlineSelect), sortable column headers
- Projects: stage group headers only show when sorted by stage
- All Tasks: "My Tasks" filter toggle
- **TaskDetailPanel**: restructured to 4-tab layout (Overview/Details/Files/Comments)
- **Link Paper to Project**: search modal on ProjectLiterature with publication picker
- **Publication Library View**: horizontal scrolling journal cover cards (scroll-snap)

**Phase 26b-aq: COMPLETE** (44 commits, 2026-04-07/08). Massive feature sprint across all pages:

*Interaction & Keyboard:*
- Keyboard shortcuts: Z (snooze +1d), A (assign), P (pin project), N (new idea/decision), T (calendar today), arrow keys (calendar nav)
- Task context menu: snooze submenu (+1d/+3d/+1w/+2w), open in new tab
- Bulk action toolbar: snooze button (+1 day)
- InlineDatePicker: relative labels ("2d ago", "in 3d"), quick presets (Today/Tomorrow/Next Mon/+1 Week/Clear)
- Command palette: task/project counts in footer, Due Today quick filter, Log Decision action
- ShortcutHelp: updated with all new shortcuts (P pin, calendar section, N decisions)
- N key opens create modal on Ideas + Decisions pages

*Dashboard & Personal:*
- Time-of-day greeting, today's progress summary
- WeeklyProgressCard: 7-day bar chart with trend indicator
- QuickWinsCard: top 4 actionable tasks scored by urgency
- Overdue alert banner on Dashboard
- CURRENT_DEFAULTS_VERSION bumped to 4 (6 default cards)
- Personal: quick actions row, priority distribution bar, weekly completion count

*Task System:*
- MyTasks: QuickFilter pills (Today/This Week/Overdue/No Date), Focus Next smart scoring, completion streak counter, status distribution bar, StandUp view, prev/next in detail panel
- TaskDetailPanel: copy link button, task age badge, source/recurrence chips, prev/next navigation (Alt+Up/Down)
- TaskGridView: calculations row shows completion percentage
- Dynamic page titles on Tasks, MyTasks, Ideas, Decisions, Deadlines, Manuscripts, Projects

*Data Pages:*
- Projects: task count badges, "Needs Attention" filter (health < 50), dynamic title
- Manuscripts: category filter (CLIF/Lab/Mesfin/Mentee), sortable columns, stage progress dots, dynamic title
- Ideas: sort toggle (Newest/Most Voted/A-Z), vote bounce animation, N-key create
- Decisions: search filter, N-key create, dynamic title
- Deadlines: urgent countdown banner, Export to .ics, dynamic title
- Grants: days remaining on progress bars, maroon when >80% elapsed

*Analytics & PI:*
- AnalyticsPage: 8-week task velocity chart, task age histogram, workload per person, lab health summary, Copy Report button
- PIAnalytics: Copy Report + Print buttons

*Activity & Search:*
- ActivityPage: person filter dropdown, "Most active: X" in subtitle
- SearchPage: recent searches (localStorage, max 5, click to re-search, clear all)
- SessionHistory: search filter on summaries

*Meetings & Digest:*
- Meetings: action item completion rate in subtitle
- MeetingDetail: Copy Summary button (markdown to clipboard)
- MeetingPrep: Print button, meeting countdown badge
- MeetingNotes: search filter, 20 results
- Digest: reading progress bar, Copy Reading List export

*Publications & Network:*
- Publications: year distribution mini-chart (clickable), Copy bibliography button
- Network: stats bar (author count, connections, avg, hub node)

*Team & Member:*
- Team: member count + active-this-week count, green activity dots on directors
- CVPage: Copy as Text button, word count badge

*Settings & Infrastructure:*
- Settings: theme preview cards (light/dark), Reset Dashboard + Clear Searches buttons
- Narratives: search filter on arc titles/projects/topics
- ScrollToTop: floating button on all portal pages
- Favicon: notification badge overlay (red circle with count)
- Sidebar: next meeting countdown hint
- CalendarPage: keyboard arrow nav, T for today
- Print CSS: enhanced @media print rules
- Ctrl+. theme cycle on PortalLayout

*Pending:* Schema v35 migration (recurrence + recurrence_parent_id) — planned but not yet needed. No code depends on it.

**Phase 27: COMPLETE** (4 commits, 2026-04-08). Task notes/updates + activity tab:
- **Schema v36**: `task_updates` table (mirrors `project_updates` pattern) with task_id, author_slug, content, update_type, created_at
- **TaskUpdateFeed**: append-only notes with type badges (progress/blocker/result/question/session), textarea input, reactions
- **TaskActivityFeed**: merged temporal timeline of notes + comments + system events with visual delineation (teal=notes, gold=comments, dot=system)
- **TaskDetailPanel restructured** to 5 tabs: Overview | Notes | Comments | Activity | Details
- Files tab merged into Details as CollapsibleSection
- Status click bug fixed: guard against clicking already-active status pill
- API: GET/POST /api/tasks/:id/updates with @mention notifications and activity logging

**Phase 28: COMPLETE** (6 commits, 2026-04-08). Next-gen infrastructure + polish:
- **Optimistic mutations** (`useMutations.ts`): instant UI for task/project/manuscript updates, rollback on error
- **R2 file uploads** (`FileUpload.tsx`, `api/routes/uploads.ts`): drag-drop file attachments with R2 storage
- **Tiptap rich text** (`RichTextEditor.tsx`): rich text editor for task descriptions (bold/italic/headings/lists/links)
- **WebSocket real-time** (`useRealtimeSync.ts`): PartySocket → Durable Object at `hub-realtime.nicholas-ingraham.workers.dev`, with polling fallback + BroadcastChannel tab sync
- **Smart polling**: 60s with WS, 10s without, version-based invalidation
- **Resend email** (`api/lib/email.ts`): email integration ready, needs API key
- **Design polish**: dark bg contrast improvements, text softening
- **InlineSelect portal fix**: dropdown renders via `createPortal` to escape table overflow, z-index resolved
- **Version bump fix**: Pages Functions must await async work directly (no ctx)

**Phase 22: COMPLETE** (5 commits, 5 deploys, 2026-04-05). Design research + polish:
- Transition standardization: 10 inline durations → 150ms/250ms constants
- CreateProjectModal: focus trapping + aria-modal (a11y gap closed)
- Mobile responsive TaskGridView: stacked card layout below 768px
- Button secondary variant: CSS vars for light mode compat
- Calculations row: Notion-style count/status summary on Tasks, Projects, Deadlines tables
- Status badge pills: 12% opacity tinted backgrounds (Kraken/Notion pattern, STATUS_BG map)
- CSS polish (Linear/Raycast research): luminance-stepping elevation, +0.01em dark letter-spacing, --muted 4th opacity tier, semi-transparent white borders
- Design patterns reference saved: `Projects/mn-ccore-lab-hub/design-patterns-reference.md`

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

Biweekly Tuesdays 3pm CT. Anchor: Apr 21, May 5. Automation runs Monday mornings.

## Component Coverage (Verified 2026-04-08)

| Component | Coverage | NOT Used On |
|-----------|----------|-------------|
| LoadingSkeleton | ALL 19 portal pages | -- |
| EmptyState | 15 pages (Tasks, MyTasks, Deadlines, Decisions, Ideas, Activity, Calendar, Search, Grants, MeetingNotes, Narratives, AskTheLab, Manuscripts, Digest, Settings) | Analytics, PBSector, Personal, PIAnalytics |
| PageHeader | 17 of 19 portal pages (all with aria-live on count/subtitle) | PBSector (custom PlannerHeader) |
| J/K keyboard nav | 11 pages (Tasks, Projects, Meetings, Ideas, Decisions, Deadlines, Manuscripts, Grants, Search, MeetingNotes, Narratives) | Calendar (arrow keys), Analytics, Settings |
| HoverCard | 8 surfaces (TaskDetail, TaskPeek, MeetingDetail, AssigneePicker, ProjectHealth, MenteeDashboard, Projects list, Activity) | Team (cards already detailed) |
| UndoToast | ALL task surfaces (TaskGridView, StandUp, Timeline, Board, Detail, Tasks, MyTasks, Personal, Deadlines, Dashboard ActionBoard, MeetingDetail, ProjectDetail, MyItems, Meetings) + Ideas, Manuscripts, Decisions | Settings (uses saved indicator) |
| Stagger animations | 12 pages (Projects, Personal, Ideas, Decisions, Deadlines, Meetings, MeetingPrep, MeetingNotes, Search, Calendar, Analytics, PIAnalytics, Settings) | -- |
| InlineSelect | Tasks (grid), Projects (list+detail), Manuscripts, Ideas, Decisions, Deadlines | Grants (no editable status) |
| Focus trapping | ALL 6 modals (CreateTask, CreateProject, CreateIdea, CreateQuestion, CreateDecision, TranscriptModal) | -- |
| Escape key close | ALL 6 modals + CommandPalette + GlobalQuickAdd + ShortcutHelp | -- |
| Dynamic page title | 7 pages (Tasks, MyTasks, Ideas, Decisions, Deadlines, Manuscripts, Projects) | Other portal pages use static usePageMeta |
| Search/filter input | 8 pages (Tasks, AskTheLab, SessionHistory, Narratives, MeetingNotes, Decisions, Search, Digest) | -- |
| N-key create | Ideas, Decisions | Tasks uses C key |
| Copy to clipboard | PIAnalytics, CVPage, Publications, Digest, MeetingDetail, AnalyticsPage | -- |
| ScrollToTop | All portal pages (via PortalLayout) | Public pages |

## Accessibility Requirements

Currently good: aria-hidden on icons, aria-label on interactive elements, aria-pressed on toggles, skip-to-content link, focus-visible styling, prefers-reduced-motion in 5 locations, all modals have focus trapping + Escape key + aria-modal.

**All major gaps closed as of Phase 23:**
- ~~UndoToast needs `role="alert"` and `aria-live="polite"`~~ DONE (be80679)
- ~~CommandPalette needs focus trapping~~ DONE (81da23b)
- ~~CreateTaskModal needs focus trapping~~ DONE (be80679)
- ~~CreateProjectModal needs focus trapping~~ DONE
- ~~CreateIdeaModal, CreateQuestionModal, CreateDecisionModal, TranscriptModal need focus trapping~~ DONE (Phase 23)
- ~~No `aria-live` regions for dynamic content updates~~ DONE — PageHeader count/subtitle have aria-live
- ~~Toast notifications not announced to screen readers~~ DONE — UndoToast container has role="status" + aria-live, success toasts share same container

## Known Gotchas

| Problem | Fix |
|---------|-----|
| Hero cards render loop | Use `<a>` tags, not Router Link |
| initialData flash | Use factory functions: `() => data` |
| Meeting ID collision | IDs include random suffix. API dedup by date+title prevents duplicates. UNIQUE index enforced. |
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
- **Sync scripts:** `scripts/db/sync_d1_push.py` / `sync_d1_pull.py` -- push/pull brain.db ↔ D1
- **Sync plan:** `~/.claude/plans/graceful-meandering-thimble.md` -- full database alignment (Phase 24)
- **CRDT engine:** `scripts/db/crdt.py` -- field-level LWW for Airtable sync (extend to D1)
- **Meeting automation:** `scripts/scheduled/meeting_automation.py`
- **Archived plans:** `Projects/mn-ccore-lab-hub/_archived/` + `Archive/Scratch/hub-plans-consolidated/`

## Office of Inspection (Testing Infrastructure)

**568+ tests** across 4 suites. Self-updating via feature registry + scanner.

| Suite | Tests | File |
|-------|-------|------|
| Inspection | 214 | `tests/inspection.spec.ts` |
| Workflows | 167 | `tests/inspection-workflows.spec.ts` |
| Daily Super-User | 131 | `tests/daily-superuser.spec.ts` |
| Sync Pipeline | 58 | `tests/sync-pipeline.test.py` |

**Run:** `bash scripts/run-tests.sh all` (quick/ui/sync/all modes)

### Test Database Isolation

Tests run against a **separate D1 database** (`mnccore-lab-test`), not production. The production DB is never touched by Playwright tests.

**How it works:**
1. `playwright.config.ts` sends `X-Test-Mode: true` header on all requests
2. Middleware in `api/index.ts` detects the header and swaps `env.DB` to `env.DB_TEST`
3. `DB_TEST` binding configured in both `wrangler.toml` and Cloudflare Dashboard
4. `api/types.ts` and `functions/api/[[route]].ts` include `DB_TEST` in the `Env` interface

**Canonical test prefix:** `_TEST_DELETE_` -- used in `tests/test-cleanup.ts` for test data identification and cleanup.

**Cleanup:** Test data lives in the isolated test DB and does not pollute production. The `tests/test-cleanup.ts` handles cleanup of `_TEST_DELETE_`-prefixed records. The manual cleanup commands below are for **legacy test data** that was created in production before isolation was implemented, and for sync pipeline tests that operate on brain.db directly:
```bash
# Legacy production cleanup (only needed for pre-isolation test data)
# Tasks (soft delete)
npx wrangler d1 execute mnccore-lab --remote --command="UPDATE tasks SET deleted_at=datetime('now') WHERE title LIKE 'SYNCTEST%'"
npx wrangler d1 execute mnccore-lab --remote --command="UPDATE tasks SET deleted_at=datetime('now') WHERE title LIKE 'INSPECTION%' OR title LIKE 'EDGE%' OR title LIKE 'JOURNEY%' OR title LIKE 'DAILYTEST%'"
npx wrangler d1 execute mnccore-lab --remote --command="UPDATE tasks SET deleted_at=datetime('now') WHERE title LIKE 'SYNC-%'"
# Non-task tables (hard delete — no deleted_at column)
npx wrangler d1 execute mnccore-lab --remote --command="DELETE FROM ideas WHERE title LIKE 'INSPECTION%' OR title LIKE 'EDGE%'"
npx wrangler d1 execute mnccore-lab --remote --command="DELETE FROM lab_questions WHERE question LIKE 'INSPECTION%' OR question LIKE 'EDGE%'"
npx wrangler d1 execute mnccore-lab --remote --command="DELETE FROM decision_log WHERE title LIKE 'INSPECTION%' OR title LIKE 'EDGE%'"
npx wrangler d1 execute mnccore-lab --remote --command="DELETE FROM notifications WHERE body LIKE 'SYNCTEST%'"
# brain.db (sync pipeline tests still touch brain.db directly)
python -c "import sqlite3; conn=sqlite3.connect('C:/Users/ingra107/Peripheral-Brain/data/brain.db'); conn.execute(\"UPDATE tasks SET status='deleted', completed=1, sync_status='synced' WHERE name LIKE 'SYNCTEST%' OR name LIKE 'INSPECTION%' OR name LIKE 'EDGE%' OR name LIKE 'DAILYTEST%' OR name LIKE 'JOURNEY%' OR name LIKE 'SYNC-%' OR name LIKE 'AAAA%' OR name LIKE 'TEST-%'\"); conn.commit(); print(f'Cleaned {conn.total_changes} test tasks from brain.db'); conn.close()"
```
**Scan for gaps:** `python scripts/inspection-scanner.py --commits 5`
**Registry:** `tests/feature-registry.json` (369 features, 318 covered = 86.2%)
**Guide:** `TESTING.md`
**Skill:** `/test-hub` (scan, run, generate, update, report)

## Phase 29: New Features (2026-04-09)

Schema v37 deployed. 9 features built:

1. **Pomodoro Stats Card** — focus hours, streak, top project (PomodoroStatsCard.tsx)
2. **Key Links on Tasks** — 📂📧▶️ icons on grid + detail panel, mnccore:// protocol for local folders
3. **Email Drafts Card** — pending count, Gmail links (EmailDraftsCard.tsx)
4. **Proactive Brief Card** — overdue/due-today/stale/focus suggestion (ProactiveBriefCard.tsx)
5. **Session History Sync** — brain.db sessions → D1 pb_sessions (push handler)
6. **System Health Card** — green/amber/red indicator, sync age (SystemHealthMiniCard.tsx)
7. **Quick Capture Bar** — dashboard top input, Ctrl+N, idea: prefix (QuickCaptureBar.tsx)
8. **File Activity Heatmap** — GitHub-style calendar heatmap (FileActivityCard.tsx)
9. **mnccore:// Protocol** — Windows registry handler for local folder/script links

New API routes: `/api/email-drafts`, `/api/proactive-brief`, `/api/file-activity`
New D1 tables: `email_drafts`, `file_activity_daily`
New task columns: `key_link_1/2/3` + `_desc`
New push handlers: pomodoro, sessions, email, file_activity, key_links, health

## Phase 30: COMPLETE (14 commits, 9 deploys, 2026-04-10/11). Visual QA + Enhancement Marathon:

*Design System Overhaul (4 consultant audits: SaaS 7.4, Dark Mode 7.0, Tables 7.2, Academic UX 8.2):*
- True achromatic dark base: `oklch(0.12 0 0)` zero hue/chroma (was 0.015 chroma blue tint)
- Sidebar 3-plane depth: `color-mix(in oklch, var(--cream), black 12%)` — darker than content
- Surface steps widened: 3%/6%/10% (was 2%/4%/6%), matching Linear's spread
- Teal desaturation: `--teal-subtle` for ambient, full chroma only on interactive
- 222 structural `--border-light` (gold) → `--border-subtle` (neutral) across 55 files
- Card borders: box-shadow-as-border technique (Vercel pattern), inset top highlight
- Light mode: `#f5f5f5` page bg, 3-layer card shadows, stronger contrast
- Badge refinement: 11px/500 (was 12px/600), opacity 0.15/0.14 (was 0.12/0.10)
- 138 instances of 9px text → 10px minimum
- 8 modal/section heading weights 400→500
- `--muted` token unified: `color-mix(in oklch, var(--ink) 70%, transparent)` in dark mode
- Letter-spacing tokens applied: h1/h2 get -0.02em, text-2xl/3xl get -0.04em
- Softer row separators: luminance shifts instead of visible grid lines
- Priority badges opacity 0.7, project tags neutral bg + teal left-border accent

*Task Grid Power Features (TaskGridView.tsx — now 1200+ lines):*
- Column resize: drag handles, min widths, double-click reset, localStorage
- Column reorder: horizontal DnD, GripVertical handles, separate DndContext
- Cell focus ring: 2px teal outline, Tab/Shift+Tab between cells
- Multi-column sort: Shift+Click for secondary, ①② indicators
- PROJECT column: InlineCellSelect with project dropdown
- Pin-to-Focus: hover action button, undo toast, works in grouped view
- Hover-only badges: age/project hidden until row hover
- Semantic column widths: 110/130/100/120/80/50px
- Frozen columns: checkbox + title sticky at ≤1024px
- `useTableConfig` hook: sort, widths, column order → localStorage, Reset View button
- Shared `ColumnHeader` + `TableContainer` components (src/components/table/)
- Density tuned: rows now hit 36/44/52px targets (height not minHeight, boxSizing)

*Batch Operations:*
- BulkActionToolbar: Status dropdown (added to existing Complete/Reassign/Priority/Snooze/Delete)
- Surfaces: Tasks, MyTasks, MyTasks grouped, Deadlines, ProjectDetail, MeetingDetail action items

*Drag-and-Drop (@dnd-kit):*
- Focus Next: GripVertical handles, SortableFocusItem
- Subtasks: both SubtaskSection (detail) + InlineSubtaskRow (grid), useReorderSubtasks mutation
- Dashboard cards: rectSortingStrategy, SortableCardWrapper, localStorage order
- Meeting action items: SortableActionItem, session-local order
- Column headers: horizontalListSortingStrategy

*PI Oversight Features:*
- "Waiting On" QuickFilter: gold pill, staleness badges (Xd waiting), top 5 summary card
- Team Workload Forecast: heatmap on Analytics (green/gold/red by task count/week/person)
- `waiting_external` status: orange pill, wired across all task surfaces + API
- Project document links: schema v38, API, ProjectDocuments component, 36 links populated

*Charts & Analytics:*
- Recharts integration: 7 hand-rolled charts → proper BarChart/AreaChart with axes/tooltips
- MetricCard sparklines: 8-week trailing SVG polyline on 4 top metrics
- Time-range selector: 7d/4w/3m/All filtering all charts
- Activity heatmap moved above the fold

*Infrastructure:*
- Email digest: POST /api/digest-email, GET /api/digest-preview, POST /api/digest-email/send
- Sign-in links: 8 surfaces with clickable `<a href="/api/auth/login">`
- Shared DataTable: ColumnHeader + TableContainer adopted by Projects, Manuscripts, Deadlines
- Deadlines: now has sortable columns (was static headers)
- InlineDatePicker + DateInput: pending-value pattern (month nav doesn't save)
- Subtask expand fix: opacity-only animation, virtualizer.measure() callback
- project_id sync fix: slug generation from project names in push/pull scripts
- Sync script handles missing short_name column gracefully
- Homepage redesign: confident hero, Stripe-style impact strip, CLIF context section
- Cloudflare Access: code ready (useAuth, /api/auth/me, CF-Access-JWT), needs dashboard config

*Tests:*
- 16 new tests in Phase 30 block (inspection.spec.ts: 198→214)
- 17 new feature registry entries (369 features, 86.2% coverage)

## Phase 31: COMPLETE (11 commits, 2026-04-11). Token Compliance + Visual Polish:

*Complete Design Token Migration (~1,062 replacements):*
- Z-index: defined 7-tier semantic hierarchy (`--z-base` through `--z-toast`), migrated 47 values across 22 files
- Semantic rgba tokens: `--gold-hover/active/emphasis`, `--teal-hover/active/emphasis`, `--maroon-hover/emphasis`, `--orange-hover`, `--green-hover`, neutral overlays `--hover-subtle/light/medium`, `--overlay-light/medium/heavy` (with dark mode overrides)
- borderRadius: 100% compliance — all 388 instances now use `--radius-*` tokens (0 hardcoded)
- Spacing: 317 on-scale values migrated to `--sp-*` tokens across 83 files
- Color literals: ~95 `#fff`/`white` replaced with `var(--ink-bright)` or `var(--cream)` in 42 files
- Hex colors: ~25 palette colors replaced with `var(--gold/teal/maroon/orange/green/slate)` in 10 files
- RGBA: 444 inline rgba() replaced with semantic hover/overlay tokens across 120 files. Opacity rationalized from 15+ tiers to 6 standardized tiers (0.03/0.06/0.10/0.15/0.40/0.70)

*Visual Improvements:*
- Table row line-height reduced from 1.6 to 1.35 (denser data scanning, Linear/LabSync feel)
- Homepage: nav backdrop blur bar for readability on dark hero, UMN label enlarged (12px/500/0.9), 4th pillar off-palette blue (#5b8abf) → var(--teal), gradient bridge between hero and content
- Avatar component: 13 named size tiers (2xs through xl) replacing 65 `!important` className overrides

*Housekeeping:*
- 38 stale worktree branches deleted (preserved xenodochial-engelbart for Open Science work)
- Welcome banner + persistent tooltip: confirmed already localStorage-gated
- project_id restoration: 520 D1 tasks restored via targeted UPDATE SQL (sync bug fixed in push script)

## Phase 31.5: COMPLETE (22 commits, 4 deploys, 2026-04-11). Expert-Driven Polish + Performance:

*Expert panel re-scored: 7.2 → 8.4/10 (PI: 8.1, Designer: 8.4)*

*Visual Polish (Designer's 12 recommendations — all implemented):*
- Dashboard compressed: 5 vertical layers → 2, cards move up ~200px. Overdue count inlined into greeting.
- Typography recession: metadata columns (assignee/project/due_date) recede with smaller size + lower opacity. Titles dominate.
- Personal page rebuilt: two-column command center (My Tasks grouped by urgency left, Upcoming + Activity + Quick Stats right)
- Meetings split-panel: 280px meeting list left, detail right. Auto-selects first meeting.
- Shared TableControls component: standardized filter/sort/view bar across Tasks, Projects, Deadlines, Manuscripts
- Sidebar consolidated: 6 sections → 3 (unlabeled nav, Research, Lab). Fewer dividers = more rhythm.
- Breadcrumbs on ProjectDetail, MeetingDetail, MemberPage
- Status bar (24px): "Last synced: Ns ago" left, "? for shortcuts" right. Anchors the viewport.
- Grants page aligned: centered metrics → left-aligned PageHeader + columnar table + timeline as view toggle
- Light mode sidebar surface: `--sidebar-bg: #ebebeb` distinct from page bg

*Accessibility (14 of 17 items fixed):*
- MotionConfig `reducedMotion="user"` — all Framer Motion animations respect OS setting (1 line)
- ARIA combobox/listbox on CommandPalette (role="combobox", role="listbox", role="option", aria-activedescendant)
- ARIA listbox on InlineSelect (aria-expanded, aria-haspopup, role="listbox", role="option")
- ARIA grid on TaskGridView (role="grid", role="row", role="columnheader" with aria-sort, role="gridcell")
- aria-label="Close" on 12 modal close buttons
- htmlFor/id linked on CreateTaskModal form fields
- aria-required on 5 create modals + aria-describedby on disabled submit buttons
- Light mode WCAG contrast: --muted → #6b7280 (5.0:1), --ink-label 0.55→0.70, --ink-hint 0.40→0.62
- Focus ring: teal in light mode (4.5:1), gold in dark mode
- Keyboard support on 4 interactive div elements (Dashboard cards, NotificationBell)
- Mobile hamburger menu: sidebar was completely inaccessible on mobile — added overlay menu with Escape close

*Performance (7 of 7 items fixed):*
- CommandPalette data hooks gated with `enabled: open` — 4 fewer API calls per page load
- Tiptap lazy-loaded in TaskDetailPanel — 116KB gzip deferred until Notes tab opens
- Static data fallbacks excluded from prod bundle — useApiData chunk -51% (69KB → 34KB)
- Dashboard recharts → SVG sparklines — 89KB recharts no longer loaded on Dashboard
- Deadlines list virtualized (@tanstack/react-virtual)
- Lightweight /api/meetings/next endpoint replaces full meetings fetch in Sidebar
- Font loading split: DM Sans critical, Fraunces + JetBrains Mono deferred
- **Cold start fix: modulePreload disabled (0 tags, was 226KB), dashboard queries deferred until after first paint**
- **Result: warm start 473ms first content (was 10+ seconds). Cold start 4.2s (CF Worker spin-up).**

*Bug Fixes:*
- Hover actions column widened 50→90px (no longer overlaps priority pill)
- "n" key shortcut: Ideas → Tasks
- Sign-in banner dismissible via localStorage
- Meeting countdown capped at 90 days (was showing "in 26928d" from test data)
- 24 test meetings + test tags purged from D1
- project_id `|| null` fix already in upstream code (confirmed)

## Pending Sync
<!-- When this session ends, the SessionEnd hook syncs this to Peripheral Brain. -->


## Next Session Playbook

**Before April 21 meeting (Nick must do):**
1. Cloudflare Access: configure @umn.edu policy on dashboard
2. SendGrid/Resend API key: add as CF Pages secret → activates email digest
3. Populate real data: 5-10 decisions, 10 ideas, expertise tags on 5 members, reassign 15 tasks to team

**Technical items remaining:**
- Automated progress report generator (deferred by Nick)
- WebSocket 400 console spam (Durable Object not configured — cosmetic)
- Project slugs with parentheses break routing (low priority)

**Step 4: Clean up D1 test data** (MANDATORY after every test run)
```bash
# See "Office of Inspection" section for full cleanup commands (tasks + ideas + questions + decisions + notifications)
```

## Test Results (2026-04-09, verified)

**231 Playwright passed, 0 failed, 5 skipped (post-Phase 31.5, 2026-04-11)**

| Suite | Passed | Failed | Skipped |
|-------|--------|--------|---------|
| smoke.spec.ts | 26 | 0 | 1 (network timeout — known three.js) |
| inspection.spec.ts | 205 | 0 | 4 |

Full workflow + sync pipeline suites not re-run this session (Phase 30 baseline: 494 passed, 58/58 sync).

### Remaining Known Issues (not test failures)
| # | Issue | Severity | Notes |
|---|-------|----------|-------|
| 1 | WebSocket 400 on handshake — console spam | LOW | Durable Object not configured; cosmetic |
| 2 | Project slugs with parentheses break routing | LOW | e.g. `(mceachron)-...`; test skips these |
| 3 | Subtasks, ideas, decisions are Hub-only | BY DESIGN | No brain.db sync needed |

### Sync Pipeline Field Coverage (all bidirectional)
| Field | brain.db | D1 | Push | Pull |
|-------|----------|-----|------|------|
| Title | `name` | `title` | yes | yes |
| Notes | `notes` | `description` | yes | yes (create) |
| Due date | `due_date` | `due_date` | yes | yes |
| Status | `status`+`completed` | `status`+`completed` | yes (smart null) | yes |
| Priority | `priority` | `priority` | yes (priority > effort > null) | yes |
| Assignee | `assignee` | `assignee` | yes | yes |
| Key links | `task_key_link_*` | `key_link_*` | yes | yes |
| Project | `project_id` (recXXX) | `project_id` (slug) | yes (slug map) | yes (reverse map) |

### D1 Schema Versions Applied
v1-v16 (original), v18 (handoffs), v21 (decision_log, project_dependencies, task_subtasks), v22 (lab_questions/answers column renames)

## Architecture Notes

### Mutations (src/hooks/mutations/)
71 mutations split into 9 domain files. `useMutations.ts` re-exports everything — no import changes needed.
- `useTaskMutations.ts` (5), `useSubtaskMutations.ts` (3), `useProjectMutations.ts` (6), `useMeetingMutations.ts` (4), `useDecisionMutations.ts` (3), `useIdeaMutations.ts` (3), `usePBMutations.ts` (13), `useOtherMutations.ts` (34)

### Testing
- **Playwright** (E2E): 546 tests, 4 suites. `reducedMotion: 'reduce'` in config.
- **Vitest** (component): Browser mode with Playwright provider. `vitest.config.ts`.
- **data-testid**: 28 attributes on key interactive elements. Use in tests over CSS selectors.

### When to Use Playwright MCP vs CLI (token budget)

**Use Playwright CLI** (default — cheap, fast):
- Running test suites: `npx playwright test tests/...`
- Batch test runs: `bash scripts/run-tests.sh all`
- Any run where you just need pass/fail counts

**Use Playwright MCP** (expensive — real browser control, burns tokens on snapshots):
- Debugging a SPECIFIC failing test that you can't figure out from the error message
- Investigating what the page actually looks like (DOM structure, visibility)
- Testing a fix interactively before committing
- When you need to inspect the accessibility tree or console errors live

**Rule of thumb:** Run tests via CLI first. If a test fails and the error context isn't enough, THEN use the MCP to navigate to that page and inspect. Never use the MCP for batch test runs — a single `browser_snapshot` call returns the full accessibility tree which costs ~2K tokens.

### API Field Protection
Update handlers protect required fields from null:
- Tasks: `status`, `priority`, `assignee` — can never be null
- Projects: `status`, `stage`, `category` — can never be null

### Removed Features
- **CV Page** (`/team/:slug/cv`): Cut 2026-04-09. PB cv-export skill handles Nick's CV.

## Session Notes
<!-- COO writes session updates here. Synced by SessionEnd hook or Start Day backup. -->

