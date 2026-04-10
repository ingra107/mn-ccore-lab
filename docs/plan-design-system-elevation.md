# Hub Design System Elevation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate the MN-CCORE Lab Hub's design quality to match world-class products (Linear, Vercel, Airtable, Stripe) by systematically replacing ad-hoc values with a principled token system, upgrading component interactions, and adding density controls.

**Architecture:** Bottom-up: tokens first (CSS variables), then component upgrades that consume them, then page-level polish. Each task is independently deployable. Dark mode is primary.

**Tech Stack:** React 19, Tailwind v4, CSS custom properties (OKLCH), Framer Motion 12, DM Sans variable font

**Working Directory:** `C:\Users\ingra107\mn-ccore-lab`

---

## Context

### Current State (audited 2026-04-10)

**What's good:** OKLCH color space, dark-first design, existing token layer (`--ink`, `--slate`, `--gold`, `--teal`), spacing rhythm (`--sp-xs` through `--sp-2xl`), element height tokens, inline editing patterns, `@dnd-kit` drag-drop, 546 Playwright tests.

**What's inconsistent (hardcoded audit):**
- 308 hardcoded `fontWeight` values (not tokenized)
- 354 hardcoded `borderRadius` values (7 exist as tokens, used only 7 times)
- 138 hardcoded `transition` values (mixed durations: 0.1s, 0.12s, 0.15s, 0.2s, 150ms)
- 41 hardcoded `boxShadow` values (only 13 use `var(--shadow-*)`)
- Font sizes: 203x `'10px'`, 144x `'12px'`, 74x `'11px'`, 77x `'9px'` — ad-hoc
- Opacity: 178x `0.6`, 152x `0.7`, 95x `0.3`, 76x `0.4`, 50x `0.5` — no semantic meaning

**Research findings (from Airtable, Vercel/Geist, Linear, Stripe):**
- All 4 use exactly 3 font weights with strict roles
- All 4 use 8px base grid (we do too)
- All 4 avoid pure white text on dark (we use `#e2e8f0` — correct)
- Linear/Vercel use luminance-based elevation on dark, not shadows
- Geist uses 10-step semantic color scale with role-based naming
- Airtable uses 13px body, 32px row height, opacity for hover states
- Stripe uses `font-variant-numeric: tabular-nums`, right-aligns numbers
- All 4 tighten letter-spacing at display sizes (we added this today)

---

## Task 0: Read Context Before Any Code

**Before writing a single line, read these files:**

1. **Hub CLAUDE.md** — design ethos (9 principles), palette, fonts, architecture
2. **Current CSS tokens** — `src/index.css` (lines 1-300)
3. **Design research** — `docs/design-system-research.md`
4. **Key components:**
   - `src/components/InlineSelect.tsx`
   - `src/components/tasks/TaskGridView.tsx` (lines 909-975 for InlineCellSelect)
   - `src/components/Sidebar.tsx`
5. **Recent git log:** `git log --oneline -15`

---

## File Map

| Action | File | What Changes |
|--------|------|-------------|
| Modify | `src/index.css` | Token foundation: weights, typography scale, opacity tiers, elevation, animation, shadows |
| Modify | `src/components/InlineSelect.tsx` | Typeahead filter, keyboard nav, focus ring |
| Modify | `src/components/tasks/TaskGridView.tsx` | Density toggle, right-aligned numbers, InlineCellSelect typeahead |
| Create | `src/components/DensityToggle.tsx` | 3-mode density control (compact/default/relaxed) |
| Modify | `src/components/Sidebar.tsx` | Luminance elevation, active state polish |
| Modify | `src/pages/Projects.tsx` | Density toggle integration |
| Modify | `src/pages/portal/MyTasks.tsx` | Density toggle integration |

---

### Task 1: Font Weight Token System

**Problem:** 308 hardcoded fontWeight values. Weights 400, 500, 600, 700 used without semantic meaning.

**Design decision:** 3 semantic weight tokens matching the universal pattern:
- `--weight-body: 400` — reading text, descriptions, cell values
- `--weight-ui: 500` — interactive elements, nav items, table headers, badges, buttons
- `--weight-heading: 600` — page titles, section headers, emphasis
- `--weight-metric: 700` — dashboard hero numbers only (no body text ever)

