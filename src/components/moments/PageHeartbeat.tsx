// PageHeartbeat — the line under a page title (color-back pick 10, Nick
// 2026-10-11): the lab's ECG mark in gray, drawn once on load, header only.
// Static under prefers-reduced-motion (index.css .pg-hb).
//
// The path is drawn in PIXELS, not stretched to a viewBox: the blip stays the
// same size on a phone and on a wide band, and the flat run is clipped by the
// box. pathLength="1" lets the CSS draw it with one dash whatever its length.
// This is the one decorative line in the Hub; the animated HeartbeatLine
// (loaders, kiosk) is a different job and stays separate.

const TRACE = 'M0 9H34l4-6 4 10 3-8 2 4H2400'

export default function PageHeartbeat({ className }: { className?: string }) {
  return (
    <svg className={`pg-hb${className ? ` ${className}` : ''}`} aria-hidden="true" focusable="false" data-testid="page-heartbeat">
      <path d={TRACE} pathLength={1} />
    </svg>
  )
}
