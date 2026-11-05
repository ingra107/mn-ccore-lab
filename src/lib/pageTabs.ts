// pageTabs — the tab model behind components/PageTabs.tsx (nav redesign,
// 2026-10-09). Pure, so the URL -> tab rule is unit-tested.

import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react'

export interface PageTab {
  key: string
  label: string
  render: () => ReactNode
  /** Not offered to this viewer (e.g. a PI-only tab for a member). */
  hidden?: boolean
  /** Old `?tab=` keys that still open this tab (a renamed or folded tab keeps its bookmarks). */
  aliases?: string[]
}

/** The tab a URL selects: its `?tab=` when that names a visible tab (by key or alias), else the first visible tab. */
export function resolveTab(tabs: PageTab[], requested: string | null): PageTab {
  const visible = tabs.filter((t) => !t.hidden)
  return visible.find((t) => t.key === requested)
    ?? visible.find((t) => requested !== null && t.aliases?.includes(requested))
    ?? visible[0]
}

/** What a tab host hands the page in its tab: the host's title (for the loading
 *  state) and the tab tray. `claim` says a PageHeader is drawing the tray; the host
 *  draws it itself when nothing has (a page that failed, or has no header yet). */
export interface PageTabsHost {
  title: string
  tray: ReactNode
  claim: () => () => void
}

export const PageTabsContext = createContext<PageTabsHost | null>(null)

/** For PageHeader: the tray to draw under the title, null outside a tab host. */
export function usePageTabsTray(): ReactNode {
  const host = useContext(PageTabsContext)
  const claim = host?.claim
  useLayoutEffect(() => claim?.(), [claim])
  return host?.tray ?? null
}
