import { createContext, useContext } from 'react'

// Context to defer non-critical dashboard-card queries until after first
// paint. Lives in its own leaf file (not Dashboard.tsx) so this
// context+hook export doesn't trip react-refresh/only-export-components on
// the page component (backlog #750, 2026-07-16 — relocated out of
// Dashboard.tsx now that all consumers can import from here directly).
export const DashboardMountedContext = createContext(false)

export function useDashboardMounted() {
  return useContext(DashboardMountedContext)
}
