# Complete Token Compliance + Visual Polish + Homepage Audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Achieve 100% design token compliance across the codebase, apply visual polish improvements, audit/fix the public homepage, and ship everything in a single deploy.

**Architecture:** Define missing token categories (z-index, semantic rgba, hover states) in `src/index.css`, then mechanically replace hardcoded values in components with token references. All substitutions produce identical visual output unless explicitly noted as improvements. Visual improvements: row height reduction, opacity rationalization, homepage readability fixes, welcome banner gating, persistent tooltip fix.

**Tech Stack:** React 19 + Tailwind v4 + CSS custom properties. No new dependencies.

**Important context for implementers:**
- SVG/Canvas components (`CLIFMap.tsx`, `CollaborationGraph.tsx`, `CollaborationNetwork.tsx`, `EnhancedCollaborationNetwork.tsx`, `ActivityHeatmap.tsx`, `NetworkBackground.tsx`) CANNOT use CSS variables — `ctx.fillStyle` and SVG attributes don't resolve `var()`. Leave these hardcoded.
- Recharts chart color arrays (`taskConstants.ts STAGE_COLORS`, `statusColors.ts STATUS_BG`) need static strings. Leave these hardcoded.
- White-on-accent button text (`#0f1923` on gold backgrounds in `Button.tsx`, `MeetingDetail.tsx`) was audited and confirmed correct. Do NOT change.
- CV page was removed (feature cut). No CV-related code to worry about.
- Gold borders on MeetingPrep filter toggles are intentional brand accents. Do NOT change.
- The token system is defined in `src/index.css` lines 1-200. Read it fully before starting.

---

## Task 1: Define Missing Token Categories in index.css

**Files:**
- Modify: `src/index.css` (add tokens after existing ones, ~line 117)

This task defines the tokens that other tasks reference. Must be done first.

- [ ] **Step 1: Add z-index token system**

Add after the `.dark { letter-spacing: 0.01em; }` block (~line 117):

```css
/* ── Z-Index Hierarchy ── */
/* Predictable stacking: every z-index in the codebase references a token */
:root {
  --z-base: 1;
  --z-sticky: 10;        /* sticky headers, floating labels */
  --z-dropdown: 50;      /* dropdowns, popovers, inline selects */
  --z-sidebar: 100;      /* sidebar, navigation panels */
  --z-modal-backdrop: 400; /* modal backdrop overlay */
  --z-modal: 500;        /* modals, command palette, global quick add */
  --z-toast: 9999;       /* toasts, route progress bar, hover cards */
}
```

- [ ] **Step 2: Add semantic rgba hover/overlay tokens**

Add after the z-index block:

```css
/* ── Semantic Overlay & Hover Tokens ── */
/* Standardized opacity tiers: 0.03 / 0.06 / 0.10 / 0.15 / 0.20 / 0.40 / 0.70 */
:root {
  --hover-subtle: rgba(0, 0, 0, 0.03);
  --hover-light: rgba(0, 0, 0, 0.06);
  --hover-medium: rgba(0, 0, 0, 0.10);
  --overlay-light: rgba(0, 0, 0, 0.15);
  --overlay-medium: rgba(0, 0, 0, 0.40);
  --overlay-heavy: rgba(0, 0, 0, 0.70);

  --gold-hover: rgba(201, 168, 76, 0.06);
  --gold-active: rgba(201, 168, 76, 0.10);
  --gold-emphasis: rgba(201, 168, 76, 0.15);
  --teal-hover: rgba(45, 138, 138, 0.06);
  --teal-active: rgba(45, 138, 138, 0.10);
  --teal-emphasis: rgba(45, 138, 138, 0.15);
  --maroon-hover: rgba(122, 0, 25, 0.06);
  --maroon-emphasis: rgba(122, 0, 25, 0.15);
  --orange-hover: rgba(194, 65, 12, 0.06);
  --green-hover: rgba(22, 163, 74, 0.06);
}

.dark {
  --hover-subtle: rgba(255, 255, 255, 0.03);
  --hover-light: rgba(255, 255, 255, 0.06);
  --hover-medium: rgba(255, 255, 255, 0.10);
  --overlay-light: rgba(0, 0, 0, 0.30);
  --overlay-medium: rgba(0, 0, 0, 0.50);
  --overlay-heavy: rgba(0, 0, 0, 0.80);
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "design: add z-index hierarchy + semantic rgba tokens to design system"
```

---

## Task 2: Z-Index Token Migration (47 values → 7 tokens)

**Files:**
- Modify: All files containing `zIndex:` in inline styles (47 instances across ~25 files)

