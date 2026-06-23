// Chip — shared small pill/badge primitive.
// Consolidates the ~35 ad-hoc pill <span> instances across Today, MyTasks,
// and other surfaces into one focused component.
//
// API:
//   color       — CSS color value (token or hex). Default: 'var(--slate)'.
//   filled      — show tinted background at `fillAlpha`% alpha. Default: true.
//   bordered    — show 1px border at `borderAlpha`% alpha of color. Default: false.
//                (MyTasks status chips use this variant — border-only or fill+border.)
//   size        — 'xs' (10px / 1px 5px) | 'sm' (11px / 2px 7px). Default: 'xs'.
//   fillAlpha   — background tint alpha (0–100). Default: 12. Override for the dimmer
//                 today/ timeline micro-pill tier (9) without forking the component.
//   borderAlpha — border tint alpha (0–100). Default: 25. (today/ micro-pills use 28.)
//   pill        — borderRadius full vs sm. Default: false.
//   title       — native tooltip string.
//   className   — passed through to the span (e.g. 'status-transition').
//   style       — caller overrides merged LAST (highest specificity).
//   children    — content (emoji + text combos are common).
//
// All radius/font-size/gap values use design tokens from src/index.css.
// NOTE: there is intentionally NO 9px size tier — --text-micro was bumped 9px→10px
// for legibility (src/index.css:351); adopting today/ 9px pills at 'xs' nudges them
// to the canonical 10px (a deliberate normalization, like the Field label-weight).

import type { CSSProperties, ReactNode } from 'react'
import { withAlpha } from '../../lib/taskGrouping'

export interface ChipProps {
  children: ReactNode
  color?: string
  filled?: boolean
  bordered?: boolean
  size?: 'xs' | 'sm'
  fillAlpha?: number
  borderAlpha?: number
  pill?: boolean
  title?: string
  className?: string
  style?: CSSProperties
}

export function Chip({
  children,
  color = 'var(--slate)',
  filled = true,
  bordered = false,
  size = 'xs',
  fillAlpha = 12,
  borderAlpha = 25,
  pill = false,
  title,
  className,
  style,
}: ChipProps) {
  const sizeStyles: CSSProperties =
    size === 'sm'
      ? { fontSize: 'var(--text-label)', padding: '2px 7px' }
      : { fontSize: 'var(--text-micro)', padding: '1px 5px' }

  const chipStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-xs)',
    fontWeight: 'var(--weight-ui)' as CSSProperties['fontWeight'],
    whiteSpace: 'nowrap',
    letterSpacing: '0.02em',
    borderRadius: pill ? 'var(--radius-full)' : 'var(--radius-sm)',
    color,
    background: filled ? withAlpha(color, fillAlpha) : 'transparent',
    border: bordered ? `1px solid ${withAlpha(color, borderAlpha)}` : undefined,
    ...sizeStyles,
    // Caller overrides take highest precedence (e.g. maxWidth, overflow, textOverflow).
    ...style,
  }

  return (
    <span style={chipStyle} title={title} className={className}>
      {children}
    </span>
  )
}
