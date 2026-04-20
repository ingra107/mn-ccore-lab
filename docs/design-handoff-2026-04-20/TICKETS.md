# MN-CCORE Hub — Implementation Tickets

33 tickets · 8 P1 · 14 P2 · 11 P3 · HEAD `ef604db`

Work top to bottom. Each ticket is self-contained: problem, fix, acceptance.

File paths assume the repo root of `github.com/ingra107/mn-ccore-lab`. Paths prefixed `src/` are live source; paths prefixed `reference/` are the handoff bundle for context.

---

# P1 · Ship-blockers (before Tuesday 11am)

These are bugs a stakeholder will see in the demo. All are small changes, mostly data-layer or string-formatting.

---

## P1-01 · Filter `test_delete_*` + `deep-audit-sync-*` fixtures everywhere

**Screenshots:** `desktop-02-personal.png`, `desktop-04-calendar.png`, `desktop-16-mentee-milestones.png`

**Problem.** QA test-fixture titles are leaking into production-facing surfaces:

- **My Hub → Recent Activity:** 5 of 5 entries are `Deleted task: test_delete_*` or `deep-audit-sync-*___cli_edit`
- **My Hub → Regulatory banner:** `test_delete_CCI-ARDS Data Use Agreement`
- **Lab Calendar:** every non-meeting event title begins `test_delete_preflight...` or `test_delete_audit...`
- **Mentee Milestones:** every milestone title begins `test_delete_`

**Fix.** Add one shared predicate and apply at every aggregation point.

```ts
// src/lib/isProductionVisible.ts (new file)
const HIDDEN_TITLE_PATTERNS = [
  /^test_delete_/i,
  /^deep-audit-sync-/i,
  /___cli_edit$/i,
]

export function isProductionVisible(title: string | null | undefined): boolean {
  if (!title) return true
  return !HIDDEN_TITLE_PATTERNS.some((re) => re.test(title))
}

export function isProductionVisibleActivity(activity: { title?: string; description?: string }): boolean {
  return isProductionVisible(activity.title) && isProductionVisible(activity.description)
}
```

**Call sites to update** (grep for these symbols):

1. `src/components/RecentActivity.tsx` — filter `activities` before render
2. `src/components/MyItems.tsx` — filter the regulatory-banner query
3. `src/pages/Calendar.tsx` (or `src/components/Calendar.tsx`) — filter event aggregation
4. `src/pages/MenteeMilestones.tsx` — filter `milestones` query
5. Activity feed at `/activity` — same filter

Wrap the query result, not the render loop — cleaner and avoids count-mismatch.

**Escape hatch.** Add a Settings toggle `Show debug/test items` that disables the filter when `localStorage.getItem('showDebugItems') === 'true'`. Off by default.