**Mapping rules:**
- `zIndex: 0` or `zIndex: 1` → `zIndex: 'var(--z-base)'` (or remove if unnecessary)
- `zIndex: 2` through `zIndex: 10` → `zIndex: 'var(--z-sticky)'`
- `zIndex: 20` or `zIndex: 21` → `zIndex: 'var(--z-dropdown)'`
- `zIndex: 50` → `zIndex: 'var(--z-dropdown)'`
- `zIndex: 100` → `zIndex: 'var(--z-sidebar)'`
- `zIndex: 500` or `zIndex: 501` → `zIndex: 'var(--z-modal)'`
- `zIndex: 9998` or `zIndex: 9999` → `zIndex: 'var(--z-toast)'`

Also check Tailwind classes: `z-50`, `z-40`, `z-30`, `z-20`, `z-10` in className strings — leave these as Tailwind classes but verify they align with the token hierarchy.

- [ ] **Step 1: Find all zIndex occurrences**

Run: `grep -rn "zIndex:" src/ --include="*.tsx" --include="*.ts"`

- [ ] **Step 2: Replace each occurrence using the mapping above**

Skip files in the exclusion list (SVG/Canvas components). For each file, replace the bare number with the CSS variable string.

Example: In `GlobalQuickAdd.tsx`, change:
```tsx
zIndex: 500
```
to:
```tsx
zIndex: 'var(--z-modal)'
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build. TypeScript accepts string values for zIndex in CSSProperties.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "design: migrate 47 z-index values to semantic token hierarchy"
```

---

## Task 3: Border Radius Token Migration (~131 values)

**Files:**
- Modify: All files with `borderRadius:` in inline styles, excluding SVG/Canvas components

**Mapping rules (snap to nearest token):**
- `borderRadius: 2` or `borderRadius: 3` → `borderRadius: 'var(--radius-sm)'` (4px)
- `borderRadius: 4` → `borderRadius: 'var(--radius-sm)'`
- `borderRadius: 5` or `borderRadius: 6` → `borderRadius: 'var(--radius-md)'`
- `borderRadius: 8` → `borderRadius: 'var(--radius-lg)'`
- `borderRadius: 10` or `borderRadius: 12` → `borderRadius: 'var(--radius-xl)'`
- `borderRadius: 16` → `borderRadius: 'var(--radius-2xl)'`
- `borderRadius: 9999` or `borderRadius: '50%'` → `borderRadius: 'var(--radius-full)'` or `'var(--radius-circle)'`

- [ ] **Step 1: Find all borderRadius occurrences**

Run: `grep -rn "borderRadius:" src/ --include="*.tsx" --include="*.ts" | grep -v "var(--radius"`

- [ ] **Step 2: Replace each occurrence using the mapping above**

Skip: LoadingSkeleton.tsx skeleton shapes where `borderRadius: 2` is intentional for text block placeholders — snap to `var(--radius-sm)` anyway.

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "design: migrate ~131 borderRadius values to --radius-* tokens"
```

---

## Task 4: Spacing Token Migration (~860 inline values)

**Files:**
- Modify: All files with `padding:`, `margin:`, `gap:` bare numbers in inline styles

**Mapping rules:**
- `2` → leave as-is (below token scale, fine for tiny adjustments)
- `3` → leave as-is
- `4` → `'var(--sp-xs)'`
- `6` → leave as-is (between xs and sm, acceptable)
- `8` → `'var(--sp-sm)'`
- `12` → `'var(--sp-md)'`
- `16` → `'var(--sp-lg)'`
- `20` → leave as-is (between lg and xl)
- `24` → `'var(--sp-xl)'`
- `32` → `'var(--sp-2xl)'`

For compound values like `padding: '8px 16px'`, convert to `padding: 'var(--sp-sm) var(--sp-lg)'`.

**Important:** Only convert values that are exact matches to the token scale (4, 8, 12, 16, 24, 32). Leave off-scale values (2, 3, 6, 10, 14, 20) as-is — they're intentional micro-adjustments.

- [ ] **Step 1: Find all inline padding/margin/gap with bare numbers**

Run: `grep -rn "padding:\|margin:\|gap:" src/ --include="*.tsx" | grep -v "var(--sp" | head -50`

- [ ] **Step 2: Replace on-scale values with tokens**

Work file-by-file, largest files first (ProjectDetail, TrajectoryPage, TaskGridView, etc.).

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "design: migrate on-scale spacing values to --sp-* tokens"
```

---

## Task 5: Color Literal Migration (~40 non-viz instances)

**Files:**
- Modify: Components using `'#fff'`, `'#ffffff'`, `'white'`, `'#000'`, `'#0f1923'` outside of SVG/Canvas/Chart contexts

