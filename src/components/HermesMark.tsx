/**
 * HermesMark — distinctive avatar/badge for the Hub's AI research
 * assistant.
 *
 * Replaces the generic lucide `<Sparkles />` icon with the alchemical
 * Mercury glyph (☿) — Hermes IS Mercury in Greco-Roman myth, and
 * historically the symbol of the messenger god. Two visual variants:
 *
 *   - "icon" (default): minimal line glyph for inline use (badges,
 *     comment headers, sidebar mention indicators).
 *   - "avatar": filled circular background with the glyph inside,
 *     for use anywhere a team-member avatar would appear (so
 *     Hermes feels like a peer, not a tool).
 *
 * Color defaults to `var(--gold)` (the Hub's AI accent), but `color`
 * prop overrides for surfaces that need teal/maroon contrast.
 */
import type { CSSProperties } from 'react'

interface HermesMarkProps {
  size?: number
  variant?: 'icon' | 'avatar'
  color?: string
  bg?: string
  className?: string
  style?: CSSProperties
  title?: string
  /** When true, plays a one-shot 600ms entrance animation (scale-in +
   *  micro-rotate + gold halo). Useful on freshly-arrived AI surfaces.
   *  M-11 — Hermes ack moment. */
  pulse?: boolean
}

export default function HermesMark({
  size = 14,
  variant = 'icon',
  color = 'var(--gold)',
  bg,
  className,
  style,
  title = 'Hermes — AI research assistant',
  pulse = false,
}: HermesMarkProps) {
  const pulseClass = pulse ? 'hermes-mark-pulse' : ''
  const composedClass = [className, pulseClass].filter(Boolean).join(' ') || undefined
  if (variant === 'avatar') {
    const ringBg = bg ?? 'color-mix(in srgb, var(--gold) 18%, transparent)'
    return (
      <span
        className={composedClass}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: 'var(--radius-circle)',
          background: ringBg,
          border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
          flexShrink: 0,
          ...style,
        }}
        role="img"
        aria-label={title}
        title={title}
      >
        <Glyph size={Math.max(10, Math.round(size * 0.6))} color={color} />
      </span>
    )
  }
  return (
    <span
      className={composedClass}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...style }}
      role="img"
      aria-label={title}
      title={title}
    >
      <Glyph size={size} color={color} />
    </span>
  )
}

function Glyph({ size, color }: { size: number; color: string }) {
  // Mercury / Hermes alchemical glyph — now two-tone (R4-09). Gold-only
  // rendered as another gold badge on gold CTAs. Teal outline + gold
  // head-circle gives it a distinct silhouette against both gold and
  // teal surfaces. When `color` prop is explicitly overridden by a
  // caller, preserve the single-tone render (legacy callers).
  const isDefault = color === 'var(--gold)'
  const accent = isDefault ? 'var(--teal)' : color
  const core = isDefault ? 'var(--gold)' : color
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Crescent above (winged-helm allusion) — teal */}
      <path d="M7.5 4 A4.5 4.5 0 0 0 16.5 4" stroke={accent} strokeWidth={1.75} />
      {/* Head circle — gold fill for pop against both gold + teal bgs */}
      <circle cx="12" cy="10" r="3.5" fill={core} stroke={core} strokeWidth={1.25} />
      {/* Caduceus shaft + crossbar — teal */}
      <path d="M12 13.5 L12 21" stroke={accent} strokeWidth={1.75} />
      <path d="M9 17.5 L15 17.5" stroke={accent} strokeWidth={1.75} />
    </svg>
  )
}
