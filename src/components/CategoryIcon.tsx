/**
 * CategoryIcon — distinct minimal glyphs for each project category.
 *
 * Replaces the 6px colored dot with an iconography that doubles as
 * a quick-scan category indicator. Single-color, sized to match a
 * status pill (default 14px). Stays compatible: pages can fall back
 * to the existing CATEGORY_DOT color via the `color` prop.
 *
 * Categories (per CLAUDE.md cross-repo schema registry):
 *   clif    → lungs (CLIF Consortium = pulmonary critical care)
 *   lab     → flask (general lab work)
 *   nate    → heartbeat (Nate's cardiac arrest research)
 *   mentee  → grad cap (trainee development)
 */
import type { CSSProperties } from 'react'

type Category = 'clif' | 'lab' | 'nate' | 'mentee' | string | null | undefined

interface CategoryIconProps {
  category: Category
  size?: number
  color?: string
  className?: string
  style?: CSSProperties
  title?: string
}

const CATEGORY_LABEL: Record<string, string> = {
  clif: 'CLIF',
  lab: 'Lab',
  nate: "Nate's",
  mentee: 'Mentee',
}

const CATEGORY_COLOR: Record<string, string> = {
  clif: 'var(--maroon)',
  lab: 'var(--teal)',
  nate: 'var(--orange)',
  mentee: 'var(--gold)',
}

export default function CategoryIcon({
  category,
  size = 14,
  color,
  className,
  style,
  title,
}: CategoryIconProps) {
  const slug = (category ?? '').toLowerCase()
  const stroke = color ?? CATEGORY_COLOR[slug] ?? 'var(--slate)'
  const label = title ?? CATEGORY_LABEL[slug] ?? slug ?? 'Uncategorized'
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    style,
    role: 'img' as const,
    'aria-label': label,
  }

  switch (slug) {
    case 'clif':
      // Lungs: trachea + two opposing curves
      return (
        <svg {...common}>
          <title>{label}</title>
          <path d="M12 4 L12 11" />
          <path d="M12 11 C12 9 9 9 7 11 C5 13 4 17 5.5 19.5 C6.5 21 9 21 9.5 19 L11 13" />
          <path d="M12 11 C12 9 15 9 17 11 C19 13 20 17 18.5 19.5 C17.5 21 15 21 14.5 19 L13 13" />
        </svg>
      )
    case 'lab':
      // Flask: triangular bottom + neck stopper
      return (
        <svg {...common}>
          <title>{label}</title>
          <path d="M9.5 4 L14.5 4" />
          <path d="M10 4 L10 9 L5.5 18 C4.8 19.5 5.8 21 7.5 21 L16.5 21 C18.2 21 19.2 19.5 18.5 18 L14 9 L14 4" />
          <path d="M7.5 15 L16.5 15" />
        </svg>
      )
    case 'nate':
      // Heartbeat / ECG line — Nate's cardiac arrest survivability work
      return (
        <svg {...common}>
          <title>{label}</title>
          <path d="M3 12 L7 12 L9 7 L12 17 L14 9 L16 14 L18 12 L21 12" />
        </svg>
      )
    case 'mentee':
      // Grad cap: mortarboard + tassel
      return (
        <svg {...common}>
          <title>{label}</title>
          <path d="M12 5 L22 9 L12 13 L2 9 Z" />
          <path d="M6 11 L6 16 C6 17.5 9 19 12 19 C15 19 18 17.5 18 16 L18 11" />
          <path d="M22 9 L22 14" />
        </svg>
      )
    default:
      // Generic: hollow circle (unlabeled / unknown category)
      return (
        <svg {...common}>
          <title>{label}</title>
          <circle cx="12" cy="12" r="6" />
        </svg>
      )
  }
}