**Mapping:**
- `'#fff'` / `'#ffffff'` / `'white'` → `'var(--ink-bright, #fff)'` (in dark contexts where white is intended) or `'var(--cream)'` (for backgrounds)
- `'#0f1923'` → `'var(--ink)'` (only in non-accent contexts — white-on-gold buttons stay as-is)
- `'#000'` / `'black'` → `'var(--ink)'`

**Key files to check:**
- `Layout.tsx` (~12 instances of hover `color: '#ffffff'` and `'#c9a84c'`)
- `DensityToggle.tsx` (`color: '#fff'`)
- `ConferencePrep.tsx`
- `CreateDecisionModal.tsx`

- [ ] **Step 1: Find color literals**

Run: `grep -rn "'#fff\|'#ffffff\|'white'\|'#000\|'black'" src/ --include="*.tsx" | grep -v "CLIFMap\|Collaboration\|Network\|Heatmap\|BrandName"`

- [ ] **Step 2: Replace with token references per mapping**

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "design: replace color literals with token references in non-viz components"
```

---

## Task 6: Hex Color Migration (~130 non-viz instances)

**Files:**
- Modify: Components using hex colors that have CSS variable equivalents

**Mapping:**
- `'#c9a84c'` → `'var(--gold)'`
- `'#2d8a8a'` → `'var(--teal)'`
- `'#7a0019'` → `'var(--maroon)'`
- `'#c2410c'` → `'var(--orange)'`
- `'#16a34a'` → `'var(--green)'`
- `'#22c55e'` → `'var(--green-light)'`
- `'#64748b'` → `'var(--slate)'`
- `'#0f1923'` → `'var(--ink)'`
- `'#e2e8f0'` → `'var(--ink)'` (dark mode ink)

**Exclusions (leave hardcoded):**
- `Button.tsx:23` — white-on-gold confirmed correct
- `MeetingDetail.tsx:560` — white-on-accent confirmed correct
- All SVG/Canvas/Chart components
- `taskConstants.ts`, `statusColors.ts` — Recharts needs static strings
- `SettingsPage.tsx` theme preview swatches — intentional hardcoded mockups

- [ ] **Step 1: Find hex colors in non-excluded files**

Run: `grep -rn "'#[0-9a-fA-F]\{6\}'" src/ --include="*.tsx" | grep -v "CLIFMap\|Collaboration\|Network\|Heatmap\|BrandName\|taskConstants\|statusColors"`

- [ ] **Step 2: Replace with token references per mapping**

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "design: replace ~130 hex colors with CSS variable tokens"
```

---

## Task 7: Semantic RGBA Migration (~400 non-viz instances)

**Files:**
- Modify: Components using inline `rgba()` that match the new semantic tokens

**Mapping (exact or near-match to token):**
- `rgba(201, 168, 76, 0.06)` → `'var(--gold-hover)'`
- `rgba(201, 168, 76, 0.10)` or `0.08` → `'var(--gold-active)'`
- `rgba(201, 168, 76, 0.12)` or `0.15` → `'var(--gold-emphasis)'`
- `rgba(45, 138, 138, 0.06)` → `'var(--teal-hover)'`
- `rgba(45, 138, 138, 0.08)` or `0.10` → `'var(--teal-active)'`
- `rgba(45, 138, 138, 0.12)` or `0.15` → `'var(--teal-emphasis)'`
- `rgba(122, 0, 25, 0.06)` or `0.08` → `'var(--maroon-hover)'`
- `rgba(122, 0, 25, 0.12)` or `0.15` → `'var(--maroon-emphasis)'`
- `rgba(194, 65, 12, 0.06)` or `0.08` → `'var(--orange-hover)'`
- `rgba(22, 163, 74, 0.06)` or `0.08` → `'var(--green-hover)'`
- `rgba(0, 0, 0, 0.03)` or `0.02` → `'var(--hover-subtle)'`
- `rgba(0, 0, 0, 0.06)` or `0.04` or `0.05` → `'var(--hover-light)'`
- `rgba(0, 0, 0, 0.10)` or `0.08` → `'var(--hover-medium)'`
- `rgba(0, 0, 0, 0.15)` → `'var(--overlay-light)'`
- `rgba(0, 0, 0, 0.4)` or `0.5` → `'var(--overlay-medium)'`
- `rgba(0, 0, 0, 0.7)` or `0.8` → `'var(--overlay-heavy)'`
- `rgba(255, 255, 255, ...)` in dark mode contexts → leave as-is (these are already correct for dark surface elevation)

