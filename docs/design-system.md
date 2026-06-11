# MN-CCORE Lab Hub — Design System Reference

Extracted from `CLAUDE.md` 2026-05-15 to keep the operating guide lean.
This file is reference-only — load it when doing design system work.

---

## Animation Timing (5 durations + 2 easings)

- `--duration-instant: 0ms` — state toggles, checkbox
- `--duration-fast: 100ms` — tooltips, button press
- `--duration-normal: 150ms` — hover, row highlight (alias: `--transition-fast`)
- `--duration-moderate: 200ms` — dropdowns, panels (alias: `--transition-panel`)
- `--duration-slow: 300ms` — sidebar, modals, page transitions
- `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` — entering elements
- `--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)` — moving elements
- Card hover: -1px lift. Respects `prefers-reduced-motion` (all durations → 0ms).

---

## Sidebar Specs

- **3-plane depth**: sidebar DARKER than content via `--sidebar-bg: color-mix(in oklch, var(--cream), black 12%)` in both light and dark mode. The sidebar must always recede behind content (matching Linear). Darker-than-content is NEVER-violate. Phase 31.5 briefly tried lighter sidebar; reverted 2026-04-12.
- Font-weight 400 for nav items, 500 for active only.
- Active: `--teal-subtle` bg fill (desaturated), full teal on text/icon. No left border.
- Inactive: `--slate` color, icon opacity 0.7.
- Borders: `--border-subtle` (neutral), NOT `--border-light` (gold).
- Section labels: 10px uppercase, opacity 0.5. Divider lines between groups.
- Row height: py-2 (compact). Font: 12px. Group gap: 4px. Section divider margin: 6px/8px.
- Logo: mark uses CSS filter for dark mode (`invert(1) brightness(1.5)`), text logo swaps to dark variant.

---

## Borders & Spacing

- `--border-light` (gold tint) = ONLY for filter toggle inactive states and intentional brand accents.
- `--border-subtle/default/strong` (neutral, 3 tiers) = ALL structural borders. 222 structural borders migrated in Phase 30.
- Spacing: `--sp-xs` (4) / `--sp-sm` (8) / `--sp-md` (12) / `--sp-lg` (16) / `--sp-xl` (24) / `--sp-2xl` (32). Strict 8px grid.
- Radius: `--radius-sm` (4) / `--radius-md` (6) / `--radius-lg` (8) / `--radius-xl` (12) / `--radius-2xl` (16) / `--radius-full` (9999) / `--radius-circle` (50%). All `borderRadius` MUST use tokens.
- Typography scale: `--text-micro` (10) / `--text-caption` (10) / `--text-label` (11) / `--text-small` (12) / `--text-body` (13) / `--text-base` (14) / `--text-md` (16) / `--text-lg` (18) / `--text-xl` (24) / `--text-2xl` (32).

---

## Z-Index Hierarchy

- `--z-base` (1) / `--z-sticky` (10) / `--z-dropdown` (50) / `--z-sidebar` (100) / `--z-modal-backdrop` (400) / `--z-modal` (500) / `--z-toast` (9999).
- All `zIndex` MUST use tokens.

---

## Semantic Hover/Overlay Tokens

- Accent hovers: `--gold-hover/active/emphasis`, `--teal-hover/active/emphasis`, `--maroon-hover/emphasis`, `--orange-hover`, `--green-hover`
- Neutral overlays: `--hover-subtle/light/medium`, `--overlay-light/medium/heavy` (dark mode overrides: light uses black-based, dark uses white-based)
- Standardized opacity tiers: 0.03 / 0.06 / 0.10 / 0.15 / 0.40 / 0.70. Snap to nearest tier.

---

## Surface Elevation (Linear pattern)

