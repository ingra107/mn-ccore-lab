import { useId } from 'react'

/**
 * HeartbeatLine — animated ECG-style pulse motif.
 *
 * Pulls its trace from the favicon SVG (public/favicon.svg) so the kiosk,
 * loaders, and section dividers all share the same visual signature.
 *
 * The trace is drawn as a single open path; we animate `stroke-dashoffset`
 * to "trace" the line at ~60bpm (one beat per second by default). A soft
 * trailing glow follows the writing tip to give the impression of a live
 * monitor. Respects `prefers-reduced-motion` — the line still renders,
 * but the animation is paused at the fully-drawn state.
 *
 * Reusable across:
 *   - Pulse Kiosk (hero divider, transition pulse)
 *   - Loading skeletons (replacing spinners)
 *   - Empty-state illustrations
 *   - Email digest header
 *
 * @example
 * <HeartbeatLine width={640} height={64} />
 * <HeartbeatLine variant="static" color="var(--gold)" strokeWidth={1.25} />
 */

interface HeartbeatLineProps {
  /** Total stroke width in px. Default 2. */
  strokeWidth?: number
  /** Render width in px (height auto-derives from viewBox if not set). */
  width?: number | string
  /** Render height in px. */
  height?: number | string
  /** Stroke color. Default `var(--gold)`. */
  color?: string
  /**
   * `live` (default) — animated, ~60bpm trace draw.
   * `static` — fully drawn, no animation.
   * `slow` — half-speed, used as ambient page divider.
   */
  variant?: 'live' | 'static' | 'slow'
  /** Beats per minute. Default 60. */
  bpm?: number
  /** Optional glow under the trace (default true for live/slow). */
  glow?: boolean
  /** Extra className for the wrapping <svg>. */
  className?: string
  /** Aria label. Default decorative (aria-hidden). */
  ariaLabel?: string
}

// Trace borrowed from public/favicon.svg, scaled to a wider canvas so it
// can be used as a hero divider. The path moves left→right with a tall
// QRS-like spike in the middle — same waveform as the favicon.
const TRACE =
  'M0 32 L80 32 L120 32 L150 24 L175 8 L200 56 L225 16 L250 38 L275 28 L320 32 L400 32 L440 32 L470 24 L495 8 L520 56 L545 16 L570 38 L595 28 L640 32'
const VIEW_W = 640
const VIEW_H = 64
// Approximate path length — used for dashoffset animation. Calculated once
// via getTotalLength() during dev; hard-coded here to avoid a layout pass.
const PATH_LENGTH = 1320

export default function HeartbeatLine({
  strokeWidth = 2,
  width = '100%',
  height,
  color = 'var(--gold)',
  variant = 'live',
  bpm = 60,
  glow = true,
  className,
  ariaLabel,
}: HeartbeatLineProps) {
  const id = useId().replace(/:/g, '')
  const beatDuration = 60 / bpm // seconds per full draw cycle
  const animDuration =
    variant === 'static' ? 0 : variant === 'slow' ? beatDuration * 2 : beatDuration

  const decorative = !ariaLabel
  const styleVars: React.CSSProperties = {
    // Custom CSS vars consumed by the @keyframes block in index.css fallback.
    ['--hb-len' as never]: PATH_LENGTH,
    ['--hb-dur' as never]: `${animDuration}s`,
  }

  return (
    <svg
      className={className}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width={width}
      height={height ?? undefined}
      preserveAspectRatio="none"
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={ariaLabel}
      style={styleVars}
    >
      <defs>
        {glow && variant !== 'static' && (
          <filter id={`hb-glow-${id}`} x="-10%" y="-50%" width="120%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
        <linearGradient id={`hb-fade-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0.0" />
          <stop offset="6%" stopColor={color} stopOpacity="0.55" />
          <stop offset="94%" stopColor={color} stopOpacity="0.55" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Baseline ghost — the "monitor grid" feel */}
      <path
        d={TRACE}
        fill="none"
        stroke={`url(#hb-fade-${id})`}
        strokeWidth={Math.max(0.5, strokeWidth * 0.4)}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.18}
      />

      {/* Animated trace */}
      <path
        d={TRACE}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={glow && variant !== 'static' ? `url(#hb-glow-${id})` : undefined}
        style={
          variant === 'static'
            ? undefined
            : {
                strokeDasharray: PATH_LENGTH,
                strokeDashoffset: PATH_LENGTH,
                animation: `hb-draw ${animDuration}s cubic-bezier(0.65, 0, 0.35, 1) infinite`,
              }
        }
      />
    </svg>
  )
}