**Acceptance.**
- My Hub Recent Activity shows real activity only (or an empty-state if there isn't any)
- Calendar renders zero `test_delete_*` events
- Mentee Milestones page either shows real data or an empty state with "Seed milestones →" CTA (see P1-07)
- Settings has a debug toggle that restores them for QA

---

## P1-02 · Fix `undefined '23` on PI Dashboard Publications per Quarter

**Screenshot:** `desktop-15-pi-analytics.png`

**Problem.** X-axis labels on the Publications per Quarter chart read:
```
undefined '23   undefined '24   undefined '25   undefined '26
```

**Fix.** Find the label formatter (likely in `src/pages/PiAnalytics.tsx` or a chart helper). The template string is missing the `quarter` variable. It should be:

```ts
// Wrong (current):
const label = `${quarterLabel} '${String(year).slice(2)}`
// where quarterLabel is `undefined` because the data shape doesn't expose it

// Right:
const label = `Q${datum.quarter} '${String(datum.year).slice(2)}`
// e.g. "Q1 '23", "Q2 '23", "Q3 '23", "Q4 '23"
```

Grep for `'2` (in single-quoted year suffixes) or `Publications per Quarter` to find the chart config.

**Acceptance.**
- All 16 quarters (Q1 '23 through Q4 '26) render with `Q<n> '<yy>` format
- No `undefined` anywhere on the chart

---

## P1-03 · Dedupe meeting action items

**Screenshot:** `desktop-13-meetings.png`

**Problem.** The Action Items list on Meeting Hub shows Cartesian duplicates:
- "Address PF-v-SF reviewer comment #3" × 2 (both Nick, Apr 1)
- "Pull updated CCI cohort counts" × 2 (both Casey, Apr 4)
- "Draft Volume vs Pressure Control" × 2 (both Nick, Mar 25)
- "Finalize GDMS survey REDCap" × 2 (both Emma, Mar 31)

**Fix.** There's already a dedupe pattern in `src/components/MyItems.tsx:681` — reuse it:

```ts
// src/components/MeetingDetail.tsx (or wherever actionItems renders)
function dedupeActionItems(items: ActionItem[]): ActionItem[] {
  const seen = new Map<string, ActionItem>()
  for (const item of items) {
    const normalized = (item.description || item.title || '')
      .replace(/^\[Carried forward\]\s*/i, '')
      .toLowerCase()
      .trim()
    const key = `${normalized}::${item.assignee_id ?? item.assignee}::${item.due_date ?? ''}`
    const existing = seen.get(key)
    // Keep the one with the most recent updated_at, or merge if needed
    if (!existing || (item.updated_at ?? '') > (existing.updated_at ?? '')) {
      seen.set(key, item)
    }
  }
  return Array.from(seen.values())
}
```

**Root cause worth investigating after ship.** The join is probably producing duplicates at the query level (task × assignee or task × meeting). Fix the query, not just the render — but dedupe-in-render is fine for Tuesday.

**Acceptance.**
- Each meeting's Action Items list has unique (title + assignee + due) tuples
- No visual duplicates across MeetingDetail or Meeting summary cards

---

## P1-04 · Fix Team Engagement scoring — anonymous=13,410, real members=0

**Screenshot:** `desktop-15-pi-analytics.png`

**Problem.** Team Engagement block shows `anonymous: 13,410` at the top while every real team member shows `0`. Two root causes possible:

1. Events are being logged without a `user_id`, falling into the anonymous bucket
2. Real members' `user_id` in event rows doesn't match `user_id` in their profile — join produces empty matches

**Fix.**

```ts
// 1. In the scoring query, exclude the anonymous bucket from the leaderboard
const engagement = events
  .filter((e) => e.user_id != null && e.user_id !== 'anonymous')
  .reduce(/* ... */)

// 2. Investigate why logged-in members score 0:
//    - Check if events.user_id is the Supabase auth.user.id
//    - Check if team_members.user_id uses the same key
//    - Look for a join like: events.user_id → team_members.email (mismatch)
```

Log a sample of `events` rows — if `user_id` is `null` or `'anonymous'` on rows you'd expect to be Nick's, the event logger has the bug (probably missing `auth.getUser()` call before insert).

**Acceptance.**
- Team Engagement shows real members with non-zero scores ordered high-to-low
- Anonymous bucket hidden OR labeled "Unattributed events" as a footnote

---

## P1-05 · Dismiss "Click a meeting for prep and actions" tooltip

**Screenshot:** `desktop-13-meetings.png`

**Problem.** Tooltip floats over the Decisions/action area of Meeting Hub and never dismisses. Looks like a stuck modal.

**Fix.**

```tsx
// src/components/Meetings.tsx (or wherever the tooltip lives)
const [showHint, setShowHint] = useState(
  () => localStorage.getItem('meetingHintDismissed') !== 'true'
)

useEffect(() => {
  function dismiss() {
    setShowHint(false)
    localStorage.setItem('meetingHintDismissed', 'true')
  }
  // Dismiss on first meeting click OR after 10s OR on explicit close
  // ...
}, [])
```

If the tooltip is in `src/components/PageTooltip.tsx` (seen in file list), add a `dismissKey` prop that persists to localStorage.

**Acceptance.**
- Tooltip disappears after first meeting click AND after manually closing
- Never re-appears in the same browser

---

## P1-06 · Label or replace the 4 hero numbers on public Home

**Screenshot:** `desktop-00-home-public.png`

**Problem.** Public home hero renders `02 · 09 · 22 · 14` as four unlabeled number boxes. Reads as placeholder debug values to external visitors.

**Fix — choose one:**

**Option A (fastest, recommended):** Label them.

```tsx
// src/components/Home.tsx — public hero
const HERO_METRICS = [
  { value: 63, label: 'Active Projects' },
  { value: 58, label: 'Publications' },
  { value: 22, label: 'Grants' },
  { value: 14, label: 'Trainees' },
]
```

Numbers must be real — pull from the same sources that feed `/dashboard`. Don't hand-type; these will drift.

**Option B:** Drop the stats entirely, replace with a one-sentence positioning line in Fraunces italic:

```tsx
<h1 className="font-serif text-6xl italic text-gold">
  Critical care research, organized.
</h1>
<p className="mt-4 text-xl text-ink-dim">
  The operational backbone for MN-CCORE — 63 active projects, 7 consortia, one source of truth.
</p>
```

**Acceptance.**
- No unlabeled numbers on public Home
- Numbers (if kept) are live-sourced, not hard-coded

---

## P1-07 · Seed real Mentee Milestones

**Screenshot:** `desktop-16-mentee-milestones.png`

**Problem.** Every milestone on `/mentee-milestones` is `test_delete_*`. After P1-01 filter, the page will be mostly empty — which is worse for Tuesday than showing real data.

**Fix.** Seed 3–4 plausible milestones per trainee directly in Supabase (Kendall, Casey, Dan). Mix types: Presentation, Certification, Manuscript, Abstract, Coursework. Some past (done), some future (upcoming). Examples:

```
Kendall:
  ✓ IRB Training Module 3 — Completed Mar 14
  · Abstract: AKI cohort preliminary analysis — Due May 1
  · Presentation: Lab meeting — Due May 15
  · Manuscript: First-author submission target — Due Aug 30

Casey:
  ✓ REDCap Advanced Workshop — Completed Feb 22
  · Grant: T32 application draft — Due May 10
  · Presentation: ATS 2026 abstract — Due Jun 1

Dan:
  ✓ Coursework: Causal Inference (PubH 7485) — Completed Dec 2025
  · Exam: Prelim oral — Due Jun 15
  · Manuscript: Methods paper coauthor — Due Sep 1
```

Coordinate with Nick on the actual commitments — don't fabricate academic obligations.

**Acceptance.**
- Mentee Milestones page shows real data for all three trainees
- Mix of done + upcoming visible in each trainee's column
- P1-01 filter doesn't empty the page

---

## P1-08 · Suppress empty Senior Mentors section on public Team page

**Screenshot:** `desktop-19-team-public.png`

**Problem.** `/team` (public) shows Co-Directors (Nick, Nathan) correctly, then two empty sections under "Senior Mentors" and another heading. Looks abandoned.

**Fix.**

```tsx
// src/components/Contact.tsx or src/pages/Team.tsx
{seniorMentors.length > 0 && (
  <section>
    <h2>Senior Mentors</h2>
    {/* ... */}
  </section>
)}
```

If `team_members` table has role data, populate these with Adams Dudley, Jeff Chipman (seen in Settings). Otherwise, hide the heading entirely.

**Acceptance.**
- No empty `<h2>` headings on public Team page
- If data exists, sections populate; otherwise, headings don't render

---

# P2 · Polish (this week)

Density, scannability, and consistency. Each ticket is 1–4 hours.

---

## P2-01 · Strip `[Carried forward]` prefix from task titles, lift to chip column

**Screenshots:** `desktop-02-personal.png`, `desktop-03-my-tasks.png`

**Problem.** Every task title starts with `[Carried forward]` — 17 characters of meta-noise on every row, swallowing the actual title column.

**Fix.**

```tsx
// src/components/TaskRow.tsx (or wherever tasks render)
function stripCarriedPrefix(title: string): { clean: string; isCarried: boolean; daysCarried?: number } {
  const match = title.match(/^\[Carried forward(?:\s+(\d+)d)?\]\s*(.*)$/i)
  if (match) {
    return { clean: match[2], isCarried: true, daysCarried: match[1] ? parseInt(match[1]) : undefined }
  }
  return { clean: title, isCarried: false }
}

// In the row:
<td>
  {task.isCarried && (
    <span className="inline-flex items-center gap-1 text-xs text-amber">
      <RotateIcon className="h-3 w-3" />
      {task.daysCarried ? `${task.daysCarried}d` : 'carried'}
    </span>
  )}
  <span>{task.clean}</span>
</td>
```

Don't just hide the prefix — the carried-forward state is useful info. Put it in a dedicated mini-column or inline-before-title chip.

**Acceptance.**
- Task titles never show `[Carried forward]` literal text
- A compact chip or glyph indicates carried-forward state
- If days-carried is computable, show it

---

## P2-02 · Lift `CLIF:` prefix off project titles; add Consortium filter column

**Screenshot:** `desktop-06-projects.png`

**Problem.** ~30 of 60 project titles start with `CLIF: `. The prefix dominates every row.

**Fix.** The infrastructure is already there — `src/components/CategoryIcon.tsx` defines `CATEGORY_LABEL.clif = 'CLIF'`.

```tsx
// src/pages/Projects/ProjectsList.tsx
function stripConsortiumPrefix(title: string): { clean: string; consortium?: string } {
  const match = title.match(/^(CLIF|MN-CCORE|UMN|ATS|RO1|K23):\s*(.*)$/i)
  if (match) return { clean: match[2], consortium: match[1].toUpperCase() }
  return { clean: title }
}
```

Add a new column "Consortium" between Title and Stage, rendering a chip with the existing `CATEGORY_COLOR` token. Make it filterable — click the chip, filter to that consortium.

**Acceptance.**
- Project titles average ~25 chars (down from ~40)
- New Consortium column with colored chips
- Clicking a chip filters the list

---

## P2-03 · Sub-bucket OVERDUE by age on Tasks and Deadlines

**Screenshots:** `desktop-03-my-tasks.png`, `desktop-05-deadlines.png`

**Problem.** OVERDUE sections have 36–43 flat rows. A 74-day-overdue project tracker scans the same as a 3-day-overdue galley proof.

**Fix.** Sub-group OVERDUE into 3 buckets:
- **Critical · 60d+** (red accent)
- **Urgent · 30–60d** (amber accent)
- **Recent · <30d** (slate)

Only split when OVERDUE has >15 items; keep flat below that threshold.

Reuse the existing section-header pattern from `src/components/DeadlineCascade.tsx` — don't invent new chrome.

**Acceptance.**
- OVERDUE splits into 3 visually distinct sub-sections when count >15
- Counts per sub-bucket visible in header
- Colors match the existing urgency palette (red/amber/slate)

---

## P2-04 · Collapse Research Digest filter rows

**Screenshot:** `desktop-11-digest.png`

**Problem.** Three rows of filter controls stack above results (tag row, time-bucket row, sort/type row). Roughly 18 controls before the first result.

**Fix.**

```tsx
// src/components/Digest.tsx
// Row 1: primary tag chips, horizontal-scroll on overflow
// Row 2: single compound "Sort by <time> / <type>" dropdown

// Move everything else (source, author, consortium) behind a "Filters" button
// that opens a Radix Sheet/Dialog
```

**Acceptance.**
- Max 2 filter rows visible by default
- "Filters" button opens a side sheet for advanced filters
- Active filter count shown as a badge on the button

---

## P2-05 · Tabbed Settings layout

**Screenshot:** `desktop-18-settings.png`

**Problem.** Settings is one long vertical scroll with 9 distinct concerns.

**Fix.** Left-rail tabs:
- Profile · Basic info + avatar
- Templates · Workflow templates
- AI · Meeting context notes
- Appearance · Theme
- Danger Zone · Reset

Use Radix Tabs (already in the stack). Hash-route for deep linking (`/settings#ai`).

**Acceptance.**
- Left rail with 5 tabs
- Each tab's content fits above the fold on a 900px viewport (or scrolls within the tab panel, not the page)
- URL hash updates on tab change

---

## P2-06 · Soften "Silent 32d" → "Needs check-in · 32d" on Mentee Milestones

**Screenshot:** `desktop-16-mentee-milestones.png`

**Problem.** "Silent" is harsh language for a trainee status.

**Fix.**

```tsx
// src/components/MenteeDashboard.tsx
function activityLabel(daysSinceActivity: number): { label: string; tone: 'ok' | 'soft' | 'warn' } {
  if (daysSinceActivity < 7) return { label: `Active · ${daysSinceActivity}d`, tone: 'ok' }
  if (daysSinceActivity < 21) return { label: `Quiet · ${daysSinceActivity}d`, tone: 'soft' }
  return { label: `Needs check-in · ${daysSinceActivity}d`, tone: 'warn' }
}
```

Visual treatment: `warn` = amber, not red. We're not calling out the trainee, we're surfacing a PI action.

**Acceptance.**
- No "Silent" label anywhere
- "Needs check-in" uses amber, not red
- Active/Quiet thresholds match the new function

---

## P2-07 · Hide PB Sector from primary nav until launch

**Screenshot:** `desktop-17-pb-sector.png`

**Problem.** `/pb-sector` is a dead-end empty state in primary nav.

**Fix.**

```tsx
// src/components/Layout.tsx (or Sidebar)
const FEATURE_FLAGS = {
  peripheralBrain: false,  // flip when PB ships
}

// In nav item list:
{FEATURE_FLAGS.peripheralBrain && <NavItem to="/pb-sector" />}
```

Don't just remove the entry — leave the route + empty state so direct-link access still works, just hide the nav until the feature is real.

**Acceptance.**
- PB Sector not in sidebar by default
- Direct visit to `/pb-sector` still works (shows empty state)
- One-flag flip re-enables the nav entry

---

## P2-08 · Mobile tab-bar safe-area padding

**Screenshot:** `mobile-01-dashboard.png`

**Problem.** Bottom tab bar overlaps dashboard cards on mobile.

**Fix.**

```tsx
// src/components/Layout.tsx — main scroll container on mobile
<main className="pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-0">
```

Or wrap `MobileTabBar.tsx` with `paddingBottom: env(safe-area-inset-bottom)` on the bar itself.

**Acceptance.**
- Last card on Dashboard, Tasks, Projects is fully visible on iPhone 14+ viewport
- Tab bar sits flush with safe area on notched devices

---

## P2-09 · Analytics zero-value delta chips

**Screenshot:** `desktop-14-analytics.png`

**Problem.** Hero cards showing `0` with no context read as deflating/broken.

**Fix.** Add YoY or MoM delta chip below each hero number:

```tsx
<div className="text-5xl font-serif tabular-nums">{current}</div>
<div className="mt-1 text-xs flex items-center gap-1">
  {delta > 0 && <span className="text-green">▲ {delta}</span>}
  {delta < 0 && <span className="text-red">▼ {Math.abs(delta)}</span>}
  {delta === 0 && <span className="text-ink-faint">→ no change</span>}
  <span className="text-ink-faint">vs {previousLabel}</span>
</div>
```

**Acceptance.**
- Every hero metric has a delta chip
- Zeros contextualized (no change / vs 12 prev / etc)

---

## P2-10 · Ideas Board kanban-first view

**Screenshot:** `desktop-09-ideas.png`

**Problem.** The pipeline (New → Under Review → Approved → Parked) renders as top pills but the list below is flat. The data model is kanban; the UI should be too.

**Fix.** Default to 4 columns matching pipeline states. Add a secondary "List" toggle for the flat view.

Use existing card components; columns are horizontal-scroll on narrow viewports.

**Acceptance.**
- `/ideas` opens to kanban view
- Drag-to-reassign between columns works (or falls back to dropdown change)
- List view still available as a toggle

---

## P2-11 · Decision Log outcome → right-most pill

**Screenshot:** `desktop-10-decisions.png`

**Problem.** In a decision log, outcome is the primary answer. Currently demoted to middle column.

**Fix.** Reorder columns: Title · Context · Tags · **Outcome** (right-most). Render Outcome as a prominent pill (Pending gold / Recorded teal / Revisited amber / Neutral slate).

**Acceptance.**
- Outcome column is right-most
- Outcome renders as a pill, not a dropdown
- Clicking the pill opens the state-change picker (inline edit preserved)

---

## P2-12 · Publications page grouped by year + at-a-glance bar

**Screenshot:** `desktop-22-publications.png`

**Problem.** Flat list of ~60 publications, no landmarks.

**Fix.**

```tsx
// Group by year, sticky year headers
// At top, one-row summary:
<div className="flex gap-6 text-sm border-b pb-4 mb-8">
  <div><span className="text-3xl font-serif">58</span> publications</div>
  <div><span className="text-3xl font-serif">22</span> journals</div>
  <div><span className="text-3xl font-serif">14</span> first-authors</div>
  <div><span className="text-3xl font-serif">6</span> 2026</div>
</div>
```

**Acceptance.**
- Year headers stick when scrolling
- At-a-glance bar at top with 4 stats
- Year groups render in reverse-chrono

---

## P2-13 · Collaboration Network label collision

**Screenshot:** `desktop-23-network.png`

**Problem.** Hub nodes (Ingraham, Mesfin) have labels overlapping with neighbors.

**Fix.** If using `force-graph`, enable `dagMode: null` + `nodeCanvasObject` with collision-aware label positioning. Or: always-on labels for top-10 nodes by paper count, hover-only for the rest.

```tsx
// src/components/CollaborationGraph.tsx
const TOP_N = 10
const alwaysLabel = new Set(topByPaperCount(nodes, TOP_N).map(n => n.id))

// In nodeCanvasObject:
if (alwaysLabel.has(node.id) || node === hoveredNode) {
  // draw label
}
```

**Acceptance.**
- Hub nodes always labeled
- No overlapping text at default zoom
- Hover reveals labels on smaller nodes

---

## P2-14 · Post-Award Milestones populated state

**Screenshot:** `desktop-12-grants.png`

**Problem.** Empty state exists; populated state doesn't. Once a grant is Funded, there's nothing to render into.

**Fix.** Design the populated state now in `reference/ui-kit/` — a timeline of NIH reporting milestones (Annual Report due, No-Cost Extension window, Final Invention Statement, etc.) per active grant. Reuse the `DeadlineCascade` treatment.

**Acceptance.**
- `/grants` Post-Award tab renders real milestone data for any Funded grant
- Empty state only shows when there are zero Funded grants

---

# P3 · Next phase (next quarter)

New surfaces and deeper redesigns. Each is a small project.

---

## P3-01 · Lab-TV — extend Pulse Kiosk to 5 slides

**Screenshot:** `desktop-24-pulse-kiosk.png`

Extend `/pulse` from one slide to five. Each slide: single load-bearing idea in giant Fraunces.

1. **The lab, right now.** (current) — 42 · 61 · 19
2. **This week.** — tasks completed, deadlines landed, papers submitted
3. **Shipping.** — phase release callouts, new features
4. **Celebrating.** — recent publications, grant awards, trainee milestones
5. **Calendar.** — next 5 upcoming events

Auto-advance every 30s. Run on a physical lab TV or Raspberry Pi → HDMI.

**Deliverable.** Five slide components in `src/pages/Pulse/slides/`. localStorage pause toggle.

---

## P3-02 · Dashboard Project Health heatmap

**Screenshot:** `desktop-01-dashboard.png`

Replace the "CLI..." truncated list with a 63-cell heatmap. One cell per project, color-coded (green=healthy / amber=attention / red=at-risk). Hover for project name + stage + last-activity.

---

## P3-03 · Manuscripts "Published" as trophy grid

**Screenshot:** `desktop-08-manuscripts.png`

Published manuscripts shouldn't read the same as drafts. Design a secondary grid view for published papers — cover-style cards with journal, year, citation count, DOI link.

---

## P3-04 · NIH RePORTER search as top-level Grants tab

**Screenshot:** `desktop-12-grants.png`

Lift the existing RePORTER integration out of the footer, make it a top tab. Use it to discover related grants by topic / PI.

---

## P3-05 · Project Detail vertical timeline

**Screenshot:** `desktop-07-project-detail.png`

Replace stacked date bullets with a real vertical timeline — connecting rule, dot glyphs (filled=done, outlined=current, empty=future). Reuses the Stage selector visual language.

---

## P3-06 · Team Engagement drill-down from PI Dashboard

**Screenshot:** `desktop-15-pi-analytics.png`

Link engagement scores to per-member activity views. Click Nick's `47` → his 14-day sparkline + heatmap + top contribution categories.

---

## P3-07 · Publications DB linked to member-page publications card

**Screenshot:** `desktop-20-team-member-portal.png`

Member pages say "Publications will appear here as they are added." Wire up to the same source as `/publications`. Filter by author match.

---

## P3-08 · Calendar dense-week toggle

**Screenshot:** `desktop-04-calendar.png`

Setting to collapse empty weeks to a single-line rule. Default off; power users turn on.

---

## P3-09 · Decisions Timeline view (or remove toggle)

**Screenshot:** `desktop-10-decisions.png`

Either build a real timeline view of decisions (chronological, grouped by month) or remove the unused toggle. Don't leave stubs.

---

## P3-10 · PWA + Apple Watch complication for Pulse

**Screenshot:** `desktop-24-pulse-kiosk.png` + `mobile-24-pulse-kiosk.png`

The Pulse cinematic works at phone size. Ship it as:
- PWA with installable manifest
- Apple Watch complication showing the "right now" numbers
- iOS home-screen widget (WidgetKit)

Low priority but high story value.

---

## P3-11 · Public Home pillars as 4-column iconographic grid

**Screenshot:** `desktop-00-home-public.png`

"Four pillars of critical care research" — currently reads as a paragraph. Render as 4-column grid, each with an icon placeholder + title + 2-line description. If icons aren't ready, use numerals (01 02 03 04) in Fraunces italic.

---

# Progress tracking

- [x] P1-01 · Filter test fixtures
- [x] P1-02 · Fix `undefined '23` labels
- [x] P1-03 · Dedupe action items
- [x] P1-04 · Fix Team Engagement scoring
- [x] P1-05 · Dismiss meeting tooltip
- [x] P1-06 · Label/replace public Home numbers
- [ ] P1-07 · Seed Mentee Milestones — BLOCKED on Nick (don't fabricate trainee commitments)
- [x] P1-08 · Suppress empty mentor sections
- [ ] P2-01 · Strip `[Carried forward]` prefix
- [ ] P2-02 · Strip `CLIF:` prefix + Consortium column
- [ ] P2-03 · OVERDUE sub-buckets
- [ ] P2-04 · Digest filter collapse
- [ ] P2-05 · Tabbed Settings
- [ ] P2-06 · Soften trainee activity labels
- [ ] P2-07 · Hide PB Sector nav
- [ ] P2-08 · Mobile tab-bar padding
- [ ] P2-09 · Analytics delta chips
- [ ] P2-10 · Ideas kanban-first
- [ ] P2-11 · Decision outcome pill
- [ ] P2-12 · Publications grouping + summary
- [ ] P2-13 · Network label collision
- [ ] P2-14 · Post-Award Milestones populated state
- [ ] P3-01 · Lab-TV 5-slide loop
- [ ] P3-02 · Dashboard heatmap
- [ ] P3-03 · Manuscripts trophy grid
- [ ] P3-04 · RePORTER top tab
- [ ] P3-05 · Project timeline vertical
- [ ] P3-06 · Engagement drill-down
- [ ] P3-07 · Member-page publications wiring
- [ ] P3-08 · Calendar dense-week
- [ ] P3-09 · Decisions timeline or remove
- [ ] P3-10 · PWA + Watch complication
- [ ] P3-11 · Home pillars iconographic grid
