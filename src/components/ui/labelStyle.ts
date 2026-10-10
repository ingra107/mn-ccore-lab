// The section label used on the project page (Open tasks, Links, Members,
// Published, Recent, ...). Sentence case at Today's section-title size and
// colour (.tk-ph h3: 14px, 600, --sk-t1), per Nick 2026-10-09 "Section headers:
// sentence case". A plain .ts module so it can be shared without tripping
// react-refresh/only-export-components.
export const LABEL_STYLE = {
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--sk-t1)',
} as const

// Neutral colour for the small icon beside a section label (one colour, not a
// per-section rainbow).
export const LABEL_ICON_COLOR = 'var(--sk-t3)'
