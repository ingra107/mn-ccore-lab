# MN-CCORE Lab Hub -- Claude Operating Guide

## Vision

The MN-CCORE Lab Hub is the **team's operating surface** -- not just a website, but where research gets managed, meetings get run, and information flows bidirectionally between Nick's CLI system and every team member's browser.

## Quick Reference

| Thing | Value |
|-------|-------|
| Live site | mn-ccore-lab.pages.dev |
| Repo | github.com/ingra107/mn-ccore-lab (220+ commits) |
| Deploy | `cd /c/Users/ingra/mn-ccore-lab && npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab` |
| Stack | React 19 + Vite 8 + Tailwind v4 + Framer Motion 12 + TypeScript |
| Data | TanStack Query v5 + Cloudflare D1 (19 tables, 60+ API endpoints) -- ALL LIVE |
| Deploy mode | Manual via wrangler -- NO auto-deploy |
| D1 database | `b8453e9b-7c5f-4029-b07d-dd89c05d00cf` (ENAM) |
| Living plan | `Projects/mnccore-minnesota-critical-care/ld-mnccore-hub-plan.md` (PB repo) |

## Design System

### Design Ethos: Operational, Not Editorial (Decision: 2026-04-01)

The Hub is a **research operations center**, not a magazine. Every design choice prioritizes usability and data clarity over decoration. Read `Context/Decisions/2026-04-01_hub-design-ethos-pivot.md` for full rationale.

**Core principles (NEVER violate):**
1. **Dark-first design.** Optimize for dark mode. Light must also be great, but dark is primary.
2. **Data tables in bordered containers.** Every table sits inside a visible bordered rectangle. No floating rows.
3. **Inline editability.** Status, stage, priority editable directly in table rows. Detail panel for deeper edits.
4. **Zero monospace in content.** JetBrains Mono is for code displays ONLY. Project slugs, meeting names, metadata use DM Sans. NEVER render user-facing text in monospace.
5. **One accent color per view.** Teal for interactive elements. Everything else neutral. No multi-color category badges.
6. **Restraint > decoration.** Fewer visual layers, more whitespace. The loudest thing on the page is the data.
7. **List view as default** for data-heavy pages (>10 items). Kanban/pipeline as opt-in toggle.

### Fonts
- **Portal titles:** DM Sans (clean, operational)
- **Public website titles:** Fraunces (editorial, brand voice)
- **Body text:** DM Sans everywhere
- **Code only:** JetBrains Mono
- **CSS:** `--font-sans` and `--font-body` both resolve to DM Sans. `--font-display` = Fraunces (public pages only).