- `--surface-0` (page bg) / `--surface-1` 3% (panels) / `--surface-2` 6% (cards, sidebar, dropdowns) / `--surface-3` 10% (hover, active)
- Dark mode: luminance stepping via `rgba(255,255,255, 0.03→0.10)` — 10% total range (Linear-equivalent)
- Light mode: `--page-bg: #f5f5f5` (off-white), cards `#ffffff` with 3-layer box-shadow (Vercel pattern)
- Card borders: `box-shadow: 0 0 0 1px var(--border-subtle)` technique (not CSS border)
- Dark cards: `inset 0 1px 0 rgba(255,255,255,0.03)` top-edge highlight
- Shadows: `--shadow-flat/card/card-hover/elevated/menu`. All `boxShadow` MUST use tokens.
- `--muted`: derived from `--ink` via `color-mix(in oklch, var(--ink) 70%, transparent)` in dark mode

---

## Table Density (user-controlled)

- 3 modes via `DensityToggle` component: Compact (36px) / Default (44px) / Relaxed (52px)
- CSS vars: `--row-height`, `--row-padding-y`, `--cell-font-size`. Applied to all 7 data table pages.
- Persisted per-user in localStorage. Numeric columns right-aligned, `tabular-nums` on dates.

---

## UX Research Patterns

Reference: `Projects/mn-ccore-lab-hub/task-management-ux-patterns-research.md` (PB repo).
Must-reference before building ANY new feature.

- **Pattern 3 (Three depth levels):** Peek (Space) → Side Panel (click) → Full Page (Enter).
- **Pattern 4 (Inline Editing):** Click any field → edit mode by type (dropdown/picker/text). Auto-save on blur.
- **Pattern 7 (List View):** Fixed row height. Column headers. Grouping with collapsible headers. Density toggle.
- **Pattern 9 (Optimistic UI):** Instant state changes. Undo toast for 5 seconds. Never show spinners.
- **Pattern 10 (Micro-interactions):** Completion animation. Status color transitions. Progressive disclosure.

Competitive reference: LabSync (JC Rojas) — friend, learn from, never compete.

---

## Capture Specs for Claude Design

Run on demand via `scripts/regen-design-bundle.sh`. Six specs wired into `playwright.config.design-capture.ts`. Output to `review/claude-design-*` / `review/interactions-*` (gitignored). Do NOT add to default test run.

Full spec details archived in `docs/archived/CLAUDE.md-history-2026-05-15.md`.

**Auth workarounds (required post-2026-04-21 launch):**
- CF Access gates prod `/portal/*`. Use ungated preview deploy: `BASE_URL=https://<hash>.mn-ccore-lab.pages.dev bash scripts/regen-design-bundle.sh <name>`.
- Every spec calls `injectFakeAuth(context, BASE)` from `tests/helpers/capture-auth.ts` to bypass the `RequireAuth` splash.

---

## Table Pattern Reference

- Shared `ColumnHeader` + `TableContainer` in `src/components/table/`
- Column headers: uppercase, 11px, 0.55 opacity, 0.06em letter-spacing
- Column resize: drag handles on right edge, min widths, persisted via `useTableConfig`
- Column reorder: drag headers horizontally, persisted to localStorage
- Cell focus: 2px teal outline, Tab/Shift+Tab between editable cells
- Multi-sort: Shift+Click for secondary sort, ①② rank indicators
- Frozen columns: checkbox + title sticky at ≤1024px viewport
- Stage group headers: quiet uppercase labels with extending rule line
- Row hover: `rgba(255,255,255,0.02)` (dark), barely-there luminance shift
- Row separators: `var(--row-separator)` token (dark: `rgba(255,255,255,0.03)`, light: `rgba(0,0,0,0.04)`)
- Hover-only badges: `.hover-badge` CSS class — use `visibility: hidden`, not `opacity: 0`
- Ghost-style action buttons (outline, not filled) + Pin-to-Focus button on MyTasks

## Conversation Surfaces (Nick-approved 2026-06-11 — composers + activity entries)

Two patterns settled during the 2026-06-11 live-review cycle. Every current AND FUTURE surface
that shows authored messages or accepts them follows these; deviations need Nick's explicit OK.

### Composer anatomy ("Slack-shaped")

- **Idle = ONE compact row:** mode pills (if any) inline-left, then a full-width single-line
  input. NEVER icons to the left of the input (they indent it and force a second line). NEVER
  pills on their own row.
