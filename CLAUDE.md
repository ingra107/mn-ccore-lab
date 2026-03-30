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

- **Fonts:** Fraunces (display) / DM Sans (body) / JetBrains Mono (mono)
- **Palette:** ink `#0f1923` / gold `#c9a84c` / cream `#faf8f3` / maroon `#7a0019` / teal `#2d8a8a`
- **Centering:** ALL containers use `.content-container` -- no custom max-width
- **Dark mode:** CSS variables invert via `.dark` class. Card dark bg: `#162535`.
- **Shared utilities:** `src/lib/dateUtils.ts` (6 formatters), `src/data/team.ts:getPersonInfo()`, `src/lib/api.ts`
- **Brand formatting:** `formatBrandName()` from `src/components/BrandName.tsx` -- use for any text that might contain "MNCCORE"

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
11. **Phase 11 -- NEXT:** Infrastructure refactors (split api/index.ts, useApiData, useMutations), hard features (task peek, subtasks, bulk actions, agenda reorder, search ranking), launch prep

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

### Tier 2: Features — Remaining
| # | Item | Why | Approach |
|---|------|-----|----------|
| 7 | **Agenda item reordering** | Can't reorder after creation. | @dnd-kit sortable. API POST for `sort_order`. |
| 8 | **Search ranking** | FTS returns by type, not relevance. | Weight by recency + type priority in API. |
| 9 | **Dashboard card pinning** | Can't pin favorites to top. | Customize modal rework + localStorage sort state. |

### Tier 3: Infrastructure
| # | Item | Why | Approach |
|---|------|-----|----------|
| 11 | **Playwright smoke tests** | No automated testing. | Script hitting 18 portal routes, verify page titles. |

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

### 2026-03-30: Phase 11 Session 1 (Spring Break Day 1, Evening)
**4 features shipped in parallel** via worktree agents:
1. **Task Peek Overlay** — Space bar quick preview, centered modal, focus management
2. **Task Subtasks** — schema-v10.sql, 5 API endpoints, checklist UI with progress bar
3. **Bulk Task Actions** — batch API (complete/uncomplete/assign/priority/delete), floating toolbar, multi-select
4. **SavedViewsBar** — 3 default views + custom named presets, localStorage, pill bar

**7 new files, 10 modified, +1897 lines.** All 4 branches merged cleanly (2 conflicts resolved). Build verified.

**Correction:** Phase 11 Tier 1 (file splitting) was already done — api/index.ts has 12 route modules (1985 total lines). Memory estimates of 3000+/17K/14K lines were from the code dump, not actual files. Updated backlog.

### 2026-03-30: Phase 10 Complete (Spring Break Day 1)
**Morning:** Recovered from dispatch worktree incident (4 rogue deploys). Added Rule 11 guardrail. Preserved 33K-line code dump.

**Afternoon (prior session):** 22 commits, 9 rounds of UX polish + feature work.
- Rounds 1-3: Spacing rhythm, visual identity, interactivity
- Round 4: Empty states (8 pages), subtitle counts, GlobalQuickAdd, PublicationDetail
- Round 5: ShortcutHelp, OG meta, dark mode (7 files), Grants portal (real data)
- Round 6: Notification groups, CSV export, RoundPrompt icebreakers
- Round 7: Recently viewed, route progress bar
- Round 8: Focus mode (F key), density toggle
- Round 9: Dynamic emoji favicons

**13 new files created.** All frontend-only NEXT-50 items exhausted.
<!-- COO writes session updates here. Synced by SessionEnd hook or Start Day backup. -->

