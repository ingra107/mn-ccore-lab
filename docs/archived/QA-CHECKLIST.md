# MN-CCORE Lab Hub -- QA Checklist

> **As of Phase 35 (2026-04-18), the Playwright preflight + 14 deep-audit
> suites cover ~95% of this list automatically.** Run
> `npx tsx scripts/pre-flight/00-orchestrator.ts` for the green/red gate.
> This file is useful ONLY for:
> - Manual human-eye review after visual refactors
> - Sanity-check before a launch-critical deploy
> - Test surfaces the automation hasn't covered yet
>
> If you find yourself running an item manually, ask whether it should
> become a preflight persona assertion instead.

Run this after every major overhaul, before every deploy, and before launch milestones.
Use Playwright or manual browser testing. Document results with screenshots.

## 1. Page Rendering (all 19+ portal pages)

### Portal Pages (sidebar layout)
- [ ] Dashboard (`/dashboard`) -- greeting, cards, overdue banner, live stats
- [ ] My Hub (`/personal`) -- sign-in state, onboarding, quick actions
- [ ] My Tasks (`/my-tasks`) -- QuickFilters, Focus Next, streak, grouped table
- [ ] All Tasks (`/tasks`) -- columnar table, view toggles, filter hint
- [ ] Calendar (`/calendar`) -- month/week/day/agenda views, today highlight
- [ ] Deadlines (`/deadlines`) -- urgent banner, overdue group, iCal export
- [ ] Projects (`/projects`) -- stage groups, task badges, category filters
- [ ] Manuscripts (`/manuscripts`) -- stage dots, PI avatars, sortable columns
- [ ] Ideas (`/ideas`) -- grid/list toggle, vote animation, N-key create
- [ ] Ask the Lab (`/ask`) -- search, status tabs, empty state
- [ ] Decisions (`/decisions`) -- search, status tabs, N-key create
- [ ] Research Digest (`/digest`) -- reading progress, date pills, search
- [ ] Search (`/search`) -- full-text results, type filters, recent searches
- [ ] Grants (`/grants`) -- SVG timeline, TODAY marker, days remaining
- [ ] Meetings (`/meetings`) -- next meeting countdown, archive, action items
- [ ] Meeting Transcripts (`/meeting-notes`) -- upload, search, status badges
- [ ] Activity (`/activity`) -- person filter, type badges, "most active"
- [ ] Analytics (`/analytics`) -- velocity chart, attention required, health summary
- [ ] PI Analytics (`/pi/analytics`) -- access gate when unauthenticated
- [ ] Settings (`/settings`) -- lab config, workflow templates, theme preview
- [ ] Narratives (`/narratives`) -- search, empty state
- [ ] Session History (`/sessions`) -- filters, time range, stats
- [ ] Mentee Milestones (`/mentee-milestones`) -- mentee cards, filters
- [ ] Deadline Cascade (`/deadline-cascade`) -- dependency graph

### Public Pages (top nav layout)
- [ ] Homepage (`/`) -- hero, stats counter, pillar cards
- [ ] Team (`/team`) -- member count, co-director cards, sections
- [ ] Publications (`/publications`) -- year chart, bibliography button
- [ ] Contact (`/contact`) -- form renders
- [ ] Network (`/network`) -- 3D graph loads (large chunk expected)

### Detail Pages
- [ ] Project Detail (`/projects/:slug`) -- tabs, timeline, inline editing
- [ ] Meeting Detail (`/meetings/:id`) -- action items, copy summary, NLP add
- [ ] Member Page (`/team/:slug`) -- avatar, expertise tags, heatmap
- [ ] Publication Detail (`/publications/:id`) -- abstract, links

## 2. API Health Check

### Read Endpoints (all should return 200)
```
GET /api/tasks, /api/projects, /api/team, /api/meetings
GET /api/ideas, /api/decisions, /api/search?q=test
GET /api/version, /api/settings, /api/calendar/events
GET /api/activity, /api/analytics/pi-dashboard
GET /api/grants, /api/publications, /api/notifications
GET /api/workflow-templates, /api/milestones
GET /api/digest, /api/projects/health
GET /api/tasks/:id/comments, /api/tasks/:id/updates, /api/tasks/:id/activity
```

### Write Endpoints (test create → verify → clean up)
- [ ] POST /api/tasks -- create task (requires title, description, assignee)
- [ ] POST /api/tasks/:id/status -- change status
- [ ] POST /api/tasks/:id -- update fields
- [ ] POST /api/tasks/:id/comments -- add comment
- [ ] POST /api/tasks/:id/updates -- add note
- [ ] POST /api/ideas -- create idea
- [ ] POST /api/decisions -- create decision
- [ ] POST /api/projects/:slug/updates -- post project update
- [ ] POST /api/meetings -- record meeting

### Schema Integrity
- [ ] All columns referenced in queries exist in D1
- [ ] Run `SELECT sql FROM sqlite_master WHERE type='table'` to dump live schema
- [ ] Compare against latest schema-vXX.sql files

