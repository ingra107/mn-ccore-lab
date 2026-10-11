// Fills for swatches and the heatmap. ProjectHealthCard STATUS_COLORS are AA TEXT
// tokens; fills are a separate map. Color jobs (rules-ui-design 21, Nick
// 2026-10-11): orange = going stale, so only the at-risk band (At Risk,
// Critical) is orange; Healthy and Attention are grays. Severity still steps
// clearly in lightness (0.86 / 0.70 / 0.62 / 0.44), so it reads without hue.
// Same values in both themes.
export const STATUS_FILLS: Record<string, string> = {
  'Healthy': 'oklch(0.86 0 0)',
  'Needs Attention': 'oklch(0.70 0 0)',
  'At Risk': 'oklch(0.62 0.16 45)',
  'Critical': 'oklch(0.44 0.13 40)',
}
