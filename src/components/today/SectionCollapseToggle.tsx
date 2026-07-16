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

// collapseToggleProps moved to ./collapseToggleProps.ts — react-refresh/
// only-export-components requires this file to export ONLY components; that
// helper is a plain function, not a component. Import it from
// './collapseToggleProps' directly at call sites (not re-exported here —
// a re-export is still a non-component export and would re-trip the rule).