## 3. Keyboard Shortcuts

- [ ] `Ctrl+K` / `Cmd+K` -- command palette opens, Escape closes
- [ ] `?` -- shortcut help modal
- [ ] `C` -- create task modal (on Tasks page)
- [ ] `N` -- create modal (on Ideas, Decisions pages)
- [ ] `J` / `K` -- row navigation (Tasks, Projects, etc.)
- [ ] `Enter` -- open TaskDetailPanel from selected row
- [ ] `Escape` -- close panel/modal
- [ ] `F` -- toggle focus mode / filter panel
- [ ] `Space` -- peek overlay
- [ ] `S` -- cycle status
- [ ] `B` -- toggle blocker
- [ ] `Z` -- snooze
- [ ] `A` -- assign
- [ ] `P` -- pin project (on Projects)
- [ ] `G + D/H/T/P/M/C/I/L/G/K/Y/A/S` -- go-to navigation
- [ ] `Ctrl+.` -- theme cycle
- [ ] Arrow keys on Calendar page
- [ ] **Guard test:** Type "f" in a search input -- should NOT trigger Focus mode

## 4. Interactive Features

### Task System
- [ ] List view -- columnar table, inline status/priority/assignee editing
- [ ] Board view -- Kanban columns, group by toggle
- [ ] Timeline view -- Gantt bars, TODAY marker
- [ ] By Person view -- per-person task list, workload indicator
- [ ] StandUp view (MyTasks) -- accessible via More Views dropdown
- [ ] TaskDetailPanel -- 5 tabs (Overview/Notes/Comments/Activity/Details)
- [ ] Subtask expand/collapse (chevron on grid rows)
- [ ] Status change produces undo toast
- [ ] Right-click context menu (snooze, open in new tab)
- [ ] Bulk select (X key) + bulk action toolbar

### Modals
- [ ] CreateTaskModal -- C key, template chips, AI autofill, focus trapping
- [ ] CreateProjectModal -- focus trapping, aria-modal
- [ ] CreateIdeaModal -- N key, focus trapping
- [ ] CreateDecisionModal -- N key, focus trapping
- [ ] CreateQuestionModal -- focus trapping
- [ ] All modals close on Escape

### Copy / Export Buttons
- [ ] Copy Bibliography (Publications page)
- [ ] Copy Reading List (Digest page)
- [ ] Copy Summary (Meeting Detail)
- [ ] Copy Report (Analytics, PI Analytics)
- [ ] Copy as Text (CV page)
- [ ] Export .ics (Deadlines)
- [ ] Print (Meeting Prep, PI Analytics, CV)

### Inline Editing
- [ ] InlineSelect dropdowns render as portal (not clipped by table overflow)
- [ ] InlineAssigneePicker avatar dropdown
- [ ] InlineDatePicker with relative labels and quick presets
- [ ] Project status/stage/PI/group editable on Projects list

## 5. Mobile Responsive (375x812)

- [ ] Sidebar collapses to hamburger menu
- [ ] Task cards stack vertically (no horizontal scroll)
- [ ] Dashboard cards stack
- [ ] Touch targets >= 36px
- [ ] No horizontal overflow / scrollbar
- [ ] Tooltips/toasts don't clip viewport

## 6. Dark / Light Mode

- [ ] Dark mode: bg #0b1017, text #e2e8f0, no pure white
- [ ] Light mode: bg #ffffff, text #0f1923, readable contrast
- [ ] Ctrl+. cycles theme correctly
- [ ] Sidebar logo visible in both modes
- [ ] Status badge pills readable in both modes

## 7. Console Errors

- [ ] No React errors (check for #310, #423, etc.)
- [ ] No uncaught promise rejections
- [ ] No 500 API responses in network tab
- [ ] WebSocket errors acceptable only if DO is intentionally disabled
- [ ] No console.log in production build

## 8. Sync Pipeline (brain.db <-> D1)

- [ ] `sync_d1_push.py` runs without error
- [ ] `sync_d1_pull.py` runs without error
- [ ] Task status changes in Hub appear in brain.db after pull
- [ ] Task status changes in brain.db appear in Hub after push
- [ ] Hub-created tasks (hex IDs) pull to brain.db but don't push to Airtable
- [ ] Soft-deleted tasks stay deleted (no zombie re-creation)
- [ ] `updated_at` timestamps set correctly on all write paths

## 9. Accessibility

- [ ] Focus trapping on all modals
- [ ] aria-modal on all modals
- [ ] aria-live on PageHeader count/subtitle
- [ ] role="status" + aria-live on UndoToast
- [ ] Skip-to-content link present
- [ ] Focus-visible styling works
- [ ] prefers-reduced-motion respected

## 10. Performance

- [ ] Dashboard loads in < 3s
- [ ] Tasks page with 500+ tasks scrolls smoothly (virtual scrolling)
- [ ] Network chunk (three.js) is lazy-loaded, doesn't block other pages
- [ ] No layout shift on page load (content starts at opacity:1)
