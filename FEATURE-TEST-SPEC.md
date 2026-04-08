# MN-CCORE Lab Hub -- Feature Test Specification

Complete inventory of every feature, expected behavior, and test procedure.
A fresh Claude session should be able to read this file and audit the entire site independently.

**Site:** https://mn-ccore-lab.pages.dev
**Stack:** React 19 + Vite + Tailwind v4 + Cloudflare D1/Workers
**Routes:** Portal pages use flat paths (/dashboard, /tasks, /projects — NOT /portal/*)

---

## SECTION 1: PAGE INVENTORY

Every page that must load without errors. Test = navigate + screenshot + check console for React errors.

### Portal Pages (PortalLayout — sidebar + top search bar)
| # | Page | Route | Key Elements to Verify |
|---|------|-------|----------------------|
| 1 | Dashboard | /dashboard | Time-of-day greeting, date, "X done today", overdue banner, 6 bento cards (Tasks, Upcoming, Project Health, Publications, WeeklyProgress, QuickWins), Customize button, role tabs (Overview/Projects/People/Deadlines) |
| 2 | My Hub | /personal | Sign-in prompt (when unauthenticated), 30-day onboarding checklist, quick actions row, priority bar, weekly completion count |
| 3 | My Tasks | /my-tasks | QuickFilter pills (All/Today/This Week/Overdue/No Date), Focus Next card, completion streak badge, view toggle (List + More Views dropdown), Group by / Sort dropdowns, "Show done" toggle |
| 4 | All Tasks | /tasks | View toggles (List/Board/By Person/Timeline), PageHeader with count, "Press F to toggle filters" hint, New Task button, Show done toggle, Filter button |
| 5 | Calendar | /calendar | Month/Week/Day/Agenda view toggles, prev/next arrows, today highlighted (teal inset ring), event count in subtitle, legend (Meetings/Task Dues/Milestones), Export button |
| 6 | Deadlines | /deadlines | Urgent countdown banner, overdue group header, List/Timeline/Cascade View/Export toggles, All Types filter, inline status editing |
| 7 | Projects | /projects | Category filters (All/CLIF/Lab/Mesfin Lab/Mentees/Needs Attention), List view toggle, stage group headers, task count badges, sortable columns (Title/Status/Stage/PI/Group), inline PI/Group editing, "Try Pipeline view" hint |
| 8 | Project Detail | /projects/:slug | Breadcrumbs, 5 tabs (Overview/Tasks/Revisions/Activity/Literature), project timeline, inline status/stage editing, Watch button, Notes section |
| 9 | Manuscripts | /manuscripts | Category filter (All PIs/All Groups), sortable columns, stage progress dots (6 teal dots), stage group headers, Pipeline view toggle |
| 10 | Ideas | /ideas | Grid/List toggle, sort (Newest/Most Voted/A-Z), All Statuses filter, status pills (New/Under Review/Approved/Parked), vote button with bounce animation, New Idea button |
| 11 | Ask the Lab | /ask | All/Open/Resolved tabs, search input, New Question button, empty state |
| 12 | Decisions | /decisions | List/Timeline toggle, status pills (All/Pending/Recorded/Revisited), search input, Log Decision button |
| 13 | Research Digest | /digest | Reading progress bar, date pills with counts, search input, All/New/Saved tabs, topic pills, relevance score badges, bookmark/dismiss/show abstract buttons |
| 14 | Search | /search | Full-text search input, type filter pills (Tasks/Projects/Meetings/Ideas/Comments/Activity), result cards with type icons, recent searches (localStorage) |
| 15 | Grants | /grants | SVG Gantt timeline with TODAY marker, Active/Proposed legend, days remaining on progress bars (maroon when >80% elapsed), mechanism badges (K23/R03/R01) |
| 16 | Meetings | /meetings | Next Meeting card with countdown, Action Items section, Meeting Archive with search, All Meetings/Decisions Only/Action Items tabs, Record Meeting button |
| 17 | Meeting Detail | /meetings/:id | Meeting title/date/facilitator, attendee avatars, action items (sortable, inline NLP quick-add), decisions section, notes, Copy Summary button |
| 18 | Meeting Transcripts | /meeting-notes | Stats cards (Processed/With Notes/Pending/Total), workflow infographic, search input, meeting list with status badges, Upload Audio button |
| 19 | Activity | /activity | Person filter dropdown, type badges, "Most active: X" in subtitle, activity feed with timestamps |
| 20 | Analytics | /analytics | Weekly date range selector, 4 metric cards (Completed/Created/Overdue/Activity), Attention Required section, 4 summary cards, Task Velocity chart, Lab Progress, Pipeline Distribution, workload per person, Copy Report button |
| 21 | PI Analytics | /pi/analytics | Access gate when unauthenticated ("PI Access Only"), commitment scorecard, response time, team engagement, mentee velocity, Copy Report + Print buttons |
| 22 | Settings | /settings | Lab name/description/icon/type fields, workflow templates (Research Project + Grant Application), theme preview cards, Reset Dashboard + Clear Searches buttons |
| 23 | Narratives | /narratives | Search input, research arcs list, empty state |
| 24 | Session History | /sessions | Search input, project filter, time range pills (7d/30d/90d/All time), stats cards, session list |
| 25 | Mentee Milestones | /mentee-milestones | Mentee filter/type filter/status filter dropdowns, mentee cards with counts, Add Milestone button |
| 26 | Deadline Cascade | /deadline-cascade | Dependency graph, impact simulation |
| 27 | PB Sector | /pb | Planner interface (Nick-only) |

### Public Pages (Layout — top nav bar)
| # | Page | Route | Key Elements |
|---|------|-------|--------------|
| 28 | Homepage | / | Hero with MN-CCORE logo, stats counters (ICU Centers/Researchers/Publications), 3 pathway cards (Collaborate/Meet Our Team/Research Impact), 4 pillars section |
| 29 | Team | /team | Member count + active this week, Co-Directors section, Senior Mentors, Faculty, Fellows, Research Staff, Collaborators |
| 30 | Member Page | /team/:slug | Avatar, title, bio, expertise tags, activity heatmap, publications list |
| 31 | CV Page | /team/:slug/cv | Publication list, Copy as Text button, word count badge |
| 32 | Trajectory | /team/:slug/trajectory | Publication curve, project velocity, task metrics |
| 33 | Publications | /publications | Year distribution mini-chart (clickable), Copy bibliography button, Key Publications section, full list |
| 34 | Publication Detail | /publications/:id | Abstract, journal, DOI link, authors |
| 35 | Network | /network | 3D force-directed graph (three.js, ~1.3MB chunk), stats bar |
| 36 | Contact | /contact | Contact form |
| 37 | Pulse | /pulse | Kiosk mode (standalone, no layout) |

---

## SECTION 2: INTERACTIVE FEATURES

### 2.1 Task System (core feature — test thoroughly)

**List View (TaskGridView)**
| Test | Action | Expected |
|------|--------|----------|
| Column headers | Visible: TITLE, ASSIGNEE, DUE DATE, STATUS, PRIORITY | Fixed columns, uppercase 11px headers |
| Sort by column | Click "DUE DATE" header | Arrow indicator toggles, rows reorder |
| Inline status edit | Click status dropdown (e.g. "To Do") on any row | Portal dropdown appears with To Do/In Progress/Blocked/Done options |
| Inline priority edit | Click priority dropdown | Options: Low/Medium/High/Critical |
| Inline assignee edit | Click assignee avatar | InlineAssigneePicker dropdown with team avatars |
| Inline date edit | Click due date | InlineDatePicker with relative labels (e.g. "2d ago"), quick presets (Today/Tomorrow/Next Mon/+1 Week/Clear) |
| Row hover | Mouse over row | Gold-tinted background, hover action buttons appear (Edit/Archive) |
| Click task title | Click title text | TaskDetailPanel slides in from right |
| Click status circle | Click the circle icon left of status text | Status cycles (todo→in_progress→done), undo toast appears |
| Subtask expand | Click chevron ">" on a row with subtasks | Row expands showing subtask list with progress bar |
| Calculations row | Bottom of table | Shows count + completion percentage (e.g. "Done 45 (67%)") |
| Checkbox select | Click checkbox on left of row | Row selected, bulk action toolbar appears |
| Right-click | Right-click on task row | Context menu with: Open, Open in New Tab, status submenu, Snooze submenu (+1d/+3d/+1w/+2w), Archive |

**Board View (TaskBoardView)**
| Test | Action | Expected |
|------|--------|----------|
| Switch to Board | Click "Board" toggle | 4 Kanban columns: To Do, In Progress, Blocked, Done |
| Group by | Click Status/Priority/Assignee toggles | Columns change grouping |
| Task cards | Each card | Shows title, assignee avatar, priority badge, overdue indicator |
| Drop zones | Each empty column | Shows "Drop here" text |
| Column collapse | Click column header chevron | Column collapses to header only |

**Timeline View (TaskTimelineView)**
| Test | Action | Expected |
|------|--------|----------|
| Switch to Timeline | Click "Timeline" toggle | Gantt-style horizontal bars, TODAY dashed line |
| Bar colors | Bars by status | Gray=todo, teal=in_progress, green=done |
| Overdue dots | Red dots at bar ends | For tasks past due date |
| No due date section | Bottom of timeline | Tasks without due dates listed separately |
| Click bar | Click any task bar | TaskDetailPanel opens |

**By Person View (TaskStandUpView)**
| Test | Action | Expected |
|------|--------|----------|
| Switch to By Person | Click "By Person" toggle | Per-person sections with avatar, task count, workload indicator |
| Overloaded badge | Person with many tasks | Shows "overloaded" or task count warning |
| UP NEXT | Each person section | Prioritized task list |

**TaskDetailPanel (slides in from right)**
| Test | Action | Expected |
|------|--------|----------|
| Open | Click task title or press Enter on selected row | Panel slides in, 400px wide |
| 5 tabs | Tab bar | Overview, Notes, Comments, Activity, Details |
| Status pills | Click a status pill (To Do/In Progress/Blocked/Done) | Status changes, undo toast appears. Clicking already-active pill does nothing. |
| Assignee | Click assignee | Dropdown to reassign |
| Description | Rich text area | Tiptap editor with B/I/H2/list/link toolbar |
| Notes tab | Click "Notes" | TaskUpdateFeed — append-only notes with type badges (progress/blocker/result/question/session) |
| Comments tab | Click "Comments" | Threaded comments with @mention support |
| Activity tab | Click "Activity" | Merged timeline of notes + comments + system events with color coding |
| Details tab | Click "Details" | Collapsible sections for metadata, files |
| Prev/Next | Arrow buttons in header or Alt+Up/Down | Navigate to adjacent task |
| Copy link | Copy button in header | Task link copied to clipboard |
| Close | X button or Escape key | Panel closes |

### 2.2 Keyboard Shortcuts

| Shortcut | Context | Expected |
|----------|---------|----------|
| `Ctrl+K` / `Cmd+K` | Any portal page | Command palette opens: search input, actions (Create Task, Submit Idea, Ask the Lab, Schedule Meeting, Log Decision), quick filters (Completed Tasks, In Progress, Due Today), task/project counts in footer |
| `?` | Any portal page | ShortcutHelp modal with all shortcuts organized by category |
| `C` | Tasks page | CreateTaskModal opens with template chips, AI autofill |
| `N` | Ideas page | CreateIdeaModal opens |
| `N` | Decisions page | CreateDecisionModal opens |
| `J` | Pages with lists | Move selection down one row |
| `K` | Pages with lists | Move selection up one row |
| `Enter` | With row selected | Open TaskDetailPanel / navigate to item |
| `Space` | With task selected | Peek overlay (Linear-style right panel) |
| `Escape` | Modal/panel open | Close the open modal or panel |
| `S` | With task selected | Cycle status (todo→in_progress→done) |
| `X` | With task selected | Toggle checkbox (bulk select) |
| `B` | With task selected | Toggle blocker flag |
| `Z` | With task selected | Snooze submenu (+1d) |
| `A` | With task selected | Assign shortcut |
| `F` | Any portal page | Toggle focus mode (hide sidebar) or filter panel |
| `P` | Projects page, with project selected | Pin/unpin project |
| `T` | Calendar page | Jump to today |
| Arrow keys | Calendar page | Navigate dates |
| `Ctrl+.` | Any portal page | Cycle theme: light → dark → system |
| `G then D` | Any portal page | Go to Dashboard |
| `G then T` | Any portal page | Go to Tasks |
| `G then P` | Any portal page | Go to Projects |
| `G then M` | Any portal page | Go to Meetings |
| `G then C` | Any portal page | Go to Calendar |
| `G then I` | Any portal page | Go to Ideas |
| `G then K` | Any portal page | Go to Deadlines |
| `G then Y` | Any portal page | Go to My Tasks |
| **GUARD** | Input/textarea focused | Shortcuts must NOT fire when typing in any input field |

### 2.3 Modals (all must have focus trapping + Escape close + aria-modal)
| Modal | Trigger | Key Fields |
|-------|---------|------------|
| CreateTaskModal | C key, "+ New Task" button, command palette | Title*, Description, Owner*, Priority, Project, Due Date, template chips |
| CreateProjectModal | "+ New Project" button | Title, Description, PI, Category, Stage |
| CreateIdeaModal | N key (Ideas), "+ New Idea" button | Title, Description |
| CreateDecisionModal | N key (Decisions), "+ Log Decision" button | Title, Context, Decision, Made By, Tags |
| CreateQuestionModal | "+ New Question" button (Ask) | Title, Description |
| TranscriptModal | Upload Audio (Meeting Transcripts) | File upload |
| ShortcutHelp | ? key | Read-only reference |
| CommandPalette | Ctrl+K | Search + actions |

### 2.4 Copy/Export Buttons (each must copy to clipboard or download file)
| Button | Page | Expected Content |
|--------|------|-----------------|
| Copy Bibliography | /publications | Formatted citation list of all publications |
| Copy Reading List | /digest | List of saved/read papers |
| Copy Summary | /meetings/:id | Markdown: title, decisions, open action items, notes |
| Copy Report | /analytics | Lab analytics summary text |
| Copy Report | /pi/analytics | PI dashboard summary |
| Copy as Text | /team/:slug/cv | Publication list as plain text |
| Export .ics | /deadlines | iCalendar file download with all deadlines |
| Print | /meetings/:id/prep, /pi/analytics, /team/:slug/cv | Browser print dialog |

### 2.5 Inline Editing (click cell → dropdown/picker → auto-save on blur)
| Component | Pages Used | Test |
|-----------|-----------|------|
| InlineSelect (status) | Tasks, MyTasks, Deadlines, ProjectDetail | Click "To Do" → dropdown appears as portal (not clipped by table overflow) → select "In Progress" → undo toast |
| InlineSelect (priority) | Tasks, MyTasks | Click "Medium" → dropdown → select "High" |
| InlineSelect (stage) | Projects, Manuscripts | Click stage → dropdown |
| InlineSelect (PI) | Projects | Click PI name → dropdown |
| InlineSelect (Group) | Projects | Click group → dropdown |
| InlineAssigneePicker | Tasks grid | Click avatar → team member dropdown |
| InlineDatePicker | Tasks grid, Deadlines | Click date → calendar picker with quick presets |

### 2.6 Toast/Undo System
| Trigger | Expected |
|---------|----------|
| Any status change | Undo toast appears for 5 seconds with "Undo" button |
| Task creation | Success toast "Task created" |
| Idea creation | Success toast |
| Click Undo | Reverts the change immediately |
| Toast timeout | Auto-dismisses after 5 seconds |
| Screen reader | Toast container has role="status" + aria-live="polite" |

---

## SECTION 3: API ENDPOINTS

### 3.1 Read Endpoints (all should return 200 with `{data: [...]}`)
```
GET /api/tasks                    → 500+ tasks
GET /api/tasks?status=todo        → filtered
GET /api/tasks?updated_since=X    → delta sync
GET /api/tasks/:id/comments       → comments array
GET /api/tasks/:id/updates        → notes array
GET /api/tasks/:id/activity       → merged timeline
GET /api/tasks/:id/subtasks       → subtask array
GET /api/projects                 → 25+ projects
GET /api/projects/health          → 50 projects with health scores
GET /api/team                     → 19 team members
GET /api/meetings                 → 17+ meetings
GET /api/ideas                    → ideas array
GET /api/decisions                → decisions array
GET /api/decisions/tags           → unique tags
GET /api/search?q=CLIF            → 20+ results
GET /api/version                  → {version: "..."}
GET /api/settings                 → lab settings
GET /api/calendar/events          → 30+ events
GET /api/activity?limit=10        → activity feed
GET /api/analytics/pi-dashboard   → PI metrics (KNOWN BUG: 500 - pub_date)
GET /api/grants                   → 5 grants
GET /api/publications             → 63 publications
GET /api/notifications            → notifications
GET /api/workflow-templates       → 3 templates
GET /api/milestones               → milestones
GET /api/digest                   → 50+ papers
GET /api/team/:slug/trajectory    → trajectory data (KNOWN BUG: 500 - pub_date)
```

### 3.2 Write Endpoints (test create → read back → clean up)
```
POST /api/tasks                   → body: {title, description, assignee, priority?, project_id?, due_date?}
POST /api/tasks/:id               → body: {title?, priority?, assignee?, ...} (field updates)
POST /api/tasks/:id/status        → body: {status: "in_progress"|"done"|"todo"|"blocked"}
POST /api/tasks/:id/comments      → body: {content, author_slug}
POST /api/tasks/:id/updates       → body: {content, update_type, author_slug}
POST /api/ideas                   → body: {title, description, author_slug}
POST /api/ideas/:id/vote          → body: {voter_slug}
POST /api/decisions               → body: {title, context, decision, made_by} (KNOWN BUG: 500 - linked_projects)
POST /api/projects/:slug/updates  → body: {content, author_slug}
POST /api/projects/:id            → body: {status?, stage?, pi?, ...}
POST /api/meetings                → body: {date, title, type?, facilitator?}
POST /api/settings                → body: {key, value}
POST /api/admin/migrate           → body: {sql} (schema changes)
```

### 3.3 Schema Integrity Check
Run via admin endpoint or D1 dashboard:
```sql
SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name;
```
Verify these columns exist:
- `publications.pub_date` (MISSING — queries reference it)
- `decision_log.linked_projects` (MISSING — schema-v21 not applied)
- `task_updates` table (should exist — schema-v36)
- `tasks.updated_at` and `tasks.deleted_at` (should exist — schema-v22)

---

## SECTION 4: DESIGN SYSTEM CHECKS

| Rule | How to Verify |
|------|--------------|
| Dark bg = #0b1017 (NOT blue-tinted) | Eyedrop body background |
| Text = #e2e8f0 (not pure white) | Eyedrop body text |
| h1 weight = 600 in portal | `getComputedStyle(document.querySelector('h1')).fontWeight` on any portal page |
| Body weight = 400 | Check paragraph text weight |
| Font = DM Sans everywhere (portal) | `getComputedStyle(el).fontFamily` — never Fraunces in portal |
| Font = Fraunces (public page titles only) | Check / and /team h1 fonts |
| Accent = teal for interactive | Check button/link colors |
| --muted opacity >= 0.5 | No text below 50% opacity in dark mode |
| Borders: --border-light (gold/semantic) vs --border-subtle (neutral/structural) | Visual inspection, no mixing |
| Transitions: 150ms (fast) / 250ms (panel) | Verify no custom durations |
| Row hover: gold-tinted rgba(201,168,76,0.06) | Hover a task row, eyedrop |

---

## SECTION 5: MOBILE RESPONSIVE (375x812)

| Test | Expected |
|------|----------|
| Sidebar | Collapses to hamburger icon |
| Task list | Stacked card layout (not columnar table) |
| Dashboard cards | Stack vertically |
| Buttons | >= 36px touch targets |
| No horizontal scroll | No scrollbar on body |
| Tooltips/toasts | Don't clip viewport edges |
| InlineSelect | Touch-friendly larger targets |

---

## SECTION 6: ACCESSIBILITY

| Test | How to Verify |
|------|--------------|
| Focus trapping in all 6 modals | Open modal, Tab repeatedly — focus stays inside |
| Escape closes all modals | Press Escape on every modal |
| aria-modal on modals | Inspect DOM for aria-modal="true" |
| aria-live on PageHeader | Inspect — count/subtitle should have aria-live |
| UndoToast role="status" | Inspect toast container |
| Skip-to-content link | Tab from page load — first focusable should be skip link |
| Focus-visible styling | Tab through nav — focus ring visible |
| prefers-reduced-motion | Set OS to reduce motion — verify animations stop |

---

## SECTION 7: SYNC PIPELINE (brain.db ↔ D1)

| Test | How | Expected |
|------|-----|----------|
| Push projects | Run `python scripts/db/sync_d1_push.py` | Projects from brain.db appear in D1 |
| Push tasks | Same script | Tasks with updated_at > last_push sent to D1 |
| Pull tasks | Run `python scripts/db/sync_d1_pull.py` | Hub-modified tasks update in brain.db |
| Hub-created tasks | Create task in Hub, run pull | New task appears in brain.db with hex ID |
| Soft delete | Delete task in Hub (soft), run pull | Task status='deleted' in brain.db |
| Bidirectional status | Change status in Hub, run pull | brain.db reflects new status |
| Task reopening | Mark done in Hub, reopen in brain.db, push | Hub shows reopened task |
| task_updates sync | Post note in Hub, run pull | **KNOWN GAP: not synced yet** |

---

## SECTION 8: KNOWN BUGS (as of 2026-04-08)

These are confirmed bugs. A fresh audit session should verify whether they're fixed.

| ID | Severity | Bug | Verification |
|----|----------|-----|-------------|
| B1 | CRITICAL | MeetingDetail crashes (React #310 hook order in sortable) | Navigate to /meetings/:id with real meeting ID |
| B2 | CRITICAL | `pub_date` column missing from publications | `GET /api/analytics/pi-dashboard` returns 500 |
| B3 | CRITICAL | `linked_projects` column missing from decision_log | `POST /api/decisions` with any body returns 500 |
| B4 | CRITICAL | WebSocket 400 on handshake | Check console on any page for WS errors |
| B5 | HIGH | Global h1 font-weight: 800 (src/index.css:190) | `getComputedStyle(h1).fontWeight` on /dashboard should be "600" |
| B6 | MEDIUM | Keyboard shortcuts fire in focused inputs | Type "f" in search input on /search |
| B7 | MEDIUM | "Press F" tooltip clips on mobile | View /dashboard at 375px width |
| B8 | MEDIUM | QA test data in Activity feed | Check /activity for "QA" or "delete me" entries |
| B9 | HIGH | task_updates not synced to brain.db | Check sync_d1_pull.py for task_updates handler |
| B10 | HIGH | Push state not updated on sync-bulk failure | Check sync_d1_push.py:365-378 |

---

## SECTION 9: PERFORMANCE BENCHMARKS

| Test | Target | How |
|------|--------|-----|
| Dashboard load | < 3s | Performance tab, measure DOMContentLoaded → interactive |
| Tasks (500+ rows) | Smooth scroll | Virtual scrolling via @tanstack/react-virtual |
| Network page | Lazy loads three.js chunk | Verify chunk doesn't block other pages |
| No layout shift | Content at opacity:1 on load | .fade-in-up starts visible |
| Bundle size | Check `dist/` after build | `npm run build` → report sizes |

---

## SECTION 10: CONSOLE ERROR BUDGET

| Acceptable | Unacceptable |
|------------|-------------|
| WebSocket 400 (if DO intentionally disabled) | Any React error (#310, #423, etc.) |
| Deprecation warnings | Any 500 API responses |
| | Any uncaught promise rejections |
| | Any console.log in production |

---

## HOW TO RUN THIS AUDIT

### Option A: Playwright MCP (comprehensive, high token cost)
```
1. Navigate to each page in Section 1
2. Take screenshot + check console errors
3. Test each interactive feature in Section 2
4. Hit each API endpoint in Section 3
5. Check design system rules in Section 4
6. Resize to 375x812 for mobile tests in Section 5
```

### Option B: API-only audit (fast, low token cost)
```
1. Hit all GET endpoints via fetch() in browser console
2. Test all POST endpoints with test data
3. Verify schema integrity via SQL
4. Check for 500s, missing columns, error messages
5. Clean up test data after
```

### Option C: Automated test script (recommended for CI)
```
1. Write Vitest + @testing-library/react tests for components
2. Write API integration tests hitting live D1
3. Run visual regression with Percy or Chromatic
4. Run on every deploy via GitHub Actions
```
