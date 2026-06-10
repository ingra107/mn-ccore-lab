/**
 * Section B — visual integrity sweep.
 *
 * For every public + portal route:
 *   - Load in 3 viewports (desktop / tablet / mobile) × 2 themes (dark / light)
 *   - Snap full viewport
 *   - Run axe-core wcag21aa (log violations)
 *   - Run overlap detector (z-index conflicts, occlusion >5%)
 *   - Check horizontal overflow
 *   - Capture console errors (filtered for noise)
 *   - Capture computed style sample (body bg, h1 weight, font-family)
 *
 * One browser, one context per (viewport,theme), 35 pages per context.
 * Outputs:
 *   findings.md, axe-violations.json, overlap-report.json,
 *   console-errors.jsonl, screenshots/<viewport>-<theme>/<route>.png
 */
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync, appendFileSync } from 'fs'
import { join } from 'path'
import AxeBuilder from '@axe-core/playwright'
import { loadAuth, browserHeaders } from '../lib/auth'
import { detectOverlaps, detectHorizontalOverflow } from '../lib/overlap-detector'
import { VIEWPORTS, type Viewport, type Theme, BASE } from '../lib/harness'

// All static routes. Dynamic routes (project(slug), meeting(id), member)
// are sampled at runtime.
const PORTAL_STATIC = [
  '/portal/dashboard',
  '/portal/personal',
  '/portal/my-items',
  '/portal/my-tasks',
  '/portal/tasks',
  '/portal/calendar',
  '/portal/deadlines',
  '/portal/deadline-cascade',
  '/portal/projects',
  '/portal/manuscripts',
  '/portal/ideas',
  '/portal/ask',
  '/portal/decisions',
  '/portal/narratives',
  '/portal/digest',
  '/portal/search',
  '/portal/grants',
  '/portal/meetings',
  '/portal/meeting-notes',
  '/portal/activity',
  '/portal/analytics',
  '/portal/pi/analytics',
  '/portal/mentee-milestones',
  '/portal/sessions',
  '/portal/settings',
]

const PUBLIC_STATIC = [
  '/',
  '/team',
  '/publications',
  '/network',
  '/contact',
  '/nick',
  '/nate',
  '/pulse',
]

const VIEWPORT_THEME_COMBOS: Array<{ viewport: Viewport; theme: Theme }> = [
  { viewport: 'desktop', theme: 'dark' },
  { viewport: 'desktop', theme: 'light' },
  { viewport: 'tablet', theme: 'dark' },
  { viewport: 'tablet', theme: 'light' },
  { viewport: 'mobile', theme: 'dark' },
  { viewport: 'mobile', theme: 'light' },
]

interface PageResult {
  path: string
  viewport: Viewport
  theme: Theme
  loadOk: boolean
  loadError?: string
  axeViolations: number
  axeIds: string[]
  overlapHits: number
  overflowOk: boolean
  consoleErrors: number
  bodyBg?: string
  h1Weight?: string
  fontFamily?: string
  screenshot?: string
}

