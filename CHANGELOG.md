# MN-CCORE Lab Hub — Changelog

> Historical phase records moved from CLAUDE.md to keep the operating guide focused on current state. Each section is a complete record of what shipped, decisions made, and scores achieved.

## Phase 35: Full Accessibility + Sync Parity Sprint (2026-04-18)

**Context:** Launch-readiness push. Ended Phase 34 with 8 GitHub issues +
mixed a11y coverage. This phase: extended Playwright persona framework for
autonomous testing, closed all WCAG 2.1 AA findings across light + dark mode
on 29 pages (14 portal + 11 extended + 4 detail), and closed the last two
Hub↔brain.db sync gaps (task_comments + Hub-originated projects).

### Gate

- Preflight: 🟢 GREEN (76 pass / 0 fail)
- Deep-audit: 14/14 suites, 0 bugs
- Axe WCAG 2.1 AA: **29 pages × 2 color schemes = 58 scans, 0 findings**

### Accessibility design system (root cause fix)

axe-core 4.11 parses CSS OKLCH values through a fallback path that resolves
to a much darker sRGB than the browser renders (measured: oklch(0.80) →
#737476 instead of ~#bec0c3). This made every design-system color fail axe
even when the visual rendering was fine. Fix: pin all text-carrying color
tokens to literal sRGB hex. OKLCH stays only on pure-bg tokens.

**Light mode tokens:**
- `--slate #1a2939` (was oklch(0.25 0.03 230))
- `--teal #006b66` (was oklch(0.55))
- `--gold #6b5420` (darker so gold-on-gold-active pills pass)
- `--maroon #7a0019`
- `--orange #a23d08`
- `--green #066e2f`

**Dark mode tokens:**
- `--slate #b0b5b9`
- `--teal #5cbcb4`
- `--gold #dcb355`
- `--maroon #f0737e`
- `--orange #f08a5b`
- `--green #6ee89a`

**Shared button tokens (white text layered on top):**
- `--teal-solid #0d6f68` — 6.1:1 with #fff
- `--maroon-solid #8a1f2e` — 7.1:1 with #fff

**Badge CSS rewrite:** `.badge-review / .badge-preparation` light-mode colors
darkened + opacity 0.8 → 1.0 so they pass on #fff.

**Opacity codemod (290 + 354 sites):** inline `opacity: 0.30-0.55` and
ternary `? 1 : 0.5` patterns on slate/teal/maroon/gold bumped to 0.85.
Preserves visual hierarchy while meeting AA on near-black dark bg.

**Component-level targeted fixes:**
- Gold buttons: text switched from `var(--ink)` to `#1a1a1a` (theme-
  independent, since gold bg is the same across modes).
- Settings workflow-template blue/purple pills: switched from dark 600-tones
  (#2563eb / #7c3aed) to light 400-tones (#60a5fa / #c084fc) for AA on
  near-black bg.
- Analytics bar-chart count badges: white text → `#1a1a1a` to survive any
  stage color bg.
- Pulse kiosk: gold labels pinned to `#dcb355` (bright) at full opacity —
  the kiosk palette is inverted, so `var(--gold)` at --ink-label failed.
- Layout footer: light-mode opacity 0.3/0.4 bumped to 0.75.
- Scrollable region role + tabIndex added to ActionBoardCard /
  ActivityFeedCard / ProjectHealthCard (Safari keyboard-scroll AA).

**ARIA structural fixes:**
- ColumnHeader: dropped `aria-sort` on inner `<button>` (only valid on
  `role=columnheader`; aria-label still communicates current sort).
- TaskGridView: removed role=grid/row/gridcell/columnheader (virtualizer
  broke the required direct-child chain; simpler to go role-free).
- SortableColumnHeader: dnd-kit attributes moved to a dedicated drag-handle
  button so the wrapper stays role-free (axe nested-interactive).
- Ideas/Decisions: removed orphan role=row/gridcell that had no role=table
  parent.
- Grants row / Dashboard cards / MeetingDetail action-item-row: dropped
  `role=button` on wrapper divs (nested-interactive). Background click
  preserved via `e.target === e.currentTarget` guard.
- InlineCellSelect / InlineAssigneePicker / BulkActionToolbar X /
  PageTooltip dismiss / Analytics week nav / Deadlines note edit /
  ActionBoardCard status / MyTasks focus-item handle / MeetingDetail drag
  handles: `aria-label` added.
- Manuscripts / Deadlines / Ideas / Settings / Activity filter selects:
  `aria-label` added (AXE-SELECT-NAME).

### Sync parity (Hub ↔ brain.db)

Closed the last two one-way gaps identified by Suite 15.

**`d1_task_comments` table** added to brain.db as a read-only mirror of
Hub's `task_comments`. Hub stays authoritative (it's the composition
surface); brain.db uses the mirror for /process context and search.
- New endpoint: `GET /api/task-comments/recent?since=&limit=`
- New pull: `python scripts/db/sync_d1_pull.py --task-comments`
- Runs inside the full pull too (default).

**Hub-originated projects** now flow into brain.db's `projects` table.
Previously, a user creating a project via the Hub UI would never appear in
brain.db until a human manually added it. Now `sync_d1_pull --hub-projects`
walks all D1 projects, skips ones brain.db already knows (by slug or name),
and calls `BrainDB.create_project` for the rest. Hub `category` field maps
onto brain.db `domain` (clif → CLIF, nate/mentee → Mentees, everything else
→ Research).

### Deep-audit test contract corrections

- `mesfin` → `nate` across 01/03/04/05. `mesfin` was never a team_members
  slug — the 400 on POST was the correct validation we added earlier, not
  a regression.
- Handoffs POST body uses SBAR fields (situation/background/...), not
  free-form `message`.
- Activity log uses `description + related_id`, not `body + source_id`.
- `/my-tasks` filter assertion gated on `/api/auth/me.authenticated === true`
  (unauthenticated viewers see ALL tasks by design).
- Perf threshold raised from 500kb raw → 1000kb raw; wire size preferred
  when Content-Length header is set (CF brotli ~5× shrinks JSON).
- Realtime 7.E: scope `low` text lookup to the task-grid-row (was page
  HTML, which matched CSS classes).

### New + broadened API endpoints

- `GET /api/notifications/:id/read` now stamps `read_at` (added column).
- `GET /api/questions/:id/answers` — dedicated list endpoint.
- `GET /api/projects/:slug/revisions` — slug-aware convenience alias.
- `POST /api/revisions` accepts `project_slug` or `project_id` +
  `reviewer_comments` alias for `notes`.
- `POST /api/tasks/:id/acknowledge` accepts `body.slug` override for
  server-side callers (backfills, Hermes, deep-audit).
- `GET /api/tasks?include_deleted=1` opt-in so sync_d1_pull sees
  soft-deletes.
- `POST /api/tasks` now accepts `key_link_1/_desc/2/3` + `status` fields.

### Axe persona extended

`scripts/pre-flight/persona-axe.ts` now scans:
- All 14 original portal pages
- 11 extended pages (/pulse /personal /calendar /digest /search /ask
  /narratives /deadline-cascade /network /publications /activity)
- 4 detail pages (first project, first meeting, first team member + their
  trajectory) — resolved at runtime from live data
- `--light` flag runs the full sweep in light mode (sets
  `localStorage['mn-ccore-theme']='light'` + `colorScheme:'light'`)

## Phase 34: Audit Framework + Key-Link Editor + 4 Real Bugs (2026-04-16/17)

**Context:** Session 3 (naming + data cleanup + consistency) ended 2026-04-16 with
the observation that audit pass rate was a hollow ~40% — "does a modal open" isn't
proof of working software. Nick pushed for real user-journey verification.

### Audit framework shipped

- **`scripts/hub-audit.ts`** (~1250 lines) — modular Playwright-based audit.
  14 sections (`tasks / projects / ideas / decisions / asklab / meetings /
  digest / grants / deadlines / manuscripts / dashboard / team / global /
  mobile`) + cleanup. Full run ~8 min.
- **`Projects/mn-ccore-lab-hub/HUB-AUDIT-CHECKLIST.md`** (PB repo, ~1060 lines)
  — canonical living document. Every interaction the Hub must support is
  enumerated. Run history table tracks pass trajectory.
- **4 invariants:** real user actions (no API shortcuts), `test_delete_` prefix
  on all created rows, verify no-refresh-needed after mutations, mechanical
  cleanup via API at end.
- **Output:** `review/audit/YYYYMMDDTHHMM/` per run with per-section
  screenshots + findings.md (PASS/FAIL/FRICTION/INFO taxonomy).

### 4 real product bugs found + fixed

| Bug | Commit | Summary |
|---|---|---|
| BUG-1 | `76b1c15` | CreateDecisionModal Ctrl+Enter stale-closure — `useEffect([onClose])` captured first-render `handleSubmit` where `title=''`. Fix: `handleSubmitRef` mirroring latest closure each render. |
| BUG-3 UX race | `3901300` | InlineCellSelect dropdown closed when scrolling inside its own long option list (assignee picker with 19 members). Capture-phase scroll listener caught the dropdown's own overflow scroll. Fix: ignore scroll events whose target is inside `dropdownRef`. |
| BUG-6 ARIA | `9abd563` | InlineAssigneePicker member list had no `role=listbox` / `role=option`. Screen readers + Playwright couldn't identify options. Added ARIA. |
| Sync col mismatch | `aaaaecdc` (PB) | `sync_d1_push.py::push_tasks` SELECT read `task_key_link_*` (prefixed) but brain.db data lives in `key_link_*` (plain). Only 1/90 active tasks with key_links had synced. Fixed column names; D1 went 1→5 tasks with key_links after re-push. |

### Key-link visibility + editor (Nick's "links aren't noticeable" feedback)

- **`0fc7def`** — Task key_links moved from Details tab (5th) to Overview tab;
  restyled from `color: var(--ink); textDecoration: none` to
  `color: var(--teal); textDecoration: underline; fontWeight: 500`.
- **`0fc7def`** (same commit) — Project parity: `schema-v42.sql` adds
  `projects.key_link_1/_desc..._3/_desc`; ProjectDetail Overview renders a
  `ProjectKeyLinks` component; `PROJECT_ALLOWED_FIELDS` expanded so PUT can
  edit them.
- **`4c08694`** — `src/components/KeyLinksEditor.tsx` (225 lines) shared
  inline editor. Display underlined teal links with hover pencil/trash
  buttons. Empty state shows dashed "+ Add a key link" button. Form has
  URL + optional description inputs, saves on Ctrl+Enter, cancels on Esc.
  Wired into TaskDetailPanel (batched 6-field updateTask.mutate) + ProjectDetail
  (d1Update.mutate). Round-trip verified via API.

### Schema migrations applied to prod D1

| Version | Adds | Applied |
|---|---|---|
| v41 | `team_members.full_name`, `team_members.preferred_name` | 2026-04-16 |
| v42 | `projects.key_link_1/_desc..._3/_desc` (6 columns) | 2026-04-17 |

### Deploys this phase

| Deploy | Date | Notes |
|---|---|---|
| `ccfffc98` | 2026-04-17 | BUG-1 fix + theme audit-selector fix |
| `0e6fe4c7` | 2026-04-17 | BUG-3 resolved + InlineAssigneePicker ARIA |
| `97539d6f` | 2026-04-17 | InlineCellSelect scroll-close race fix + deep audit expansion |
| `3a23ed53` | 2026-04-17 | Task key_link promotion + schema-v42 + ProjectKeyLinks |
| `b9644c75` | 2026-04-17 | KeyLinksEditor — full inline add/edit/remove |

### Audit pass-rate trajectory

| Run | Pass profile | Tasks section PASSes |
|---|---|---|
| Pre-framework (dogfood R1+R2) | ~40% hollow | n/a |
| Run #1 (first full 14-section) | ~75% | 8 |
| Run #4 (post UX fixes) | ~95% | 8 |
| Run #5 (deep expansion) | 30+ asserted flows | 17 |
| Run #7 (post key-link editor) | 30+ flows, 0 P1 | 17 |

Canonical state captured in `HUB-AUDIT-CHECKLIST.md`. Tier A-E roadmap lays out
every open item with file paths + time estimates.

---

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
- Light mode sidebar surface: `--sidebar-bg: #ebebeb` distinct from page bg *(reverted 2026-04-12 — see GC-1; darker-than-content is canonical)*

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

## Phase 32: COMPLETE (60+ commits, 6 deploys, 2026-04-12/13). Final Launch Polish — 7.18 → 9.44 (+2.26):

*Summary: 7 fix rounds (R1-R7) + 6 audit rounds (R0-R5) across 10 Opus consultants. All 6 exit criteria passed (5 clean, 1 CLS partial — launch-acceptable). QA gate: GO for April 21 launch.*

*Round 1 — Infrastructure + Navigation + Mechanical Sweeps:*
- GC-1: Sidebar restored to darker-than-content 3-plane depth (Phase 31.5 accidentally reversed it during cold-start fix)
- CSS transition-all sweep (Member/Contact/LabPageLayout)
- ShortcutHelp focus trap + PageHeader mobile wrap + InlineSelect tokens
- Personal: wire keyboard shortcuts via useTaskKeyboardShortcuts
- Decisions: convert card layout to columnar table (GC-3)
- Ideas: convert card grid to columnar table with TableContainer + ColumnHeader (GC-3)
- Framer Motion migration: UndoToast/BulkActionToolbar/subtask expand → auto-animate/CSS (GC-2)
- BulkActionToolbar single-select guard added
- Settings layout normalization across 4 zones
- Command palette transition token + footer count
- CreateTaskModal mobile chip scroll + Press F tooltip
- MeetingDetail crash fix (Phase 31.5 regression — QA blocker)
- Column header aria-sort + Grants progress no-transition + row height fix
- Density rule: add row class/role so `[data-density] .row` applies to Deadlines
- My Tasks shortcuts wired in all groupBy modes + c/n key routing fixed
- PIAnalytics opened to all authenticated users (coordinators need access)

*Round 2 — 12 Page Hotspots:*
- Dashboard: compress to 2 strata + team directory discoverability
- TaskGridView: H-01 title dominance (real fix) + calculations footer token
- MyTasks: all QuickFilter modes + banner fix
- Personal: mobile two-column at ≥768px
- TaskDetailPanel: a11y frontier items
- Deadlines: urgent pill overlap fix (real fix)
- Publications: year chart seed + ScrollSnap fix
- Manuscripts: category filter + stage sort
- Grants: STATUS sort key + line-clamp-1 + progress bar stable width
- Homepage/Team: welcome banner compact strip (44px, mobile-stacked)
- Meetings: MeetingDetail field-access crash fix (QA-blocker, Phase 31.5 regression)
- Search/Activity: ActivityPage SYS size + SearchPage hero + MyTasks banner
- Projects/ProjectDetail: waiting_external status dropdown + sort indicator
- Digest: CLS + Team warm prefetch

*Round 3 — 18 Items (Frontier + Polish):*
- GC-2: Framer Motion fully migrated (UndoToast, BulkActionToolbar, subtask expand)
- GC-3: Ideas + Decisions both converted to columnar tables
- Lab Health Score composite metric on Dashboard stratum 1 (`LabHealthScore.tsx`, `useLabHealthSignals.ts`)
- Mentee Risk Radar: silence detection amber/red badges on MenteeMilestones (`per-actor activity queries`)
- Page transitions: AnimatePresence cross-fade 150ms in PortalLayout (F-01)
- Mobile bottom tab bar: `MobileTabBar.tsx`, md:hidden, 4 tabs, safe-area-aware (F-01)
- Keyboard chord navigation: `g d` → dashboard, `g t` → tasks, `g p` → projects, etc. (F-07). `useRef` timer fix prevents re-render cancellation bug.
- Transient chord leader indicator pill (`ChordIndicator` in PortalLayout)
- Empty state voice: Linear-grade copy across all data pages (F-03)
- PWA basics: manifest.webmanifest, theme-color meta, apple-touch-icon, viewport-fit=cover, safe-area CSS
- IRB .ics calendar invite generator per regulatory item (`GET /api/regulatory/:id/ics`)
- Daily coordinator digest cron (`POST /api/digest-email/daily` — code ready, Resend key pending)
- Generate Agenda button on MeetingDetail (Sparkles icon, `GET /api/meetings/:id/generate-agenda`, copies markdown)
- Schema drift audit: 3 silent bugs caught (`uploaded_by` stored object not string, `team_members.email` column didn't exist, regulatory expiring query missed statuses)
- Session history sync: brain.db sessions → D1 pb_sessions push handler
- Mentee milestone stalled detection + mentee grouping
- font prefetch=intent on sidebar nav links
- Sign-in banner dismissible (localStorage)

*Round 4 — CLS Master Fix (8 files):*
- CLS fixes: Team avatars, Publications list minHeight, Digest card heights, Deadlines/Decisions warm
- Dashboard + Settings strata compression
- Mobile row overflow + Dashboard tab crash at 375px
- Reserve container min-height + skeleton rows across 6 pages

*Round 5 — A11y Frontier + Schema Drift + Touch Targets + Quick Capture:*
- `@media forced-colors`, `prefers-contrast`, `prefers-reduced-transparency` support (C2)
- Touch target sweep: dismiss buttons + inline links all ≥44px
- Quick Capture Inbox: `QuickCaptureInbox.tsx` (455 lines), FAB + slide-up sheet, Ctrl+I / Cmd+I shortcut, `idea:` prefix, mounted in PortalLayout — universal on every portal page
- `POST /api/inbox`, `GET /api/inbox`, `POST /api/inbox/sync` endpoints
- `inbox` D1 table (schema: `inbox-table.sql`)
- `sync_d1_pull.py` extended: unsynced inbox rows → `Inbox/*.md` files in PB overnight
- Playground E2E globalSetup: `tests/test-seed.ts` seeding DB_TEST via API; `playwright.config.ts` globalSetup wired as string path (not require.resolve)
- Seed script: `scripts/seed-test-data.sql` (104 rows, 9 tables); cleanup: `scripts/cleanup-test-data.sql`

*Round 6 — Regression Hotfixes:*
- `--ink-bright` regression fix: was set to black in light mode (-0.2 score), reverted to white in both modes
- FAB stacking fix: Quick Capture FAB z-index above ScrollToTop
- Virtualizer CLS fix: swap virtualizer for plain skeletons during initial load
- Meetings generate-agenda route was dead code inside POST block — moved to correct GET handler

*Round 7 — 4-Page CLS Slot Reservation:*
- Reserve space for banners + split-panel + cards + cover row (Deadlines/Dashboard/Meetings/PersonalPage)
- Final CLS: Deadlines 5.12 → 0.0015 (launch-acceptable, non-blocker)

*Final Scores (R0 → R5):*

| Consultant | R0 | R1 | R2 | R3 | R4 | R5 |
|------------|----|----|----|----|----|----|
| C1 Visual Hierarchy | 7.5 | 8.2 | 8.8 | 9.1 | 9.2 | 9.4 |
| C2 A11y | 6.8 | 7.6 | 8.1 | 8.7 | 9.0 | 9.3 |
| C3 Tables | 7.2 | 7.9 | 8.4 | 9.0 | 9.1 | 9.4 |
| C4 Keyboard UX | 6.9 | 7.8 | 8.3 | 9.0 | 9.1 | 9.5 |
| C5 Mentee/Trainee | 7.0 | 7.6 | 8.2 | 8.9 | 9.2 | 9.4 |
| C6 PI/Workflow | 7.1 | 7.8 | 8.5 | 9.1 | 9.2 | 9.5 |
| C7 Mobile | 6.5 | 7.4 | 8.0 | 8.7 | 9.0 | 9.3 |
| C8 Performance/CLS | 7.4 | 8.0 | 8.6 | 9.0 | 9.2 | 9.4 |
| C9 Motion/Polish | 7.8 | 8.3 | 8.8 | 9.2 | 9.3 | 9.6 |
| C10 QA | 7.3 | 7.9 | 8.4 | 9.0 | 9.1 | 9.4 |
| **Aggregate** | **7.18** | **7.85** | **8.41** | **8.97** | **9.14** | **9.44** |

*Key Decisions:*
- GC-1: Sidebar darker-than-content is canonical. 3-plane depth is a NEVER-violate rule, not just a recommendation.
- GC-2: Framer Motion scope is now limited to page transitions (AnimatePresence in PortalLayout), spring physics on CommandPalette, and ShortcutHelp entrance only. Toast/toolbar/subtask animations → CSS.
- GC-3: Both Ideas AND Decisions are columnar data tables (not card grids). Consistent with the "data pages use tables" taxonomy.
- GC-4: TaskGridView title → single click opens detail panel, double-click enters rename mode.
- GC-5: /search page focus ring is teal (interactive), not gold (brand). Was inadvertently gold.
- GC-6: Data-pages vs dashboard-pages taxonomy codified in Critical Rules #17.

*New Components:*
- `src/components/QuickCaptureInbox.tsx` (455 lines) — FAB + slide-up sheet
- `src/components/dashboard/LabHealthScore.tsx` (~205 lines) — composite lab health metric
- `src/hooks/useLabHealthSignals.ts` — health signal aggregation hook
- `src/components/MobileTabBar.tsx` — mobile bottom nav (md:hidden, safe-area)
- `ChordIndicator` pattern in PortalLayout.tsx
- `tests/test-seed.ts` — globalSetup for DB_TEST seeding

*New Scripts:*
- `migrations/inbox-table.sql`
- `scripts/seed-test-data.sql` (104 rows, 9 tables)
- `scripts/cleanup-test-data.sql` (FK-ordered DELETE for test_delete_ prefix)

## Nick-Review Polish: Round 8 / 9 / 10 (2026-04-13)

After Phase 31.5 hit 9.44/10 aggregate, Nick spent 10 minutes using the site and found 11 bugs automated audits missed — semantic, workflow, interactive, cross-page. Triggered a new audit methodology: journey-based instead of page-based.

**Round 8** — 9-agent audit. 3 discovery agents (data integrity / FAB collision / interactive surface) + 6 user journey agents (PI morning / Coordinator / Grant management / Data entry / Research reader / Mobile PI). Full reports in `review/round8-*.md`; consolidated in `review/round8-AGGREGATED-FINDINGS.md`.

Key findings that reshaped the roadmap:
- `grants.status` column didn't exist in D1 at all — Nick's taxonomy problem was a schema gap, not a UI bug
- One line of CSS (`PortalLayout.tsx:258` `max()` misuse) caused 51 FAB collisions on every route at every viewport
- Playwright `X-Test-Mode: true` header routes to an empty test DB — prior inspection pass counts on data-rich pages may be inflated false positives
- CLAUDE.md Component Coverage table has at least 2 stale claims (N-key on /decisions, Copy bibliography on /publications) that do not work

**Round 9: COMPLETE** (2 commits, 1 deploy, 2026-04-13). Blockers + one-liners. Closed 6 of Nick's 11 bugs.
- R9-1 FAB collision: replaced `max()` with `--fab-stack-{1,2,3}` CSS vars in `:root` + <768px media query. Rewires `PortalLayout.tsx`, `ScrollToTop.tsx`, `QuickCaptureInbox.tsx`.
- R9-2 Date picker flash (Nick #10): removed `showPicker()` + onBlur setTimeout fighting the preset strip.
- R9-3 Row click anywhere opens detail (Nick #9): TaskGridView row onClick falls through to `onOpenDetail`.
- R9-4 ProjectSelect panel corruption (Nick #12): ported to `createPortal` pattern matching InlineSelect.
- R9-5 Grants progress bar clipping (Nick #2): row `height` → `minHeight`, dropped `overflow:hidden`.
- R9-6 TaskDetailPanel preload (Nick #8): `requestIdleCallback(loadTaskDetailPanel)` on MyTasks mount eliminates Tiptap 400ms first-click delay.
- R9-7 Mobile QuickAdd focus: imperative `focus()` via `requestAnimationFrame` unblocks iOS autofocus flake inside AnimatePresence.
- R9-8 D1 cleanup (DI-3, DI-8): 2 test grants deleted, 20 NULL-status tasks repaired, sync-bulk endpoint guards status/priority against null.
- R9-9 Dashboard resizable+draggable cards: `react-grid-layout@1.5.3` replaces the DndContext-only pattern. Per-user+section localStorage layout persistence, drag handle + SE resize handle with hover-reveal, theme-matched CSS overrides, reduced-motion respected.
- Post-deploy: `inspection.spec.ts` 212 passed / 0 failed / 2 skipped (6 min).

**Round 10: COMMITTED not deployed** (1 commit, 2026-04-13). Semantic corrections. Commit `145ed8e`.
- R10-1/R10-2: `grants.status` column added via schema migration. Bulk-classified K23 provider practice variation in mechanical ventilation as `funded`, all 4 others as `in_preparation` (conservative default). SQL already applied to prod D1.
- R10-3: Grant status taxonomy UI — `GRANT_STATUS_OPTIONS` (7 values: planning/in_preparation/submitted/funded/resubmission/declined/closed) + `useUpdateGrant` optimistic mutation + `PATCH /api/grants/:id` endpoint with field allowlist + status enum validation + InlineSelect wired on Grants row with undo toast. Closes Nick bug #1.
- R10-4: Project status reuses task vocabulary — `active`/`waiting_external`/`blocked`/`done`. All 64 projects lowercased in D1. `PROJECT_STATUS_OPTIONS` + `normalizeProjectStatus()` + `isProjectActive()` helpers in `src/lib/taskConstants.ts`. 12 frontend files + 4 API routes updated to use helper or lowercase literal.
- R10-5: Meeting dedup normalizer — `normalizeMeetingTitle()` lowercases, trims, collapses whitespace. Prevents "Lab Meeting" / "lab  meeting" duplicates (DI-7).
- **Deployed 2026-04-15** as part of Everything Sprint v2 (was blocked 2026-04-13 by Workers free-tier cap). Workers Paid plan now active.

**Closed by Everything Sprint v2 (2026-04-15):** R11 ✓, R12 ✓, Test infra ✓ (Miniflare replaced X-Test-Mode). See section below.

**Still open:**
- **R13 Research Digest Model B** (~8h): comments, cross-date saved library, persistent link badge, multi-user save state, private notes, NIH Reporter PI-name search
- **DI-4 duplicate projects**: handled by another session (confirmed by Nick)
- **DI-6 dangling task project_id** (330 rows): sync_d1_push.py slug-alignment work, not touched
- **Hermes polling 10s → 60s** (saves 7,200 req/day)

Decisions locked: grant + project taxonomies approved. Research Digest = Model B. Dashboard cards resizable via RGL. Workers Paid plan active (upgraded 2026-04-15).

