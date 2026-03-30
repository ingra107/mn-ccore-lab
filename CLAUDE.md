# MN-CCORE Lab Hub -- Claude Operating Guide

## Vision

The MN-CCORE Lab Hub is the **team's operating surface** -- not just a website, but where research gets managed, meetings get run, and information flows bidirectionally between Nick's CLI system and every team member's browser.

## Quick Reference

| Thing | Value |
|-------|-------|
| Live site | mn-ccore-lab.pages.dev |
| Repo | github.com/ingra107/mn-ccore-lab (160+ commits) |
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
10. **Phase 10 -- IN PROGRESS:** UX polish pass (LabSync benchmark), launch prep (SendGrid + Cloudflare Access), data quality (7 headshots, Nate Scholar ID)

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

## UX Polish Tracker (Phase 10)

### Done (2026-03-30)
- Hero EKG pulse inline SVG (brand consistency with nav logo)
- Sidebar item gap 2px→4px, section labels 10→11px
- Bento grid gap 16→20px, card padding normalized 24px
- Task card padding 14→16px, list gap 8→12px, meta text 10→11px
- Sort buttons 11→12px, filter dropdowns 12→13px
- View switcher: all 4 views inline (removed "More views" dropdown)
- Search bar pill-shaped (rounded-full)
- ToggleButton larger touch targets
- Deploy guardrail (Rule 11: never deploy from worktrees)

### Done (2026-03-30, round 2)
- Filter dropdown icons (FolderKanban, Users, CircleDot, Flag inside pills)
- Page title icons on all 14 portal pages (teal icon in rounded square)
- Sidebar active state: 3px left teal accent bar
- Quick Action button hierarchy ("New Task" primary teal fill, others outlined)

### Done (2026-03-30, round 3)
- Task card hover: subtle lift (-1px) + shadow on hover
- Empty states: icon in teal rounded box (56px), text-base headings, outlined CTA buttons
- Meetings + Projects custom headers: added teal page icons

### Remaining
- Empty state consistency audit on remaining pages (Grants, Manuscripts, Calendar, etc.)
- Consistent page subtitle counts across all portal pages (some have dynamic counts, some don't)
- Publication detail pages (/publications/:id) — individual paper view for sharing/SEO
- Rebuild dispatch features: GlobalQuickAdd (quick task creation from anywhere)
  - Source: `Scratch/plans/mnccore-hub-session-code-dump-2026-03-30.md` (33K lines)
- Launch prep: SendGrid API key, Cloudflare Access auth, 7 headshots, Nate Scholar ID

## Session Notes

### 2026-03-30: Dispatch Recovery + UX Polish (Spring Break Day 1)
**What happened:** 4 dispatch worktree agents deployed rogue code to Cloudflare Pages over 11 hours, overwriting production. Diagnosed root cause (CLAUDE.md had deploy command without guardrail), recovered by redeploying from main (all 188 commits intact), added Rule 11 (never deploy from worktrees), logged mistake pattern + mechanic_knowledge.

**UX Polish (3 rounds, benchmarked against LabSync):**
- Round 1: Spacing rhythm — sidebar, cards, grids, sort/filter sizes, view switcher inline, search bar pill, toggle touch targets
- Round 2: Visual identity — page icons on all 14 pages, filter icons (folder/person/status/flag), sidebar left accent bar, button hierarchy
- Round 3: Interactivity — task card hover lift, empty state redesign (icon boxes, proportions), Meetings+Projects page icons
- Hero: Added EKG pulse inline SVG

**Commits:** 037e518, a0f774a, 4bb3787, 56d8183, 1dc3a7b, 2275ae8, 34d086c (7 commits, ~200 lines changed across 20+ files)
**Dispatch code dump preserved:** `Scratch/plans/mnccore-hub-session-code-dump-2026-03-30.md` (33K lines)
<!-- COO writes session updates here. Synced by SessionEnd hook or Start Day backup. -->