export async function runSectionB(runId: string, rootDir: string) {
  const auth = loadAuth()
  const sectionDir = join(rootDir, 'B-visual')
  mkdirSync(sectionDir, { recursive: true })
  const findingsPath = join(sectionDir, 'findings.md')
  const axePath = join(sectionDir, 'axe-violations.json')
  const overlapPath = join(sectionDir, 'overlap-report.json')
  const consoleErrLog = join(sectionDir, 'console-errors.jsonl')

  console.log(`\n══════ SECTION B-visual — run ${runId} ══════`)
  console.log(`  ${PORTAL_STATIC.length + PUBLIC_STATIC.length} pages × ${VIEWPORT_THEME_COMBOS.length} viewport+theme combos`)

  const browser = await chromium.launch({ headless: true })
  const allResults: PageResult[] = []
  const allAxe: Record<string, any[]> = {}
  const allOverlaps: Record<string, any[]> = {}

  let passes = 0
  let bugs = 0

  for (const { viewport, theme } of VIEWPORT_THEME_COMBOS) {
    console.log(`\n  ── ${viewport}/${theme} ──`)
    const screenshotDir = join(sectionDir, 'screenshots', `${viewport}-${theme}`)
    mkdirSync(screenshotDir, { recursive: true })

    const ctx = await browser.newContext({
      viewport: VIEWPORTS[viewport],
      deviceScaleFactor: VIEWPORTS[viewport].deviceScaleFactor,
      colorScheme: theme,
      reducedMotion: 'reduce',
      extraHTTPHeaders: browserHeaders(auth),
    })
    await ctx.addInitScript((t: string) => {
      try { localStorage.setItem('mn-ccore-theme', t) } catch {}
    }, theme)

    const page = await ctx.newPage()

    const consoleErrors: Array<{ path: string; text: string }> = []
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      const t = m.text()
      if (
        t.includes('WebSocket') ||
        t.includes('hub-realtime') ||
        t.includes('Failed to load resource') ||
        t.includes('fonts.gstatic.com') ||
        t.includes('fonts.googleapis.com') ||
        t.includes('Access to font') ||
        t.includes('Access to CSS stylesheet') ||
        t.includes('Access to XMLHttpRequest at \'https://fonts') ||
        t.includes('maps.googleapis.com') ||
        t.includes('partysocket')
      ) return
      consoleErrors.push({ path: page.url(), text: t.slice(0, 240) })
    })
    page.on('pageerror', (e) => {
      const m = e.message
      if (m.includes('WebSocket') || m.includes('hub-realtime') || m.includes('partysocket')) return
      consoleErrors.push({ path: page.url(), text: `[pageerror] ${m.slice(0, 240)}` })
    })

    const allPaths = [...PORTAL_STATIC, ...PUBLIC_STATIC]
    for (const path of allPaths) {
      const pre = consoleErrors.length
      const result: PageResult = {
        path,
        viewport,
        theme,
        loadOk: false,
        axeViolations: 0,
        axeIds: [],
        overlapHits: 0,
        overflowOk: true,
        consoleErrors: 0,
      }
      try {
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 })
        await page.waitForTimeout(600)
        result.loadOk = true
      } catch (e) {
        result.loadError = (e as Error).message.slice(0, 160)
        bugs++
        console.log(`    ✗ ${path} — load failed: ${result.loadError}`)
        allResults.push(result)
        continue
      }

      // Snap
      const safePath = path.replace(/\//g, '_').replace(/^_/, '') || 'root'
      const snapFile = `${safePath}.png`
      try {
        await page.screenshot({ path: join(screenshotDir, snapFile), fullPage: false })
        result.screenshot = snapFile
      } catch {}

      // Computed style sample
      try {
        const style = await page.evaluate(() => ({
          bodyBg: getComputedStyle(document.body).backgroundColor,
          h1Weight: getComputedStyle(document.querySelector('h1') ?? document.body).fontWeight,
          fontFamily: getComputedStyle(document.body).fontFamily,
        }))
        result.bodyBg = style.bodyBg
        result.h1Weight = style.h1Weight
        result.fontFamily = style.fontFamily
      } catch {}

      // Horizontal overflow
      try {
        const overflow = await detectHorizontalOverflow(page)
        result.overflowOk = !overflow.hasOverflow
        if (overflow.hasOverflow) {
          bugs++
          console.log(`    ✗ ${path} ${viewport}/${theme} — horizontal overflow ${overflow.bodyScrollWidth} > ${overflow.clientWidth}`)
        }
      } catch {}

      // Overlap detector
      try {
        const overlaps = await detectOverlaps(page)
        result.overlapHits = overlaps.length
        if (overlaps.length > 0) {
          allOverlaps[`${viewport}-${theme}-${path}`] = overlaps
          // Only count as bug if a notable occlusion (>20%)
          const major = overlaps.filter((h) => h.occlusionPct >= 20)
          if (major.length > 0) {
            bugs++
            console.log(`    ✗ ${path} ${viewport}/${theme} — ${major.length} major overlap(s)`)
          }
        }
      } catch (e) {
        console.log(`    ! overlap detect error: ${(e as Error).message.slice(0, 100)}`)
      }

      // axe-core a11y
      try {
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
        result.axeViolations = axe.violations.length
        result.axeIds = axe.violations.map((v) => v.id)
        if (axe.violations.length > 0) {
          allAxe[`${viewport}-${theme}-${path}`] = axe.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.length,
          }))
          // Count critical/serious as bug; minor/moderate are findings only
          const critical = axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').length
          if (critical > 0) {
            bugs++
            console.log(`    ✗ ${path} ${viewport}/${theme} — ${critical} critical/serious axe violations (${result.axeIds.join(',')})`)
          }
        }
      } catch (e) {
        console.log(`    ! axe error on ${path}: ${(e as Error).message.slice(0, 100)}`)
      }

      result.consoleErrors = consoleErrors.length - pre
      if (result.consoleErrors > 0) {
        for (const ce of consoleErrors.slice(pre)) {
          appendFileSync(consoleErrLog, JSON.stringify({ viewport, theme, ...ce }) + '\n')
        }
      }

      passes++
      console.log(`    ✓ ${path}`)
      allResults.push(result)
    }

    await ctx.close()
  }

  await browser.close()

  // Persist artifacts
  writeFileSync(axePath, JSON.stringify(allAxe, null, 2))
  writeFileSync(overlapPath, JSON.stringify(allOverlaps, null, 2))

  // Build findings.md
  const totalLoadFails = allResults.filter((r) => !r.loadOk).length
  const totalOverflow = allResults.filter((r) => !r.overflowOk).length
  const totalOverlap = allResults.filter((r) => r.overlapHits > 0).length
  const totalAxeAny = allResults.filter((r) => r.axeViolations > 0).length
  const totalConsoleErr = allResults.filter((r) => r.consoleErrors > 0).length

  const lines = [
    `# B-visual — run ${runId}`,
    ``,
    `Pages: ${PORTAL_STATIC.length + PUBLIC_STATIC.length}`,
    `Viewport+theme combos: ${VIEWPORT_THEME_COMBOS.length}`,
    `Total page loads: ${allResults.length}`,
    ``,
    `## Summary`,
    ``,
    `- Load failures: ${totalLoadFails}`,
    `- Horizontal overflow violations: ${totalOverflow}`,
    `- Pages with overlap hits: ${totalOverlap}`,
    `- Pages with axe violations: ${totalAxeAny}`,
    `- Pages with console errors: ${totalConsoleErr}`,
    ``,
    `Detail:`,
    `- axe-violations.json — full axe rule + node count per page`,
    `- overlap-report.json — z-index + bounding-box hits per page`,
    `- console-errors.jsonl — one line per error`,
    `- screenshots/<viewport>-<theme>/ — full snap of each page`,
    ``,
    `## Per-page table`,
    ``,
    `| Path | viewport | theme | load | axe | overlaps | overflow | console |`,
    `|---|---|---|---|---|---|---|---|`,
    ...allResults.map(
      (r) =>
        `| ${r.path} | ${r.viewport} | ${r.theme} | ${r.loadOk ? '✓' : '✗ ' + r.loadError} | ${r.axeViolations} | ${r.overlapHits} | ${r.overflowOk ? '✓' : '✗'} | ${r.consoleErrors} |`,
    ),
  ]
  writeFileSync(findingsPath, lines.join('\n'))

  console.log(`\n  Section B done — passes=${passes} bugs=${bugs}`)
  return { name: 'B-visual', passes, bugs }
}