- **Composing (focus or content):** input grows; ONE action row appears BELOW the box —
  left: quiet icon buttons (attach / mention / emoji) + compact pill toggles ("Only me" 🔒,
  "Hermes") with `role="switch"` + string `aria-checked`; right: Post. Single line, never wraps
  at panel-min-width.
- Pill toggles match the mode-pill styling (height 22, radius-sm, border+tint active state) —
  no uppercase micro-labels, no letter-spacing.
- Mobile may keep sticky-bottom compose (deliberate divergence — thumbs reach bottom).
- Reference implementations: `OverviewQuickAdd` (TaskDetailPanel) + `SmartCompose`.

### Activity-entry anatomy ("Slack-thread")

One renderer owns it: `ActivityEntryItem` in `src/components/activity/activityRender.tsx`.
Surfaces pass FUNCTIONAL props only (peek count, reactions on/off) — zero cosmetic overrides.

```
[avatar 28px]  Name (--weight-ui)  ·  timestamp (--ink-hint, viewer-local, <time>)  ·  [kind badge]
               body (--text-small, --weight-body), indented under the name column
               [reactions row]
```

- Per-kind variation confined to the LEFT ACCENT BAR + the BADGE SLOT, nothing else:
  comment=gold bar/no badge · update=update_type bar+UpdateBadge · completion=green bar+✓ ·
  system=slate bar+⚙ System pill · Hermes=gold ring card, HermesMark in the avatar/name slot ·
  @me=🔒 AuthorOnlyBadge inline · task-origin-in-project-feed=TaskOriginBadge secondary line.
- Uniform vertical rhythm — one spacing token between entries, no per-kind margin drift.
- Empty states are MINIMAL: one quiet `--ink-hint` line ("No activity yet"), never a tall
  reserved block.
- CONTENT cleanliness of machine entries (raw typed IDs, rambling autolog text) is the nightly
  activity-gardener's job (PB `scripts/gardener/`) — never solve content noise with renderer
  special-cases, and never machine-rewrite human-authored text.

### Section rhythm (detail panels)

Title block → inline field row (Status/Priority/Project/Due ▾) → composer → tab bar read as
DISTINCT sections (structural `--border-subtle` separation + consistent padding scale).
Metadata (created · acknowledged) is one quiet one-liner. Assignee is a compact avatar-pill,
same visual weight as the field-row selects.

## THE LOCKED PANEL STYLE (Nick-validated 2026-06-11: "lock it in this is great") — house canon

Eight live-review rounds on TaskDetailPanel converged the house style. These principles are
CANON for every surface; the N1b de-box sweep propagates them (drawers → toolbars → composer
surfaces → card interiors). Deviations need Nick's explicit OK.

1. **One continuous surface.** No alternating background bands to separate sections. Separation
   = whitespace rhythm + the tab row's own active underline. Sticky headers get a single
   hairline, not their own band.
2. **Borderless until interactive.** Resting = quiet text + ▾ affordance; hover = `--hover-subtle`
   tint ONLY (never an outline — and watch for INNER components leaking their own hover borders,
   e.g. the DateInput-inside-pill case, `[data-ghost-pill]` override); keyboard focus = visible
   ring (a11y; only the resting/hover border is banned).
3. **Box budget of one.** Per view, exactly ONE input-inviting element is boxed/elevated — the
   composer. It floats: `--surface-2` bg + radius only, NO outline, NO shadow. Search inputs are
   the other legitimate box. Tables keep their grid (structural); their toolbars de-box.
4. **Pill controls.** Inline field triggers (status/priority/project/due/assignee) and mode
   toggles are full-radius pills (`--radius-full`, ~3px 10px padding). Chips only where semantic
   (links, sources). NO redundant icons inside pills when the value is self-describing (the
   calendar-icon-on-due case).
