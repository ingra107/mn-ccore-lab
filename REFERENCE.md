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

## API Endpoints (75+)

### Core Data
- GET /api/team, /api/projects, /api/publications, /api/grants
- GET /api/milestones, /api/meetings, /api/digest
- GET /api/notifications, /api/commitments

### Project Operations
- POST /api/projects/:id/comments, /api/projects/:id/updates
- GET /api/projects/health (real 4-factor scoring algorithm)

### Meeting Operations
- POST /api/meetings/:id/agenda, /api/meetings/:id/action-items
- POST /api/meetings/:id/decisions, /api/meetings/:id/notes

### Task System
- GET /api/tasks (7 filters), POST /api/tasks, POST /api/tasks/:id, POST /api/tasks/:id/status
- GET /api/tasks/:id/comments, POST /api/tasks/:id/comments
- GET /api/tasks/:id/activity
- blocked_by field for task dependencies

### Ideas Board
- GET /api/ideas, POST /api/ideas, POST /api/ideas/:id, POST /api/ideas/:id/vote

### Decisions (Enhanced Phase 19)
- GET /api/decisions (?tag= filter), POST /api/decisions
- POST /api/decisions/:id/update, POST /api/decisions/:id/outcome
- GET /api/decisions/tags (unique tags with counts)
- GET /api/decisions/similar?context=, GET /api/decisions/similar-by-id?id=

### Trainee Trajectories (Phase 19)
- GET /api/team/:slug/trajectory (publications, projects, tasks, activity, milestones)

### PI Analytics (Phase 19)
- GET /api/analytics/pi-dashboard
- GET /api/analytics/mentee-velocity
- GET /api/analytics/response-time
- GET /api/analytics/team-engagement
- GET /api/team/by-expertise?tag=

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
| `src/hooks/useApiData.ts` | 20+ TanStack Query hooks |
| `src/hooks/useMutations.ts` | 10+ mutation hooks with optimistic updates |
| `src/hooks/useTaskKeyboardShortcuts.ts` | Task-specific shortcuts (J/K/Space/S/X/B/Enter/Esc) |
| `src/lib/dateUtils.ts` | Shared date formatters (6 exports) |
| `src/data/team.ts` | Team members + `getPersonInfo()` |
| `src/components/Avatar.tsx` | Photo/initials avatar |
| `src/components/MentionInput.tsx` | @slug autocomplete |
| `src/components/NotificationBell.tsx` | Nav bell + dropdown |
| `src/components/CommandPalette.tsx` | Cmd+K fuzzy search |
| `src/components/GlobalQuickAdd.tsx` | Todoist-style NLP task creation |
| `src/lib/parseQuickAdd.ts` | NLP parser: @person, #project, p1-p3, dates |
| `src/components/tasks/TaskDetailPanel.tsx` | Slide-over detail panel |
| `src/components/tasks/TaskBoardView.tsx` | Drag-drop kanban with swimlanes + column collapse |
| `src/components/tasks/TaskPeekOverlay.tsx` | Space bar peek panel (Linear-style) |
| `src/components/tasks/TaskGridView.tsx` | Columnar table with inline editing |
| `src/components/PageHeader.tsx` | Standardized page header |
| `src/components/EmptyState.tsx` | Consistent empty states |
| `src/components/LoadingSkeleton.tsx` | Table/Card/Text skeleton loaders |
| `src/components/InlineAssigneePicker.tsx` | Avatar dropdown for assignee editing |
| `src/components/InlineDatePicker.tsx` | Date editing with overdue detection |
| `src/components/CollapsibleSection.tsx` | Progressive disclosure sections |
| `src/pages/ProjectDetail.tsx` | Project editing, comments, updates |
| `src/pages/Grants.tsx` | SVG Gantt timeline (2023-2033) |
| `src/pages/portal/Personal.tsx` | Personal Hub bento grid |
| `src/pages/portal/AnalyticsPage.tsx` | Lab Analytics |
| `src/pages/TrajectoryPage.tsx` | Trainee development trajectory |
| `src/pages/portal/PIAnalytics.tsx` | Evidence-based PI dashboard |
| `src/pages/portal/DecisionsPage.tsx` | Decision log with replay/tags/outcomes |
| `api/index.ts` | Cloudflare Worker — all endpoints + cron |
| `api/routes/trajectory.ts` | Trajectory API |
| `api/routes/pi-dashboard.ts` | PI analytics API |
| `api/routes/decision-replay.ts` | Similar decisions API |
| `functions/api/[[route]].ts` | Pages Function catch-all |

## Portal Features (45+ shipped)

**Core:** Task System (5 views: Grid/Board/StandUp/Timeline + detail panel + comments + subtasks + bulk actions + peek), Personal Hub, Deadlines, Manuscripts, Ideas Board (voting), Calendar (4 views), Lab Analytics, Activity Feed, Settings, AI Meeting Notes, Smart Search (FTS), Lab Pulse (kiosk).

**Navigation:** Cmd+K, Keyboard Shortcuts (G+key + task-specific J/K/S/X/B/Space/Enter), Focus Mode (F key), Route Progress Bar, Dynamic Favicons, Recently Viewed.

**Task UX (Phase 17):** Space bar peek overlay, inline assignee/date/priority editing, hover row actions, completion animation, status color transitions, loading skeletons, progressive disclosure, board swimlanes + column collapse.

**Data (Phase 18):** Blocker flagging (blocked_by + B shortcut), project health (4-factor algorithm + colored bars), dashboard card badges, saved named views.

**Differentiation (Phase 19):** Trainee development trajectories (pub curve + velocity + metrics + heatmap), decision replay (tags + similar search + outcomes + timeline), evidence-based PI dashboard (commitment scorecard + response time + engagement + mentee velocity), expertise tags on profiles.

**Other:** Quick Capture, GlobalQuickAdd (NLP), Grants SVG Gantt, CV Export, Density Toggle, CSV Export, Meeting Icebreakers, Reactions, @Mentions.

## Phase History (1-19 COMPLETE, 400+ commits)

Phases 1-8: Public website, D1 backend, team portal, sync, API, digest, migration, notifications.
Phase 9: LabSync parity — task system, 10+ portal pages, Cmd+K, keyboard shortcuts.
Phase 10: UX polish — GlobalQuickAdd, focus mode, density toggle, OG meta, dark mode fixes.
Phase 11: Hard features — task peek, subtasks, bulk actions, search ranking, dashboard pinning.
Phase 12: PB Sector v2 — daily planner, dispatch queue, 4 new D1 tables.
Phase 13: Visual polish — TaskDetailPanel custom controls, --border-subtle system.
Phase 14: Design ethos pivot — palette, containers, inline editing, fonts, monospace, colors.
Phase 15: Project detail → tabbed workspace.
Phase 16: Foundation + table overhaul — dark deepening, TaskGridView, columnar tables.
Phase 17: UX interaction layer — PageHeader, keyboard shortcuts, peek, inline editing, board enhancements, skeletons.
Phase 18: Functional depth — blocker flagging, project health, dashboard badges.
Phase 19: Differentiation — trainee trajectories, decision replay, PI dashboard, expertise tags.

## Implementation Notes

api/index.ts split into 15+ route modules: `api/routes/{tasks,projects,meetings,publications,team,digest,ideas,notifications,search,settings,reactions,calendar,activity,subtasks,trajectory,decisions,decision-replay,pi-dashboard}.ts`.
