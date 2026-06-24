/**
 * EmptyStateArt — 8 lab-aesthetic line illustrations for EmptyState slots.
 *
 * Two-color palette (stroke + accent), DM-Sans-friendly weight, 160×120
 * canvas, scales cleanly. Drop into the existing `<EmptyState icon={...} />`
 * slot. The lucide icon stays as a fallback for surfaces that don't
 * have an art variant defined.
 *
 * Variants:
 *   tasks         — clipboard with checkmark + scribble
 *   ideas         — lightbulb sketch with rays
 *   decisions     — open notebook with margin scribble
 *   meetings      — wall clock at quarter past
 *   publications  — paper stack with corner page-curl
 *   grants        — folder with stamp circle
 *   search        — magnifier on data dots
 *   generic       — Erlenmeyer flask (lab fallback)
 */
import type { CSSProperties } from 'react'

export type EmptyArtVariant =
  | 'tasks'
  | 'ideas'
  | 'decisions'
  | 'meetings'
  | 'publications'
  | 'grants'
  | 'search'
  | 'generic'

interface Props {
  variant?: EmptyArtVariant
  width?: number
  height?: number
  /** Primary stroke color. Default uses --slate via currentColor. */
  color?: string
  /** Accent color for the highlight stroke. Default --gold. */
  accent?: string
  className?: string
  style?: CSSProperties
  title?: string
}

export default function EmptyStateArt({
  variant = 'generic',
  width = 160,
  height = 120,
  color = 'currentColor',
  accent = 'var(--gold)',
  className,
  style,
  title,
}: Props) {
  const common = {
    width,
    height,
    viewBox: '0 0 160 120',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    style,
    role: 'img' as const,
    'aria-hidden': title ? undefined : true,
    'aria-label': title,
  }
  const accentProps = { stroke: accent, strokeWidth: 1.75, fill: 'none' }

  switch (variant) {
    case 'tasks':
      // Clipboard outline + 3 lines + accent checkmark on the top line
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <rect x="50" y="22" width="60" height="78" rx="4" />
          <rect x="66" y="14" width="28" height="14" rx="3" />
          <path d="M62 46 L98 46" />
          <path d="M62 60 L92 60" opacity="0.55" />
          <path d="M62 74 L88 74" opacity="0.4" />
          <path d="M62 88 L82 88" opacity="0.3" />
          <path {...accentProps} d="M58 46 L62 50 L70 40" />
        </svg>
      )
    case 'ideas':
      // Lightbulb with sketched rays + accent filament glow
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <path d="M68 56 C68 41 92 41 92 56 C92 64 86 67 86 75 L74 75 C74 67 68 64 68 56 Z" />
          <path d="M76 84 L84 84" />
          <path d="M76 90 L84 90" />
          <path d="M80 96 L80 100" />
          <path opacity="0.5" d="M52 38 L46 32" />
          <path opacity="0.5" d="M108 38 L114 32" />
          <path opacity="0.5" d="M44 56 L36 56" />
          <path opacity="0.5" d="M116 56 L124 56" />
          <path {...accentProps} d="M76 60 Q80 52 84 60" />
          <circle {...accentProps} cx="80" cy="56" r="1.4" fill={accent} />
        </svg>
      )
    case 'decisions':
      // Open notebook (two facing pages) + accent margin scribble
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <path d="M20 32 L80 24 L80 100 L20 92 Z" />
          <path d="M140 32 L80 24 L80 100 L140 92 Z" />
          <path d="M80 24 L80 100" />
          <path d="M30 46 L72 40" opacity="0.5" />
          <path d="M30 60 L72 54" opacity="0.4" />
          <path d="M30 74 L72 68" opacity="0.3" />
          <path d="M88 40 L130 46" opacity="0.5" />
          <path d="M88 54 L130 60" opacity="0.4" />
          <path d="M88 68 L130 74" opacity="0.3" />
          <path {...accentProps} d="M94 82 L116 82 M94 86 L110 86" />
        </svg>
      )
    case 'meetings':
      // Wall clock at quarter past + accent hour hand
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <circle cx="80" cy="60" r="34" />
          <path d="M80 32 L80 36" />
          <path d="M80 84 L80 88" />
          <path d="M52 60 L56 60" />
          <path d="M104 60 L108 60" />
          <path {...accentProps} d="M80 60 L96 60" />
          <path d="M80 60 L80 42" />
          <circle cx="80" cy="60" r="2" fill={color} />
        </svg>
      )
    case 'publications':
      // Stacked papers with corner page-curl + accent line
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <path d="M48 38 L96 38 L96 92 L48 92 Z" opacity="0.45" />
          <path d="M56 30 L104 30 L104 84 L56 84 Z" opacity="0.7" />
          <path d="M64 22 L104 22 L112 30 L112 76 L64 76 Z" />
          <path d="M104 22 L104 30 L112 30" />
          <path {...accentProps} d="M72 42 L102 42" />
          <path d="M72 52 L102 52" opacity="0.55" />
          <path d="M72 62 L96 62" opacity="0.4" />
        </svg>
      )
    case 'grants':
      // Folder with bevel + circular accent stamp
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <path d="M28 38 L70 38 L78 46 L132 46 L132 96 L28 96 Z" />
          <path d="M28 50 L132 50" opacity="0.4" />
          <circle {...accentProps} cx="106" cy="76" r="14" strokeDasharray="3 3" />
          <path {...accentProps} d="M100 76 L104 80 L112 71" />
        </svg>
      )
    case 'search':
      // Magnifier on a row of data dots
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <circle cx="38" cy="80" r="3" />
          <circle cx="56" cy="80" r="3" />
          <circle cx="74" cy="80" r="3" />
          <circle cx="92" cy="80" r="3" opacity="0.6" />
          <circle cx="110" cy="80" r="3" opacity="0.4" />
          <circle cx="128" cy="80" r="3" opacity="0.25" />
          <circle {...accentProps} cx="78" cy="46" r="22" />
          <path {...accentProps} d="M94 62 L108 76" />
        </svg>
      )
    case 'generic':
    default:
      // Erlenmeyer flask with measure markings + accent meniscus
      return (
        <svg {...common}>
          {title && <title>{title}</title>}
          <path d="M68 22 L92 22" />
          <path d="M70 22 L70 50 L52 92 C50 96 53 100 57 100 L103 100 C107 100 110 96 108 92 L90 50 L90 22" />
          <path d="M62 78 L98 78" opacity="0.5" />
          <path d="M76 60 L84 60" opacity="0.5" />
          <path d="M78 36 L82 36" opacity="0.5" />
          <path {...accentProps} d="M58 86 Q80 78 102 86" />
        </svg>
      )
  }
}
