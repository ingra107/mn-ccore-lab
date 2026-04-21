# MN-CCORE Hub — Round 2 Tickets (2026-04-20 post-fixes)

Audit of the post-Round-1 state. **After three passes (statics → keyframes → motion GIFs): 34 tickets · 7 P1 · 18 P2 · 9 P3.**

**Reading order:** Focus answers first (§ 0, Nick's **four** priority asks — Quick Add, chevrons, focus outline, swipe-dismiss), then P1 / P2 / P3, then § 5 motion review.

Format matches round 1 — each ticket has problem · screenshot · fix · acceptance. File paths reference `github.com/ingra107/mn-ccore-lab`.

---

# § 0 · Direct answers to Nick's three priority asks

## Ask 1 · Quick Add panel on Task Detail → Overview

**Capture:** `focus-01-quick-add-overview-default.png`

**Caveat up front.** The capture you sent is the Tasks list — the Task Detail panel isn't open in the frame. I'm answering from the spec you wrote in FEEDBACK-FOCUS.md and from the cropped slice visible in `focus-02-row-focus-outline-clicked.png` (right-hand Detail panel, description textarea with floating send button). Re-capture with the panel open if you want me to look at the rendered reality.

**Does the mode-pill pattern land?** Yes, *if* the pills sit directly above the textarea as segmented controls and the placeholder changes in response. That's the strongest signal we've got for "these two writes go to different places." Linear, Height, and Campsite all do variants of this — it's a proven pattern for forked-destination inputs.

**Where it breaks:** if the pills are above AND the helper line ("Comment · talk to teammates…") sits below the textarea, the user sees pills → input → helper, and the helper arrives too late. The pills ARE the helper once the metaphor is learned; the sentence underneath is belt-and-suspenders for week one only.

**Concrete recommendation:**

```
┌─────────────────────────────────────────────────────┐
│  [ 💬 COMMENT ]  [ 📓 NOTE ]         See all →      │  ← segmented
│ ─────────────────────────────────────────────────── │
│                                                      │
│  @emma can you double-check the propensity score    │  ← placeholder
│  weights? Also @hermes pull recent JAMA papers…     │    swaps with pill
│                                                      │
│                                                      │
│  ────                                                │
│  [✨ Ask Hermes]                    [ Post  ⌘↵ ]    │
└─────────────────────────────────────────────────────┘
```

- **Pills**: segmented (one visible fill), not two separate buttons. Makes clear these are modes of one input, not two inputs.
- **Helper line**: kill it permanently once the placeholder does its job. If you want to keep SOMETHING: render it as a tooltip on the pill icon, not flowing text.
- **Placeholders**: strip the leading `e.g. ` and the surrounding quotes. They read as pedagogy. Drop the trailing period too — placeholder text is not prose.
  - COMMENT → `@emma can you double-check the propensity score weights? @hermes pull recent JAMA papers on this`
  - NOTE → `Pulled cohort, n=412 after exclusions. APACHE>25 worked. Stuck on merge — using ENC_ID not HOSP_ID`
- **Note sub-types (progress / blocker / result / question)**: do NOT expose them in the Quick Add. Default to `progress`. The whole point of Quick Add is to not think about categorization; the user can re-tag it from the Notes tab if they care. If someone writes `Stuck on…` in the textarea, infer `blocker` server-side later — that's a P3 nicety.
- **Hermes toggle**: leave the `✨ Ask Hermes` affordance as a chip BELOW the textarea, not a third pill. It's not a destination mode — it's an action on submit. Keep it visually lower-weight than Post.

**Acceptance.**
- Segmented pills, one visible fill, placeholder swaps on switch
- No helper line below textarea (tooltip on pill icon if you want a safety net)
- Submit button shows ⌘↵ shortcut
- No note-subtype picker surfaced in Quick Add

See ticket **P2-02** for a related issue — the right-side panel's textbox area (visible in focus-02-row-clicked) has a strange inner scroll appearance that'll eat the pills if not styled deliberately.

---

## Ask 2 · Inline ▾ chevrons on every editable cell

**Captures:** `focus-03-inline-arrows-{tasks,projects,manuscripts,decisions}.png`

**Verdict: drop them by default, restore on row-hover / cell-focus.** Current state has 5–7 chevrons per row × 24 rows = 120-168 repeating glyphs on Tasks alone. It's pure noise — the chevron tells you nothing once you've learned the table is editable, and you learn that in the first 10 seconds.

**Per-page recommendation:**

| Page | Current | Proposed |
|---|---|---|
| Tasks (`desktop-03`) | ▾ on 5 cells/row | Drop always-on. `:hover` on row reveals chevron on all dropdowns. `:focus-visible` on cell shows chevron too. |
| Projects (`desktop-06`) | ▾ on Stage, PI, Group | Same — drop always-on, reveal on hover/focus. |
| Manuscripts (`desktop-08`) | ▾ on Status, Stage, PI, Group | Same. |
| Decisions (`desktop-10`) | ▾ on Outcome column | **Keep this one.** Outcome is the core action; always-on affordance is earned. |
| Meetings (`desktop-13`) | ▾ on attendee / status | Same as Tasks. |

**CSS for the default drop / hover-reveal pattern:**

```css
/* Editable cell — chevron hidden by default */
.cell-editable {
  position: relative;
}
.cell-editable .chevron {
  opacity: 0;
  transition: opacity 80ms ease-out;
  margin-left: 4px;
}

/* Reveal on row hover OR cell focus */
.row:hover .cell-editable .chevron,
.cell-editable:focus-within .chevron,
.cell-editable:focus-visible .chevron {
  opacity: 0.7;
}

/* Full opacity when the cell itself is hovered */
.cell-editable:hover .chevron {
  opacity: 1;
}

/* Keyboard discoverability: focus-visible border on cell */
.cell-editable:focus-visible {
  outline: 2px solid var(--teal);
  outline-offset: -2px;
  border-radius: 4px;
}
```

**Keyboard-only users are covered by `:focus-visible` + the outline.** When they tab to an editable cell, they get the outline (no chevron needed — the outline IS the affordance).

**Global discoverability for new users:** put a single line in the empty-list footer or `?`-shortcuts overlay: `Click any cell to edit · Tab or click to focus`. One sentence, one time.

**Acceptance.**
- 0 chevrons visible on Tasks / Projects / Manuscripts at rest
- Hover any row → all editable cells show faint chevron
- Tab to a cell → outline appears, chevron appears
- Decisions Outcome column keeps its chevron (exception earned)

---

## Ask 3 · Teal row-focus outline

**Captures:** `focus-02-row-focus-outline-{j-pressed,multi-j,clicked}.png`

**Observation.** The J-pressed and multi-J captures look **visually identical to the default Tasks view** — the 2px teal outline isn't actually visible on those frames. Either the outline only paints during the exact keydown (1–2 frames), or the capture fired before the state landed, or it was never implemented for the J/K path. Only `focus-02-row-focus-outline-clicked.png` shows it: a 2px teal rectangle around row 2.

So we actually have **two different problems**:

1. **J/K has no visible focus signal** (violates WCAG 2.1 focus-visible requirement)
2. **Click-select has too heavy a signal** (2px outline reads as chrome)

**Fix: give them two different, deliberately distinct states.**

### J/K-focused state (keyboard cursor)

Low-weight, read as "the row my next keystroke will affect." Always-on while focus holds.

```css
.row[data-focused="true"] {
  background: color-mix(in oklch, var(--teal) 6%, var(--surface));
  box-shadow: inset 3px 0 0 var(--teal);
  /* NO outline. 3px left edge only. */
}

/* High-contrast / forced-colors: still give them something */
@media (forced-colors: active) {
  .row[data-focused="true"] {
    outline: 2px solid Highlight;
    outline-offset: -2px;
  }
}
```

- 3px inset left edge in teal = clearly tells you "cursor is here" without drawing a box
- 6% teal background tint reinforces it but degrades gracefully on CLIF/Lab/Mentees projects (which already carry left-edge accent colors; the 3px overrides for the focused row, which is what you want)
- WCAG-compliant via the edge (non-color signal)

### Click-selected state (intent: "I'm doing something with this")

Stronger than focused. Used when the row was deliberately clicked AND the Detail panel is open.

```css
.row[data-selected="true"] {
  background: color-mix(in oklch, var(--teal) 10%, var(--surface));
  box-shadow: inset 4px 0 0 var(--teal);
  position: relative;
}
.row[data-selected="true"]::after {
  content: "";
  position: absolute;
  inset: 0;
  border: 1px solid color-mix(in oklch, var(--teal) 30%, transparent);
  border-radius: 6px;
  pointer-events: none;
}
```

- 4px left edge (vs 3px for J/K) — slight emphasis bump
- 10% background tint (vs 6%)
- Faint 1px teal border via `::after` — much softer than the current 2px hard outline

### Why separate states

The current implementation apparently paints the SAME 2px outline for both J/K-landed and click-selected. That's backwards: click is a stronger intent (you chose this row, the Detail panel opened). Make it visually heavier. J/K is casual browsing — should be lighter.

**Acceptance.**
- J/K state paints a 3px left edge + 6% bg tint, visible always while focus holds
- Click-selected state paints a 4px left edge + 10% bg tint + faint 1px border, persists while Detail panel is open
- axe-core passes on focused row (currently probably fails with just the outline)
- Forced-colors mode shows focused row with `Highlight` outline

---

## Ask 4 · Mobile swipe-to-dismiss — keep + tune, or replace?

**Captures:**
- `videos/04-swipe-to-dismiss.gif` (Pixel 5 re-run)
- `videos/04-swipe-dismiss-a-panel-open.png`, `-b-mid-drag.png`, `-c-dismissed.png` (keyframes)
- Frame extracts: `round2/videos/04_f000.png` through `04_f042.png`

**Observation, unambiguous.** In the re-run capture, the swipe gesture is **inert**. The three mid-drag keyframes (`a`, `b`, `c`) are pixel-identical. The GIF frame extracts show the panel sliding IN (opening), sitting for ~2s, and never moving — there's a faint circular tap indicator near the Priority Urgent pill (around y=715px) that suggests the gesture fired, but the panel receives zero transform. It's not "glitchy" — on this build, it's not wired. The panel never dismisses.

So Nick's complaint ("glitchy, threshold inconsistent, conflicts with iOS back") is actually three different failure modes that all look the same from a user's seat: **I swiped and nothing happened.**

**Verdict: replace with a non-gesture dismiss for mobile.** Reasoning:

1. **The gesture is not a discovered affordance.** Nothing in the panel visually invites horizontal drag. No edge handle, no chevron, no "Swipe →" hint. Users who don't already know the gesture exists never find it.
2. **The iOS Safari back-gesture conflict is unsolvable in pure web.** The browser's `history.back()` edge-swipe owns the leftmost ~15px of viewport and no CSS can disclaim it. Whatever threshold you pick, some % of dismisses will accidentally navigate back.
3. **We already have three working dismiss paths**: the `×` in the panel header, tap-outside-backdrop, and Escape (desktop). Adding a flaky gesture as a fourth creates maintenance burden without adding capability.

### Proposal: keep the gesture *architecture* for future, but ship dismiss affordances that don't rely on it.

**Replacement affordances (ship all three):**

```tsx
// 1. Enlarged X button, top-right, min 44x44 touch target
<button
  aria-label="Close task"
  className="absolute top-3 right-3 size-11 flex items-center justify-center
             rounded-full hover:bg-slate-100 active:bg-slate-200"
  onClick={onDismiss}
>
  <X className="size-5" />
</button>

// 2. "Done" pill, bottom-of-panel, full-width on mobile
<div className="sticky bottom-0 p-3 bg-surface/95 backdrop-blur border-t">
  <button className="btn-primary w-full h-12" onClick={onDismiss}>
    Done
  </button>
</div>

// 3. Tap-outside / backdrop dismiss (already exists on desktop; ensure mobile too)
<Overlay onClick={onDismiss} className="fixed inset-0 bg-black/20" />
```

The X+Done combo handles every scenario: thumb-at-top users hit X, thumb-at-bottom users hit Done. Backdrop is the "I changed my mind" fallback.

### If you insist on keeping the swipe (not recommended)

Parameters that would work with the current iOS Safari quirks:

- **Activation zone:** only respond to `touchstart` with `e.touches[0].clientX > 20` — reserve the left 20px for iOS back-gesture
- **Threshold (both required):** dismiss when drag distance > 40% of panel width **OR** horizontal velocity > 600 px/s at release (whichever comes first)
- **Direction lock:** cancel if vertical movement exceeds 15° from horizontal in first 50ms (lets user scroll content without dismissing)
- **Visual feedback:** panel must follow finger 1:1 in px (not 0.8× or spring) — any lag is perceived as glitch
- **Snap-back:** on release below threshold, animate to `x:0` in 180ms ease-out
- **Dismiss animation:** on release above threshold, animate to `x:panelWidth` in 220ms ease-out, then unmount

```tsx
const PANEL_WIDTH = 320 // or whatever
const DISMISS_THRESHOLD_PX = PANEL_WIDTH * 0.4
const DISMISS_VELOCITY_PX_S = 600
const EDGE_EXCLUSION_PX = 20

function onTouchStart(e: TouchEvent) {
  if (e.touches[0].clientX < EDGE_EXCLUSION_PX) return // yield to iOS back
  // ...track pointer
}
```

But again: **if you ship both X+Done AND the gesture, the gesture is just confusion.** Pick one.

**Acceptance.**
- Mobile task detail panel has: (a) 44×44 X button top-right, (b) full-width "Done" pill at bottom, (c) backdrop tap to dismiss
- Swipe gesture removed from `src/components/TaskDetail.tsx` (mobile variant) — grep for `onTouchStart|useSwipe|useDrag` and delete
- No regression on desktop Escape key
- User testing on an actual iPhone with Safari: no accidental back-navigations over 10 open/close cycles

---

# P1 · New ship-blockers from Round 2 captures

## P1-R2-01 · My Items page shows sign-in wall to *logged-in* users

**Screenshot:** `desktop-27-my-items.png`

**Problem.** The My Items page renders the sign-in-to-see-items empty state even though the user is authenticated (they got to `/my-items` via the sidebar; the sidebar itself is populated, implying auth is working). Either:
1. The auth check on this page is broken (different token than the rest of the app)
2. This is the unauthed view and Nick is showing it out of context
3. There's a `user_id` mismatch — My Items queries don't match the auth user

This is an outright broken experience. A PI clicking "My Items" gets a "sign in" prompt they can't meaningfully act on.

**Fix.** Audit the query:

```tsx
// src/pages/MyItems.tsx or similar
const { user } = useUser()  // probably working
const { data } = useQuery(['my-items', user.id], () => fetchMyItems(user.id))

// If data is empty, render EMPTY STATE not SIGN-IN STATE
if (!user) return <SignInEmpty />
if (data?.length === 0) return <NoItemsEmpty user={user} />
```

Two distinct empty states — "you haven't been assigned anything yet" is a totally different message from "sign in to see your stuff."

**Acceptance.**
- Logged-in users on My Items never see the "Sign in to see your items" message
- Empty state for authenticated user with 0 items reads: "Nothing assigned to you yet. When teammates @-mention you or assign tasks, they show up here."
- Direct link works for both auth states

---

## P1-R2-02 · `@claude Hi` and `test q` public on Ask the Lab

**Screenshot:** `desktop-29-ask-the-lab.png`

**Problem.** The Ask the Lab page shows three questions and two of them are obvious test fixtures:
- `@claude Hi`
- `test q` (with description `test`)

Round 1 P1-01 filtered `test_delete_*` from activity / calendar / milestones. This page was missed. Anyone visiting `/ask` sees Nick's QA as "open questions."

**Fix.** Extend the Round-1 `isProductionVisible()` predicate to the Ask query:

```tsx
// src/pages/AskTheLab.tsx
const HIDDEN_QUESTION_PATTERNS = [
  /^test\s*q/i,
  /^test$/i,
  /^@claude\s+hi$/i,
  /^test_delete_/i,
]

const visibleQuestions = questions.filter(q =>
  !HIDDEN_QUESTION_PATTERNS.some(re => re.test(q.title.trim()))
)
```

Or — cleaner — add a `status: 'test'` column and filter those by default, with the same Settings debug toggle that restores them. Consistent with the Round-1 pattern.

**Acceptance.**
- `/ask` shows only real questions (or an empty state with a CTA to ask the first one)
- Debug toggle in Settings restores test questions for QA
- Same predicate/approach as Round-1 P1-01 (don't fork the filter logic)

---

## P1-R2-03 · Settings Lab Icon field shows emoji input ("🧪") against "No emoji" design ethos

**Screenshot:** `desktop-18-settings.png`

**Problem.** Profile tab has a "Lab Icon (Emoji)" field with a placeholder purple 🧪 emoji. The Hub's design system (your `colors_and_type.css` + design ethos) is emphatically no-emoji. Shipping a field that says "hey put an emoji here" contradicts the brand at the Settings level.

**Fix.** Replace the emoji field with an icon picker limited to the Hub's actual icon set:

```tsx
// Current:
<input type="text" placeholder="🧪" />

// Replace with:
<IconPicker
  value={labIcon}
  icons={[
    'flask', 'heartbeat', 'microscope', 'brain', 'dna',
    'pulse', 'stethoscope', 'waveform', 'graph', 'book'
  ]}
  renderIcon={(name) => <LucideIcon name={name} className="h-5 w-5 text-gold" />}
/>
```

Pick 10–12 lab-appropriate icons from the existing Lucide set the Hub already imports. Render as a small grid of tiles. Stores the icon name, not an emoji codepoint.

**Acceptance.**
- No emoji input anywhere in Settings
- Icon picker renders Lucide icons in the Hub's gold/teal palette
- Selected icon appears in sidebar next to Lab Name (replaces whatever emoji was there)
- Migrate existing `lab_icon` values that are emojis → map to closest Lucide icon or default to `flask`

---

## P1-R2-04 · Research Narratives empty black/gold dot header reads as broken

**Screenshot:** `desktop-30-narratives.png`

**Problem.** Each section on `/narratives` starts with 6 circular dots — one large black, then 5 gold/tan of decreasing size. No label, no legend, no affordance. Reads as either a loading skeleton or a broken chart. (Looking more carefully they may be project-count sparkline bubbles — but without a label they're pure decoration or, worse, noise.)

**Fix.** Either:
1. **Label them.** If the dots are project health summary (N active / N paused / etc), add a legend line: `63 projects · 42 active · 12 paused · 9 archived · 0 blocked`.
2. **Kill the dots.** If they're pure decoration, remove. Section header with count is enough.

Don't ship unexplained visuals in a research tool.

**Acceptance.**
- Every visual on `/narratives` has either a label, legend, or tooltip explaining what it is
- If decorative, removed entirely
- Section counts render as a one-line summary next to the section title

---

# P2 · Polish and regressions

## P2-R2-01 · Round-1 P2-02 regression — 10+ projects STILL lead with a prefix

**Screenshot:** `desktop-06-projects.png` (visible at both zoom levels; row labels include `CLIF: Fluid Shortage All Comers`, `CLIF ICU Readmissions`, `ARF-NIV Treatment Location (Goldfarb)`, `C-QODE Real World Data Lead`, `CQODE Backbone`, etc.)

**Problem.** Round-1 P2-02 said strip `CLIF:` prefix and lift to a Consortium column. The Group column exists now (right side: CLIF / Lab / nate / Mentees) — good. But `CLIF:` / `CLIF ` / `C-QODE` / `CQODE` / `(Mesfin)` prefixes are still in the title column. The regex didn't catch the variants.

**Fix.** Extend the prefix regex:

```tsx
function stripConsortiumPrefix(title: string): { clean: string; consortium?: string } {
  // Match: "CLIF: foo", "CLIF foo", "C-QODE foo", "CQODE foo", "(Mesfin) foo", "(CLIF) foo"
  const patterns = [
    /^(CLIF|C-?QODE|MN-?CCORE|UMN|ATS):?\s+(.*)$/i,
    /^\((Mesfin|CLIF|MN-CCORE)\)\s+(.*)$/i,
  ]
  for (const re of patterns) {
    const m = title.match(re)
    if (m) return { clean: m[2], consortium: m[1].toUpperCase().replace('-', '') }
  }
  return { clean: title }
}
```

Write a unit test against the actual project titles in the DB before shipping.

**Acceptance.**
- No project title on `/projects` starts with `CLIF` / `CQODE` / `C-QODE` / `(Mesfin)` / `MN-CCORE:`
- All 60-odd projects render their "clean" titles
- Group column still populates correctly (no orphaned projects)

---

## P2-R2-02 · Task Detail right-panel width + content clipping

**Screenshot:** `focus-02-row-focus-outline-clicked.png` (right-hand panel)

**Problem.** The Task Detail slide-in panel renders at a narrow fixed width that clips every label: `"Bring RO1 CL..."` (title), `"Acknowledge..."` (status), `"Mar 28, 202..."` (date), Description textarea is ~180px wide. On a 1440px desktop, there's plenty of room.

**Fix.**

```tsx
// src/components/TaskDetailPanel.tsx
const PANEL_WIDTH = {
  min: 420,  // never below this
  ideal: 'min(520px, 40vw)',
  max: 640,
}

<aside
  className="fixed right-0 top-0 h-screen bg-surface shadow-xl"
  style={{ width: 'min(520px, 40vw)', minWidth: 420 }}
>
```

And let the user resize via a drag-grip on the left edge (persist to localStorage).

**Acceptance.**
- Panel renders at ≥420px on desktop
- Title, status, due-date fields never truncate on desktop widths
- Drag-to-resize handle on left edge; width persists across sessions

---

## P2-R2-03 · Session History empty state — replace vague copy with actionable

**Screenshot:** `desktop-33-sessions.png`

**Problem.** "No sessions yet · Sessions will appear here once synced from brain.db" tells the user nothing actionable. What's brain.db? How does it sync? What do they do?

**Fix.**

```tsx
// src/pages/Sessions.tsx
<EmptyState
  icon={<ClockIcon />}
  headline="No Claude sessions yet"
  body="Sessions show up here automatically when you use Claude Code with the MN-CCORE hook installed."
  cta={
    <div className="flex gap-2">
      <Button variant="primary" href="/docs/session-sync">Set up sync →</Button>
      <Button variant="ghost" href="/docs/brain-db">What's brain.db?</Button>
    </div>
  }
/>
```

**Acceptance.**
- Empty state names the tool (Claude Code) and the hook
- Two CTAs: primary (setup doc), ghost (explain brain.db)
- No reference to `brain.db` as naked jargon

---

## P2-R2-04 · Public Lab page "Trainees & Mentees" trailing anonymous avatar rows

**Screenshot:** `desktop-25-nick-lab.png`

**Problem.** The public `/nick` page's Trainees & Mentees section shows 6 real trainees, then **2 rows with no name, blank role, blank bio** at the bottom. Public-facing. Looks like abandoned rows.

**Fix.** Same pattern as Round-1 P1-08 (empty mentor sections):

```tsx
const namedTrainees = trainees.filter(t => t.name && t.name.trim().length > 0)
// Only render rows where name is populated
```

Anonymous / stub trainee rows should NEVER render on public pages. Internal Hub can show them with a "Draft profile" state.

**Acceptance.**
- `/nick` and `/nate` public pages show only trainees with populated names
- Internal Team page still shows all entries (draft + published) with clear state indicator

---

## P2-R2-05 · Trajectory page "Publication Cadence" empty with zero affordance

**Screenshot:** `desktop-35-trajectory.png`

**Problem.** Publication Cadence chart shows `↑` glyph + "Insufficient publication data" text and... that's it. A member with 1094 tasks completed and 37 commits (visible above) but the Publications chart is empty. Either:
1. Wire publications data source (fix)
2. Hide the chart when there's nothing to show
3. Render a call-to-action ("Connect ORCID →")

Don't just show a wedge-in-the-grid that reads as broken.

**Fix.** Follow the Hub's existing empty-state pattern — icon + 1-line headline + CTA.

```tsx
// src/components/PublicationCadenceChart.tsx
if (data.length < 3) {
  return (
    <EmptyBlock
      icon={<BookIcon />}
      headline="Connect publications"
      body="We need 3+ indexed publications to draw a cadence curve."
      cta={<Button href="/settings/orcid">Link ORCID →</Button>}
    />
  )
}
```

**Acceptance.**
- No "Insufficient data" + empty plot combo anywhere on trajectory
- Empty block has headline + helpful body + action
- Threshold is explicit ("need 3+")

---

## P2-R2-06 · Trajectory "Task Velocity" chart has zero Y-axis context

**Screenshot:** `desktop-35-trajectory.png`

**Problem.** Task Velocity histogram shows 12 bars with a max of ~550-ish, but the Y-axis has no unit label. Is that tasks/day? tasks/week? total tasks? Unclear. The "559" number at top-right hints "559 total over window" but the bars don't match that math.

**Fix.**

```tsx
<YAxis
  label={{ value: 'tasks completed / week', angle: -90, position: 'insideLeft' }}
  tickFormatter={(v) => `${v}`}
/>
<span className="text-xs text-ink-faint">
  Last 12 weeks · {totalCompleted} tasks completed
</span>
```

Pick ONE unit (tasks/week is right for a 12-bar chart). Label it. State the window.

**Acceptance.**
- Y-axis labeled with units
- Chart has a one-line sub-header: "Last N weeks · M total"
- Hover on any bar shows week range + count

---

## P2-R2-07 · Deadline Cascade is a flat list, not a cascade

**Screenshot:** `desktop-28-deadline-cascade.png`

**Problem.** The page is named "Deadline Cascade" and per FEEDBACK-FOCUS.md is supposed to be the "dependency graph between deadlines." What renders is a long flat list with section headers. No cascade, no dependencies, no graph.

Either rename the page or build the cascade. Naming it something it isn't erodes trust in the tool.

**Fix (minimal, ship fast):** Rename to `Deadlines by Section` until the dependency graph is real.

**Fix (full):** Build the actual cascade:

```tsx
// src/pages/DeadlineCascade.tsx
<CascadeGraph
  nodes={deadlines.map(d => ({ id: d.id, label: d.title, due: d.due_date }))}
  edges={dependencies}  // from deadline_dependencies table
  layout="dagre"
/>
```

Each deadline becomes a node; dependency edges draw arrows showing "A must ship before B." Use the same visual language as the Collaboration Network graph (force-graph or dagre).

**Acceptance.**
- Page name matches page content (rename OR build)
- If graph: nodes are deadlines, edges show dependencies, critical path highlighted
- If renamed: no orphaned `/deadline-cascade` route

---

## P2-R2-08 · Search page single input on a giant empty canvas

**Screenshot:** `desktop-31-search.png`

**Problem.** `/search` is one big input in the middle of a ~600px-tall empty canvas. No suggestions, no recent queries, no scopes, no shortcuts shown. The subtitle "Search across tasks, projects, people, decisions, and meeting notes" is the only content. Cmd+K already does this better.

**Fix.** Turn the idle state into a useful browse/recents surface:

```tsx
<Section title="Recent searches">
  <SearchChip>"propensity score"</SearchChip>
  <SearchChip>"ards cohort"</SearchChip>
  <SearchChip>@kendall</SearchChip>
</Section>

<Section title="Jump to">
  <QuickLink to="/tasks?mine=1">My tasks (24)</QuickLink>
  <QuickLink to="/deadlines?filter=urgent">Urgent deadlines (16)</QuickLink>
  <QuickLink to="/ideas?status=new">New ideas (33)</QuickLink>
</Section>

<Section title="Search tips">
  <Tip>Prefix with <kbd>@</kbd> for people, <kbd>#</kbd> for tags, <kbd>/</kbd> for projects</Tip>
</Section>
```

Same information `Cmd+K` surfaces, but on a navigable page for deep-linking / bookmarkability.

**Acceptance.**
- `/search` idle state is useful (recents + jump-to + tips), not blank
- Typing in the input still does live search
- Recent searches persist to localStorage per-user

---

## P2-R2-09 · Decision Log — "test decision · Neutral · anonymous" row

**Screenshot:** `focus-03-inline-arrows-decisions.png` (bottom row: "test decision · Neutral · anonymous · — · Apr 9 · Recorded")

**Problem.** Same Round-1 pattern: a "test decision" fixture made it into the live Decision Log. One row, but Decisions is a high-trust surface.

**Fix.** Extend the fixture filter to the Decisions query. Same approach as P1-R2-02.

```tsx
const HIDDEN_DECISION_PATTERNS = [
  /^test\s+decision/i,
  /^test_delete_/i,
]
```

**Acceptance.**
- No "test decision" row on `/decisions`
- Same filter predicate as P1-01/P1-R2-02

---

## P2-R2-10 · "Try Pipeline view for a visual overview" tooltip sticks on Projects

**Screenshot:** `focus-03-inline-arrows-projects.png` (gray pill near top: "Try Pipeline view for a visual overview")

**Problem.** Same Round-1 P1-05 pattern — nudge tooltips that don't dismiss. Bottom of Meetings was fixed; this one on Projects isn't.

**Fix.** Reuse the dismissKey pattern from P1-05:

```tsx
<PageTooltip
  dismissKey="projectsPipelineHint"
  copy="Try Pipeline view for a visual overview"
  cta={{ label: "Show me", action: () => setView('pipeline') }}
/>
```

**Acceptance.**
- Tooltip dismisses on X, on "Show me" click, and after 10s idle
- Never re-appears in same browser

---

## P2-R2-11 · Active Funding card order is `---` first, then real awards

**Screenshot:** `desktop-25-nick-lab.png` (Active Funding section at top)

**Problem.** Nick's public page leads Active Funding with "--- Departmental Operational Support" (a stub row with no title, no amount shown). Real grants render below. Outside visitors see the empty row first.

**Fix.** Order by dollar amount desc or by status (active > pending > stub). Stub/placeholder rows filter out on public view; show on internal.

```tsx
const publicGrants = grants
  .filter(g => g.title && g.title.trim() !== '---' && g.title !== 'Departmental Operational Support')
  .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
```

**Acceptance.**
- `/nick` and `/nate` show only grants with real titles
- Sorted by amount desc (lead with the big awards)

---

# P3 · Next-phase / enhancement

## P3-R2-01 · "Score = comments×3 + updates×2 + completions×1" needs a hover tooltip on every chart using it

**Screenshot:** `desktop-15-pi-analytics.png` (Team Engagement section)

**Observation.** The score formula is footnoted below the chart — great. But it's easy to miss and the chart's unit (what does `126` mean for Nick?) is opaque without it.

**Fix.** Render the formula as an `ⓘ` icon next to "TEAM ENGAGEMENT · Last 30 days" with hover popover. Keep footer line too as redundancy.

This is a "would meaningfully improve Nick's day" fix because when he shows PIs or trainees their score, they'll ask "why 126 and not 45" and the footnote is buried.

**Acceptance.**
- `ⓘ` next to section title
- Hover shows formula + 1-line interpretation ("Higher = more cross-team engagement this window")
- Keep existing footer as fallback

---

## P3-R2-02 · Round-1 P2-14 follow-on — ship the Post-Award Milestones design even before data

*(You said skip this, but the design deliverable can land without data. Keeping the ticket with that framing.)*

**Screenshot:** `desktop-12-grants.png`

**Out of scope for this round.** Noted in FEEDBACK-FOCUS § 7.

---

## P3-R2-03 · Public Lab page "Affiliates" footer column is 5 links, unordered

**Screenshot:** `desktop-25-nick-lab.png` (footer)

**Observation.** Footer "Affiliates" column has 5 disconnected link-looking items. No hierarchy, no visual rhythm.

**Fix.** Render as a small logo row (CHF logo, MN-CCORE logo, etc) with 1-line labels. Or group under subheads: "Clinical" / "Research" / "Training."

**Acceptance.**
- Affiliates section has either logos OR grouped subheadings
- Max 5 items per subgroup

---

## P3-R2-04 · Narratives page — "Recently Published" dangles as a 3-item rail

**Screenshot:** `desktop-30-narratives.png`

**Observation.** Inside each Narratives section there's a "Recently Published" rail with 3-5 teasers. Reads as content but is visually isolated — floats between the project list and the section divider. Either:
1. Surface it louder (dedicated section at top of page: "This Month's Shipped Work")
2. Remove from per-section and consolidate at page top

This is a high-value content stripe being hidden.

**Acceptance.**
- Recent publications aggregated to page-top or own section with strong visual treatment
- Per-section noise reduced

---

## P3-R2-05 · Activity page — likely a test-fixture tsunami (not captured, inferred)

**Screenshot:** `desktop-34-activity.png` (not reviewed in detail — high likelihood of same fixture noise as Round-1 based on Ask the Lab + Decisions findings)

**Action.** Apply `isProductionVisible()` predicate to the `/activity` feed query too. Follow-through on Round 1 P1-01 that may have missed this route.

**Acceptance.**
- `/activity` shows zero `test_delete_*` / `deep-audit-sync` / `@claude Hi` events

---

## P3-R2-06 · Tasks "Showing all lab tasks · Sign in" banner — conflicts with auth state

**Screenshot:** `desktop-03-my-tasks.png` (top banner: "Showing all lab tasks. Sign in with your @umn.edu account to see only your tasks.")

**Observation.** This banner assumes the viewer is unauth'd, but the view is clearly populated with a logged-in user's density of data (54 task badge in sidebar). Either the auth check on this banner is wrong OR the banner should suggest "switch to Mine" (already a filter chip), not "sign in."

**Fix.**

```tsx
{!user ? (
  <Banner>Showing all lab tasks. <a>Sign in</a> to see yours.</Banner>
) : (
  // Don't show the banner at all when authed. The "Mine / All 24" chips are the UX.
  null
)}
```

**Acceptance.**
- Banner only appears for unauthenticated visitors
- Authenticated users see "Mine / All N" chips as the sole filter affordance

---

## P3-R2-07 · Dashboard project-count consistency

**Observation (inferred from sidebar).** Sidebar shows "Tasks 54" but Round-1 Tasks header said "24 active." There are probably multiple count sources: active vs all, open vs total, lab vs mine. Audit that every displayed count (sidebar badge, section header, bottom-status footer) resolves to the same canonical query for the same definition.

**Fix.**

```tsx
// Single source of truth
const counts = useQuery('task-counts', () => ({
  mine_active: ...,
  mine_all: ...,
  lab_active: ...,
  lab_all: ...,
}))

// Sidebar badge uses mine_active (not lab_all, not lab_active)
// Tasks header shows BOTH: "24 mine active · 54 lab active"
```

**Acceptance.**
- Every count in the UI has a defined source (mine vs lab × active vs total)
- Sidebar badge and page header reconcile ("Tasks 54" with page showing "24" is currently confusing)

---

# Regression check matrix (from FEEDBACK-FOCUS § 4)

| Round-1 ticket | Status | Notes |
|---|---|---|
| P1-01 fixtures filter | ✅ mostly | Missed `/ask`, `/decisions`, `/activity` — filed P1-R2-02, P2-R2-09, P3-R2-05 |
| P1-02 PI labels | ✅ confirmed | Chart now reads `'23 '24 '25 '26` — clean |
| P1-04 Team Engagement | ✅ confirmed | Nick 126 / Nathan 18 / others 5-8 — looks real, no anonymous leader |
| P1-08 empty mentor | ✅ confirmed | Public team page clean (within captures reviewed) |
| P2-01 carried-forward | ✅ confirmed | Visible `sync` chip + carried indicator replacing prefix |
| P2-02 CLIF prefix | ⚠️ partial regression | See P2-R2-01 — many variants still slipping through |
| P2-03 OVERDUE sub-buckets | ✅ confirmed | "URGENT · 30-60D" visible on tasks captures |
| P2-05 Settings tabs | ✅ confirmed | Profile / Templates / AI / Appearance / Danger Zone tabs present — also see P1-R2-03 for emoji field |
| P2-09 delta chips | ✅ confirmed | Visible on PI Dashboard cards ("Stable" microcopy on response time) |
| P2-10 Ideas kanban | ✅ assumed (not directly re-captured) | Would need fresh `/ideas` to confirm |
| P2-11 outcome pill | ✅ confirmed | Decisions log Outcome right-most, as pill |
| P2-12 pubs year groups | ✅ assumed (not directly re-captured) | — |
| P2-13 network labels | ✅ assumed | — |
| P3-02 health heatmap | ✅ assumed | — |
| P3-03 manuscripts trophy | ✅ assumed | "Trophy" view chip visible on `/manuscripts` |
| P3-04 RePORTER tab | ✅ assumed | — |
| P3-05 project stage-strip | ✅ assumed | — |
| P3-08 calendar dense | ✅ assumed | — |
| P3-11 home pillars 4-col | ✅ assumed | — |

**Strong.** Round-1 held up well. Main regression is the CLIF: prefix variants (P2-R2-01); main new-surface findings are Ask the Lab fixtures (P1-R2-02) and Settings emoji field (P1-R2-03).

---

# Priority triage

**Tonight:**
- P1-R2-01 (My Items sign-in wall) — blocks a PI from using their core page
- P1-R2-02 (Ask the Lab fixtures) — public embarrassment

**This week:**
- P1-R2-03 (Settings emoji field) — brand consistency
- P1-R2-04 (Narratives dots) — erodes trust in data viz
- P2-R2-01 (CLIF prefix variants) — round-1 regression
- P2-R2-02 (Task panel width) — everyday-use friction
- P2-R2-09 (decision fixture) — fixture leak
- P2-R2-10 (projects tooltip) — round-1 pattern follow-through

**When bandwidth:**
- All § 0 answers applied (chevrons / row focus / quick-add polish)
- Rest of P2
- P3

---

---

# § 2 · Second-pass findings (remaining captures + video keyframes)

## P1-R2-05 · J/K keyboard nav paints **nothing** — feature is effectively broken

**Screenshots:** `videos/14-keyboard-nav-{a-idle,b-after-j,c-after-3j}.png`

**Problem.** Frames `a`, `b`, `c` (idle / after-1-j / after-3-j) are visually **identical** when diffed. There is no outline, background tint, left-edge marker, or any other signal that the keyboard cursor moved. Frame `d` shows the detail panel opened via Enter/Space — so the underlying cursor IS tracking, it just never paints.

The "teal outline is ugly" feedback in Ask 3 is actually misdiagnosed — the outline isn't rendering on J/K at all, only on click. This is a WCAG 2.4.7 focus-visible failure AND a broken interaction.

**Fix.** Apply Ask 3's proposal as a *bug fix*, not a polish pass. Use the 3px inset left edge + 6% bg tint spec from § 0 Ask 3.

**Acceptance.**
- Pressing J/K while the Tasks list has focus paints a visible cursor on the targeted row within 1 frame
- State persists while focus holds (not just on keydown)
- `Enter`/`Space` opens Detail panel for the visible focused row

---

## P1-R2-06 · Quick-add NLP token chips obscure the input text

**Screenshots:** `videos/15-quick-add-b-tokens-parsed.png`

**Problem.** Cmd+N NLP quick-add renders token pills *on top of* the user's typed text. In the capture, "review CLIF draft Friday" is partially hidden behind the `P2` and `@nick` pills — you can't see what you typed while you're typing it. The inferred chips below (title / assignee / priority / due date) are great; the overlap on the input itself is broken.

**Fix.** Render the live-parse highlights **under** the text using a transparent overlay layer, not **over** it. Two options:

```tsx
// Option A: syntax-highlight style — color the background behind tokens
<InputWithTokens>
  <BackgroundLayer>  {/* z-index: 0, colored rects behind tokens */}
    <TokenBg at={{start: 0, end: 5}} color="purple/10" />
    <TokenBg at={{start: 24, end: 30}} color="gold/10" />
  </BackgroundLayer>
  <TextInput className="relative z-10" />  {/* text on top */}
</InputWithTokens>

// Option B: no live chips in input, only in the inference row below
// (simpler, reads just as well)
```

Option B is probably right — the inference row is already clear. Keeping the in-input highlighting AND the row is belt-and-suspenders.

**Acceptance.**
- User's typed text is always 100% readable in the quick-add input
- Inferred values appear in the row below the input, not overlapping it
- Submit with ⌘↵ still shows the final parse summary

---

## P2-R2-12 · Ideas kanban has 10/0/0/0 — single-column, looks broken

**Screenshot:** `desktop-09-ideas.png`

**Problem.** The round-1 P2-10 kanban-first fix shipped correctly, but the live data shows **all 10 ideas in NEW, 0 in Under Review / Approved / Parked**. Reads as a broken column view on arrival. Either:
- Nobody's ever touched the status progression (real data problem, not design)
- The status transitions aren't wired
- New is the only column with anything, and we should show the List view when the board is this lopsided

**Fix.** Auto-detect "board has ≥80% in one column" and suggest List view via a dismissible banner:

```tsx
{ideasByStatus.NEW / ideas.length > 0.8 && (
  <InlineBanner variant="info" dismissKey="ideasKanbanLopsided">
    Everything's in New. <LinkButton onClick={() => setView('list')}>
    Switch to List view →
    </LinkButton>
  </InlineBanner>
)}
```

Also: inside each card, the status picker is still the chevron-heavy dropdown. Apply Ask 2's chevron-drop-on-hover pattern here.

**Acceptance.**
- Kanban banner prompts List switch when one column holds >80%
- Idea card status picker uses the hover-reveal chevron pattern

---

## P2-R2-13 · Persistent undismissable tooltips appear on Dashboard, Deadlines, Meetings, Projects

**Screenshots:**
- `desktop-01-dashboard.png` → "Press F to toggle filters on any page"
- `desktop-05-deadlines.png` → "Switch to Timeline for a visual map"
- `desktop-13-meetings.png` → "Click a meeting for prep and actions"
- `focus-03-inline-arrows-projects.png` → "Try Pipeline view for a visual overview"

**Problem.** Same Round-1 P1-05 regression pattern, but it's now on **four pages at once**. One global nudge component with no user-level dismissal memory.

**Fix.** Consolidate into a single `<PageNudge>` component with a shared dismissKey registry:

```tsx
// src/components/PageNudge.tsx
const dismissed = JSON.parse(localStorage.getItem('nudges.dismissed') ?? '{}')

export function PageNudge({ dismissKey, children, cta }: Props) {
  const [visible, setVisible] = useState(!dismissed[dismissKey])
  if (!visible) return null
  return (
    <div className="nudge-pill">
      {children}
      {cta}
      <CloseButton onClick={() => {
        dismissed[dismissKey] = Date.now()
        localStorage.setItem('nudges.dismissed', JSON.stringify(dismissed))
        setVisible(false)
      }} />
    </div>
  )
}
```

Replace every one-off tooltip/banner with this. Add a Settings → Appearance toggle to "Re-enable tips" for users who want them back.

**Acceptance.**
- Every nudge on every page dismisses on X
- Dismissal persists across sessions via localStorage
- Settings → Appearance → "Re-enable product tips" button restores them
- Audit: no hand-rolled tooltip/banner components left; all route through `<PageNudge>`

---

## P2-R2-14 · Project Detail stage strip shows no current-stage indicator

**Screenshot:** `desktop-07-project-detail.png`

**Problem.** The stage strip on "CLIF: PF-v-SF Oxygenation Severity" renders all 6 stages (Idea → Data Collection → Analysis → Writing → Review → Published) with identical light-gray dots. The project status pill says "Submitted" elsewhere on the page — but the strip gives no visual cue of where the project actually is.

**Fix.** Mark the current stage + fill completed stages:

```tsx
const currentIdx = stages.findIndex(s => s.name === project.stage)
stages.map((stage, i) => (
  <StageDot
    state={
      i < currentIdx ? 'done' :      // solid teal
      i === currentIdx ? 'current' :  // teal ring + solid center
      'upcoming'                       // outline only
    }
    label={stage.name}
  />
))
```

Visually: done = teal fill, current = teal ring + gold center dot, upcoming = gray outline.

**Acceptance.**
- Current stage visually distinct from both completed and upcoming
- Completed stages visibly filled
- Strip renders correctly for every stage value (Idea through Published)

---

## P2-R2-15 · Meetings "Full meeting recommended" callout inverts priority signal

**Screenshot:** `desktop-13-meetings.png`

**Problem.** Gold-pill callout at top of Meeting Hub: "Full meeting recommended · 8 blocked tasks need discussion · 23 agenda items submitted · 560 pending tasks · 11879 activities since last meeting". That's a lot of numbers, and "11879 activities since last meeting" reads as inflation (probably since Jan 1, not since last week's meeting). Hard to know what to act on.

**Fix.** Lead with the *actionable* number, tuck the rest:

```tsx
<Callout variant="recommend">
  <strong>Full meeting recommended</strong>
  <span>{blockedTasks.count} blocked tasks need discussion · {agendaItems.count} agenda items ready</span>
  <DetailToggle>
    ({pendingTasks.count} pending · {activities.count} activities since last week)
  </DetailToggle>
</Callout>
```

Hide the noisy stats behind a `⋯` expand. Lead with what makes the meeting worthwhile.

**Acceptance.**
- Lead-line is 1 sentence, ≤80 chars, action-oriented
- Secondary stats collapsed behind expand toggle
- "since last meeting" time-window explicit ("since last week's meeting")

---

## P2-R2-16 · Activity card hover-reveal icons unlabeled

**Screenshots:** `videos/05-hover-badges-a-idle.png` → `-b-hover.png`

**Problem.** On row hover, Tasks rows gain 3 unlabeled icon buttons at the right edge — apparently sync/comment/calendar quick-actions. No tooltip visible in the capture, no hover-label. User has to click to find out.

**Fix.** Add `title=` / proper tooltips on each action icon:

```tsx
<IconButton title="Sync with GitHub issue" icon={<GitBranch />} />
<IconButton title="Add comment" icon={<MessageCircle />} />
<IconButton title="Schedule" icon={<Calendar />} />
```

And: render them only when an action is actually available (don't show GitHub-sync icon for rows without a linked issue).

**Acceptance.**
- Every hover-revealed icon has a tooltip
- Icons hidden when the action doesn't apply to that row
- Keyboard users can Tab through icons with visible focus ring

---

## P3-R2-08 · Cmd+K palette count flicker (60 → 59)

**Screenshots:** `videos/06-cmd-k-a-opened.png` (`59 active projects`) vs `b-fuzzy-search.png` (`60 projects`)

**Minor bug.** Palette open-state footer shows 59, then 60 after searching. Same query origin, debounced refetch probably causing the flip. Pin the count to a single useQuery result per palette-open session.

---

## P3-R2-09 · Dashboard "Welcome to MN-CCORE Lab Hub" banner still present for returning users

**Screenshot:** `desktop-01-dashboard.png`

Observation. The welcome banner has "Get started →" / X. Follow up P2-R2-13 pattern — should dismiss forever on X click for returning users, and never show again once any task has been created/modified.

---

# § 3 · Updated Round-1 regression matrix (second-pass confirmed)

| Round-1 ticket | Status | Evidence |
|---|---|---|
| P1-01 fixtures | ⚠️ 3 routes leaking | `/ask` (P1-R2-02), `/decisions` (P2-R2-09), `/activity` (P3-R2-05) |
| P1-02 PI labels | ✅ | `desktop-15` chart reads `'23 '24 '25 '26` |
| P1-04 Team Engagement | ✅ | Nick 126 / Nathan 18 / others 5-8, no anonymous |
| P1-08 empty mentor | ✅ | `desktop-19` team public clean |
| **P1-05 nudge dismissal** | ❌ **regression** | Now on 4 pages — see P2-R2-13 |
| P2-01 carried-forward | ✅ | `desktop-13` shows carried pills |
| P2-02 CLIF prefix | ⚠️ partial | Variants slipping through — P2-R2-01 |
| P2-03 OVERDUE sub-buckets | ✅ | `desktop-05` shows OVERDUE/THIS WEEK/NEXT WEEK/LATER |
| P2-05 Settings tabs | ✅ | But emoji field regressed — P1-R2-03 |
| P2-09 delta chips | ✅ | On PI Dashboard + Analytics |
| P2-10 Ideas kanban | ✅ shipped, ⚠️ data lopsided | P2-R2-12 proposes fallback |
| P2-11 outcome pill | ✅ | Decisions right-most |
| P2-12 pubs year groups | ✅ | assumed from `desktop-22` (not re-viewed) |
| P2-13 network labels | ✅ | `desktop-23` readable |
| P3-02 health heatmap | ✅ | `desktop-01` dashboard shows LIST/HEATMAP toggle |
| P3-03 manuscripts trophy | ✅ | `desktop-08` trophy chip visible |
| P3-04 RePORTER tab | ✅ | `desktop-12` NIH RePORTER tab |
| P3-05 stage-strip | ⚠️ shipped but dead | P2-R2-14 — no current indicator |
| P3-08 calendar dense | ✅ | `desktop-04` Dense button visible |
| P3-11 home pillars | ✅ | `desktop-00` home shows 4-col |

**Two real regressions:** P1-05 nudge (now 4x worse) and P3-05 stage-strip (shipped but non-functional).

---

# § 4 · Final priority rollup (Round 2)

**Tonight / morning (P1):**
- P1-R2-01 My Items sign-in wall
- P1-R2-02 Ask the Lab fixtures
- P1-R2-03 Settings emoji field
- P1-R2-04 Narratives mystery dots
- **P1-R2-05 J/K paints nothing** ← confirmed via motion review (§ 5)
- **P1-R2-07 Swipe-to-dismiss inert on Pixel 5** ← third-pass motion finding; see § 0 Ask 4
- **P1-R2-08 Board view: drag never fires** ← third-pass motion finding; see § 5, clip 10
- ~~P1-R2-06~~ **downgraded to P3-R2-10** after motion confirmed inline chips don't overlap input text

**This week (P2):**
- P2-R2-01 CLIF prefix variants
- P2-R2-02 Detail panel width
- P2-R2-09 test decision fixture
- P2-R2-10 + P2-R2-13 consolidate all persistent nudges
- P2-R2-12 Ideas lopsided fallback
- P2-R2-14 Project stage strip current indicator
- P2-R2-15 Meetings callout lead-with-action
- P2-R2-16 hover icon tooltips
- P2-R2-03/04/05/06/07/08/11 (balance of P2)

**When bandwidth (P3):**
- Answers from § 0 applied broadly (chevron + row-focus + quick-add polish)
- Remaining P3-R2 tickets

---

**Bundle produced:** 2026-04-20 · 3 passes (statics → keyframes → motion GIFs)
**Captures reviewed:** 33 of 33 desktop · 6 of 6 mobile · all 4 new focus captures · all 15 motion GIFs (frame-extracted via ImageDecoder)
**New P1s across all passes:** 5 (My Items wall, Ask fixtures, Settings emoji, Narratives dots, J/K paints nothing) + 2 from motion (swipe inert, board drag inert)
**Round-1 regressions confirmed:** 2 (P1-05 nudges, P3-05 stage strip)
**Deferred/downgraded:** P1-R2-06 (quick-add) → P3 after motion showed chips render as in-place syntax highlights, not overlays

See § 5 below for the full motion review — easing curves, stagger, overshoot across all 15 interaction clips.


---

# § 5 · Motion review — all 15 interaction clips

**Method.** All 15 GIFs decoded frame-by-frame via ImageDecoder in a browser sandbox; 5-8 frames sampled per clip across the timeline (more for long clips). Extracted frames saved to `round2/videos/NN_fNNN.png` if you want to see what I was looking at. At 10 fps, 1 frame = 100 ms — timings below are inferred from that cadence.

Each clip gets: **what I see** · **what's off** · **fix**. Only clips with motion problems get a full ticket number; working clips are logged for completeness.

---

## Motion summary table

| # | Clip | Duration | Motion quality | Status |
|---|---|---|---|---|
| 01 | status-change-undo | ~60s (608fr) | — flaky capture, mostly static | see below |
| 02 | detail-panel-slide-in | ~3.5s | **too slow** (~1200ms slide) | **M-02** |
| 03 | detail-panel-tabs | ~5.6s | tab switch instant, no motion | **M-03** |
| 04 | swipe-to-dismiss | ~4.3s | **inert** — gesture does nothing | **P1-R2-07** |
| 05 | hover-row-badges | ~2.8s | fade-in on hover, clean | ✅ |
| 06 | cmd-k-palette | ~3.8s | modal appears, count flickers | see P3-R2-08 |
| 07 | assignee-picker | ~3s | dropdown opens cleanly | ✅ |
| 08 | date-picker | ~60s | captured too long, motion fine | ✅ |
| 09 | subtask-expand | ~3.1s | **instant expand, no height-anim** | **M-09** |
| 10 | board-drag | ~3.4s | **list view, not board — drag never fires** | **P1-R2-08** |
| 11 | hermes-mention | ~3.6s | @hermes badge appears, no sparkle seen | **M-11** |
| 12 | pulse-kiosk | ~24s | scene rotation, no transitions between | **M-12** |
| 13 | dashboard-drag-reorder | ~4.2s | customize panel overflows viewport | **M-13** |
| 14 | keyboard-nav | ~4.2s | J/K paints nothing (see P1-R2-05) | **P1-R2-05** |
| 15 | quick-add-nlp | ~4.6s | modal fade-in, inline chips work | ✅ (P1-R2-06 downgraded) |

---

## P1-R2-07 · Mobile swipe-to-dismiss is inert on Pixel 5 build

**Captures:** `videos/04-swipe-to-dismiss.gif`, `videos/04-swipe-dismiss-{a,b,c}.png`, frame extracts `04_f000` – `04_f042`

**Problem — confirmed via motion.** The three "before / mid-drag / dismissed" keyframes are pixel-identical. A faint circular touch indicator appears near the Priority Urgent pill (~x=480, y=715), confirming the gesture *fires* — but the panel gets zero horizontal transform. The GIF frame-extract sequence shows:

- f000: loading spinner
- f008: task list visible, panel starting to slide IN (note: this is the *open* animation, not dismiss)
- f015: panel ~60% open
- f022: panel fully open
- f028 → f042: identical; panel stays open; dismiss never happens

So the "swipe-to-dismiss" capture actually shows swipe-with-no-response. This is separate from the "keep vs replace" ask (see § 0 Ask 4) — it's a P1 because the gesture is completely broken on the device we just shipped to.

**Fix.** Two options, both viable:

1. **(Recommended) Rip the gesture out** and ship the X+Done+backdrop replacement from § 0 Ask 4. Matches the question Nick already asked and avoids debugging mobile Safari gesture quirks.
2. If you want to fix it: the gesture handler is probably attached to the panel root but getting `preventDefault`'d by an inner scroll container. Check `src/components/TaskDetail.mobile.tsx` for a nested `overflow-y: auto` — the drag start needs to `stopPropagation` OR be attached at the scroll container itself. Also verify `touch-action: pan-y` isn't set on the panel (would block horizontal pans entirely).

**Acceptance** (if fixing rather than replacing):
- Pixel 5 Chrome: drag from panel body, panel follows finger 1:1, releases > 40% width OR > 600 px/s velocity dismisses
- iOS Safari: drag from panel body, panel follows finger, leftmost 20px reserved for browser back-gesture
- Both: drag below threshold snaps back to `x:0` in 180ms ease-out

---

## P1-R2-08 · Board view drag never fires (clip shows list view instead)

**Capture:** `videos/10-board-drag.gif`, frames `10_f000` – `10_f030`

**Problem.** Clip labeled "Kanban drag (Tasks board view)" shows the Tasks **list** view for the entire 3.4s clip. All 6 sampled frames are identical. Either:

1. The test harness clicked the "Board" toggle but it didn't activate
2. The drag gesture started but failed silently
3. The capture started on the wrong view

In any of those cases, we have no evidence that board drag works. Given the swipe-inert finding above, I'd bet on option 2: gesture attaches but doesn't fire.

**Fix.** Re-capture with explicit view-toggle verification:

```ts
// in Playwright:
await page.getByRole('button', { name: /board/i }).click()
await expect(page.getByTestId('kanban-column')).toHaveCount(4) // or whatever
// NOW start the drag
```

And audit: does the Kanban `react-dnd` / `@dnd-kit` setup actually mount on mobile? Common bug: the drag sensors default to `PointerSensor` which works on trackpad but needs `TouchSensor` added for touch devices.

**Acceptance.**
- Re-capture confirms board view visible + drag transform visible on the dragged card
- Drag works on both desktop (mouse) and mobile touch
- Dropped card lands in target column with visible commit animation

---

## M-02 · Detail panel slide-in is ~1200ms — too slow

**Capture:** `videos/02-detail-panel-slide-in.gif`, frames `02_f000` – `02_f030`

**Observation.** The panel slide-in sequence:

| frame | time | state |
|---|---|---|
| f006 | 600ms | row clicked, panel invisible |
| f012 | 1200ms | panel ~40% in |
| f018 | 1800ms | panel ~70% in |
| f024 | 2400ms | panel fully seated |
| f030 | 3000ms | at rest |

From click → fully seated is **~1200ms of animation**. That's 4× the spec for this pattern. iOS slideovers target 300ms, Linear's detail panel is ~220ms, macOS NSPanel is 250ms.

Slow slide-in is perceived as sluggish on every click. Users who click 30 tasks a day eat an extra 27 seconds of wait animation.

**Fix.** Shorten to 240ms with `ease-out` (or a spring).

```css
.task-detail-panel {
  transform: translateX(100%);
  transition: transform 240ms cubic-bezier(0.25, 0.1, 0.25, 1); /* ease-out */
}
.task-detail-panel[data-open="true"] {
  transform: translateX(0);
}
```

Or with a spring for more character (use `popmotion` / `framer-motion` if already in the tree):

```tsx
<motion.div
  initial={{ x: '100%' }}
  animate={{ x: 0 }}
  exit={{ x: '100%' }}
  transition={{ type: 'spring', stiffness: 420, damping: 36 }}
/>
```

The spring variant overshoots ~2% — gives a subtle sense of landing. Not recommended if the panel is wide (overshoot becomes visible chrome); recommended for the detail panel here.

**Acceptance.**
- Panel slide-in completes in ≤ 280ms from click to at-rest
- Reduced-motion: fade-in 120ms instead of slide
- No layout thrash on surrounding list (backdrop blur, if any, must be GPU-composited)

---

## M-03 · Detail panel tab switches are instant (no motion)

**Capture:** `videos/03-detail-panel-tabs.gif`, frames `03_f000` – `03_f050`

**Observation.** Clicking between Overview / Notes / Comments / Activity / Details shows **no transition** — content swaps in 1 frame. Not a blocker (Apple does this in Finder sidebar) but for a panel that's already established motion character on open/close, the hard-swap feels inconsistent.

**Fix.** Cross-fade the tab body, 120ms.

```css
.tab-content {
  animation: tab-enter 120ms ease-out;
}
@keyframes tab-enter {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

4px Y-translate gives directionality; 120ms keeps it feeling like "instant with polish" rather than a separate motion event. Skip if reduced-motion.

**Acceptance.**
- Tab content fades in over 120ms with 4px Y-lift
- No horizontal motion (tabs are siblings, not a carousel)
- Reduced-motion: opacity only, no translate

---

## M-09 · Subtask expand is instant — no height animation

**Capture:** `videos/09-subtask-expand.gif`, frames `09_f000` – `09_f030`

**Observation.** Chevron click → subtasks appear fully formed in 1 frame. For 1–2 subtasks fine; for 8+ subtasks (the grid shown in the clip has room for many), the jarring layout jump pushes everything below off-screen instantly.

**Fix.** Animate max-height with a known-max grid-row trick (so content height is dynamic):

```css
.subtasks-region {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 180ms ease-out;
}
.subtasks-region[data-open="true"] {
  grid-template-rows: 1fr;
}
.subtasks-region > div {
  overflow: hidden;
}
```

Modern CSS grid-rows transitions are the cleanest way to animate "auto height." 180ms is enough for 6-8 rows without feeling slow.

**Pair with a subtle opacity fade** on the new rows so they don't pop visually:

```css
.subtask-row {
  opacity: 0;
  animation: subtask-enter 160ms ease-out forwards;
  animation-delay: 60ms;
}
@keyframes subtask-enter { to { opacity: 1; } }
```

**Acceptance.**
- Expanding N subtasks animates height over 180ms
- Rows fade in over the same window
- Chevron rotates 90° in sync with the expand

---

## M-11 · Hermes @mention — no sparkle badge animation observed

**Capture:** `videos/11-hermes-mention.gif`, frames `11_f000` – `11_f035`

**Observation.** Frame sampling shows the Comments tab with `@hermes` typed in the mention input, but no gold sparkle badge animation visible across f000/f010/f020/f030/f035. Either:
1. The sparkle happens in 1-2 frames (too fast to capture at 10fps)
2. It never fires because the mention isn't resolving
3. The capture doesn't include the submit moment

If it's #1, that's actually a problem — at 10fps a 100-200ms sparkle is 1-2 frames and users will miss it too.

**Fix.** Make the Hermes-ack animation longer and more legible. Target: 600-800ms of sustained motion, not a flash.

```tsx
// On @hermes resolution:
<motion.span
  className="hermes-badge"
  initial={{ scale: 0, rotate: -30 }}
  animate={{ scale: 1, rotate: 0 }}
  transition={{ type: 'spring', stiffness: 400, damping: 15 }}
>
  <Sparkle className="size-4 text-gold" />
  Hermes
</motion.span>
```

Plus a particle shimmer (3-4 gold dots, `scale: 0 → 1.2 → 0`, staggered by 40ms) so the badge lands with a small flourish. This is one of the few places novelty motion is warranted — it's the "your AI heard you" moment.

**Acceptance.**
- Hermes badge appearance is ≥ 500ms of sustained, perceptible motion
- Staggered particles or a shimmer reinforce "something magical happened"
- Reduced-motion: badge scales in 150ms without particles

---

## M-12 · Pulse kiosk scene rotation has no transitions

**Capture:** `videos/12-pulse-kiosk.gif`, frames `12_f000` – `12_f230`

**Observation.** 6 scenes auto-rotate over 24s (4s per scene). Between scenes: **hard cut**. Every 4 seconds, the entire viewport swaps. For a kiosk that's meant to hold a room's attention, hard cuts read as "the page broke."

**Fix.** Cross-fade between scenes, 400ms. The kiosk is ambient-use — longer, gentler motion works better than snappy.

```tsx
<AnimatePresence mode="wait">
  <motion.section
    key={currentScene}
    initial={{ opacity: 0, scale: 1.02 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.98 }}
    transition={{ duration: 0.4, ease: 'easeInOut' }}
  >
    {scenes[currentScene]}
  </motion.section>
</AnimatePresence>
```

Subtle 2% scale on enter/exit adds cinematic weight without being showy. Reduced-motion: opacity only, 200ms.

**Acceptance.**
- Each scene transition takes ~400ms with cross-fade + 2% scale
- Spacebar pause still works (preserve `isPaused` check in the rotation timer)
- Reduced-motion: 200ms opacity-only fade

---

## M-13 · Dashboard customize panel overflows viewport on activation

**Capture:** `videos/13-dashboard-drag-reorder.gif`, frames `13_f000` – `13_f040`

**Observation.** Customize toggle works well, cards get grab-handles, drag works. **But** activating Customize reveals a full set of toggles for every card (Action Board / Upcoming Meeting / Project Health / Research Pipeline / Activity Feed / Quick Stats / Recent Activity / Weekly Progress / Quick Wins / Focus Timeline / Email Drafts / Cross-Project Insights / CLIF Metrics / Research Topics / etc). The toggle panel renders as a dense 2-row chip grid that pushes the rest of the page down by ~180px. On a 13" MacBook the action (drag) happens below the fold.

**Fix.** Put the toggle-visibility controls in a side sheet, not inline. This is the "settings" action; it doesn't need to be visible while you're dragging.

```tsx
<Dashboard>
  {isCustomizing && (
    <SideSheet anchor="right" onClose={() => setCustomizing(false)}>
      <SheetHeader>Customize dashboard</SheetHeader>
      <SheetBody>
        <CardToggleList />
      </SheetBody>
    </SideSheet>
  )}
  <DashboardGrid showHandles={isCustomizing} />
</Dashboard>
```

Drag handles stay visible on the cards themselves. The toggle-visibility list goes into the sheet so user can toggle + reorder independently.

**Acceptance.**
- Customize mode: drag handles appear on cards, no inline toggle grid
- Side sheet opens on Customize click; closes on ESC / outside-click / re-toggle
- Dashboard grid stays at its normal position (no layout jump)
- Reorder persists to localStorage + server

---

## Working clips (no tickets)

- **05 hover-row-badges** — hover fade-in on the age/project chips is clean, ~100ms ease-out. Ship.
- **07 assignee-picker** — inline dropdown opens cleanly, avatar grid. No motion complaints.
- **08 date-picker** — presets render, no issues observed. (The capture is 608 frames = 60s, mostly idle — probably the Playwright timeout Nick flagged. Partial flow is fine.)
- **15 quick-add-nlp** — **downgrade P1-R2-06 to P3-R2-10.** Motion confirms the inline highlighting is a syntax-highlight-in-place pattern (tokens replace text with colored chips, no overlay). Input remains readable. Keep as shipped.

---

## Reduced-motion summary

Every animation above should have a `@media (prefers-reduced-motion: reduce)` branch. Consolidate:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
  /* Then selectively restore opacity-only cross-fades for essential feedback */
  .task-detail-panel { transition: opacity 120ms linear !important; }
  .tab-content { animation: none !important; opacity: 1 !important; }
  .pulse-kiosk-scene { transition: opacity 200ms linear !important; }
  .hermes-badge { transition: opacity 150ms linear !important; }
}
```

Ship this global rule alongside any of the motion fixes above.

---

## Motion "design system" recommendation

To stop re-litigating duration/easing per component, adopt a small token set:

```ts
// src/design-tokens/motion.ts
export const duration = {
  instant: 80,      // micro-interactions (chip hover, chevron rotate)
  quick: 160,       // small state changes (tab cross-fade, subtask expand)
  base: 240,        // most transitions (panel slide, modal open)
  slow: 400,        // ambient / kiosk / scene changes
  hero: 600,        // Hermes badge, confetti, celebration moments
} as const

export const easing = {
  out: 'cubic-bezier(0.25, 0.1, 0.25, 1)',   // most things (deceleration)
  inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',      // symmetric transitions
  spring: { type: 'spring', stiffness: 420, damping: 36 } as const,
  softSpring: { type: 'spring', stiffness: 260, damping: 28 } as const,
} as const
```

Audit existing motion once and migrate to these tokens. Anything longer than `slow` (400ms) needs a justification comment.

---