**Files:** Modify: `src/index.css`

- [ ] **Step 1:** Add weight tokens after `--value-weight` (~line 128):
```css
--weight-body: 400;
--weight-ui: 500;
--weight-heading: 600;
--weight-metric: 700;
```

- [ ] **Step 2:** Wire existing aliases: `--label-weight: var(--weight-heading);` `--value-weight: var(--weight-body);`

- [ ] **Step 3:** Add heading rule: `h1, h2, h3, h4, h5, h6 { font-weight: var(--weight-heading); }`

- [ ] **Step 4:** `npm run build` — verify passes

- [ ] **Step 5:** Commit: `"design: add 3-tier font weight token system"`

---

### Task 2: Typography Scale Tokens

**Problem:** 12 different pixel values used 800+ times with no semantic naming.

**Design decision:** Named scale inspired by Geist's label/copy/heading separation, mapped to our existing `--label-size`/`--value-size`:

```css
--text-micro: 9px;      /* badges, tiny labels */
--text-caption: 10px;   /* timestamps, meta, column headers (uppercase) */
--text-label: 11px;     /* field labels, section dividers */
--text-small: 12px;     /* secondary content, table cells, sidebar items */
--text-body: 13px;      /* primary content, cell values */
--text-base: 14px;      /* buttons, links, nav items */
--text-md: 16px;        /* body paragraphs, descriptions */
--text-lg: 18px;        /* sub-headings */
--text-xl: 24px;        /* section titles */
--text-2xl: 32px;       /* page titles */
```

**Files:** Modify: `src/index.css`

- [ ] **Step 1:** Add tokens after `--value-size`
- [ ] **Step 2:** Wire aliases: `--label-size: var(--text-label);` `--value-size: var(--text-body);`
- [ ] **Step 3:** `npm run build` — verify
- [ ] **Step 4:** Commit: `"design: add named typography scale tokens"`

---

### Task 3: Opacity Semantic Tokens

**Problem:** 6 opacity values used 700+ times. No guidance on which to use.

**Design decision:** 5-tier hierarchy:
- `--ink-primary: 1.0` — active text, headings
- `--ink-muted: 0.7` — secondary text, metadata (replaces ad-hoc 0.6 and 0.7)
- `--ink-label: 0.55` — field labels, column headers
- `--ink-hint: 0.4` — placeholder text, subtle hints
- `--ink-disabled: 0.3` — disabled states

**Files:** Modify: `src/index.css`

- [ ] **Step 1:** Add `--ink-muted: 0.7;` and `--ink-disabled: 0.3;` after `--ink-hint`
- [ ] **Step 2:** `npm run build` — verify
- [ ] **Step 3:** Commit: `"design: add semantic opacity tokens"`

---

### Task 4: Elevation System — Luminance on Dark, Shadows on Light

**Problem:** Dark mode shadows are invisible. Linear/Vercel prove luminance stepping works.

**Design decision:** Surface elevation tokens:
```css
/* Light: subtle tints */
--surface-0: var(--cream);
--surface-1: rgba(0, 0, 0, 0.02);
--surface-2: rgba(0, 0, 0, 0.04);
--surface-3: rgba(0, 0, 0, 0.06);

/* Dark: luminance stepping */
--surface-0: var(--cream);
--surface-1: rgba(255, 255, 255, 0.02);
--surface-2: rgba(255, 255, 255, 0.04);
--surface-3: rgba(255, 255, 255, 0.06);
```

Plus menu shadow (Geist shadow-as-border pattern):
```css
--shadow-menu: 0 0 0 1px var(--border-subtle), 0 4px 16px rgba(0,0,0,0.12);
/* dark: */ 0 0 0 1px var(--border-default), 0 4px 16px rgba(0,0,0,0.5);
```

**Files:** Modify: `src/index.css`

- [ ] **Step 1:** Add surface tokens to `:root` and `.dark`
- [ ] **Step 2:** Add `--shadow-menu` to both modes
- [ ] **Step 3:** `npm run build` — verify
- [ ] **Step 4:** Commit: `"design: luminance-based elevation + menu shadow tokens"`

