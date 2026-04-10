# Design System Research — World-Class Patterns

> Compiled 2026-04-10 from Airtable, Vercel/Geist, Linear, Stripe analysis.
> Reference for all Hub UI decisions.

## Universal Patterns (3+ of 4 systems agree)

### 1. 8px Base Grid
All four use 8px base with 4px half-steps. Linear/Stripe include odd values (7px, 11px) for optical alignment.

### 2. Three-Tier Font Weight System
| System | Body | UI/Interactive | Emphasis |
|--------|------|----------------|----------|
| Linear | 400 | **510** | 590 |
| Vercel | 400 | 500 | 600 |
| Stripe | **300** | 400 | — |
| Airtable | 400 | 500 | 900 (display only) |

**None use bold (700) in primary font.**

### 3. Negative Letter-Spacing at Display Sizes
All four tighten tracking as size increases:
- 48px+: -0.04em to -0.06em
- 32px: -0.02em to -0.04em
- 24px: -0.01em to -0.02em
- 16px and below: normal (0)

### 4. Not-Quite-Black / Not-Quite-White Text
| System | Primary text (dark mode) | Primary text (light mode) |
|--------|--------------------------|---------------------------|
| Linear | `#f7f8f8` | — |
| Vercel | — | `#171717` |
| Stripe | — | `#061b31` (deep navy) |
| Airtable | — | `#181d26` (deep navy) |

**Hub currently uses `#e2e8f0` — already following this pattern.**

### 5. Semi-Transparent Borders on Dark
- Linear: `rgba(255,255,255,0.05)` subtle, `rgba(255,255,255,0.08)` standard
- Vercel: `rgba(255,255,255,0.08)` via box-shadow
- Pattern: 3-tier border system (subtle/default/strong)

### 6. Border Radius: 4-8px for Functional Elements
All keep buttons/inputs/cards at 4-8px. Only badges/pills use 9999px.

### 7. Controlled Density via Explicit Modes
- Airtable: 4 row heights (Short/Medium/Tall/Extra Tall)
- Stripe: `condensed` vs `spaced` variants
- Industry standard row heights: 36px (compact) / 44px (default) / 52px (relaxed)

---

## Per-System Deep Dives

### Airtable
- **Font**: Haas / -apple-system fallbacks
- **Spacing**: 8px base, radius 2-32px scale
- **Colors**: Deep Navy `#181d26`, Accent Blue `#1b61c9`, Borders `#e0e2e6`
- **Tables**: 4 density levels, column resize, single-click inline editing
- **Dropdowns**: Tag/chip multi-select, type-to-search, inline option creation, 40-hue color palette
- **Shadow**: Blue-tinted multi-layer `rgba(0,0,0,0.32) 0 0 1px, rgba(0,0,0,0.08) 0 0 2px, rgba(45,127,249,0.28) 0 1px 3px`

### Vercel / Geist
- **Font**: Geist Sans/Mono (custom variable fonts), aggressive negative tracking (-2.88px at 48px)
- **Spacing**: 4/8/12/16/24/32/48/64/96/128px scale
- **Colors**: 10-step semantic scale per color (100=component bg, 400=border, 900=secondary text, 1000=primary text)
- **CSS vars**: `--ds-gray-100` through `--ds-gray-1000`, `--ds-background-100/200`
- **Borders**: box-shadow technique `0 0 0 1px rgba(0,0,0,0.08)` — NOT CSS borders
- **Weights**: 400/500/600 only. No bold.
- **Dark mode**: CSS custom property swapping

### Linear
- **Font**: Inter Variable with `"cv01","ss03"` OpenType features, Inter Display for headings
- **Signature weight**: 510 (between regular and medium)
- **Colors**: Almost entirely achromatic. One accent: Indigo `#5e6ad2`/`#7170ff`
- **Dark surfaces**: `#010102` → `#0f1011` → `#191a1b` → `#28282c` (luminance stepping, not shadows)
- **Text**: `#f7f8f8` / `#d0d6e0` / `#8a8f98` / `#62666d` (4-tier hierarchy)
- **Borders**: `rgba(255,255,255,0.05)` and `rgba(255,255,255,0.08)` exclusively
- **Philosophy**: "Structure should be felt not seen" — luminance > weight > borders
- **Speed**: Optimistic UI everywhere, zero loading spinners

### Stripe
- **Font**: sohne-var (custom), weight 300 body + 400 UI (remarkably light)
- **Colors**: Deep Navy `#061b31` text, Purple `#533afd` accent, blue-tinted shadows
- **Tables**: `font-variant-numeric: tabular-nums` on all numeric columns
- **Shadows**: Brand-tinted `rgba(50,50,93,0.25)` — not gray
- **Sidebar**: 36px row height (desktop precision)
- **Accessible colors**: Generated via CIELAB perceptually uniform color space

---

## 10 Actionable Improvements for the Hub

### Quick Wins (CSS tokens only)
1. **Negative letter-spacing at heading sizes** — add `--tracking-display: -0.04em`, `--tracking-heading: -0.02em`
2. **Tabular numbers** — `.tabular-nums { font-variant-numeric: tabular-nums }` on date/number columns
3. **Upgrade border tokens** — `--border-subtle: rgba(255,255,255,0.05)`, `--border-default: rgba(255,255,255,0.08)`, `--border-strong: rgba(255,255,255,0.12)`
4. **Animation timing tokens** — `--duration-fast: 100ms`, `--duration-normal: 150ms`, `--duration-moderate: 200ms`, `--ease-out: cubic-bezier(0.16,1,0.3,1)`

### Medium Effort (component changes)
5. **Three font weights** — body=400, UI/interactive=500, headings=600 (DM Sans supports this)
6. **Luminance-based elevation** — `rgba(255,255,255,0.02/0.04/0.06)` over base instead of shadows
7. **Table density toggle** — 3 modes: 36px/44px/52px row heights

### Larger Features
8. **10-step semantic color scale** (Geist pattern) — systematic token architecture
9. **Inline edit polish** — 0ms activation, 150ms hover hint, 200ms success flash
10. **Density controls** — per-table compact/default/relaxed toggle

---

## Sources
- Vercel Geist: vercel.com/geist (Introduction, Colors, Typography)
- Linear: linear.app/now (Design Reset Parts I & II, Latest Refresh)
- Linear Style: linear.style/
- Stripe: docs.stripe.com (Elements API, Apps Styling, Accessible Color Systems blog)
- Airtable: support.airtable.com (Grid View, Row Height, Multiple Select Field)
- SeedFlip Vercel breakdown, LogRocket Linear analysis, fontofweb.com token extraction
