// CollapseChevron — shared ▸/▾ glyph for Today page section headers
// (Timeline/Agenda, Planned today, TaskGroup, rail cards). Matches the
// existing "Completed today" affordance (TodayPage.tsx). Purely
// presentational — each caller owns its own open/close useState. Session-only
// by design (no storageKey/localStorage): Nick wants every section to start
// expanded on every load.

// `color` is accepted for the callers that still pass one and ignored: the
// reskin draws every section chevron in the one muted tier (.tk-chev).
export function CollapseChevron({ open }: { open: boolean; color?: string }) {
  return <span aria-hidden="true" className="tk-chev">{open ? '▾' : '▸'}</span>
}

// collapseToggleProps moved to ./collapseToggleProps.ts — react-refresh/
// only-export-components requires this file to export ONLY components; that
// helper is a plain function, not a component. Import it from
// './collapseToggleProps' directly at call sites (not re-exported here —
// a re-export is still a non-component export and would re-trip the rule).
