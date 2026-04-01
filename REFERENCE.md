# MN-CCORE Lab Hub — Reference Guide

Detailed tables, API endpoints, key files, and feature inventory.
Moved from CLAUDE.md to reduce session context load. Read on demand.

## D1 Tables (19)

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

## API Endpoints (60+)

### Core Data
- GET /api/team, /api/projects, /api/publications, /api/grants
- GET /api/milestones, /api/meetings, /api/digest
- GET /api/notifications, /api/commitments

### Project Operations
- POST /api/projects/:id/comments, /api/projects/:id/updates
- GET /api/projects/health

### Meeting Operations
- POST /api/meetings/:id/agenda, /api/meetings/:id/action-items
- POST /api/meetings/:id/decisions, /api/meetings/:id/notes

### Task System
- GET /api/tasks (7 filters), POST /api/tasks, POST /api/tasks/:id, POST /api/tasks/:id/status
- GET /api/tasks/:id/comments, POST /api/tasks/:id/comments
- GET /api/tasks/:id/activity

### Ideas Board
- GET /api/ideas, POST /api/ideas, POST /api/ideas/:id, POST /api/ideas/:id/vote

### Calendar & Activity
- GET /api/calendar/events, /api/activity/heatmap?slug=&days=

### Search & Settings
- GET /api/search?q=, /api/settings, /api/workflow-templates
- POST /api/settings, /api/workflow-templates

### Notifications
- POST /api/notifications/:id/read, /api/notifications/read-all

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/api.ts` | Typed D1 API client |
| `src/hooks/useApiData.ts` | 12+ TanStack Query hooks |
| `src/hooks/useMutations.ts` | 7 mutation hooks with optimistic updates |
| `src/lib/dateUtils.ts` | Shared date formatters (6 exports) |
| `src/data/team.ts` | Team members + `getPersonInfo()` |
| `src/components/Avatar.tsx` | Photo/initials avatar |
| `src/components/MentionInput.tsx` | @slug autocomplete |
| `src/components/NotificationBell.tsx` | Nav bell + dropdown |
| `src/components/CommandPalette.tsx` | Cmd+K fuzzy search |
| `src/components/GlobalQuickAdd.tsx` | Todoist-style NLP task creation |
| `src/lib/parseQuickAdd.ts` | NLP parser: @person, #project, p1-p3, dates |
| `src/components/tasks/TaskDetailPanel.tsx` | Slide-over detail panel |
| `src/components/tasks/TaskBoardView.tsx` | Drag-drop kanban (@dnd-kit) |
| `src/pages/ProjectDetail.tsx` | Project editing, comments, updates |
| `src/pages/Grants.tsx` | SVG Gantt timeline (2023-2033) |
| `src/pages/portal/Personal.tsx` | Personal Hub bento grid |
| `src/pages/portal/AnalyticsPage.tsx` | Lab Analytics |
| `api/index.ts` | Cloudflare Worker — all endpoints + cron |
| `functions/api/[[route]].ts` | Pages Function catch-all |

## Portal Features (28 shipped)

Task System (4 views + drag-drop + detail panel + comments), Personal Hub,
Deadlines, Manuscripts, Ideas Board (voting), Calendar (4 views), Lab Analytics,
Activity Feed, Settings, AI Meeting Notes, Smart Search (FTS), Lab Pulse (kiosk),
Cmd+K, Keyboard Shortcuts (G+key), Activity Heatmap, Quick Capture, GlobalQuickAdd
(NLP), Publication Detail, Grants Portal, Meeting Icebreakers, Focus Mode (F key),
Density Toggle, Route Progress Bar, Dynamic Favicons, CSV Export, Recently Viewed,
Subtasks, Bulk Actions.

## Phase History (1-13 COMPLETE, 360+ commits)

Phases 1-8: Public website, D1 backend, team portal, sync, API, digest, migration, notifications.
Phase 9: LabSync parity — task system, 10+ portal pages, Cmd+K, keyboard shortcuts.
Phase 10: UX polish — GlobalQuickAdd, focus mode, density toggle, OG meta, dark mode fixes.
Phase 11: Hard features — task peek, subtasks, bulk actions, search ranking, dashboard pinning.
Phase 12: PB Sector v2 — daily planner, dispatch queue, 4 new D1 tables.
Phase 13: Visual polish — TaskDetailPanel custom controls, --border-subtle system.

## Phase 11 Implementation Notes

api/index.ts split into 12 route modules: `api/routes/{tasks,projects,meetings,publications,team,digest,ideas,notifications,search,settings,reactions,calendar,activity,subtasks}.ts`.

Code dump reference: `Scratch/plans/mnccore-hub-session-code-dump-2026-03-30.md`
