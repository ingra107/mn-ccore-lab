// F27 (fable audit, 2026-11-05): the mobile tab bar and the sidebar draw one page
// with one icon. Tasks and Grants used to differ between them.
import { describe, it, expect } from 'vitest'
import { PORTAL_PAGE_ICONS } from '../constants/pageLabels'
import { PATHS } from '../constants/paths'
import mobileTabBarSource from '../components/MobileTabBar.tsx?raw'
import sidebarSource from '../components/Sidebar.tsx?raw'

describe('Page icons', () => {
  it('has one icon per page, read by both navs', () => {
    for (const p of [PATHS.myTasks, PATHS.grants, PATHS.team, PATHS.calendar]) expect(PORTAL_PAGE_ICONS[p]).toBeTruthy()
    for (const src of [mobileTabBarSource, sidebarSource]) {
      expect(src).toContain('PORTAL_PAGE_ICONS[PATHS.myTasks]')
      expect(src).toContain('PORTAL_PAGE_ICONS[PATHS.grants]')
    }
    expect(mobileTabBarSource).not.toContain('ListChecks')
    expect(mobileTabBarSource).not.toContain('Award')
    expect(sidebarSource).not.toContain('DollarSign')
  })
})
