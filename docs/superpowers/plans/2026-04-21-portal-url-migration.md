# Portal URL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 27 gated Hub routes under a `/portal/*` URL prefix so a single Cloudflare Access application destination (`mn-ccore-lab.pages.dev/portal/*`) gates the entire authenticated surface while public marketing pages stay at the root.

**Architecture:** Dual-route migration in phases. Phase 1 adds new `/portal/*` routes alongside existing root routes — both work, zero user impact. Phase 2-3 migrates internal navigation and Link references to the new paths. Phase 4 converts the old root routes to `<Navigate>` redirect shims. Phase 5 updates the test suite. Phase 6 configures CF Access. Each phase ships independently; the app is never broken mid-migration.

**Tech Stack:** React Router v6, Cloudflare Pages + Access, Playwright, Vite

---

## Context

### Current state (HEAD `2c5023f` on main)

All routes in `src/App.tsx:160-253` are declared in three blocks:

1. **Standalone** (line 170): `/pulse` — no layout wrapper.
2. **Public (Layout chrome)** (lines 173-185): 9 paths — stays as-is.
3. **Gated (RequireAuth + PortalLayout chrome)** (lines 190-241): 27 paths — migrates to `/portal/*`.

Phase 36c already seeded the direction: `/portal/team/:slug` and `/portal/team/:slug/trajectory` are live portal-prefixed routes. Rule #23 in `CLAUDE.md` documents this.

### Call-site inventory

- **Internal `<Link to="/...">`:** ~52 files via `grep -rn 'to="/' src/`
- **`navigate('/...')` calls:** `src/components/CommandPalette.tsx` (22 sites), `src/hooks/useKeyboardShortcuts.ts`, `src/hooks/useProjectKeyboardNav.ts`
- **Nav arrays:** `Sidebar.tsx:69-157` (22 items), `MobileTabBar.tsx`, `CommandPalette.tsx` nav section
- **Test file `page.goto`:** 16 files under `tests/` — raw string concat like `` `${BASE}/dashboard` ``
- **`window.location` / direct href:** audit in Phase 3

### Path migration table

| Old (stays as redirect) | New canonical |
|---|---|
| `/dashboard` | `/portal/dashboard` |
| `/personal` | `/portal/personal` |
| `/my-items` | `/portal/my-items` |
| `/my-tasks` | `/portal/my-tasks` |
| `/tasks` | `/portal/tasks` (already a redirect → my-tasks; update both sides) |
| `/calendar` | `/portal/calendar` |
| `/deadlines` | `/portal/deadlines` |
| `/deadline-cascade` | `/portal/deadline-cascade` |
| `/projects` | `/portal/projects` |
| `/projects/:slug` | `/portal/projects/:slug` |
| `/manuscripts` | `/portal/manuscripts` |
| `/ideas` | `/portal/ideas` |
| `/ask` | `/portal/ask` |
| `/decisions` | `/portal/decisions` |
| `/narratives` | `/portal/narratives` |
| `/digest` | `/portal/digest` |
| `/research-digest` | `/portal/digest` (redirect) |
| `/search` | `/portal/search` |
| `/grants` | `/portal/grants` |
| `/meetings` | `/portal/meetings` |
| `/meetings/:id` | `/portal/meetings/:id` |
| `/meetings/:id/prep` | `/portal/meetings/:id/prep` |
| `/meeting-prep` | `/portal/meetings` (redirect) |
| `/meeting-notes` | `/portal/meeting-notes` |
| `/activity` | `/portal/activity` |
| `/analytics` | `/portal/analytics` |
| `/pi/analytics` | `/portal/pi/analytics` |
| `/pi-analytics` | `/portal/pi/analytics` (redirect) |
| `/mentee-milestones` | `/portal/mentee-milestones` |
| `/pb` | `/portal/pb` |
| `/sessions` | `/portal/sessions` |
| `/settings` | `/portal/settings` |
| `/portal/team/:slug` | **unchanged** (already under /portal) |
| `/portal/team/:slug/trajectory` | **unchanged** |

Public paths (**no change**): `/`, `/team`, `/nick`, `/nate`, `/team/:slug`, `/team/:slug/trajectory`, `/publications`, `/publications/:id`, `/network`, `/contact`, `/pulse`.

### File structure

**New files:**
- `src/constants/paths.ts` — single source of truth for canonical paths. All navigation, tests, and OG cards reference this.

**Modified files (by phase):**
- Phase 1: `src/App.tsx`
- Phase 2: `src/components/Sidebar.tsx`, `src/components/MobileTabBar.tsx`, `src/components/CommandPalette.tsx`, `src/hooks/useKeyboardShortcuts.ts`, `src/hooks/useProjectKeyboardNav.ts`
- Phase 3: ~52 component files with `<Link to="/...">` — atomic sweep
- Phase 4: `src/App.tsx` (convert old routes to `<Navigate>`)
- Phase 5: 16 test files with `page.goto` + `playwright.config.*.ts` if any
- Phase 6: `LAUNCH-CHECKLIST.md`, `CLAUDE.md`, `SESSION-HANDOFF.md` doc updates + CF dashboard

---

## Phase 1 — Add `/portal/*` routes alongside existing

Goal: `/portal/dashboard` serves the Dashboard page. `/dashboard` also still serves the Dashboard page. Both work.

### Task 1: Add path constants module

**Files:**
- Create: `src/constants/paths.ts`

- [ ] **Step 1: Write the path constants**