**Note on opacity rationalization:** When an rgba value is close but not exact (e.g., `0.04` vs token `0.03`), snap to the nearest token tier. This is the visual improvement — standardizing creates rhythm.

- [ ] **Step 1: Find rgba values in non-excluded files**

Run: `grep -rn "rgba(" src/ --include="*.tsx" | grep -v "CLIFMap\|Collaboration\|Network\|Heatmap\|BrandName\|index.css\|statusColors\|taskConstants" | head -60`

- [ ] **Step 2: Replace with semantic token references per mapping**

Work in batches by color (all gold first, then teal, then neutral, etc.).

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "design: migrate ~400 rgba values to semantic hover/overlay tokens"
```

---

## Task 8: Row Height / Line-Height Improvement

**Files:**
- Modify: `src/index.css` (density mode section, ~line 120)

**Context:** Row line-height was left at 1.6 as "user choice" in Session-Handoff. Nick wants to revisit. The reduction from 1.6 to 1.35 makes tables denser and more professional (Linear/LabSync feel).

- [ ] **Step 1: Reduce task-grid-row line-height**

In `src/index.css`, find the `.task-grid-row` or table row styling. Add:

```css
.task-grid-row {
  line-height: 1.35;
}
```

If there's no existing `.task-grid-row` class, add it to the table density section. Also check if `TaskGridView.tsx` has inline `lineHeight` — if so, change there instead.

- [ ] **Step 2: Verify build and visually inspect**

Run: `npm run build`
Then check with a local dev server or deploy preview. The rows should feel tighter and more scannable.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "design: reduce table row line-height to 1.35 for denser data scanning"
```

---

## Task 9: Welcome Banner + Tooltip Fixes

**Files:**
- Modify: `src/pages/Dashboard.tsx` (welcome banner gating)
- Modify: Wherever the "Press F to toggle filters" tooltip is rendered (check for `PageTooltip` or similar component)

- [ ] **Step 1: Gate welcome banner to first visit only**

Find the welcome banner in `Dashboard.tsx`. It currently shows for all users. Add localStorage gating:

```tsx
const [showWelcome, setShowWelcome] = useState(() => {
  return !localStorage.getItem('hub-welcome-dismissed');
});

const dismissWelcome = () => {
  localStorage.setItem('hub-welcome-dismissed', '1');
  setShowWelcome(false);
};
```

Then wrap the banner JSX in `{showWelcome && ( ... )}` and wire the dismiss button to `dismissWelcome`.

- [ ] **Step 2: Verify persistent tooltip is properly gated**

Search for "Press F" or "toggle filters" in the codebase. If the tooltip component already uses localStorage (the audit suggested it does), verify it works. If it shows on every page load in the live site (it does per our screenshot), find and fix the gating logic.

Run: `grep -rn "Press F\|toggle filters\|PageTooltip" src/ --include="*.tsx"`

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix: gate welcome banner + persistent tooltip to first visit only"
```

---

## Task 10: Homepage Audit & Polish

**Files:**
- Modify: `src/pages/Home.tsx`
- Modify: `src/components/Layout.tsx` (public nav section)

**Context:** 4 design consultants scored the site 7.0-8.2/10 but flagged these homepage issues:
1. Nav barely visible on dark hero
2. "UNIVERSITY OF MINNESOTA" label too small/dim
3. 4th pillar uses off-palette blue (#5b8abf)
4. Hard gradient seam between hero and light section
5. One accent color per view rule violated (5 non-neutral colors on one page)

- [ ] **Step 1: Fix public nav visibility on dark hero**

In `Layout.tsx`, find the public nav rendering for the homepage hero. Add a semi-transparent backdrop or increase nav text opacity:

```tsx
// Add to the nav container on the homepage
style={{
  backgroundColor: 'rgba(0, 0, 0, 0.3)',
  backdropFilter: 'blur(8px)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
}}
```

Or alternatively, make the nav bar have a darker background strip so the links are readable against the hero image.

- [ ] **Step 2: Fix University of Minnesota label**

In `Home.tsx`, find the "UNIVERSITY OF MINNESOTA" text. Increase from ~10px to at least `var(--text-small)` (12px) and raise opacity from ~0.8 to 0.9:

```tsx
style={{
  fontSize: 'var(--text-small)',
  opacity: 0.9,
  letterSpacing: '0.15em',
  fontWeight: 'var(--weight-ui)',
}}
```

- [ ] **Step 3: Fix 4th pillar off-palette blue**

In `Home.tsx`, find the pillars array (~line 50-56). Replace `#5b8abf` with `var(--teal)`:

