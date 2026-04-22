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

    // Look for Status / Priority / Snooze submenu triggers
    const statusItem = s.page.locator('text=/^Status/').first()
    const priorityItem = s.page.locator('text=/^Priority/').first()
    if (await statusItem.count()) pass(s, 'F context menu shows Status submenu')
    else bug(s, 'F.1', 'P1', 'context menu Status item', 'not found', 'Status submenu visible')
    if (await priorityItem.count()) pass(s, 'F context menu shows Priority submenu')
    else bug(s, 'F.2', 'P1', 'context menu Priority item', 'not found', 'Priority submenu visible')

    // Esc closes
    await s.page.keyboard.press('Escape')
    await s.page.waitForTimeout(300)
    const stillOpen = await statusItem.count()
    if (stillOpen === 0) pass(s, 'F Escape closes context menu')
    else bug(s, 'F.3', 'P2', 'Escape closes context menu', 'menu still in DOM', 'closed')
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
