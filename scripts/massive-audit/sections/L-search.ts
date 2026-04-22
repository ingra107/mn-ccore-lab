/**
 * Section L — global search + command palette navigation.
 */
import { openSession, closeSession, log, pass, bug, snap, goto, persistFindingsJson } from '../lib/harness'

export async function runSectionL(runId: string, rootDir: string) {
  const s = await openSession({ section: 'L-search', runId, rootDir })
  try {
    log(s, 'L — global search page')
    await goto(s, '/portal/search')
    await s.page.waitForTimeout(800)
    await snap(s, 'search-page')

    const input = s.page.locator('input[type="search"], input[placeholder*="earch" i]').first()
    if (await input.count()) {
      pass(s, 'L search page renders search input')
      await input.fill('CLIF')
      await s.page.waitForTimeout(800)
      await snap(s, 'search-results')
    } else {
      bug(s, 'L.0', 'P1', 'search input on /portal/search', 'no input visible', 'search input rendered')
    }

    // CommandPalette via Ctrl+K
    log(s, 'L — Ctrl+K command palette open + type')
    await goto(s, '/portal/dashboard')
    await s.page.keyboard.press('Control+K')
    await s.page.waitForTimeout(500)
    const cmdInput = s.page.locator('[data-testid="command-search"], input[placeholder*="search" i]').first()
    if (await cmdInput.count()) {
      pass(s, 'L Ctrl+K opens command palette with search input')
      await cmdInput.fill('dashboard')
      await s.page.waitForTimeout(400)
      await snap(s, 'cmd-search')
    } else {
      bug(s, 'L.1', 'P1', 'command palette renders', 'no command-search input', 'palette input visible')
    }
    await s.page.keyboard.press('Escape')
  } finally {
    persistFindingsJson(s)
    await closeSession(s)
  }
  const passes = s.findings.filter((f) => f.level === 'PASS').length
  const bugs = s.findings.filter((f) => f.level === 'BUG').length
  return { name: 'L-search', passes, bugs }
}
