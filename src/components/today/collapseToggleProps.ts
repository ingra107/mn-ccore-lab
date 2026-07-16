// collapseToggleProps — shared a11y prop bundle for section-header collapse
// toggles (9 sites had hand-rolled copies of this role/tabIndex/aria/onClick/
// onKeyDown group). Spread onto the header element; each site keeps its own
// layout/style.
//
// Split out of SectionCollapseToggle.tsx (which now exports ONLY the
// CollapseChevron component) — react-refresh/only-export-components requires
// a file to export exclusively components; this is a plain function.
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
