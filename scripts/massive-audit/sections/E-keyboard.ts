/**
 * Section E — keyboard shortcut sweep.
 *
 * Hits documented G+key navigation chains and global shortcuts; verifies
 * URL change or expected modal appearance.
 */
import { openSession, closeSession, log, pass, bug, snap, goto, persistFindingsJson, BASE } from '../lib/harness'

const G_NAV: Array<{ keys: string[]; expectedPath: RegExp }> = [
  { keys: ['g', 'd'], expectedPath: /\/portal\/dashboard/ },
  { keys: ['g', 't'], expectedPath: /\/portal\/(my-tasks|tasks)/ },
  { keys: ['g', 'p'], expectedPath: /\/portal\/projects/ },
  { keys: ['g', 'm'], expectedPath: /\/portal\/meetings/ },
  { keys: ['g', 'i'], expectedPath: /\/portal\/ideas/ },
  { keys: ['g', 'c'], expectedPath: /\/portal\/calendar/ },
  { keys: ['g', 's'], expectedPath: /\/portal\/settings/ },
]

export async function runSectionE(runId: string, rootDir: string) {
  const s = await openSession({ section: 'E-keyboard', runId, rootDir })
  try {
    log(s, 'E — keyboard shortcut sweep')
    await goto(s, '/portal/dashboard')

    for (const nav of G_NAV) {
      try {
        // Navigate away first to make the next G+key meaningful
        await goto(s, '/portal/personal')
        await s.page.waitForTimeout(200)
        for (const k of nav.keys) {
          await s.page.keyboard.press(k)
          await s.page.waitForTimeout(100)
        }
        await s.page.waitForTimeout(800)
        const url = s.page.url()
        if (nav.expectedPath.test(url)) {
          pass(s, `E ${nav.keys.join('+').toUpperCase()} → ${url.slice(BASE.length)}`)
        } else {
          bug(s, `E.${nav.keys.join('').toUpperCase()}`, 'P1', `G+${nav.keys.slice(1).join('').toUpperCase()} navigation`, `landed at ${url}`, `URL matching ${nav.expectedPath.source}`)
        }
      } catch (e) {
        bug(s, `E.${nav.keys.join('').toUpperCase()}.thrown`, 'P0', `G+${nav.keys.slice(1).join('').toUpperCase()} threw`, (e as Error).message.slice(0, 160), 'no throw')
      }
    }

    // Cmd+K opens CommandPalette
    log(s, 'E — Ctrl+K opens command palette')
    await goto(s, '/portal/dashboard')
    await s.page.keyboard.press('Control+k')
    await s.page.waitForTimeout(500)
    await snap(s, 'cmd-k-open')
    const palette = s.page.locator('[data-testid="command-palette"], [role="dialog"]').first()
    if (await palette.count()) pass(s, 'E Ctrl+K opens dialog')
    else bug(s, 'E.cmd-k', 'P1', 'Ctrl+K opens command palette', 'no dialog rendered', 'palette dialog')
    await s.page.keyboard.press('Escape')

    // ? opens ShortcutHelp (Shift+/ on US keyboard)
    log(s, 'E — ? opens shortcut help')
    await s.page.waitForTimeout(800)
    await s.page.keyboard.press('Shift+/')
    await s.page.waitForTimeout(500)
    await snap(s, 'q-open')
    const help = s.page.getByRole('dialog').first()
    if (await help.count()) pass(s, 'E ? opens shortcut help dialog')
    else bug(s, 'E.qmark', 'P1', '? opens shortcut help', 'no dialog rendered', 'help dialog')
    await s.page.keyboard.press('Escape')
  } finally {
    persistFindingsJson(s)
    await closeSession(s)
  }
  const passes = s.findings.filter((f) => f.level === 'PASS').length
  const bugs = s.findings.filter((f) => f.level === 'BUG').length
  return { name: 'E-keyboard', passes, bugs }
}
