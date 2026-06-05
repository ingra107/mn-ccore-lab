// Chip — shared small pill/badge primitive.
// Consolidates the ~35 ad-hoc pill <span> instances across Today, MyTasks,
// and other surfaces into one focused component.
//
// API:
//   color    — CSS color value (token or hex). Default: 'var(--slate)'.
//   filled   — show tinted background at 12% alpha. Default: true.
//   size     — 'xs' (10px / 1px 5px) | 'sm' (11px / 2px 7px). Default: 'xs'.
//   pill     — borderRadius full vs sm. Default: false.
//   title    — native tooltip string.
//   style    — caller overrides merged LAST (highest specificity).
//   children — content (emoji + text combos are common).
//
// All radius/font-size/gap values use design tokens from src/index.css.

import type { CSSProperties, ReactNode } from 'react'
import { withAlpha } from '../../lib/taskGrouping'

export interface ChipProps {
  children: ReactNode
  color?: string
  filled?: boolean
  size?: 'xs' | 'sm'
  pill?: boolean
  title?: string
  style?: CSSProperties
}

export function Chip({
  children,
  color = 'var(--slate)',
  filled = true,
  size = 'xs',
  pill = false,
  title,
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
    background: filled ? withAlpha(color, 12) : 'transparent',
    ...sizeStyles,
    // Caller overrides take highest precedence (e.g. maxWidth, overflow, textOverflow).
    ...style,
  }

  return (
    <span style={chipStyle} title={title}>
      {children}
    </span>
  )
}