```typescript
// src/constants/paths.ts
// Single source of truth for Hub URL paths.
// All Links, navigate() calls, tests, and OG cards should reference these
// constants instead of string literals.
//
// Migration note (2026-04-21): gated paths moved under /portal/* so a single
// CF Access application destination can gate the authenticated surface.
// Root-level equivalents redirect via <Navigate> in App.tsx for bookmark
// compatibility — do not add new routes at the root gated path.

export const PORTAL_PREFIX = '/portal'

// Gated (behind CF Access + RequireAuth)
export const PATHS = {
  dashboard: `${PORTAL_PREFIX}/dashboard`,
  personal: `${PORTAL_PREFIX}/personal`,
  myItems: `${PORTAL_PREFIX}/my-items`,

  myTasks: `${PORTAL_PREFIX}/my-tasks`,
  tasks: `${PORTAL_PREFIX}/tasks`,
  calendar: `${PORTAL_PREFIX}/calendar`,
  deadlines: `${PORTAL_PREFIX}/deadlines`,
  deadlineCascade: `${PORTAL_PREFIX}/deadline-cascade`,

  projects: `${PORTAL_PREFIX}/projects`,
  project: (slug: string) => `${PORTAL_PREFIX}/projects/${slug}`,
  manuscripts: `${PORTAL_PREFIX}/manuscripts`,
  ideas: `${PORTAL_PREFIX}/ideas`,
  ask: `${PORTAL_PREFIX}/ask`,
  decisions: `${PORTAL_PREFIX}/decisions`,
  narratives: `${PORTAL_PREFIX}/narratives`,
  digest: `${PORTAL_PREFIX}/digest`,
  search: `${PORTAL_PREFIX}/search`,
  grants: `${PORTAL_PREFIX}/grants`,

  meetings: `${PORTAL_PREFIX}/meetings`,
  meeting: (id: string | number) => `${PORTAL_PREFIX}/meetings/${id}`,
  meetingPrep: (id: string | number) => `${PORTAL_PREFIX}/meetings/${id}/prep`,
  meetingNotes: `${PORTAL_PREFIX}/meeting-notes`,

  activity: `${PORTAL_PREFIX}/activity`,
  analytics: `${PORTAL_PREFIX}/analytics`,
  piAnalytics: `${PORTAL_PREFIX}/pi/analytics`,
  menteeMilestones: `${PORTAL_PREFIX}/mentee-milestones`,
  pb: `${PORTAL_PREFIX}/pb`,
  sessions: `${PORTAL_PREFIX}/sessions`,
  settings: `${PORTAL_PREFIX}/settings`,

  teamMember: (slug: string) => `${PORTAL_PREFIX}/team/${slug}`,
  teamTrajectory: (slug: string) => `${PORTAL_PREFIX}/team/${slug}/trajectory`,
} as const

// Public (no auth)
export const PUBLIC_PATHS = {
  home: '/',
  pulse: '/pulse',
  publicTeam: '/team',
  publicMember: (slug: string) => `/team/${slug}`,
  publicTrajectory: (slug: string) => `/team/${slug}/trajectory`,
  nick: '/nick',
  nate: '/nate',
  publications: '/publications',
  publication: (id: string | number) => `/publications/${id}`,
  network: '/network',
  contact: '/contact',
} as const

// Known legacy root paths that should redirect to portal equivalents.
// Consumed by App.tsx's redirect shim block. Kept indefinitely; cost is
// negligible and bookmarks should not silently break.
export const LEGACY_REDIRECTS: Record<string, string> = {
  '/dashboard': PATHS.dashboard,
  '/personal': PATHS.personal,
  '/my-items': PATHS.myItems,
  '/my-tasks': PATHS.myTasks,
  '/tasks': PATHS.myTasks,
  '/calendar': PATHS.calendar,
  '/deadlines': PATHS.deadlines,
  '/deadline-cascade': PATHS.deadlineCascade,
  '/projects': PATHS.projects,
  '/manuscripts': PATHS.manuscripts,
  '/ideas': PATHS.ideas,
  '/ask': PATHS.ask,
  '/decisions': PATHS.decisions,
  '/narratives': PATHS.narratives,
  '/digest': PATHS.digest,
  '/research-digest': PATHS.digest,
  '/search': PATHS.search,
  '/grants': PATHS.grants,
  '/meetings': PATHS.meetings,
  '/meeting-prep': PATHS.meetings,
  '/meeting-notes': PATHS.meetingNotes,
  '/activity': PATHS.activity,
  '/analytics': PATHS.analytics,
  '/pi/analytics': PATHS.piAnalytics,
  '/pi-analytics': PATHS.piAnalytics,
  '/mentee-milestones': PATHS.menteeMilestones,
  '/pb': PATHS.pb,
  '/sessions': PATHS.sessions,
  '/settings': PATHS.settings,
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: no new errors (file is standalone exports).

- [ ] **Step 3: Commit**

```bash
git add src/constants/paths.ts
git commit -m "feat(paths): add canonical path constants module"
```

### Task 2: Add `/portal/*` routes in App.tsx alongside existing

**Files:**
- Modify: `src/App.tsx:190-241` (inside the `RequireAuth><PortalLayout />` block)

- [ ] **Step 1: Add new portal routes**

Inside the existing `<Route element={<RequireAuth><PortalLayout /></RequireAuth>}>` block at `src/App.tsx:190-241`, ADD these routes **in addition to** (not replacing) the existing ones. Place them immediately before the existing `/portal/team/:slug` declarations at line 239:

```tsx
                  {/* Portal-prefixed canonical routes (2026-04-21 migration).
                      Root-level equivalents below redirect here via Navigate
                      after Phase 4. Both work during migration. */}
                  <Route path="/portal/dashboard" element={<ErrorBoundary><PageErrorBoundary pageName="Dashboard"><Dashboard /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/personal" element={<ErrorBoundary><Personal /></ErrorBoundary>} />
                  <Route path="/portal/my-items" element={<ErrorBoundary><MyItems /></ErrorBoundary>} />
                  <Route path="/portal/my-tasks" element={<ErrorBoundary><MyTasks /></ErrorBoundary>} />
                  <Route path="/portal/tasks" element={<Navigate to="/portal/my-tasks" replace />} />
                  <Route path="/portal/calendar" element={<ErrorBoundary><CalendarPage /></ErrorBoundary>} />
                  <Route path="/portal/deadlines" element={<ErrorBoundary><Deadlines /></ErrorBoundary>} />
                  <Route path="/portal/deadline-cascade" element={<ErrorBoundary><DeadlineCascadePage /></ErrorBoundary>} />
                  <Route path="/portal/projects" element={<ErrorBoundary><Projects /></ErrorBoundary>} />
                  <Route path="/portal/projects/:slug" element={<ErrorBoundary><PageErrorBoundary pageName="ProjectDetail"><ProjectDetail /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/manuscripts" element={<ErrorBoundary><Manuscripts /></ErrorBoundary>} />
                  <Route path="/portal/ideas" element={<ErrorBoundary><Ideas /></ErrorBoundary>} />
                  <Route path="/portal/ask" element={<ErrorBoundary><AskTheLab /></ErrorBoundary>} />
                  <Route path="/portal/decisions" element={<ErrorBoundary><PageErrorBoundary pageName="DecisionsPage"><DecisionsPage /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/narratives" element={<ErrorBoundary><NarrativesPage /></ErrorBoundary>} />
                  <Route path="/portal/digest" element={<ErrorBoundary><Digest /></ErrorBoundary>} />
                  <Route path="/portal/search" element={<ErrorBoundary><SearchPage /></ErrorBoundary>} />
                  <Route path="/portal/grants" element={<ErrorBoundary><PageErrorBoundary pageName="Grants"><GrantsPortal /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/meetings" element={<ErrorBoundary><Meetings /></ErrorBoundary>} />
                  <Route path="/portal/meetings/:id" element={<ErrorBoundary><MeetingDetail /></ErrorBoundary>} />
                  <Route path="/portal/meetings/:id/prep" element={<ErrorBoundary><MeetingPrep /></ErrorBoundary>} />
                  <Route path="/portal/meeting-notes" element={<ErrorBoundary><MeetingNotesPage /></ErrorBoundary>} />
                  <Route path="/portal/activity" element={<ErrorBoundary><ActivityPage /></ErrorBoundary>} />
                  <Route path="/portal/analytics" element={<ErrorBoundary><AnalyticsPage /></ErrorBoundary>} />
                  <Route path="/portal/pi/analytics" element={<ErrorBoundary><PageErrorBoundary pageName="PIAnalytics"><PIAnalytics /></PageErrorBoundary></ErrorBoundary>} />
                  <Route path="/portal/mentee-milestones" element={<ErrorBoundary><MenteeMilestones /></ErrorBoundary>} />
                  <Route path="/portal/pb" element={<ErrorBoundary><PBSector /></ErrorBoundary>} />
                  <Route path="/portal/sessions" element={<ErrorBoundary><SessionHistory /></ErrorBoundary>} />
                  <Route path="/portal/settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
```

- [ ] **Step 2: Update catch-all redirect to point at /portal/dashboard**

At `src/App.tsx:244`, change:

```tsx
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
```

To:

```tsx
                <Route path="*" element={<Navigate to="/portal/dashboard" replace />} />
```

- [ ] **Step 3: Build succeeds**

Run: `npm run build`
Expected: green. No TypeScript errors.

- [ ] **Step 4: Smoke-test both old and new paths locally**

Run: `npm run dev`

Open each in browser:
- `http://localhost:5173/dashboard` — loads Dashboard
- `http://localhost:5173/portal/dashboard` — loads Dashboard
- `http://localhost:5173/projects` — loads Projects list
- `http://localhost:5173/portal/projects` — loads Projects list
- `http://localhost:5173/portal/projects/mesfin-k23-ihca-survivability-calculator` — loads project detail

All five must render the expected page with no console errors.

Expected: all routes work. Both old and new prefix serve the same component.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(router): add /portal/* canonical routes alongside root routes"
```

---

## Phase 2 — Migrate navigation components

Goal: clicking sidebar, command palette, mobile tab bar, keyboard shortcuts → navigates to `/portal/*`. Old root routes still function for any stale bookmarks.

### Task 3: Update Sidebar nav items

**Files:**
- Modify: `src/components/Sidebar.tsx:69-157` (nav arrays)

- [ ] **Step 1: Import PATHS**

At top of `src/components/Sidebar.tsx`, add the import:

```typescript
import { PATHS } from '../constants/paths'
```

- [ ] **Step 2: Rewrite the three nav arrays using PATHS**

Replace the Workspace/Planning/Research/Meetings/Lab nav array entries at `Sidebar.tsx:69-157`. Map each `to:` field through PATHS:

```tsx
      { to: PATHS.dashboard, label: 'Dashboard', icon: LayoutDashboard },
      { to: PATHS.personal, label: 'My Hub', icon: User },
      { to: PATHS.myTasks, label: 'Tasks', icon: CheckSquare },
      { to: PATHS.calendar, label: 'Calendar', icon: Calendar },
      // ... continue for all 22 nav entries
      { to: PATHS.projects, label: 'Projects', icon: FolderKanban },
      { to: PATHS.manuscripts, label: 'Manuscripts', icon: FileText },
      { to: PATHS.grants, label: 'Grants', icon: DollarSign },
      { to: PATHS.deadlines, label: 'Deadlines', icon: Clock },
      { to: PATHS.ideas, label: 'Ideas', icon: Lightbulb },
      { to: PATHS.digest, label: 'Research Digest', icon: BookOpen },
      { to: PATHS.meetings, label: 'Meetings', icon: UsersIcon },
      { to: PATHS.meetingNotes, label: 'Transcripts', icon: FileText },
      { to: '/team', label: 'Team', icon: UsersIcon },  // PUBLIC — stays at root
      { to: PATHS.activity, label: 'Activity', icon: Activity },
      { to: PATHS.analytics, label: 'Analytics', icon: BarChart3 },
      { to: PATHS.settings, label: 'Settings', icon: Settings },
      // PI-only
      { to: PATHS.piAnalytics, label: 'PI Analytics', icon: TrendingUp },
      { to: PATHS.menteeMilestones, label: 'Mentee Milestones', icon: GraduationCap },
      { to: PATHS.deadlineCascade, label: 'Deadline Cascade', icon: GitBranch },
      { to: PATHS.meetings, label: 'Meeting Prep', icon: ClipboardList },
      { to: PATHS.pb, label: 'Daily Plan', icon: Terminal },
      { to: PATHS.sessions, label: 'Session History', icon: History },
      { to: PATHS.piAnalytics, label: 'PI Dashboard', icon: Shield },
```

Note `/team` (public team list) stays as a string literal — it's intentionally public. All others route through PATHS.

- [ ] **Step 3: Leave the logo link and search link at root**

`Sidebar.tsx:192` (`<Link to="/" ...>` for logo) and `Sidebar.tsx:319` (footer logo) stay pointing at `/` (public home). Do not change.

`Sidebar.tsx:301` (search) — change to `PATHS.search`:

```tsx
            to={PATHS.search}
```

- [ ] **Step 4: Verify isActive still works for new paths**

`Sidebar.tsx:174` has:

```typescript
const isActive = (path: string) => {
```

This compares `location.pathname` against the `path` in each nav item. Since both now use `/portal/*`, and the current location also uses `/portal/*` (after we navigate), this works unchanged. No edit needed.

- [ ] **Step 5: Build + visual-check sidebar**

Run: `npm run build && npm run dev`

Open `http://localhost:5173/portal/dashboard`:
- Sidebar "Dashboard" item shows active state (teal fill)
- Click each sidebar link; URL shows `/portal/...`; correct page loads
- Hover state still lifts, active state still renders

Expected: all sidebar clicks land on `/portal/*` paths, active state tracks correctly.

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(sidebar): route nav items through PATHS constants"
```

### Task 4: Update MobileTabBar

**Files:**
- Modify: `src/components/MobileTabBar.tsx`

- [ ] **Step 1: Read current nav entries**

Run: `grep -n 'to=\|path:' src/components/MobileTabBar.tsx`

Expected: list of mobile tab entries — typically 4-5 main tabs + an overflow "More" drawer.

- [ ] **Step 2: Import PATHS and rewrite**

Add `import { PATHS } from '../constants/paths'` at top. Replace every `to="/dashboard"`, `to="/my-tasks"`, etc. with `to={PATHS.dashboard}` equivalents. The overflow "More" drawer (from R12-H5) lists portal routes — update all entries in it.

Example transform:
```tsx
// before
<Link to="/dashboard">Dashboard</Link>
// after
<Link to={PATHS.dashboard}>Dashboard</Link>
```

- [ ] **Step 3: Build succeeds**

Run: `npm run build`
Expected: green.

- [ ] **Step 4: Mobile viewport smoke-test**

Run: `npm run dev`
Open DevTools → device emulation → Pixel 5. Visit `http://localhost:5173/portal/dashboard`. Tap each bottom tab + each item in the "More" drawer. Every destination URL should start with `/portal/`.

Expected: all mobile nav land on portal paths.

- [ ] **Step 5: Commit**

```bash
git add src/components/MobileTabBar.tsx
git commit -m "feat(mobile): route mobile tab bar nav through PATHS"
```

### Task 5: Update CommandPalette navigate() calls

**Files:**
- Modify: `src/components/CommandPalette.tsx:120-353` (action callbacks)

- [ ] **Step 1: Import PATHS**

Add at top:

```typescript
import { PATHS } from '../constants/paths'
```

- [ ] **Step 2: Rewrite each navigate() call**

At `CommandPalette.tsx:120`, the palette iterates a `nav` array and navigates to `nav.path`. That `nav` array is built from Sidebar's same list — trace its source. If CommandPalette constructs its own nav list, rewrite those entries through PATHS too. If it imports from Sidebar's array, no change needed after Task 3.

For the quick-action navigate calls (lines 132, 141, 149, 157, 166, 176, 184, 192, 200, 208, 220, 228, 237, 244, 254, 262, 276, 288, 300, 312, 353), rewrite as follows:

```typescript
// line 132 — was: navigate('/tasks?create=true')
navigate(`${PATHS.myTasks}?create=true`)

// line 141 — was: navigate('/ideas?create=true')
navigate(`${PATHS.ideas}?create=true`)

// line 149 — was: navigate('/ask?create=true')
navigate(`${PATHS.ask}?create=true`)

// line 157 — was: navigate('/meetings?create=true')
navigate(`${PATHS.meetings}?create=true`)

// line 166 — was: navigate('/decisions?create=true')
navigate(`${PATHS.decisions}?create=true`)

// line 176 — was: navigate('/tasks?status=done')
navigate(`${PATHS.myTasks}?status=done`)

// line 184 — was: navigate('/tasks?status=in_progress')
navigate(`${PATHS.myTasks}?status=in_progress`)

// line 192 — was: navigate('/tasks?priority=high')
navigate(`${PATHS.myTasks}?priority=high`)

// line 200 — was: navigate('/my-tasks')
navigate(PATHS.myTasks)

// line 208 — was: navigate('/tasks?status=todo')
navigate(`${PATHS.myTasks}?status=todo`)

// line 220 — was: navigate('/tasks?assignee=nick')
navigate(`${PATHS.myTasks}?assignee=nick`)

// line 228 — was: navigate('/tasks?status=blocked')
navigate(`${PATHS.myTasks}?status=blocked`)

// line 237 — was: navigate('/projects?category=CLIF')
navigate(`${PATHS.projects}?category=CLIF`)

// line 244 — was: navigate('/projects?category=Lab')
navigate(`${PATHS.projects}?category=Lab`)

// line 254 — was: navigate(`/meetings/${meetings[0].id}`)
navigate(PATHS.meeting(meetings[0].id))

// line 262 — was: navigate(`/meetings/${meetings[0].id}/prep`)
navigate(PATHS.meetingPrep(meetings[0].id))

// line 276 — was: navigate(`/tasks?open=${task.id}`)
navigate(`${PATHS.myTasks}?open=${task.id}`)

// line 288 — was: navigate(`/projects/${project.slug}`)
navigate(PATHS.project(project.slug))

// line 300 — was: navigate(`/portal/team/${member.slug}`)
navigate(PATHS.teamMember(member.slug))

// line 312 — was: navigate(`/meetings/${meeting.id}`)
navigate(PATHS.meeting(meeting.id))

// line 353 — was: navigate(`/projects/${project.slug}`)
navigate(PATHS.project(project.slug))
```

Note: `/tasks` (old redirect-to-my-tasks pattern) maps to `PATHS.myTasks` directly because the query-param consumers read from MyTasks anyway.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 4: Keyboard-shortcut smoke-test**

Run: `npm run dev`. Open `http://localhost:5173/portal/dashboard`. Press Cmd/Ctrl+K to open palette. Execute each category:
- "Create Task" → URL becomes `/portal/my-tasks?create=true`, modal opens
- "My Tasks" → URL becomes `/portal/my-tasks`
- Navigate to any project by typing its name → URL becomes `/portal/projects/...`

Expected: every palette action lands on `/portal/*`.

- [ ] **Step 5: Commit**

```bash
git add src/components/CommandPalette.tsx
git commit -m "feat(palette): route command palette navigate() through PATHS"
```

### Task 6: Update useKeyboardShortcuts + useProjectKeyboardNav

**Files:**
- Modify: `src/hooks/useKeyboardShortcuts.ts`
- Modify: `src/hooks/useProjectKeyboardNav.ts`

- [ ] **Step 1: Audit hook nav calls**

Run: `grep -n 'navigate(' src/hooks/useKeyboardShortcuts.ts src/hooks/useProjectKeyboardNav.ts`

For each `navigate('/...')` call site, swap to the `PATHS.*` equivalent (or `PATHS.project(slug)` for dynamic project nav).

- [ ] **Step 2: Import PATHS and rewrite**

At top of each hook file:

```typescript
import { PATHS } from '../constants/paths'
```

Rewrite each `navigate('/dashboard')` → `navigate(PATHS.dashboard)` and so on.

- [ ] **Step 3: Build + smoke-test keyboard shortcuts**

Run: `npm run build && npm run dev`. Visit `/portal/dashboard`. Press each global shortcut registered in the hook (`?` to list them via ShortcutHelp modal). Every nav shortcut lands on `/portal/*`.

Expected: keyboard-driven nav works on new paths.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useKeyboardShortcuts.ts src/hooks/useProjectKeyboardNav.ts
git commit -m "feat(hooks): route keyboard nav through PATHS"
```

---

## Phase 3 — Migrate remaining Link/href call sites

Goal: every hardcoded `to="/..."` or `href="/..."` pointing at a gated route uses `PATHS` or at least the new `/portal/*` prefix. No internal navigation resolves to a legacy root gated path.

### Task 7: Sweep all `<Link to="/...">` references

**Files:**
- Modify: ~40-50 files (discovered at step 1)

- [ ] **Step 1: Inventory call sites**

Run: `grep -rn 'to="/' src/ --include="*.tsx" --include="*.ts" | grep -v 'src/constants/paths.ts' | grep -v 'src/App.tsx' > /tmp/link-audit.txt`

Then: `wc -l /tmp/link-audit.txt`

Expected: ~50 lines. Open the file; it's the master checklist for this task.

- [ ] **Step 2: Classify each line**

For each line in `/tmp/link-audit.txt`:

- **Public path** (e.g., `to="/team"`, `to="/publications/..."`, `to="/"`): **do not change**. Add a brief comment in the file if it's unclear why: `// Public marketing route — stays at root`.
- **Gated path** (e.g., `to="/dashboard"`, `to="/projects/..."`, `to="/my-tasks"`): **change to PATHS equivalent**. Import PATHS at top of file if not already.
- **Dynamic template** (e.g., `` to={`/projects/${slug}`} ``): convert to `to={PATHS.project(slug)}`.

- [ ] **Step 3: Apply edits file by file**

For each file, add `import { PATHS } from '@/constants/paths'` (or relative path) at top, then sed/replace literals. Keep the edit surgical — no incidental reformatting.

Example:
```tsx
// before
<Link to="/dashboard" className="...">Dashboard</Link>
// after
<Link to={PATHS.dashboard} className="...">Dashboard</Link>
```

- [ ] **Step 4: Build catches misses**

Run: `npm run build`
Expected: no TypeScript errors. If `PATHS.foo` doesn't exist, the build fails and points at the file.

- [ ] **Step 5: Verify sweep**

Run: `grep -rn 'to="/dashboard\|to="/my-tasks\|to="/projects\|to="/meetings\|to="/ideas\|to="/decisions\|to="/narratives\|to="/grants\|to="/analytics\|to="/settings\|to="/personal\|to="/calendar\|to="/deadlines\|to="/manuscripts\|to="/activity\|to="/search\|to="/ask\|to="/digest\|to="/mentee-milestones\|to="/pb\|to="/sessions\|to="/my-items' src/`

Expected: zero matches. All gated `to="/..."` literals are gone from src/.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "refactor(nav): migrate all internal <Link to=\"/...\"> to PATHS constants"
```

### Task 8: Sweep template literals and dynamic hrefs

**Files:**
- Modify: any file using `` `${'...'}/dashboard` `` or similar template nav

- [ ] **Step 1: Search for templated gated paths**

Run: ``grep -rn '`/dashboard\|`/my-tasks\|`/projects/\|`/meetings/\|`/ideas\|`/grants\|`/settings\|`/analytics\|`/activity\|`/deadlines\|`/manuscripts\|`/decisions\|`/digest\|`/search\|`/ask' src/ --include="*.tsx" --include="*.ts"``

Expected: a handful of call sites (OG card paths, share links, copy-link buttons).

- [ ] **Step 2: Update each**

Replace with PATHS equivalents. Example:

```tsx
// before
const shareUrl = `${origin}/projects/${project.slug}`
// after
import { PATHS } from '@/constants/paths'
const shareUrl = `${origin}${PATHS.project(project.slug)}`
```

- [ ] **Step 3: Build + test copy-link buttons manually**

Run: `npm run build && npm run dev`. Open a task detail, click "Copy Link". Paste into a new tab. Should be `.../portal/my-tasks?open=<id>` or equivalent.

Expected: all shared/copied URLs use portal paths.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "refactor(nav): migrate template-literal gated URLs to PATHS"
```

### Task 9: Audit `window.location` + direct form-action URLs

**Files:**
- Audit: `src/`

- [ ] **Step 1: Search for direct location assignment**

Run: `grep -rn 'window.location.\|location.href =' src/ --include="*.tsx" --include="*.ts" | grep -v node_modules`

- [ ] **Step 2: Inspect each match**

For any match that constructs a gated URL, swap through PATHS. Many matches will be reloads (`window.location.reload()`) — leave those alone.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: green.

- [ ] **Step 4: Commit only if changes**

```bash
git add src/
git diff --cached --name-only | grep -q . && git commit -m "refactor(nav): migrate window.location gated URLs to PATHS" || echo "No changes"
```

---

## Phase 4 — Convert old root routes to redirect shims

Goal: Old root paths like `/dashboard` continue to work as 302-style client redirects. Anyone with a stale bookmark is silently re-homed at `/portal/dashboard`.

### Task 10: Replace root gated routes with Navigate

**Files:**
- Modify: `src/App.tsx:192-231` (the old root gated routes)

- [ ] **Step 1: Remove old root gated route declarations**

Delete lines 192-231 in `src/App.tsx` (everything from the `<Route path="/dashboard" ...>` through `<Route path="/settings" ...>`). Keep:
- The `{/* Workspace */}` section comment
- The `<Route element={<RequireAuth><PortalLayout /></RequireAuth>}>` wrapper
- The `/portal/*` routes added in Task 2
- The `/portal/team/:slug` + trajectory routes already present

- [ ] **Step 2: Add redirect shim block OUTSIDE the RequireAuth wrapper**

At `src/App.tsx`, just before the `<Route element={<RequireAuth><PortalLayout /></RequireAuth>}>` block, add an ungated redirect shim block. These redirects don't need PortalLayout wrapping because they immediately bounce to a portal path.

```tsx
                {/* Legacy root-path redirects (2026-04-21 migration).
                    Anyone hitting an old URL bounces to the /portal/* equivalent.
                    Kept indefinitely; cost is negligible. */}
                <Route path="/dashboard" element={<Navigate to="/portal/dashboard" replace />} />
                <Route path="/personal" element={<Navigate to="/portal/personal" replace />} />
                <Route path="/my-items" element={<Navigate to="/portal/my-items" replace />} />
                <Route path="/my-tasks" element={<Navigate to="/portal/my-tasks" replace />} />
                <Route path="/tasks" element={<Navigate to="/portal/my-tasks" replace />} />
                <Route path="/calendar" element={<Navigate to="/portal/calendar" replace />} />
                <Route path="/deadlines" element={<Navigate to="/portal/deadlines" replace />} />
                <Route path="/deadline-cascade" element={<Navigate to="/portal/deadline-cascade" replace />} />
                <Route path="/projects" element={<Navigate to="/portal/projects" replace />} />
                <Route path="/projects/:slug" element={<NavigateWithParams to="/portal/projects/:slug" />} />
                <Route path="/manuscripts" element={<Navigate to="/portal/manuscripts" replace />} />
                <Route path="/ideas" element={<Navigate to="/portal/ideas" replace />} />
                <Route path="/ask" element={<Navigate to="/portal/ask" replace />} />
                <Route path="/decisions" element={<Navigate to="/portal/decisions" replace />} />
                <Route path="/narratives" element={<Navigate to="/portal/narratives" replace />} />
                <Route path="/digest" element={<Navigate to="/portal/digest" replace />} />
                <Route path="/research-digest" element={<Navigate to="/portal/digest" replace />} />
                <Route path="/search" element={<Navigate to="/portal/search" replace />} />
                <Route path="/grants" element={<Navigate to="/portal/grants" replace />} />
                <Route path="/meetings" element={<Navigate to="/portal/meetings" replace />} />
                <Route path="/meetings/:id" element={<NavigateWithParams to="/portal/meetings/:id" />} />
                <Route path="/meetings/:id/prep" element={<NavigateWithParams to="/portal/meetings/:id/prep" />} />
                <Route path="/meeting-prep" element={<Navigate to="/portal/meetings" replace />} />
                <Route path="/meeting-notes" element={<Navigate to="/portal/meeting-notes" replace />} />
                <Route path="/activity" element={<Navigate to="/portal/activity" replace />} />
                <Route path="/analytics" element={<Navigate to="/portal/analytics" replace />} />
                <Route path="/pi/analytics" element={<Navigate to="/portal/pi/analytics" replace />} />
                <Route path="/pi-analytics" element={<Navigate to="/portal/pi/analytics" replace />} />
                <Route path="/mentee-milestones" element={<Navigate to="/portal/mentee-milestones" replace />} />
                <Route path="/pb" element={<Navigate to="/portal/pb" replace />} />
                <Route path="/sessions" element={<Navigate to="/portal/sessions" replace />} />
                <Route path="/settings" element={<Navigate to="/portal/settings" replace />} />
```

- [ ] **Step 3: Add NavigateWithParams helper**

React Router's `<Navigate to>` does not expand `:slug` placeholders. Add a small helper at the top of `App.tsx`:

```typescript
import { Navigate, useParams } from 'react-router-dom'

function NavigateWithParams({ to }: { to: string }) {
  const params = useParams()
  let resolved = to
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) resolved = resolved.replace(`:${key}`, value)
  }
  return <Navigate to={resolved} replace />
}
```

Place it near the top of the file (below imports, above `App`).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: green.

- [ ] **Step 5: Smoke-test redirects**

Run: `npm run dev`. Visit each manually:
- `http://localhost:5173/dashboard` → URL in address bar changes to `/portal/dashboard`, Dashboard renders
- `http://localhost:5173/projects/mesfin-k23-ihca-survivability-calculator` → URL changes to `/portal/projects/mesfin-k23-ihca-survivability-calculator`, ProjectDetail renders
- `http://localhost:5173/meetings/abc123/prep` → URL changes to `/portal/meetings/abc123/prep`
- `http://localhost:5173/research-digest` → URL changes to `/portal/digest`

