/**
 * Persona: formal axe-core accessibility scan.
 *
 * Runs @axe-core/playwright against every major portal page and reports
 * real WCAG 2.1 violations. Complements the heuristic accessibility persona
 * (which checks focus outlines + modal trap + landmarks) with the industry-
 * standard audit engine.
 *
 * Run: npx tsx scripts/pre-flight/persona-axe.ts
 */
import { openPersona, closePersona, section, pass, record, snap, goto } from './shared'
import AxeBuilder from '@axe-core/playwright'

const PORTAL_PAGES = [
  '/dashboard',
  '/my-tasks',
  '/tasks',
  '/projects',
  '/manuscripts',
  '/meetings',
  '/deadlines',
  '/ideas',
  '/decisions',
  '/grants',
  '/analytics',
  '/pi-analytics',
  '/team',
  '/settings',
]

async function main() {
  const s = await openPersona({
    persona: 'axe',
    role: 'axe-core formal WCAG 2.1 scan',
    colorScheme: 'dark',
  })

  try {
    for (const path of PORTAL_PAGES) {
      section(s, `Scan ${path}`)
      await goto(s, path)
      await s.page.waitForTimeout(1500)

      const results = await new AxeBuilder({ page: s.page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      const violations = results.violations
      await snap(s, `axe${path.replace(/\//g, '-')}`, 200)

      if (violations.length === 0) {
        pass(s, `${path}: 0 axe violations`)
      } else {
        for (const v of violations) {
          const severity = v.impact === 'critical' ? 'P0' : v.impact === 'serious' ? 'P1' : v.impact === 'moderate' ? 'P2' : 'INFO'
          const nodeSample = v.nodes.slice(0, 3).map((n) => n.target.join(' > ')).join(' | ')
          record(s, {
            id: `AXE-${v.id.toUpperCase()}`,
            severity,
            scenario: `${path}: ${v.help}`,
            observed: `${v.nodes.length} element(s): ${nodeSample.slice(0, 300)}`,
            expected: `${v.helpUrl} — ${v.description.slice(0, 150)}`,
          })
        }
      }
    }
  } catch (e) {
    record(s, { id: 'FATAL', severity: 'P0', scenario: 'Persona journey aborted', observed: (e as Error).message.slice(0, 200), expected: 'journey completes' })
  } finally {
    const result = await closePersona(s)
    console.log(`\n[axe] DONE — ${result.passCount} pass, ${result.findings.length} findings`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
