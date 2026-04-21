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

// Every portal route. Detail pages (`:slug`/`:id`) resolved at runtime
// using known live data so the axe scan catches rendering for content-rich
// pages, not just empty shells.
const PORTAL_PAGES = [
  '/portal/dashboard',
  '/portal/my-tasks',
  '/portal/my-tasks',
  '/portal/projects',
  '/portal/manuscripts',
  '/portal/meetings',
  '/portal/deadlines',
  '/portal/ideas',
  '/portal/decisions',
  '/portal/grants',
  '/portal/analytics',
  '/portal/pi-analytics',
  '/team',
  '/portal/settings',
  // Extended coverage added 2026-04-18 — catches pages whose a11y hadn't
  // been validated by axe yet.
  '/pulse',
  '/portal/personal',
  '/portal/calendar',
  '/portal/digest',
  '/portal/search',
  '/portal/ask',
  '/portal/narratives',
  '/portal/deadline-cascade',
  '/network',
  '/publications',
  '/portal/activity',
]

async function main() {
  // CLI flag: --light forces the light-mode palette. Default stays dark so
  // the normal preflight run is unchanged.
  const mode: 'light' | 'dark' = process.argv.includes('--light') ? 'light' : 'dark'
  const s = await openPersona({
    persona: mode === 'light' ? 'axe-light' : 'axe',
    role: `axe-core formal WCAG 2.1 scan (${mode} mode)`,
    colorScheme: mode,
  })

  // Resolve one real project + meeting + member slug so detail pages scan
  // content, not empty shells.
  let detailPages: string[] = []
  try {
    const projResp = await s.api.get('/api/projects')
    const mtgResp = await s.api.get('/api/meetings')
    const teamResp = await s.api.get('/api/team')
    const proj = projResp.ok() ? ((await projResp.json()) as { data?: Array<{ slug: string }> }).data?.[0]?.slug : null
    const mtg = mtgResp.ok() ? ((await mtgResp.json()) as { data?: Array<{ id: string }> }).data?.[0]?.id : null
    const mem = teamResp.ok() ? ((await teamResp.json()) as { data?: Array<{ slug: string }> }).data?.find((m) => m.slug)?.slug : null
    if (proj) detailPages.push(`/portal/projects/${proj}`)
    if (mtg) detailPages.push(`/portal/meetings/${mtg}`)
    if (mem) detailPages.push(`/team/${mem}`)
    if (mem) detailPages.push(`/team/${mem}/trajectory`)
  } catch { /* proceed without detail pages */ }

  const allPages = [...PORTAL_PAGES, ...detailPages]

  try {
    for (const path of allPages) {
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
