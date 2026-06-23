// utils — shared pure helpers for the Today timeline/agenda components.

/** Format a raw minute count as a human label: 30 → "30m", 60 → "1h", 90 → "1h 30m". */
export function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
