/**
 * Section G — drag & drop. Dashboard grid card reorder.
 */
import { openSession, closeSession, log, pass, bug, snap, goto, persistFindingsJson } from '../lib/harness'

export async function runSectionG(runId: string, rootDir: string) {
  const s = await openSession({ section: 'G-drag-drop', runId, rootDir })
  try {
    log(s, 'G — Dashboard grid card presence')
    await goto(s, '/portal/dashboard')
    await s.page.waitForTimeout(1500)
    await snap(s, 'dashboard-initial')

    const cards = s.page.locator('.rgl-item, [data-testid^="card-"]')
    const cardCount = await cards.count()
    if (cardCount > 0) pass(s, `G dashboard has ${cardCount} grid card(s)`)
    else bug(s, 'G.1', 'P1', 'dashboard grid cards', 'no .rgl-item or [data-testid^=card-] found', 'one or more cards')

    // Drag handles present
    const handles = s.page.locator('.rgl-drag-handle')
    const handleCount = await handles.count()
    if (handleCount > 0) pass(s, `G drag handles present (${handleCount})`)
    else bug(s, 'G.2', 'P2', 'drag handles', 'no .rgl-drag-handle found', 'one per card')

    // Customize button
    const customize = s.page.locator('[data-testid="dashboard-customize"]').first()
    if (await customize.count()) pass(s, 'G dashboard-customize button present')
    else bug(s, 'G.3', 'P2', 'customize button', 'not found', 'data-testid=dashboard-customize')
  } finally {
    persistFindingsJson(s)
    await closeSession(s)
  }
  const passes = s.findings.filter((f) => f.level === 'PASS').length
  const bugs = s.findings.filter((f) => f.level === 'BUG').length
  return { name: 'G-drag-drop', passes, bugs }
}