```tsx
{
  icon: Database,
  title: 'Multi-Center Data Science',
  description: '...',
  color: 'var(--teal)',  // was #5b8abf (off-palette blue)
  stat: 'Open source',
}
```

- [ ] **Step 4: Smooth hero-to-content gradient transition**

Find the transition between the dark hero section and the light content section. Add a transitional gradient band:

```tsx
// After the hero section, before content
<div style={{
  height: 80,
  background: 'linear-gradient(to bottom, oklch(0.12 0 0), var(--page-bg))',
}} />
```

Or adjust the hero's bottom gradient to fade into the page background more gradually.

- [ ] **Step 5: Verify build and take comparison screenshots**

Run: `npm run build`
Then take Playwright screenshots of the homepage in both dark and light mode to compare.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "design: homepage polish — nav visibility, label sizing, palette fix, gradient transition"
```

---

## Task 11: !important Cleanup (Reduce ~110 instances)

**Files:**
- Modify: `src/index.css` and various .tsx files

**Approach:** Don't try to eliminate all — some are fighting Tailwind specificity and are necessary. Focus on:
1. Avatar size overrides (`!w-[22px]`, `!w-7`, `!h-7`) — replace with proper size props on the Avatar component
2. Opacity overrides (`!opacity-100`, `hover:!opacity-100`) — use CSS `:hover` rules instead
3. Density overrides in CSS (`!important` on padding) — increase specificity with better selectors

- [ ] **Step 1: Audit !important usage**

Run: `grep -rn "!important\|\\!" src/ --include="*.tsx" --include="*.css" | grep -v node_modules | head -40`

- [ ] **Step 2: Remove unnecessary overrides**

Focus on the easy wins — Avatar size props, opacity hover states. Leave the CSS density overrides and print styles alone (those legitimately need !important).

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: reduce !important overrides where CSS specificity suffices"
```

---

## Task 12: Stale Branch Cleanup

**Files:** Git branches only (no code changes)

- [ ] **Step 1: List branches to delete**

Run: `git branch | grep "claude/"` to see the 30+ stale worktree branches.

- [ ] **Step 2: Review the Open Science branch**

Run: `git log claude/xenodochial-engelbart --oneline -10` to check if there's unique work worth preserving. If so, note it for future review but don't merge in this sprint.

- [ ] **Step 3: Delete stale branches**

```bash
git branch -D claude/admiring-brahmagupta claude/blissful-archimedes ...
```

Delete all `claude/*` branches EXCEPT `claude/xenodochial-engelbart` (has unique Open Science work). Also keep any branches named `backup-*` or `restore-*`.

- [ ] **Step 4: Verify**

Run: `git branch` — should show only `main` and any deliberately preserved branches.

---

## Task 13: Build, Verify, Deploy

- [ ] **Step 1: Full build verification**

Run: `npm run build`
Expected: Clean build, no errors, no new warnings beyond the known three.js chunk.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Visual regression check**

Take Playwright screenshots of 6 key pages (Dashboard, Tasks, Projects, Settings, Homepage dark, Homepage light) and compare against the pre-change screenshots to verify no visual regressions. Token substitutions should produce identical output; only Task 8 (row height), Task 9 (banner/tooltip), and Task 10 (homepage) should show visible changes.

- [ ] **Step 4: Deploy**

```bash
npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab
```

- [ ] **Step 5: Post-deploy smoke test**

Visit mn-ccore-lab.pages.dev in browser. Check:
- Dashboard loads (dark mode)
- Tasks page table renders
- Projects page renders
- Homepage hero nav is visible
- Welcome banner only shows for new visitors
- No stacking/z-index issues visible

- [ ] **Step 6: Commit deploy marker**

```bash
git add -A
git commit -m "docs: Phase 31 — token compliance, homepage polish, visual improvements"
```

---

## Summary

| Task | Type | Estimated files |
|------|------|-----------------|
| 1. Define missing tokens | Foundation | 1 (index.css) |
| 2. Z-index migration | Functional improvement | ~25 |
| 3. Border radius migration | Visual improvement | ~40 |
| 4. Spacing migration | Maintenance | ~50 |
| 5. Color literal migration | Maintenance | ~15 |
| 6. Hex color migration | Maintenance | ~30 |
| 7. RGBA migration | Visual improvement (opacity rationalization) | ~60 |
| 8. Row height reduction | Visual improvement | 1-2 |
| 9. Welcome banner + tooltip | UX improvement | 2-3 |
| 10. Homepage polish | Visual improvement | 2 |
| 11. !important cleanup | Maintenance | ~15 |
| 12. Branch cleanup | Housekeeping | 0 (git only) |
| 13. Build + verify + deploy | Ship | 0 |
