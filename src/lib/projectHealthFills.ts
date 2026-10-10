// Fills for swatches and the heatmap. ProjectHealthCard STATUS_COLORS are AA TEXT tokens
// (--gold and --orange land at almost the same lightness in light mode, and
// Attention borrowed the brand gold). Fills are a separate map: severity steps
// clearly in lightness (0.40 / 0.60 / 0.83), so it still reads without hue,
// and Attention is lemon, not brand gold. Same values in both themes.
export const STATUS_FILLS: Record<string, string> = {
  'Healthy': 'oklch(0.72 0.13 150)',
  'Needs Attention': 'oklch(0.83 0.13 100)',
  'At Risk': 'oklch(0.60 0.18 40)',
  'Critical': 'oklch(0.40 0.16 20)',
}
