# Session Handoff — 2026-04-10 (marathon session, 11 commits, 8 deploys)

## Summary

Massive visual QA + feature sprint. 4 design consultants audited the site. 150+ files changed across 11 commits. Started at 6.1/10, ended at estimated 8.0-8.5/10.

## Commits (11)

1. **Visual QA fixes** (2b402b3) — Neutral dark surfaces (--cream chroma 0.015→0.005→0), 16 hardcoded hex values purged, sidebar luminance, card title weight 400→500, date picker pending-value fix, column proportions, hover-only badges, light mode card borders, table overflow-x, settings containers
2. **5 features** (31a2d83) — Drag-drop Focus Next (@dnd-kit), sign-in link, batch task updates (BulkActionToolbar), PROJECT column on TaskGridView, subtask expand rendering fix
3. **Systemic sweep** (efa99e0) — 222 gold→neutral borders across 55 files, sign-in links ×7, project info on all task views (StandUp, Board, Timeline, Deadlines), subtask DnD on both surfaces, badge opacity 0.12→0.15, Projects column widths, pipeline #f5f5f5→var(--ice), MyTasks grouped batch selection
4. **More features** (cbfc387) — Batch updates on Deadlines/ProjectDetail/MeetingDetail, dashboard card drag-drop, meeting action item reorder, DateInput pending-value consistency
5. **Design polish** (18635a8) — Softer borders (Linear values), letter-spacing tokens applied, softer row separators (luminance shifts), light mode surface elevation (#fafafa page bg), card shadow-as-border technique
6. **Consultant recs** (efa7373) — Sidebar darker than content (color-mix black 12%), surface steps widened (3%/6%/10%), true achromatic base (zero hue), --teal-subtle token, teal desaturation, badge weight reduction (11px/500), card inset highlight
7. **Final features** (a1cc538) — project_id sync fix (slug generation from names), Pin-to-Focus button on hover, column resize with drag handles, Recharts charts (velocity + age distribution), MetricCard sparklines, email digest system (endpoint + preview + send), useTableConfig hook
8. **Digest bugfix** (213ea47) — activity_log uses timestamp not created_at
9. **Enhancement sweep** (ea8640e) — "Waiting On" PI view with staleness badges, Team Workload Forecast heatmap, `waiting_external` task status (orange pill), shared ColumnHeader/TableContainer, multi-column sort (Shift+Click), PageLayout wrapper, project document links (schema+API+frontend), analytics time-range selector (7d/4w/3m/All), activity heatmap moved above fold, 138 instances 9px→10px, --muted token unified, priority badge opacity 0.7, project tags neutral bg + left-border accent, --teal chroma lowered
10. **Column drag reorder** (a2edd4d) — Separate DndContext for horizontal column reorder, SortableColumnHeader with GripVertical, persisted to localStorage, coexists with subtask DnD + column resize + sort

## New Features Built

### Task Grid (TaskGridView.tsx — now 1000+ lines)
- Column resize (drag handles, min widths, localStorage persistence)
- Column reorder (drag headers, horizontal DnD)
- Cell focus ring (2px teal outline, Tab/Shift+Tab between cells)
- Multi-column sort (Shift+Click, ①② rank indicators)
- Pin-to-Focus button on hover actions
- PROJECT column with InlineCellSelect dropdown
- Hover-only age/project badges
- Semantic column widths (120/110/130/90px)
- Frozen first column at ≤1024px (sticky positioning)
- Table config persistence (useTableConfig hook: sort, widths, column order → localStorage)
- Reset View button (RotateCcw, detects non-default config)
- Shared ColumnHeader component (src/components/table/)

### Batch Updates
- BulkActionToolbar: Status dropdown added (Complete/Reopen/Reassign/Priority/Snooze/Delete)
- Works on: Tasks, MyTasks, MyTasks grouped view, Deadlines, ProjectDetail tasks, MeetingDetail action items
- Threshold: appears when 2+ items selected

### Drag-and-Drop (@dnd-kit)
- Focus Next: GripVertical handles, SortableFocusItem
- Subtasks: both SubtaskSection (detail panel) + InlineSubtaskRow (grid), useReorderSubtasks mutation
- Dashboard cards: rectSortingStrategy, SortableCardWrapper, localStorage order
- Meeting action items: SortableActionItem, session-local order
- Column headers: horizontalListSortingStrategy, SortableColumnHeader

### PI Oversight
- "Waiting On" QuickFilter — gold pill, shows tasks delegated to others, staleness badges (Xd waiting)
- Team Workload Forecast — heatmap on Analytics, green/gold/red by task count per week per person
- `waiting_external` status — orange pill, wired across all task surfaces + API

### Project Documents
- Schema v38: project_documents table (id, project_id, title, url, doc_type, created_at)
- API: GET/POST/DELETE /api/projects/:slug/documents
- Frontend: ProjectDocuments component on ProjectDetail overview tab
- Preset quick-add: Box Folder, Google Doc, Dataset, Protocol

### Analytics
- Recharts integration (Task Velocity BarChart, Task Age Distribution histogram)
- MetricCard sparklines (8-week trailing SVG polyline)
- Time-range selector (7d/4w/3m/All)
- Activity heatmap moved above the fold

### Email Digest
- POST /api/digest-email (generate JSON+HTML)
- GET /api/digest-preview?member=nick (browser preview)
- POST /api/digest-email/send (via Resend, needs API key)
- Sections: overdue, due today, meetings, recent activity
- Dark header, color-coded sections, Open Hub CTA

### Other
- InlineDatePicker + DateInput: pending-value pattern (month nav doesn't trigger save)
- 8 sign-in links across all anonymous surfaces
- Project sync fix: brain.db slug generation from project names (68 tasks synced)
- Sync script handles missing short_name column gracefully
- Relay sent to home laptop for brain.db migration

## Design System Changes

### Dark Mode
- True achromatic base: `--cream: oklch(0.12 0 0)` (zero hue, zero chroma)
- Sidebar: `color-mix(in oklch, var(--cream), black 12%)` — darker than content (3-plane depth)
- Surface steps widened: --surface-1=3%, --surface-2=6%, --surface-3=10% (was 2/4/6)
- Borders softened: --border-subtle=0.05, --border-default=0.08, --border-strong=0.12
- Card inset highlight: `inset 0 1px 0 rgba(255,255,255,0.03)` (Linear pattern)
- --teal: oklch(0.65 0.07 190) (lower chroma, less teal wash)
- --teal-subtle: oklch(0.55 0.04 190) (for ambient/background uses)

### Light Mode
- Page bg: #f5f5f5 (was #fafafa — stronger card contrast)
- Card shadows: 3-layer (`0 0 0 1px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.06), 0 2px 6px rgba(0,0,0,0.03)`)
- Card border: box-shadow technique (not CSS border)

### Typography
- Letter-spacing: h1/h2 get --tracking-heading (-0.02em), text-2xl/3xl get --tracking-display (-0.04em)
- 138 instances of 9px text → 10px minimum (--text-micro updated)
- 8 modal/section heading weights 400→500
- Badge: 12px/600 → 11px/500, tighter padding

### Borders
- 222 structural --border-light (gold) → --border-subtle (neutral) across 55 files
- Gold preserved only for: filter toggle inactive states, intentional brand accents
- --muted: dark mode now `color-mix(in oklch, var(--ink) 70%, transparent)` (derived from ink)

### Status/Priority
- STATUS_BG: 0.12→0.15 opacity (light mode readability)
- PRIORITY_CONFIG.bg: 0.1→0.14 opacity
- Priority badges: opacity 0.7 for quieter visual weight
- Project tags: neutral bg + 2px teal left-border accent
- `waiting_external` status added (orange pill)

## Consultant Scores

| Consultant | Score | Key Insight |
|-----------|-------|-------------|
| SaaS Product Designer | 7.4/10 | "Token architecture genuinely exceptional. Gap is cross-page consistency." |
| Dark Mode Specialist | 7.0/10 | "Good foundation. Sidebar=page bg was the biggest sin." |
| Data Viz + Tables | 7.2/10 | "Priority left-border accent is innovative. Column resize was #1 need." |
| Academic Research UX | 8.2/10 | "Manuscript lifecycle 9/10. Killer feature: automated progress reports." |

## Test Results

- Post-fix Playwright audit: 43 PASS, 0 FAIL
- Zero console errors across all 18 portal pages
- Zero test data in production (51 entries cleaned)
- Build passes cleanly

## Only 2 Items Deferred

1. Table row height decrease (line-height 1.6→1.35) — user choice
2. Automated progress report generator — user said "not now, maybe later"

## Deploy Command
```bash
cd /c/Users/ingra/mn-ccore-lab && npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab
```
