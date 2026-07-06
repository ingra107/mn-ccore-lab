// CollapseChevron — shared ▸/▾ glyph for Today page section headers
// (Timeline/Agenda, Planned today, TaskGroup, rail cards). Matches the
// existing "Completed today" affordance (TodayPage.tsx). Purely
// presentational — each caller owns its own open/close useState. Session-only
// by design (no storageKey/localStorage): Nick wants every section to start
// expanded on every load.
import { INK_DIM } from './constants'

export function CollapseChevron({ open, color }: { open: boolean; color?: string }) {
  return (
    <span aria-hidden="true" style={{ color: color ?? INK_DIM, fontSize: 11, lineHeight: 1, flexShrink: 0 }}>
      {open ? '▾' : '▸'}
    </span>
  )
}

// Shared a11y prop bundle for section-header collapse toggles (9 sites had
// hand-rolled copies of this role/tabIndex/aria/onClick/onKeyDown group).
// Spread onto the header element; each site keeps its own layout/style.
export function collapseToggleProps(open: boolean, onToggle: () => void, label: string) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-expanded': open,
    'aria-label': open ? `Collapse ${label}` : `Expand ${label}`,
    onClick: onToggle,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } },
  }
}