5. **GhostSelect is the canonical picker** (`src/components/ui/GhostSelect.tsx`): ghost pill
   trigger; fully-opaque themed menu (Rule 45), radius-lg corners; portal-positioned and
   REPOSITIONS on scroll (never close-on-scroll); keyboard nav; `searchable` prop for long lists
   (auto-focused filter input — projects etc.). Never native `<select>` on styled surfaces.
6. **Floating side-peek panels.** Detail panels inset from the viewport (~12px top/right/bottom),
   `--radius-xl` ALL corners, `overflow: hidden`, ONE large soft shadow
   (`0 8px 40px rgba(0,0,0,0.45)` dark), no hard edge-bolted walls. Mobile stays a full-screen
   sheet.
7. **Title-group / action-group rhythm.** Descriptive metadata (created · acknowledged · source)
   snugs UNDER the title block; the editable field row OPENS the action section with the
   composer; then tabs. "What is this" and "act on it" are distinct groups.
8. **Empty states are one quiet line.** Ghost text at `--ink-hint` ("Add description…",
   "No activity yet") — never a reserved bordered block, never a pre-rendered toolbar.

## ATTENTION & NOTIFICATION CANON (Nick-driven, 2026-06-11 seen-model session)

The Slack-style seen model shipped 2026-06-11 (auto-acknowledge, entity_seen v81, portal
bell). These principles are CANON for any future badge, chip, counter, or notification:

1. **Two distinct attention signals, never conflated.** Gold ✦ NEW = an ASSIGNMENT you've
   never opened (`tasks.acknowledged_at IS NULL`; one-shot, cleared by opening; reset by
   reassignment). Teal ● n NEW = new CONVERSATION on something you've already seen
   (`entity_seen` vs `activity_entries`; recurring). Gold wins when both could apply.
   Render ONLY through `src/components/tasks/AttentionChip.tsx` — never fork a chip.
2. **Badge honesty.** A count in the nav must be (a) what it claims, (b) drainable by
   interacting with the thing it counts, and (c) a door to the pointed list behind it.
   Nick (verbatim class): "a badge that doesn't drain when you interact is noise"; a badge
   with no clickable list behind it "makes it seem like you can click and there is a list
   … but that isn't possible". The 231-overdue badge failed all three (and was counting
   soft-deleted rows). Never ship a permanently-red ambient-guilt number.
3. **Seeing is the interaction.** Opening a thing marks it seen/acknowledged/read — never
   an explicit "Acknowledge"/"mark read" chore. Bell dropdown: unread highlights persist
   while open, everything marks read on close (Slack semantics).
4. **Clicks open the actionable entity, never "just another page".** Every notification /
   attention row deep-links into the entity's editor (in-place panel when the surface can
   host one, `?open=` deep-link otherwise). Corollary: ALL legacy redirects use
   `NavigateKeepSearch` — a plain `<Navigate>` silently drops `?open=`/`?create=` and
   produces exactly the "lands on a bare page" failure (209 notification links were dead
   for weeks this way).
5. **Premium chip anatomy** (the AttentionChip recipe — reuse for any future signal pill):
   full-radius pill, hairline border at ~28% of the accent, whisper fill at ~9%, 8.5px
   700-weight caps with 0.12em tracking, tabular numerals, glyph not punctuation (✦ /
   ringed 5px dot). No animation (Rule 44); the Right-Now glow stays the page's only glow.

## ICON DISCIPLINE (Nick 2026-06-11: "looks pixely and not premium")

- **Small icons get a true 1.5px stroke**: lucide's default `strokeWidth=2` on its 24-grid
  scales to a soft ~1.5px at size 16-18 with no pixel alignment — fuzzy on standard-DPI.
  Use `strokeWidth={1.5} absoluteStrokeWidth` (see `ICON_PROPS` in `Sidebar.tsx`).
- **Contained glyphs over overflowing ones** at small sizes (`SquareCheck` not
  `CheckSquare` — the overflowing check reads busy at 18px).
- **Class-sweep pending**: this is currently applied only to the Sidebar. The site-wide
  pass (MobileTabBar, toolbars, panels, empty states) is a queued task — apply the same
  treatment wherever icons render at ≤20px.