### Palette (evolving — cream is NOT sacred)
- ink `#0f1923` / gold `#c9a84c` / teal `#2d8a8a` / maroon `#7a0019` / slate
- Background: moving toward clean white (light) / ink (dark). Cream (#faf8f3) may be replaced.
- Warm containers: `#f5f3ee` for pipeline columns (not cool `--ice`)
- Category encoding: small dots (6px, 0.7 opacity) — maroon=CLIF, teal=Lab, gold=Mesfin

### Table Pattern (apply to ALL data pages)
- Bordered container with subtle border and small radius
- Proper column headers (uppercase, 11px, 0.5 opacity)
- Stage group headers: quiet uppercase labels with extending rule line
- Row hover: gold-tinted `rgba(201, 168, 76, 0.06)`, active state at `0.10`
- Inline controls: status/priority dropdowns editable in-row
- Ghost-style action buttons (outline, not filled)

### Micro-interactions
- Background transitions: 120ms ease-out (fast, responsive)
- Shadow transitions: 250ms ease (physical, weighty)
- Card hover: -1px lift with shadow deepening
- Row active: brief darken for tactile feedback

### Sidebar (needs improvement)
- Sections must be clearly separated by whitespace (not just a heading)
- Section headings: subtle, small, but navigable — current ones don't create enough visual breaks
- Reference: LabSync sidebar for section separation quality

### Borders & Spacing
- `--border-light` (gold tint): semantic borders (inputs, active pills)
- `--border-subtle` (neutral): structural borders (table rows, panel headers)
- Spacing scale: 4, 8, 12, 16, 20, 24, 32px. No off-grid values (no 14px, no 13.5px).
- `mt-8` before section headings, `gap-3` within sections

### Shared utilities
- `src/lib/dateUtils.ts` (6 formatters), `src/data/team.ts:getPersonInfo()`, `src/lib/api.ts`
- `formatBrandName()` from `src/components/BrandName.tsx`

## Architecture

```
Nick's CLI (brain.db)                      Team Members (browsers)
     |                                           |
     |  sync_d1_push.py (scheduled)              |  React + TanStack Query
     |  brain.db -> D1                           |  (optimistic UI, initialData)
     |                                           |
     |  sync_d1_pull.py (scheduled)              |  POST /api/* (writes)
     |  D1 updates -> brain.db                   |  (comments, toggles, stage edits)
     |                                           |
     +---- HTTP API / Wrangler -----+------- HTTP API ----+
                                    |
                               D1 (mnccore-lab)
                               19 tables, 600+ rows
```

- **Data layer:** TanStack Query v5 hooks -> D1 API in production, static TS fallback in dev. All pages use D1 exclusively (no more localStorage/DataProvider).
- **API:** Cloudflare Worker with 60+ GET/POST/PUT endpoints (auth-gated writes)
- **Auth:** Open (Cloudflare Access available for team launch -- restrict to /dashboard, /projects, /meetings, /my-items)
- **Email:** Cloudflare Worker cron (7 AM CT weekdays) + SendGrid (dormant -- needs SENDGRID_API_KEY secret)
- **Sync:** Python scripts in Peripheral Brain (push + pull), scheduled in dispatcher

## D1 Tables

| Table | Rows | Purpose |
|-------|------|---------|
| team_members | 12 | Lab personnel + roles |
| projects | 25+ | Research projects with stages |
| publications | 100+ | PubMed-sourced publications |
| grants | 10+ | Active and pending grants |
| milestones | 30+ | Project milestones + deadlines |
| meetings | 20+ | Biweekly meetings + agendas |
| agenda_items | dynamic | Per-meeting agenda items |
| action_items | 50+ | Legacy action items (pre-task system) |
| project_updates | dynamic | Per-project status updates |
| project_comments | dynamic | Threaded project comments |
| research_digest | 152+ | Weekly paper digests |
| notifications | dynamic | In-app notification feed |
| commitments | dynamic | Team commitments tracker |
| collaboration_network | dynamic | Inter-member collaboration links |
| tasks | 19+ | Unified task system (replaces action_items) |
| ideas | dynamic | Research ideas board with voting |
| task_comments | dynamic | Per-task discussion threads |
| lab_settings | 6 | Key-value settings store |
| workflow_templates | 3+ | Custom project stage templates |

## API Endpoints

### Core Data
- GET /api/team, GET /api/projects, GET /api/publications, GET /api/grants
- GET /api/milestones, GET /api/meetings, GET /api/digest
- GET /api/notifications, GET /api/commitments

### Project Operations
- POST /api/projects/:id/comments, POST /api/projects/:id/updates
- GET /api/projects/health

### Meeting Operations
- POST /api/meetings/:id/agenda, POST /api/meetings/:id/action-items
- POST /api/meetings/:id/decisions, POST /api/meetings/:id/notes

### Task System
- GET /api/tasks (7 filters), POST /api/tasks, POST /api/tasks/:id, POST /api/tasks/:id/status
- GET /api/tasks/:id/comments, POST /api/tasks/:id/comments
- GET /api/tasks/:id/activity

### Ideas Board
- GET /api/ideas, POST /api/ideas, POST /api/ideas/:id, POST /api/ideas/:id/vote

### Calendar & Activity
- GET /api/calendar/events (aggregates meetings + tasks + milestones)
- GET /api/activity/heatmap?slug=&days=

### Search & Settings
- GET /api/search?q= (FTS across 6 tables)
- GET /api/settings, POST /api/settings
- GET /api/workflow-templates, POST /api/workflow-templates

### Notifications
- POST /api/notifications/:id/read, POST /api/notifications/read-all

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/api.ts` | Typed D1 API client -- row types + fetch wrappers |
| `src/hooks/useApiData.ts` | 12+ TanStack Query hooks with D1->frontend transforms + static fallback |
| `src/hooks/useMutations.ts` | 7 mutation hooks with optimistic cache updates + rollback |
| `src/hooks/useNotifications.ts` | Notification queries + mark-as-read mutation |
| `src/hooks/useCommitments.ts` | Commitment queries (filterable by assignee) |
| `src/hooks/useGrantTimeline.ts` | Grant data with date parsing for SVG Gantt chart |
| `src/hooks/useCVData.ts` | Publication + grant data formatted for academic CV |
| `src/hooks/useMentionAutocomplete.ts` | @slug autocomplete with keyboard navigation |
| `src/hooks/useKeyboardShortcuts.ts` | G+key navigation, / search, ? help |
| `src/lib/dateUtils.ts` | Shared date formatters (6 exports) -- single source of truth |
| `src/data/team.ts` | Team members + `getPersonInfo()` shared utility |
| `src/components/Avatar.tsx` | Photo/initials avatar -- uses overflow-hidden + w-full h-full img |
| `src/components/MentionInput.tsx` | @slug autocomplete textarea replacement (arrows/enter/escape) |
| `src/components/NotificationBell.tsx` | Nav bell icon with unread count badge + dropdown panel |
| `src/components/CommandPalette.tsx` | Cmd+K fuzzy search across tasks/projects/people/meetings |
| `src/components/ShortcutHelp.tsx` | Keyboard shortcut reference modal |
| `src/components/BrandName.tsx` | Inline EKG pulse SVG + formatBrandName() utility |
| `src/components/ActivityHeatmap.tsx` | GitHub-style contribution heatmap |
| `src/components/MetricCard.tsx` | Shared stat card (replaces 3 duplicates) |
| `src/components/ToggleButton.tsx` | Shared toggle button (replaces 7+ duplicates) |
| `src/components/ConditionalLink.tsx` | Link/div conditional wrapper |
| `src/components/tasks/TaskDetailPanel.tsx` | Slide-over detail panel, inline editing all fields, task comments, activity log |
| `src/components/tasks/TaskBoardView.tsx` | Drag-drop kanban using @dnd-kit |
| `src/hooks/useCountUp.ts` | Animated counters -- StrictMode-safe, re-animates on async data |
| `src/pages/MeetingDetail.tsx` | Meeting lifecycle: agenda, action items, decisions, notes |
| `src/pages/ProjectDetail.tsx` | Two-way editing, comments, updates, action items, add-to-agenda |
| `src/pages/Grants.tsx` | SVG Gantt timeline chart (2023-2033), filter tabs, grant detail cards |
| `src/pages/CVPage.tsx` | Per-member academic CV: publications, grants, print-friendly CSS |
| `src/pages/MyItems.tsx` | Personal feed: action items, notifications, commitments. Auth gate. |
| `src/pages/portal/ActivityPage.tsx` | Dedicated activity feed with type filters |
| `src/pages/portal/AnalyticsPage.tsx` | Lab Analytics with weekly report, team performance, heatmap |
| `src/pages/portal/SettingsPage.tsx` | Lab settings + custom workflow templates |
| `src/pages/portal/MeetingNotesPage.tsx` | AI Meeting Notes (upload audio / paste transcript) |
| `src/pages/Pulse.tsx` | Lab Pulse kiosk mode (/pulse) for conference room TVs |
| `src/components/dashboard/ProjectHealthCard.tsx` | Health indicators from /api/projects/health |
| `src/components/dashboard/MyItemsCard.tsx` | Dashboard bento card showing top 3 pending items |
| `api/index.ts` | Cloudflare Worker -- all 60+ API endpoints + cron handler |
| `api/schema-v2.sql` | D1 schema for meetings, action_items, agenda_items, project_updates |
| `api/schema-v3.sql` | D1 schema for research_digest table |
| `api/schema-v4.sql` | D1 schema for notifications table, grant dates, grant_id on milestones |
| `api/schema-v5.sql` | D1 schema for commitments table |
| `api/schema-v7.sql` | D1 schema for ideas table |
| `api/schema-v8.sql` | D1 schema for task_comments table |
| `api/schema-v9.sql` | D1 schema for lab_settings + workflow_templates tables |
| `functions/api/[[route]].ts` | Pages Function catch-all -- proxies /api/* to Worker |
| `src/pages/Digest.tsx` | Research Digest browser (152 papers, topic/date/status filters) |
| `src/components/UpcomingMeetingBanner.tsx` | Homepage meeting banner with action item count |
| `src/components/LatestDigest.tsx` | Homepage digest preview (top 4 papers) |
| `src/components/GlobalQuickAdd.tsx` | Todoist-style task creation modal (Cmd+N) |
| `src/components/QuickAddTaskInput.tsx` | Token-highlighted input with mirror overlay |
| `src/lib/parseQuickAdd.ts` | NLP parser: @person, #project, p1-p3, date expressions |
| `src/pages/PublicationDetail.tsx` | Individual publication view with OG meta tags |
| `src/pages/portal/Grants.tsx` | Grant cards, progress bars, milestones from useGrantTimeline |
| `src/components/RoundPrompt.tsx` | Meeting icebreaker prompts (shuffle, customize, persist) |
| `src/data/roundPrompts.ts` | 28 prompts across 5 categories + deterministic hash |
| `src/hooks/useRecentlyViewed.ts` | Track page visits in localStorage (6 max) |
| `src/components/RouteProgressBar.tsx` | NProgress-style teal bar during route transitions |
| `src/hooks/useDensity.ts` | Comfortable/compact spacing toggle (CSS variables) |
| `src/hooks/useFavicon.ts` | Dynamic emoji favicon per portal section |

## Portal Features

| Feature | Components | What It Does |
|---------|-----------|-------------|
| Task System | TaskCard, TaskListView, TaskBoardView, TaskStandUpView, TaskTimelineView, TaskFilters, CreateTaskModal, TaskDetailPanel | 4-view task management with drag-drop, inline editing, comments |
| Personal Hub | Personal.tsx | Bento grid: tasks, deadlines, notifications, commitments, activity, PI cards |
| Deadlines | Deadlines.tsx | Aggregated task due dates + milestones, List + Timeline views |
| Manuscript Pipeline | Manuscripts.tsx | 6-stage kanban + list, PI filter |
| Ideas Board | Ideas.tsx | Grid/list views, voting, status management |
| Calendar | CalendarPage.tsx | Month/Week/Day/Agenda views, iCal export, meeting links |
| Lab Analytics | AnalyticsPage.tsx | Weekly report, team performance, pipeline distribution, activity heatmap |
| Activity Feed | ActivityPage.tsx | Dedicated feed with type/action filters |
| Settings | SettingsPage.tsx | Lab info, custom workflow templates |
| AI Meeting Notes | MeetingNotesPage.tsx | Upload audio / paste transcript -> AI summaries + action items |
| Smart Search | SearchPage.tsx | FTS across 6 D1 tables, grouped by type |
| Lab Pulse | Pulse.tsx | Kiosk mode (/pulse) for conference room TVs |
| Cmd+K | CommandPalette.tsx | Fuzzy search + navigation + actions |
| Keyboard Shortcuts | useKeyboardShortcuts.ts | G+key nav, / search, ? help |
| Task Detail Panel | TaskDetailPanel.tsx | Slide-over with inline editing, comments, activity |
| Drag-Drop Board | TaskBoardView.tsx | @dnd-kit kanban with optimistic status changes |
| Activity Heatmap | ActivityHeatmap.tsx | GitHub-style contribution heatmap |
| Quick Capture | Personal.tsx | Lightbulb input -> creates Idea |
| GlobalQuickAdd | GlobalQuickAdd.tsx, QuickAddTaskInput.tsx, parseQuickAdd.ts | Todoist-style NLP task creation (Cmd+N, floating +) |
| Publication Detail | PublicationDetail.tsx | /publications/:id with OG meta, author avatars, topic links |
| Grants Portal | portal/Grants.tsx | Grant cards, progress bars, milestones, link to Gantt |
| RoundPrompt | RoundPrompt.tsx, roundPrompts.ts | 28 meeting icebreakers, shuffle/customize, localStorage |
| Recently Viewed | useRecentlyViewed.ts | Chips on Personal Hub tracking last 6 pages |
| Focus Mode | PortalLayout.tsx | F key hides sidebar + header for distraction-free work |
| Density Toggle | useDensity.ts | Comfortable/compact spacing via CSS variables |
| Route Progress | RouteProgressBar.tsx | NProgress-style teal bar during navigation |
| Dynamic Favicons | useFavicon.ts | Section-specific emoji in browser tab |
| CSV Export | AnalyticsPage.tsx | Download task data as CSV |

## Critical Rules

1. **Content visible by default.** `.fade-in-up` starts at opacity:1. NEVER hide content behind animations.
2. **Hero cards use `<a>` tags** (full page load), not React Router `<Link>`. AnimatePresence + useCountUp conflict.
3. **initialData as factory functions.** Always `initialData: () => data`, never `initialData: data`.
4. **Avatar overflow-hidden.** Container has `overflow-hidden`, img needs `w-full h-full`.
5. **PubMed is truth for publications.** Scholar CSV for completeness check only.
6. **Grants: Active vs Pending.** Display separately with clear labels.
7. **`getPersonInfo()` from `src/data/team.ts`** -- never create local copies.
8. **Date formatting from `src/lib/dateUtils.ts`** -- never create local formatters.
9. **@mentions use `MentionInput`** -- replace any `<textarea>` that accepts team member references.
10. **Dedup action items** -- normalize "[Carried forward]" prefix when counting or displaying pending items.
11. **NEVER deploy from a worktree.** Only deploy from the primary main branch working copy. Worktree agents must commit code to a branch and create a PR -- never build or deploy directly. This prevents orphaned deployments that can't be traced back to source code.
12. **ONE deploy per session.** Cloudflare Pages uses Workers KV for static asset serving (free tier: 100K reads, 1K writes/day). Each deploy uploads ~44 files to KV. Batch all work and deploy ONCE at the end of a session. Multiple deploys in one session risk hitting KV limits. (Learned 2026-03-30: 4 deploys hit 50% of daily KV limit.)

## Roadmap

1. **Phase 1 -- DONE:** Public website (12 pages, 60+ components)
2. **Phase 2 -- DONE:** D1 backend + TanStack Query data layer
3. **Phase 3 -- DONE:** Interactive team portal (meetings, action items, comments, updates)
4. **Phase 4 -- DONE:** brain.db <-> D1 sync, meeting automation, digest sync
5. **Phase 5 -- DONE:** D1 API activation, mobile optimization, dark mode, edge cases
6. **Phase 6 -- DONE:** Research Digest page, homepage enhancements, nav badges, SEO
7. **Phase 7 -- DONE:** D1 migration (all pages off localStorage), Grant Gantt page, CV Export, schema v4
8. **Phase 8 -- DONE:** NotificationBell, MentionInput, MyItems page, commitment sync, morning pulse email cron, meeting automation D1 integration
9. **Phase 9 -- DONE (Sessions 1-4):** LabSync parity -- Task system (4 views, drag-drop, detail panel), Personal Hub, Deadlines, Manuscripts, Ideas, Calendar, Analytics, Activity, Settings, AI Meeting Notes, Lab Pulse, Cmd+K, keyboard shortcuts, Smart Search, Quick Capture
10. **Phase 10 -- DONE (9 rounds, 22 commits):** UX polish (LabSync benchmark). GlobalQuickAdd, PublicationDetail, Grants portal, empty state consistency, RoundPrompt, focus mode, density toggle, favicons, recently viewed, route progress bar, CSV export, notification grouping, dark mode fixes, OG meta tags.
11. **Phase 11 -- DONE:** Infrastructure refactors, hard features (task peek, subtasks, bulk actions, agenda reorder, search ranking, dashboard pinning). 42 features shipped in master plan.
12. **Phase 12 -- DONE:** PB Sector v2 (Monk Manual planner). Star task + 3 focus + quick wins slots with @dnd-kit. 4 new D1 tables, 7 new API endpoints, 8 new components. Calendar timeline, pomodoro tracking, reflection panel. Dispatch queue table ready for Phase 3 (Claude integration).
13. **Phase 13 -- DONE:** Visual Polish & LabSync Parity. TaskDetailPanel custom controls, TaskCard status cycling, --border-subtle system, section spacing, chromatic restraint audit.
14. **Phase 14 -- IN PROGRESS:** Design Ethos Pivot (operational, not editorial). Deep LabSync study → 10 design patterns extracted → 3 rounds of design audits. Projects + Manuscripts pages redesigned (list-first, category dots, warm palette, ghost buttons, gold hover). Next: palette shift (drop cream), bordered table containers, inline editing, sidebar improvement, font split (Fraunces public-only), project detail → workspace. See `Context/Decisions/2026-04-01_hub-design-ethos-pivot.md`.

## Meeting Cadence

- **Biweekly Tuesdays at 3pm CT** (106 attendees on calendar)
- Anchor: `date(2026, 4, 7)`, weekday=1 (Tuesday)
- Sequence: ...Mar 10, Mar 24, **Apr 7**, Apr 21...
- Meeting automation runs Monday mornings (creates D1 meeting + agenda from brain.db)

## Known Gotchas

| Problem | Fix |
|---------|-----|
| Hero cards render loop | Use `<a>` tags, not React Router Link |
| useCountUp StrictMode | Hook handles double-mount cleanly; brief flash in dev is expected |
| initialData flash | Use factory functions: `initialData: () => data` |
| Avatar pill shape | Container needs `overflow-hidden`, img needs `w-full h-full` |
| Meeting ID collision | IDs include random suffix: `mtg-date-random` |
| Tailwind v4 | `@import` syntax, not `@tailwind` directives |
| Cloudflare Access blocks all | Fix: restrict to /dashboard, /projects, /meetings paths only |
| Network chunk 1.3MB | Expected (three.js). Already code-split via React.lazy |
| Duplicate action items | Dedup by normalizing "[Carried forward]" prefix -- applied in Meetings, MyItems, ActionBoard, Layout nav badge |
| DOI double-prefix | CV page: strip `https://doi.org/` prefix before constructing link |
| @mention in textarea | Use `MentionInput` component, not raw `<textarea>` |
| Task dedup | `useTasks()` hook deduplicates carried-forward items automatically |
| Calendar dedup | API deduplicates by type+date+title |
| Brand formatting | Use `formatBrandName()` for any text that might contain "MNCCORE" |
| Sidebar logo | Uses actual SVG logo mark, not plain text |
| Tailwind v4 group-hover + arbitrary values | `group-hover:max-h-[80px]` doesn't compile. Use CSS rule in index.css instead: `.parent:hover .child { max-height: 80px !important }` |
| --border-light vs --border-subtle | Gold `--border-light` for semantic borders (active pills, selected items). Neutral `--border-subtle` for structural borders (panel headers, section dividers). Don't mix. |
| TaskCard status cycling | Cycles todo→in_progress→done (skips blocked). Blocked is set explicitly from detail panel only. |
| @dnd-kit bundle | Used for board drag-drop (~12KB) |

## Peripheral Brain Connection

- **Project record:** `MN-CCORE Lab Hub` (type: Nick_Lab) in brain.db
- **Living plan:** `Projects/mnccore-minnesota-critical-care/ld-mnccore-hub-plan.md` -- READ FIRST
- **Vision doc:** `Projects/mnccore-minnesota-critical-care/ld-mnccore-hub-vision.md`
- **Memory:** `memory/project_mnccore-website-redesign.md`
- **Sync push:** `scripts/db/sync_d1_push.py` (brain.db -> D1)
- **Sync pull:** `scripts/db/sync_d1_pull.py` (D1 -> brain.db)
- **Meeting automation:** `scripts/scheduled/meeting_automation.py`

## Phase 10 Summary (COMPLETE — 2026-03-30, 22 commits, 9 rounds)

All frontend-only improvements from NEXT-50 Tiers 1-2 shipped. 13 new files, 25+ modified.
Key additions: GlobalQuickAdd (NLP parser), PublicationDetail, Grants portal, RoundPrompt,
focus mode, density toggle, favicons, recently viewed, route progress bar, CSV export,
notification grouping, empty state consistency, dark mode fixes, OG meta tags.

## Phase 11 Backlog — Infrastructure & Hard Problems

**NOTE:** Tier 1 file size estimates from code dump were wrong (3000+ → 419 actual for api/index.ts). api/index.ts was already split into 12 route modules. useApiData is 594 lines, useMutations is 427 lines — manageable as-is.

### Tier 1: Code Quality — ALREADY DONE
api/index.ts already split into `api/routes/{tasks,projects,meetings,publications,team,digest,ideas,notifications,search,settings,reactions,calendar,activity,subtasks}.ts`. No further splitting needed.

### Tier 2: Features — DONE (Phase 11 Session 1)
| # | Item | Status |
|---|------|--------|
| 4 | **Task peek overlay** | DONE — Space bar preview, TaskRow types, keyboard nav |
| 5 | **Task subtasks** | DONE — D1 table, 5 API endpoints, checklist UI in TaskDetailPanel |
| 6 | **Bulk task actions** | DONE — Batch API (5 actions), floating toolbar, multi-select checkboxes |
| 10 | **SavedViewsBar** | DONE — 3 default views, custom views, localStorage, pill bar UI |

### Tier 2: Features — Session 2 (ALL DONE)
| # | Item | Status |
|---|------|--------|
| 7 | **Agenda item reordering** | DONE — @dnd-kit sortable, API batch reorder, grip handle |
| 8 | **Search ranking** | DONE — Relevance scoring: type priority + recency + title match + status boost |
| 9 | **Dashboard card pinning** | DONE — Gold pinned section, hover pin buttons, Customize panel pins |

### Tier 3: Infrastructure — DONE
| # | Item | Status |
|---|------|--------|
| 11 | **Playwright smoke tests** | DONE — Config + 23 route tests + 9 API health checks |

### Launch Blockers (External)
- SendGrid API key → `wrangler secret put SENDGRID_API_KEY`
- Cloudflare Access → restrict to portal paths with @umn.edu
- 7 missing team headshots
- Nate Mesfin Google Scholar ID

### Code Dump Recovery Reference
`Scratch/plans/mnccore-hub-session-code-dump-2026-03-30.md` (33K lines)

| Component | Line | Status |
|-----------|------|--------|
| TaskPeekOverlay | 18347 | RECOVERED — refactored to TaskRow |
| SavedViewsBar | 19757 | RECOVERED |
| BulkActionToolbar | 19283 | RECOVERED — with batch API |
| ProjectDependencyGraph | 21631 | Needs data source |
| TeamPulseCard | 20916 | Needs useTeamPulse hook |

## Session Notes

<!-- COO writes session updates here. Synced by SessionEnd hook or Start Day backup. -->

