// NowMarker — the one "now" object wherever time is drawn (color-back pick 4,
// Nick 2026-10-11): a teal hairline and a 6px dot with a soft halo, labelled
// "Today" (or the time on Today's timeline). Teal already owns "today"; this
// makes it the same shape on Calendar (month, week, day), the Grants timeline,
// Today's timeline and Deadlines.
//
// Two renderings of one object:
//   <NowMarker>      HTML, horizontal: inline in a list.
//   <NowMarkerSvg>   SVG, vertical: for a chart drawn in SVG (Grants).
// The halo on a "today" date disc is the .now-halo class.

import type { CSSProperties } from 'react'

export function NowMarker({
  label = 'Today',
  showLabel = true,
  labelBg,
  className,
  style,
}: {
  label?: string
  showLabel?: boolean
  /** Background behind the label, so the hairline does not run through it. */
  labelBg?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={`now-mk${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      data-testid="now-marker"
      style={labelBg ? ({ ...style, '--now-mk-bg': labelBg } as CSSProperties) : style}
    >
      <span className="now-mk-dot" />
      <span className="now-mk-line" />
      {showLabel && <span className="now-mk-lbl">{label}</span>}
    </div>
  )
}

/** The vertical marker for an SVG chart: line from y1 to y2 at x, the dot and
 *  halo at the top, "Today" beside the dot. */
export function NowMarkerSvg({ x, y1, y2, label = 'Today' }: { x: number; y1: number; y2: number; label?: string }) {
  return (
    <g data-testid="now-marker" aria-hidden="true">
      <line x1={x} y1={y1} x2={x} y2={y2} stroke="var(--job-accent)" strokeWidth={1.5} />
      <circle cx={x} cy={y1} r={7} fill="var(--job-accent)" fillOpacity={0.18} />
      <circle cx={x} cy={y1} r={3} fill="var(--job-accent)" />
      <text x={x + 10} y={y1 + 3.5} style={{ fontSize: '10px', fontWeight: 600, fill: 'var(--job-accent)' }}>{label}</text>
    </g>
  )
}
