import { useId, useMemo } from 'react'

/**
 * PulseSparkline — wall-scale sparkline / bar chart for the kiosk.
 *
 * Designed to be the SOLE visual on a scene — fills the frame, never
 * decorated with axes or chart-junk. A thin baseline + tiny year tick
 * labels are the only chrome. Bars animate up via SVG `transform`
 * (origin at bottom) on a 1.4s entrance.
 *
 * Used for:
 *   - Publications by year
 *   - Project velocity
 *   - Any year-bucketed count
 */

export interface SparkPoint {
  label: string
  value: number
  /** Optional emphasis (highlighted bar) — e.g. current year. */
  emphasis?: boolean
}

export interface PulseSparklineProps {
  data: SparkPoint[]
  /** Height in px. Width is fluid (100%). */
  height?: number
  /** Bar fill color. Default --gold. */
  color?: string
  /** Highlight color for emphasized bars. */
  emphasisColor?: string
  /** Show the baseline rule. */
  baseline?: boolean
  /** Show "value" labels above each bar. */
  showValues?: boolean
}

export default function PulseSparkline({
  data,
  height = 360,
  color = 'rgba(220, 179, 85, 0.55)',
  emphasisColor = '#dcb355',
  baseline = true,
  showValues = true,
}: PulseSparklineProps) {
  const id = useId().replace(/:/g, '')
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.value)), [data])

  const VIEW_W = 1200
  const VIEW_H = height
  const PAD_X = 40
  const PAD_TOP = 60
  const PAD_BOTTOM = 50
  const innerW = VIEW_W - PAD_X * 2
  const innerH = VIEW_H - PAD_TOP - PAD_BOTTOM
  const slot = innerW / Math.max(1, data.length)
  const barW = Math.min(slot * 0.55, 90)

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      height={height}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Sparkline chart"
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={emphasisColor} stopOpacity="0.95" />
          <stop offset="100%" stopColor={emphasisColor} stopOpacity="0.35" />
        </linearGradient>
      </defs>

      {baseline && (
        <line
          x1={PAD_X}
          x2={VIEW_W - PAD_X}
          y1={VIEW_H - PAD_BOTTOM + 0.5}
          y2={VIEW_H - PAD_BOTTOM + 0.5}
          stroke="rgba(220,179,85,0.30)"
          strokeWidth={1}
        />
      )}

      {data.map((d, i) => {
        const h = (d.value / max) * innerH
        const x = PAD_X + slot * i + (slot - barW) / 2
        const y = VIEW_H - PAD_BOTTOM - h
        const fill = d.emphasis ? `url(#spark-${id})` : color
        const delay = i * 0.06
        return (
          <g key={`${d.label}-${i}`}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              fill={fill}
              rx={2}
              style={{
                transformOrigin: `${x + barW / 2}px ${VIEW_H - PAD_BOTTOM}px`,
                animation: `pulse-bar-grow 1.4s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s both`,
              }}
            />
            {showValues && d.value > 0 && (
              <text
                x={x + barW / 2}
                y={y - 14}
                textAnchor="middle"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 22,
                  fontWeight: 500,
                  fill: d.emphasis ? '#f5efe2' : 'rgba(245,239,226,0.6)',
                  letterSpacing: '-0.02em',
                }}
              >
                {d.value}
              </text>
            )}
            <text
              x={x + barW / 2}
              y={VIEW_H - PAD_BOTTOM + 28}
              textAnchor="middle"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                fontWeight: 500,
                fill: 'rgba(226,232,240,0.55)',
                letterSpacing: '0.06em',
              }}
            >
              {d.label}
            </text>
          </g>
        )
      })}

      <style>{`
        @keyframes pulse-bar-grow {
          from { transform: scaleY(0); }
          to   { transform: scaleY(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          rect[style*="pulse-bar-grow"] { animation: none !important; transform: none !important; }
        }
      `}</style>
    </svg>
  )
}
