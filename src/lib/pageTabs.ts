// pageTabs — the tab model behind components/PageTabs.tsx (nav redesign,
// 2026-10-09). Pure, so the URL -> tab rule is unit-tested.

import type { ReactNode } from 'react'

export interface PageTab {
  key: string
  label: string
  render: () => ReactNode
  /** Not offered to this viewer (e.g. a PI-only tab for a member). */
  hidden?: boolean
}

/** The tab a URL selects: its `?tab=` when that names a visible tab, else the first visible tab. */
export function resolveTab(tabs: PageTab[], requested: string | null): PageTab {
  const visible = tabs.filter((t) => !t.hidden)
  return visible.find((t) => t.key === requested) ?? visible[0]
}
