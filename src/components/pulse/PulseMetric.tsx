/**
 * PulseMetric — giant single hero metric for the kiosk.
 *
 * Number renders in Fraunces display weight at clamp(96px, 14vw, 200px) —
 * built to read across the room from a wall display. Optional inline
 * delta/trend indicator. Tabular numerals so digits don't dance during
 * count-ups.
 */

export interface PulseMetricProps {
  value: string | number
  label: string
  /** Optional secondary unit (e.g. "this week", "active"). */
  unit?: string
  /** Color of the number itself. Defaults to bright cream. */
  color?: string
  /** Optional small caption rendered under the label. */
  caption?: string
  /** Tailor metric size — `hero` (default), `lg`, `md`. */
  size?: 'hero' | 'lg' | 'md'
}

const SIZES = {
  hero: 'clamp(96px, 14vw, 200px)',
  lg:   'clamp(64px, 8vw, 120px)',
  md:   'clamp(40px, 5vw, 72px)',
}

export default function PulseMetric({
  value,
  label,
  unit,
  color = '#f5efe2',
  caption,
  size = 'hero',
}: PulseMetricProps) {
  return (
    <div className="flex flex-col gap-2 text-left">
      <div className="flex items-baseline gap-4">
        <span
          className="tabular-nums"
          style={{
            fontFamily: 'var(--font-display)',
            color,
            fontWeight: 500,
            fontSize: SIZES[size],
            lineHeight: 0.92,
            letterSpacing: '-0.04em',
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              color: 'rgba(245,239,226,0.55)',
              fontWeight: 400,
              fontSize: 'clamp(20px, 1.6vw, 28px)',
            }}
          >
            {unit}
          </span>
        )}
      </div>
      <div
        className="uppercase"
        style={{
          fontFamily: 'var(--font-sans)',
          color: '#dcb355',
          fontWeight: 500,
          fontSize: 'clamp(13px, 1.05vw, 16px)',
          letterSpacing: '0.18em',
        }}
      >
        {label}
      </div>
      {caption && (
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            color: 'rgba(226,232,240,0.55)',
            fontSize: 'clamp(13px, 1vw, 16px)',
            fontWeight: 400,
            marginTop: 4,
          }}
        >
          {caption}
        </div>
      )}
    </div>
  )
}
