// The small uppercase section label used by the ProjectDetail right column
// (Key Links, Published, Documents & Links). A plain .ts module so it can be
// shared without tripping react-refresh/only-export-components.
export const LABEL_STYLE = {
  fontSize: '10px',
  fontWeight: 500,
  color: 'var(--slate)',
  opacity: 'var(--ink-label)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
} as const
