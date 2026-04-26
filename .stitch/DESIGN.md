# MN-CCORE Lab Hub — Design System (Stitch source of truth)

This file is the design system context for Stitch generation. It mirrors the locked decisions in `CLAUDE.md`. **Do not edit Stitch output to violate these tokens** — translate to them.

---

## Atmosphere

**Operational, not editorial.** This is a research operations center, not a magazine. Design choices prioritize information density, scannability, and inline editability over decoration. Dark-first. Linear / Notion / Airtable-adjacent. NEVER: glassmorphism, neon, gradients, purple, generic AI-slop hero with centered headline.

Vibe: dense data tables, quiet UI, one-accent-per-view, instant inline editing, undo-everywhere optimistic UI.

---

## Platform

- **Web only.** Desktop-first (1280-1920 wide). Mobile responsive at 375 / 414 / 768.
- React 19 + Tailwind v4 (CSS-first config — `@import "tailwindcss"`, no JS config).
- No shadcn. Custom primitives only.

---

## Palette (literal sRGB hex — DO NOT use OKLCH for text)

| Role | Light hex | Dark hex |
|---|---|---|
| **Page background** | `#f5f5f5` | `#0b1017` (deep neutral, NOT blue-tinted) |
| **Card surface** | `#ffffff` | `rgba(255,255,255,0.06)` over page bg |
| **Sidebar bg** (darker than content) | `color-mix(--cream, black 12%)` | `color-mix(--ink, black 12%)` |
| **Primary text** (`--ink-primary`) | `#1a2939` slate | `#e2e8f0` softened white |
| **Muted text** (`--ink-muted` 0.7) | slate × 0.7 | softened white × 0.7 |
| **Slate** | `#1a2939` | `#b0b5b9` |
| **Teal** (interactive accent — primary action) | `#006b66` | `#5cbcb4` |
| **Teal solid** (button bg w/ white text) | `#0d6f68` (both) | `#0d6f68` (both) |
| **Gold** (warning, badges) | `#6b5420` | `#dcb355` |
| **Maroon** (error, deadline) | `#7a0019` | `#f0737e` |
| **Orange** (writing stage) | `#a23d08` | `#f08a5b` |
| **Green** (success, complete) | `#066e2f` | `#6ee89a` |

**One accent per view.** Teal = interactive. Other colors = state-coded only. Max 2 non-neutral colors per screen.

---

## Stage fills (theme-stable bar/pill colors)

For ANY bar / progress strip / status pill where white text sits on top, do NOT use `--teal` / `--gold` / `--slate` (they flip to LIGHT in dark mode and `#fff` text fails ~2:1). Use these dark-stable hex values:

| Token | Hex (both themes) |
|---|---|
| `--stage-fill-idea` | `#4b5563` |
| `--stage-fill-data-collection` | `#0d6f68` (teal) |
| `--stage-fill-analysis` | `#6b5420` (gold) |
| `--stage-fill-writing` | `#a23d08` (orange) |
| `--stage-fill-review` | `#8a1f2e` (maroon) |
| `--stage-fill-submitted` | `#0d6f68` (teal) |
| `--stage-fill-published` | `#066e2f` (green) |

---

## Typography

- **Body text:** DM Sans (sans-serif). EVERYWHERE. Including all UI labels, table cells, card content.
- **Editorial display only** (public marketing site, NOT portal): Fraunces.
- **Monospace:** JetBrains Mono — `<kbd>` only. Zero monospace in normal content.
- **NEVER:** Inter, Roboto, Times New Roman, system serifs, generic Helvetica.

### Weight scale (3 tiers)

- `400` — body / reading
- `500` — interactive (buttons, nav, badges, sidebar active)
- `600` — section titles, emphasis, dashboard metrics

### Opacity scale (5 tiers — never below 0.30 on readable text)

- `--ink-primary` 1.0 — main content
- `--ink-muted` 0.70 — secondary content
- `--ink-label` 0.55 (light) / 0.85 (dark) — column headers, labels
- `--ink-hint` 0.68 (light) / 0.85 (dark) — placeholders, subtitles
- `--ink-disabled` 0.30 — explicitly disabled

### Size scale

- `--text-micro` 10 (mobile floor 11)
- `--text-caption` 10
- `--text-label` 11 (column headers, uppercase 0.06em letter-spacing)
- `--text-small` 12
- `--text-body` 13
- `--text-base` 14
- `--text-md` 16
- `--text-lg` 18
- `--text-xl` 24
- `--text-2xl` 32

---

## Spacing & layout (strict 8px grid)

- `--sp-xs` 4 / `--sp-sm` 8 / `--sp-md` 12 / `--sp-lg` 16 / `--sp-xl` 24 / `--sp-2xl` 32
- Border radius: `--radius-sm` 4 / `--radius-md` 6 / `--radius-lg` 8 / `--radius-xl` 12 / `--radius-2xl` 16 / `--radius-full` 9999

---

## Patterns

### Data pages = columnar tables