Expected: every legacy URL bounces. No broken pages, no infinite loops.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(router): convert legacy root gated routes to /portal/* redirects"
```

---

## Phase 5 — Update tests

Goal: every `page.goto` in the test suite points at a `/portal/*` URL (or a root public URL where appropriate). Run the inspection + journey suites against the new paths.

### Task 11: Update test-file navigation

**Files:**
- Modify: 16 files under `tests/` (discovered at step 1)

- [ ] **Step 1: Inventory test gotos**

Run: `grep -rn 'page\.goto\|\.goto(' tests/ | grep -v node_modules > /tmp/test-goto-audit.txt && wc -l /tmp/test-goto-audit.txt`

Expected: ~150-300 lines. Open file; master checklist.

- [ ] **Step 2: Create a paths test helper**

Create `tests/helpers/paths.ts`:

```typescript
// tests/helpers/paths.ts
// Test-side path helpers. Mirrors src/constants/paths.ts but returns plain
// strings so tests read naturally and don't import the production bundle.

export const P = {
  dashboard: '/portal/dashboard',
  personal: '/portal/personal',
  myItems: '/portal/my-items',
  myTasks: '/portal/my-tasks',
  tasks: '/portal/tasks',
  calendar: '/portal/calendar',
  deadlines: '/portal/deadlines',
  deadlineCascade: '/portal/deadline-cascade',
  projects: '/portal/projects',
  project: (slug: string) => `/portal/projects/${slug}`,
  manuscripts: '/portal/manuscripts',
  ideas: '/portal/ideas',
  ask: '/portal/ask',
  decisions: '/portal/decisions',
  narratives: '/portal/narratives',
  digest: '/portal/digest',
  search: '/portal/search',
  grants: '/portal/grants',
  meetings: '/portal/meetings',
  meeting: (id: string | number) => `/portal/meetings/${id}`,
  meetingPrep: (id: string | number) => `/portal/meetings/${id}/prep`,
  meetingNotes: '/portal/meeting-notes',
  activity: '/portal/activity',
  analytics: '/portal/analytics',
  piAnalytics: '/portal/pi/analytics',
  menteeMilestones: '/portal/mentee-milestones',
  pb: '/portal/pb',
  sessions: '/portal/sessions',
  settings: '/portal/settings',
  teamMember: (slug: string) => `/portal/team/${slug}`,
  // Public
  home: '/',
  publicTeam: '/team',
  publicMember: (slug: string) => `/team/${slug}`,
  publications: '/publications',
} as const
```

- [ ] **Step 3: Sweep test files**

For each line in `/tmp/test-goto-audit.txt`, classify and rewrite:

- **Gated path** (e.g., `` `${BASE}/dashboard` ``): change to `` `${BASE}${P.dashboard}` `` — import P at top of file.
- **Public path** (e.g., `` `${BASE}/team` ``): leave as-is, OR use `P.publicTeam` for consistency. Pick one rule per file.
- **Dynamic** (e.g., `` `${BASE}/projects/${slug}` ``): change to `` `${BASE}${P.project(slug)}` ``.

Example:
```typescript
// before
await page.goto(`${BASE}/dashboard`)
// after
import { P } from './helpers/paths'
await page.goto(`${BASE}${P.dashboard}`)
```

- [ ] **Step 4: Run local inspection suite**

Run: `npm run test:local`
Expected: all pass. If inspection assertions search for URL in page state, they'll now match `/portal/*`.

- [ ] **Step 5: Run prod inspection suite (careful — Workers quota)**

Run: `npm run test:prod`
Expected: all 213 pass against the deployed site. If the deploy isn't yet done, this will fail on the new paths — skip this step until after Phase 6 deploy.

- [ ] **Step 6: Commit**

```bash
git add tests/
git commit -m "test: migrate page.goto calls to portal paths via helpers/paths"
```

### Task 12: Update hub-audit.ts + other audit scripts

**Files:**
- Modify: `scripts/hub-audit.ts`
- Modify: any `scripts/*.ts` that navigates the Hub

- [ ] **Step 1: Audit**

Run: `grep -rn 'goto\|BASE}/' scripts/ 2>/dev/null | grep -v node_modules`

- [ ] **Step 2: Rewrite each to use P**

Import `P` from `tests/helpers/paths` (or inline the strings if scripts live outside tests/).

Example:
```typescript
// before in hub-audit.ts:
await page.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' })
// after:
await page.goto(`${BASE}/portal/my-tasks`, { waitUntil: 'networkidle' })
```

- [ ] **Step 3: Smoke-run one audit section locally**

Run: `HUB_AUDIT_BASE=http://localhost:5173 npx tsx scripts/hub-audit.ts --section=tasks --list`

Expected: section listing prints without network error.

- [ ] **Step 4: Commit**

```bash
git add scripts/
git commit -m "chore(scripts): migrate hub-audit goto URLs to portal paths"
```

---

## Phase 6 — Deploy + configure CF Access

Goal: single CF Access app with one destination gates the authenticated surface. Public routes stay open.

### Task 13: Ship the deploy

**Files:**
- Deploy target: `mn-ccore-lab.pages.dev`

- [ ] **Step 1: Build fresh**

Run: `npm run build`
Expected: green.

- [ ] **Step 2: Deploy**

Run: `npx wrangler pages deploy dist --project-name mn-ccore-lab`

Expected: deployment URL printed. Copy it.

- [ ] **Step 3: Post-deploy verify**

```bash
curl -I https://mn-ccore-lab.pages.dev/dashboard
# Expected: 200 (SPA still serves index.html; client-side redirect bounces to /portal/dashboard on load)

curl -I https://mn-ccore-lab.pages.dev/portal/dashboard
# Expected: 200
```

Open `https://mn-ccore-lab.pages.dev/dashboard` in browser:
- Address bar changes to `/portal/dashboard`
- Dashboard renders

Open `https://mn-ccore-lab.pages.dev/portal/projects`: loads project list.

Expected: both URLs work; legacy bounces to new.

- [ ] **Step 4: Run prod inspection suite**

Run: `npm run test:prod`
Expected: 213 pass.

- [ ] **Step 5: Commit deploy record (optional — changelog)**

Update `CHANGELOG.md` with a top entry describing the portal URL migration. Example:

```markdown
## 2026-04-21 — Portal URL Migration (Phase 37)

Migrated 27 gated routes under `/portal/*` prefix. Single Cloudflare Access
application now gates the authenticated surface via one destination
(`mn-ccore-lab.pages.dev/portal/*`). Public marketing pages stay at root.

- All internal navigation routes through `src/constants/paths.ts`
- Legacy root paths (`/dashboard`, `/projects/:slug`, etc.) redirect via
  `<Navigate>` shims — bookmarks continue working
- Test suite updated to use `tests/helpers/paths.ts`
```

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG entry for portal URL migration"
git push origin main
```

### Task 14: Configure CF Access application

**Files:**
- Cloudflare dashboard (not in repo)
- Modify: `LAUNCH-CHECKLIST.md` — replace the 25-path list with the single `/portal/*` destination
- Modify: `CLAUDE.md` — update routing rule #23 to note the migration

- [ ] **Step 1: Simplify CF Access app destination**

Zero Trust → Access → Applications → `MN-CCORE Lab Hub` → Edit → Application domain section.

Remove any existing path entries. Add ONE destination:
- Subdomain: (blank)
- Domain: `mn-ccore-lab.pages.dev`
- Path: `/portal/*`

Save.

- [ ] **Step 2: Verify policies still attached**

Policies tab should show `Nick Only` + `Audit Service Token` (from earlier setup).

- [ ] **Step 3: Verify gating works**

```bash
# Public path — must stay open
curl -I https://mn-ccore-lab.pages.dev/
# Expected: 200, no CF Access redirect

# Legacy gated path — client SPA still loads (index.html returns) then redirects to /portal/dashboard
curl -I https://mn-ccore-lab.pages.dev/dashboard
# Expected: 200 (HTML served, JS bounces on page load)

# New canonical gated path WITHOUT token — must get CF Access block
curl -I https://mn-ccore-lab.pages.dev/portal/dashboard
# Expected: 302 to cloudflareaccess.com OR CF Access HTML

# New canonical gated path WITH service token — must pass
curl -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
     -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
     -I https://mn-ccore-lab.pages.dev/portal/dashboard
# Expected: 200
```

NOTE: there's one subtle consequence — hitting `/dashboard` without being logged in now serves HTML (CF Access doesn't gate `/dashboard` because only `/portal/*` is gated), and the React redirect fires client-side. The redirect target `/portal/dashboard` is gated, so at that point CF Access login wall appears. User-visible flow:
1. User types `/dashboard`
2. CF Access: not gated, serves HTML
3. React: bounces to `/portal/dashboard`
4. CF Access: gated, serves login page
5. User logs in, lands on `/portal/dashboard`

That's acceptable — stale bookmarks still end at the gated destination. Document this in CLAUDE.md.

- [ ] **Step 4: Update LAUNCH-CHECKLIST.md**

In `LAUNCH-CHECKLIST.md` section 1, replace the long path list with:

```markdown
Configure in Cloudflare dashboard → Zero Trust → Access → Applications:
- Create application for `mn-ccore-lab.pages.dev`
- Single destination: `mn-ccore-lab.pages.dev/portal/*`
- Policies: `Nick Only` (allow @umn.edu) + `Audit Service Token` (service auth)
- Public paths (at root, no auth needed): `/`, `/team`, `/publications*`,
  `/network*`, `/contact*`, `/pulse*`, `/nick`, `/nate`, `/team/:slug`,
  `/team/:slug/trajectory`
```

- [ ] **Step 5: Update CLAUDE.md rule #23**

Edit rule #23 in `CLAUDE.md` to reflect the full migration:

```markdown
23. **All gated routes live under `/portal/*`. Public routes stay at root.**
    Migration 2026-04-21 — single CF Access application destination
    (`/portal/*`) gates the entire authenticated surface. Legacy root
    paths (`/dashboard`, `/projects/:slug`, etc.) redirect via
    `<Navigate>` shims in `src/App.tsx`. All internal navigation goes
    through `src/constants/paths.ts`. Tests use `tests/helpers/paths.ts`.
    Adding a new gated route = add under `/portal/*` in `App.tsx` + export
    from `paths.ts`. Never add at root unless it's a public marketing page.
```

- [ ] **Step 6: Commit docs + push**

```bash
git add LAUNCH-CHECKLIST.md CLAUDE.md
git commit -m "docs: CF Access uses single /portal/* destination"
git push origin main
```

---

## Cleanup / Future work (NOT in this plan)

- 30-90 days post-launch: drop redirect shims if analytics show no traffic on legacy paths. Remove Phase 4 route block from `src/App.tsx`. Remove `LEGACY_REDIRECTS` from `paths.ts`.
- Consider hoisting `/team/:slug` (public member page) and `/portal/team/:slug` (portal member page) into a single template that renders different chrome based on `useLocation`. Currently duplicated by intent — not a bug, but a future simplification.

---

## Self-review

**Spec coverage:** Every gated path in `src/App.tsx:192-231` has a corresponding Phase 1 new route (Task 2) and a Phase 4 redirect (Task 10). Every public path is explicitly left unchanged. All call-site surfaces — sidebar, command palette, mobile nav, keyboard hooks, Link tags, template literals, window.location, tests, audit scripts — each have a task.

**Placeholder scan:** Every code step contains complete code or exact command. "Audit `window.location`" task includes the grep command + classification rules + example rewrite. No "TBD" or "fill in" tokens.

**Type consistency:** `PATHS` signature stays stable across Tasks 1-12 (exported as const record of string + function-returning-string entries). `P` in tests mirrors `PATHS` with plain strings (tests don't import prod bundle). `NavigateWithParams` helper used consistently in Task 10.

**Known deliberate asymmetries:**
- `PATHS.tasks = /portal/tasks` but palette navigates users to `PATHS.myTasks` for create/status actions (line mapping in Task 5, step 2). This matches current prod behavior — `/tasks` is already a redirect to `/my-tasks` today.
- `/team/:slug` (public) and `/portal/team/:slug` (portal) remain two distinct routes rendering the same component. Phase 36c design, preserved.
