import type { ReactNode } from 'react'

/**
 * SegmentedToggle — the ONE hairline-pill segmented control (locked de-box
 * canon, design-system.md "THE LOCKED PANEL STYLE" pt 3-4 + the N1b one-pill-
 * language convergence). Active = accent TINT + accent text, never a solid
 * fill or a --surface-* tray. Use this everywhere a 2-4 option view/mode
 * toggle is needed; do NOT re-mint the inline pill-group block (that divergence
 * is exactly what wave 5 + this extraction killed).
 *
 * Replaced the inline duplicates in TableControls, ProjectHealthCard,
 * IdeasPage, and the Dashboard view tabs (2026-06-13 session-close /simplify).
 */
export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

interface SegmentedToggleProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** teal = interactive default; gold = the Lab Overview identity. */
  accent?: 'teal' | 'gold'
  size?: 'sm' | 'md'
  uppercase?: boolean
  /** horizontal-scroll when options overflow (Dashboard tabs on mobile). */
  scrollable?: boolean
  className?: string
  ariaLabel?: string
}

const ACCENT = {
  teal: { active: 'var(--teal-active)', text: 'var(--teal)' },
  // gold text on the gold tint uses --gold-on-emphasis for AA (Rule 42).
  gold: { active: 'var(--gold-active)', text: 'var(--gold-on-emphasis)' },
} as const

const SIZE = {
  sm: { padding: '2px 8px', fontSize: 10 },
  md: { padding: '4px 12px', fontSize: 12 },
} as const

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  accent = 'teal',
  size = 'md',
  uppercase = false,
  scrollable = false,
  className,
  ariaLabel,
}: SegmentedToggleProps<T>) {
  const a = ACCENT[accent]
  const s = SIZE[size]
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center${className ? ` ${className}` : ''}`}
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 999,
        flexShrink: 0,
        overflow: scrollable ? 'auto hidden' : 'hidden',
      }}
    >
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            title={opt.label}
            className="flex items-center gap-1.5 cursor-pointer"
            style={{
              padding: s.padding,
              fontSize: s.fontSize,
              fontWeight: active ? 600 : 500,
              background: active ? a.active : 'transparent',
              color: active ? a.text : 'var(--slate)',
              border: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'all var(--duration-fast)',
              ...(uppercase ? { textTransform: 'uppercase' as const, letterSpacing: '0.05em' } : {}),
            }}
          >
            {opt.icon && (
              <span style={{ display: 'flex', alignItems: 'center', color: 'inherit' }}>{opt.icon}</span>
            )}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export default SegmentedToggle