Tasks, MyTasks, Projects, Manuscripts, Deadlines, Grants, Ideas, Decisions, Settings team directory.

- Fixed columns: `Title | Assignee | Due | Status | Priority` (or appropriate per page)
- Column headers: uppercase 11px, 0.06em letter-spacing, 0.55 opacity
- Row height: 36 / 44 / 52 (compact / default / relaxed — user toggle)
- Row separators: barely-there `rgba(255,255,255,0.03)` dark / `rgba(0,0,0,0.04)` light
- Row hover: `rgba(255,255,255,0.02)` dark — luminance shift, not color
- Inline editing: every cell shows ▾ on hover. Click → dropdown by type. Auto-save on blur. NO save button.
- Hover-only badges: `visibility: hidden` until row hover (not opacity 0)
- Calculations row: count + status summary at bottom (Notion pattern)
- Grouped by stage: quiet uppercase header with extending rule line, only when sorted by stage

### Dashboard pages = cards, NOT tables

Dashboard, Personal, Analytics, PIAnalytics, Calendar, Meetings (split-panel), Pulse Kiosk, Home (public).

- Bento grid layout, react-grid-layout for Dashboard (resizable + draggable)
- Metric cards: large 700-weight number, label below, optional trend indicator
- One accent per card max

### Navigation

- **Sidebar darker than content.** Always. Dark mode `color-mix(--ink, black 12%)`. Light mode `color-mix(--cream, black 12%)`.
- 3-plane depth (page bg < content < sidebar)
- Active item: `--teal-subtle` filled bg, full teal on text + icon. NO left-border indicator.
- Inactive: slate text, 0.7 icon opacity.
- Section labels: 10px uppercase 0.5 opacity, divider lines between groups.
- Row height: py-2 (compact). 12px font.

### Surfaces (Linear elevation)

- `--surface-0` page bg
- `--surface-1` (3% white over) — panels
- `--surface-2` (6% white over) — cards, sidebar, dropdowns
- `--surface-3` (10% white over) — hover, active

Card border = `box-shadow: 0 0 0 1px var(--border-subtle)` (not CSS border).
Top-edge highlight on dark cards: `inset 0 1px 0 rgba(255,255,255,0.03)`.

### Animation timing (5 durations + 2 easings)

- `--duration-instant` 0ms (state toggle)
- `--duration-fast` 100ms (tooltip, button press)
- `--duration-normal` 150ms (hover, row highlight)
- `--duration-moderate` 200ms (dropdown, panel)
- `--duration-slow` 300ms (sidebar, modal, page transition)
- `--ease-out` cubic-bezier(0.16, 1, 0.3, 1) — entering
- `--ease-in-out` cubic-bezier(0.4, 0, 0.2, 1) — moving

Card hover: -1px lift only. Respects `prefers-reduced-motion`.

### Mount animations

**Transform-only.** Never `opacity: 0 → 1` (axe-core flags mid-transition contrast). Use `y` / `scale` only.

---

## Brand primitives (Hub-specific — name them in prompts)

These are real React components in `src/components/`. Stitch should reference them by name in mockups so we know to drop in the real component during implementation.

| Primitive | Use case |
|---|---|
| `HeartbeatLine` / `HeartbeatDivider` | The lab's ECG motif — section dividers, brand accents |
| `HermesMark` (icon + avatar variants) | AI assistant badges + Hermes peer avatar (replaces lucide Sparkles) |
| `CategoryIcon` (lungs / flask / heartbeat / cap) | Project category indicator (clif / lab / nate / mentee) |
| `EmptyStateArt` | 8 illustrations for empty states |
| `PhaseReleaseBanner` | "What shipped" announcement card |
| `Avatar` (slug-based) | Team member avatar — `slug='claude-ai'` auto-swaps to HermesMark |
| `InlineSelect` / `InlineAssigneePicker` / `InlineDatePicker` | NEVER use raw `<select>` — these handle typeahead, ARIA, keyboard nav |
| `SmartCompose` | Inline file-drop + paperclip + paste-image compose surface |
| `PresenceAvatars` | Live presence avatar stack (15s heartbeat, green live dot) |

---

## Anti-patterns (NEVER generate these)

- Glassmorphism / frosted glass
- Neon colors / purple accents
- Pure black `#000` background or text
- Centered hero with editorial headline (this is an ops center, not a landing page)
- Generic Sparkles icon for AI (use HermesMark)
- Raw `<select>` element
- Card stacks where a table belongs
- Opacity below 0.30 on readable text
- Compound opacity (parent card opacity × child colored span)
- Mount animations using opacity (use transform only)
- Multiple non-neutral colors in one view (one accent per view)
- Italic text for body content
- Decorative shadows beyond Linear-style elevation tokens

---

## Team scope

19-member academic medicine research lab (UMN). Not a SaaS startup. Members: PI (Nick), fellows, postdocs, mentees, coordinator, biostatistician. Design serves research operations: tracking 60+ projects, 600+ tasks, manuscripts, grants, deadlines, meetings, decisions.
