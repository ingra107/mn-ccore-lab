/**
 * Section F — right-click context menu audit.
 */
import { openSession, closeSession, log, pass, bug, snap, goto, persistFindingsJson } from '../lib/harness'

export async function runSectionF(runId: string, rootDir: string) {
  const s = await openSession({ section: 'F-context-menus', runId, rootDir })
  try {
    log(s, 'F — task right-click context menu')
    await goto(s, '/portal/my-tasks')
    await s.page.waitForTimeout(800)
    const firstRow = s.page.locator('[data-testid^="task-row-"]').first()
    if (!(await firstRow.count())) {
      bug(s, 'F.0', 'P1', 'task rows visible', 'no rows in DOM', 'at least one task row')
      return finalize(s)
    }
    await firstRow.click({ button: 'right' })
    await snap(s, 'task-context-menu', 500)

    // TaskContextMenu has no role attribute, but its items have
    // class="context-menu-item". Use that as the identifier.
    const items = s.page.locator('.context-menu-item')
    const itemCount = await items.count()
    if (itemCount > 0) pass(s, `F context menu opens (${itemCount} items)`)
    else bug(s, 'F.1', 'P1', 'context menu opens', 'no .context-menu-item in DOM', 'menu items rendered')

    // SubmenuItem (Status/Priority/Snooze) doesn't carry .context-menu-item
    // — its label is in a <span> inside a positioned div. Look for that.
    const statusSpan = s.page.locator('span').filter({ hasText: /^Status$/ })
    const prioritySpan = s.page.locator('span').filter({ hasText: /^Priority$/ })
    const statusInMenu = await statusSpan.count()
    const priorityInMenu = await prioritySpan.count()
    if (statusInMenu > 0) pass(s, 'F context menu shows Status submenu trigger')
    else bug(s, 'F.2a', 'P1', 'context menu Status trigger', 'no item titled Status', 'Status submenu trigger')
    if (priorityInMenu > 0) pass(s, 'F context menu shows Priority submenu trigger')
    else bug(s, 'F.2b', 'P1', 'context menu Priority trigger', 'no item titled Priority', 'Priority submenu trigger')

    // Esc closes
    await s.page.keyboard.press('Escape')
    await s.page.waitForTimeout(300)
    const itemsAfter = await s.page.locator('.context-menu-item').count()
    if (itemsAfter === 0) pass(s, 'F Escape closes context menu')
    else bug(s, 'F.3', 'P2', 'Escape closes context menu', `${itemsAfter} .context-menu-item still in DOM`, 'menu portal closed')
  } finally {
    return finalize(s)
  }
  function finalize(sess: any) {
    persistFindingsJson(sess)
    return closeSession(sess).then(() => ({
      name: 'F-context-menus',
      passes: sess.findings.filter((f: any) => f.level === 'PASS').length,
      bugs: sess.findings.filter((f: any) => f.level === 'BUG').length,
    }))
  }
}