---

### Task 5: Animation Timing Tokens

**Problem:** 138 hardcoded transitions, 8+ different durations. Research consensus: 100/150/200/300ms.

**Design decision:** Replace existing tokens with expanded system + `prefers-reduced-motion`:
```css
--duration-instant: 0ms;
--duration-fast: 100ms;
--duration-normal: 150ms;
--duration-moderate: 200ms;
--duration-slow: 300ms;
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);     /* Vercel curve */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

Legacy aliases preserved: `--transition-fast: var(--duration-normal)`, `--transition-panel: var(--duration-moderate)`.

**Files:** Modify: `src/index.css`

- [ ] **Step 1:** Replace transition section with expanded tokens
- [ ] **Step 2:** Add `@media (prefers-reduced-motion: reduce)` zeroing all durations
- [ ] **Step 3:** `npm run build` — verify
- [ ] **Step 4:** Commit: `"design: expand animation timing + prefers-reduced-motion"`

---

### Task 6: Density Toggle Component

**Problem:** No user control over table density. All 4 researched systems offer this.

**Design decision:** 3 modes — Compact (36px), Default (44px), Relaxed (52px). localStorage persistence.

**Files:**
- Modify: `src/index.css` (density CSS variables)
- Create: `src/components/DensityToggle.tsx`

- [ ] **Step 1:** Replace density section in CSS with `--row-height`, `--row-padding-y`, `--cell-font-size` variables for each mode

- [ ] **Step 2:** Create `DensityToggle.tsx` with `useDensity()` hook (localStorage), `densityClass()` helper, and 3-button toggle UI using `AlignJustify`, `List`, `StretchHorizontal` icons

- [ ] **Step 3:** `npx tsc --noEmit` — verify types
- [ ] **Step 4:** Commit: `"feat: density toggle component + CSS modes"`

---

### Task 7: Wire Density to TaskGridView + MyTasks

**Files:** Modify: `src/components/tasks/TaskGridView.tsx`, `src/pages/portal/MyTasks.tsx`

- [ ] **Step 1:** Import `useDensity`, `DensityToggle`, `densityClass` in MyTasks
- [ ] **Step 2:** Add DensityToggle to toolbar, wrap grid in `densityClass(density)` div
- [ ] **Step 3:** Update TaskGridView to use `var(--row-height)` instead of `ROW_HEIGHT = 44`
- [ ] **Step 4:** `npm run build` — verify
- [ ] **Step 5:** Commit: `"feat: wire density to task grid"`

---

### Task 8: InlineSelect Typeahead + Keyboard Navigation

**Problem:** No filtering in dropdowns. Airtable gold standard: type to filter, arrow keys, Enter to select.

**Files:** Modify: `src/components/InlineSelect.tsx`

- [ ] **Step 1:** Add `filter`, `focusedIdx`, `filterRef` state
- [ ] **Step 2:** Add `filtered` memo with case-insensitive substring match
- [ ] **Step 3:** Add `handleKeyDown` for ArrowDown/Up/Enter/Escape
- [ ] **Step 4:** Add filter input (shown when options >= 5) with `--field-bg` background
- [ ] **Step 5:** Update option rendering with focus highlight (`rgba(45,138,138,0.10)`)
- [ ] **Step 6:** Replace hardcoded shadow with `var(--shadow-menu)`
- [ ] **Step 7:** `npm run build` — verify
- [ ] **Step 8:** Commit: `"feat: InlineSelect typeahead + keyboard nav"`

---

### Task 9: InlineCellSelect Typeahead (TaskGridView)

Same pattern as Task 8, applied to `InlineCellSelect` in `TaskGridView.tsx` (lines 909-975).

- [ ] **Step 1-5:** Mirror Task 8 for InlineCellSelect
- [ ] **Step 6:** `npm run build` — verify
- [ ] **Step 7:** Commit: `"feat: InlineCellSelect typeahead + keyboard nav"`

---

### Task 10: Sidebar Luminance Elevation

**Files:** Modify: `src/components/Sidebar.tsx`, `src/index.css`

- [ ] **Step 1:** Read Sidebar.tsx fully (check CLAUDE.md for active state rules)
- [ ] **Step 2:** Apply `background: var(--surface-1)` to sidebar container
- [ ] **Step 3:** Add `.menu-surface` utility class in CSS with dark mode `color-mix`
- [ ] **Step 4:** `npm run build` — verify
- [ ] **Step 5:** Commit: `"design: sidebar luminance elevation"`

---

### Task 11: Border Radius Token Migration

**Problem:** 354 hardcoded borderRadius values. Tokens exist but barely used.

**Files:** Modify: `src/index.css` + batch across component files

- [ ] **Step 1:** Add `--radius-2xl: 16px`, `--radius-full: 9999px`, `--radius-circle: 50%`
- [ ] **Step 2:** Batch replace: `'4px'` -> `var(--radius-sm)`, `'6px'` -> `var(--radius-md)`, `'8px'` -> `var(--radius-lg)`, `'12px'` -> `var(--radius-xl)`, `'50%'` -> `var(--radius-circle)`, `'9999px'` -> `var(--radius-full)`
- [ ] **Step 3:** Verify zero remaining: `grep -r "borderRadius: '[0-9]" src/ | grep -v "var(--radius" | wc -l`
- [ ] **Step 4:** `npm run build` — verify
- [ ] **Step 5:** Commit: `"design: migrate 206 hardcoded borderRadius to tokens"`

---

### Task 12: Box Shadow Token Migration

**Problem:** 41 hardcoded shadows, only 13 tokenized.

- [ ] **Step 1:** Map each shadow to `--shadow-card`, `--shadow-card-hover`, `--shadow-elevated`, or `--shadow-menu`
- [ ] **Step 2:** Replace all hardcoded shadows
- [ ] **Step 3:** `npm run build` — verify
- [ ] **Step 4:** Commit: `"design: migrate hardcoded shadows to elevation tokens"`

---

### Task 13: Right-Align Numeric Columns

**Problem:** Stripe right-aligns all numbers for scan-ability. Our numeric data is left-aligned.

**Files:** Modify: `TaskGridView.tsx`, `Projects.tsx`, other table pages

- [ ] **Step 1:** Add `textAlign: 'right'` to due date column header + cells in TaskGridView
- [ ] **Step 2:** Apply to Projects table numeric columns (task count, health)
- [ ] **Step 3:** `npm run build` — verify
- [ ] **Step 4:** Commit: `"design: right-align numeric columns"`

---

### Task 14: Wire Density to All Data Tables

**Problem:** Density toggle only on MyTasks after Task 7. 8 other tables need it.

**Files:** Modify: Projects, Deadlines, Manuscripts, Grants, Ideas, MenteeMilestones pages

- [ ] **Step 1:** Import `useDensity` + `DensityToggle` + `densityClass` in each page
- [ ] **Step 2:** Add toggle to toolbar, wrap table in density class
- [ ] **Step 3:** Update rows to use `var(--row-height)` and `var(--row-padding-y)`
- [ ] **Step 4:** `npm run build` — verify
- [ ] **Step 5:** Commit: `"feat: density toggle on all data tables"`

---

## Verification Checklist

| Check | How |
|-------|-----|
| Build passes | `npm run build` |
| TypeScript clean | `npx tsc --noEmit` |
| Token coverage up | Count `var(--` in index.css |
| Density works | Click compact/default/relaxed, verify row heights change |
| Typeahead works | Open InlineSelect with 5+ options, type to filter |
| Keyboard nav | Arrows move focus, Enter selects, Escape closes |
| Dark mode solid | All surfaces use luminance tokens |
| Reduced motion | `prefers-reduced-motion: reduce` in DevTools — no animations |
| No regressions | Visual check Dashboard, Projects, Tasks, ProjectDetail |

## Deferred to Future Sessions

- 10-step semantic color scale (Geist pattern)
- Hardcoded fontWeight mass migration (308 values — token defined, migration separate)
- Hardcoded transition mass migration (138 values)
- Hardcoded opacity mass migration (700+ values)
- Command palette (Linear Cmd+K)
- Multiple views of same data (Notion pattern)
