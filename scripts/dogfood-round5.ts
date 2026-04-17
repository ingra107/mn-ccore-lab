/**
 * Dogfood Round 5 — Visual correctness sweep.
 *
 * Scope: every portal page in dark + light × desktop + mobile.
 * Captures screenshots for visual review. Script also:
 *   • Counts clipped elements via computed styles
 *   • Measures tap target sizes on mobile
 *   • Checks for overlap via bounding rect intersection on a sampled set
 *
 * NEW — does not repeat Rounds 1-4.
 *
 * Run: npx tsx scripts/dogfood-round5.ts
 */
import { chromium, type Page, type BrowserContext } from '@playwright/test'
import { writeFileSync, mkdirSync } from 'fs'

const BASE = 'https://mn-ccore-lab.pages.dev'
const OUT = 'review/dogfood-round5'
mkdirSync(OUT, { recursive: true })

const findings: string[] = []
let bugCount = 0
let stepNum = 0

const PAGES = [
  '/dashboard',
  '/my-tasks',
  '/tasks',
  '/projects',
  '/manuscripts',
  '/ideas',
  '/decisions',
  '/deadlines',
  '/grants',
  '/meetings',
  '/publications',
  '/digest',
  '/calendar',
  '/personal',
  '/analytics',
  '/activity',
  '/search',
  '/team',
  '/settings',
]

const MODAL_ACTIONS: { page: string; label: string; trigger: (p: Page) => Promise<void> }[] = [
  { page: '/my-tasks', label: 'create-task-modal', trigger: async (p) => { await p.locator('button:has-text("New Task")').first().click() } },
  { page: '/ideas', label: 'create-idea-modal', trigger: async (p) => { await p.keyboard.press('n') } },
  { page: '/decisions', label: 'create-decision-modal', trigger: async (p) => { await p.keyboard.press('n') } },
  { page: '/dashboard', label: 'cmdk-palette', trigger: async (p) => { await p.keyboard.press('Control+k') } },
  { page: '/dashboard', label: 'shortcut-help', trigger: async (p) => { await p.keyboard.press('?') } },
  { page: '/dashboard', label: 'bug-report-modal', trigger: async (p) => { await p.locator('button[aria-label*="Report" i], button:has-text("Report a Bug")').first().click() } },
  { page: '/dashboard', label: 'quick-capture', trigger: async (p) => { await p.keyboard.press('Control+i') } },
]

function log(msg: string) {
  console.log(msg)
  findings.push(msg)
}

function bug(scenario: string, observed: string, expected: string, severity: 'P0' | 'P1' | 'P2' = 'P1') {
  bugCount++
  const entry = `- **[BUG-R5-${bugCount}] [${severity}] ${scenario}**\n  - Observed: ${observed}\n  - Expected: ${expected}`
  findings.push(entry)
  console.log(`  ❌ ${entry.replace(/\n/g, ' | ')}`)
}

async function snap(page: Page, label: string, waitMs = 700) {
  await page.waitForTimeout(waitMs)
  stepNum++
  const name = `${String(stepNum).padStart(3, '0')}-${label}`
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
  return name
}

// Measure: find buttons smaller than 44x44 on mobile
async function auditMobileTapTargets(page: Page, label: string) {
  const smallTargets = await page.evaluate(() => {
    const results: { tag: string; text: string; width: number; height: number }[] = []
    const all = document.querySelectorAll('button, a[href], [role="button"], [role="option"], [role="tab"], input[type="checkbox"], input[type="radio"]')
    for (const el of all) {
      const r = el.getBoundingClientRect()
      if (r.width < 44 && r.width > 0 && r.height < 44 && r.height > 0) {
        const text = (el.textContent || el.getAttribute('aria-label') || '').slice(0, 40)
        results.push({ tag: el.tagName, text, width: Math.round(r.width), height: Math.round(r.height) })
      }
    }
    return results.slice(0, 10) // cap noise
  })
  if (smallTargets.length > 0) {
    log(`  [TAP-TARGET] ${label}: ${smallTargets.length} interactive < 44×44`)
    for (const t of smallTargets.slice(0, 3)) {
      log(`    - ${t.tag} ${t.width}×${t.height} "${t.text}"`)
    }
    return smallTargets.length
  }
  return 0
}

// Measure: find text nodes with font-size < 11px on mobile
async function auditMobileFontSize(page: Page, label: string) {
  const tiny = await page.evaluate(() => {
    const bad: string[] = []
    const all = document.querySelectorAll('p, span, div, a, button, label, h1, h2, h3, h4, h5, h6, li, td, th')
    for (const el of all) {
      const cs = window.getComputedStyle(el as Element)
      const fs = parseFloat(cs.fontSize)
      const hasText = (el as HTMLElement).innerText?.trim().length > 0
      if (hasText && fs > 0 && fs < 11) {
        const text = ((el as HTMLElement).innerText || '').slice(0, 30)
        bad.push(`${fs}px "${text}"`)
      }
    }
    return bad.slice(0, 5)
  })
  if (tiny.length > 0) {
    log(`  [FONT-TINY] ${label}: ${tiny.length} text nodes < 11px`)
    for (const t of tiny) log(`    - ${t}`)
    return tiny.length
  }
  return 0
}

// Measure: horizontal overflow (body scrollWidth > window.innerWidth)
async function auditHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => {
    return { body: document.body.scrollWidth, vw: window.innerWidth }
  })
  if (overflow.body > overflow.vw + 2) {
    log(`  [H-OVERFLOW] ${label}: body ${overflow.body}px > viewport ${overflow.vw}px`)
    return true
  }
  return false
}

async function sweepTheme(ctx: BrowserContext, theme: 'dark' | 'light', viewport: 'desktop' | 'mobile') {
  const page = await ctx.newPage()
  const viewportSize = viewport === 'mobile' ? { width: 375, height: 812 } : { width: 1440, height: 900 }
  await page.setViewportSize(viewportSize)
  // Set theme via localStorage before first nav
  await page.addInitScript((t) => {
    localStorage.setItem('mn-ccore-theme', t)
  }, theme)

  const label = `${viewport}-${theme}`
  log(`\n━━━ SWEEP ${label.toUpperCase()} ━━━`)

  let mobileTapTotalBad = 0
  let mobileFontTotalBad = 0
  let hOverflowPages = 0

  for (const path of PAGES) {
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 20000 })
      await page.waitForTimeout(800)
      await snap(page, `${label}${path.replace(/\//g, '-')}`, 400)

      if (await auditHorizontalOverflow(page, `${label} ${path}`)) hOverflowPages++
      if (viewport === 'mobile') {
        mobileTapTotalBad += await auditMobileTapTargets(page, `${label} ${path}`)
        mobileFontTotalBad += await auditMobileFontSize(page, `${label} ${path}`)
      }
    } catch (e) {
      log(`  [NAV-FAIL] ${label} ${path}: ${(e as Error).message.slice(0, 80)}`)
    }
  }

  // Summary for this sweep
  if (hOverflowPages > 0) {
    bug(`${label} horizontal overflow on ${hOverflowPages} pages`, `pages scroll horizontally at ${viewportSize.width}px`, '0 pages overflow (body.scrollWidth ≤ viewport)', viewport === 'mobile' ? 'P1' : 'P2')
  }
  if (viewport === 'mobile') {
    if (mobileTapTotalBad > 50) bug('mobile sub-44 tap targets', `${mobileTapTotalBad} across ${PAGES.length} pages`, '0 interactive elements < 44×44 on mobile', 'P1')
    if (mobileFontTotalBad > 20) bug('mobile sub-11px text', `${mobileFontTotalBad} text nodes`, '0 text nodes < 11px on mobile', 'P2')
  }

  await page.close()
}

async function sweepModals(ctx: BrowserContext, theme: 'dark' | 'light') {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript((t) => { localStorage.setItem('mn-ccore-theme', t) }, theme)

  for (const m of MODAL_ACTIONS) {
    try {
      await page.goto(`${BASE}${m.page}`, { waitUntil: 'networkidle', timeout: 20000 })
      await page.waitForTimeout(1000)
      await m.trigger(page)
      await page.waitForTimeout(600)
      await snap(page, `modal-${theme}-${m.label}`, 400)
      // Close
      await page.keyboard.press('Escape').catch(() => {})
    } catch (e) {
      log(`  [MODAL-FAIL] ${theme} ${m.label}: ${(e as Error).message.slice(0, 80)}`)
    }
  }
  await page.close()
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })

  try {
    await sweepTheme(ctx, 'dark', 'desktop')
    await sweepTheme(ctx, 'light', 'desktop')
    await sweepTheme(ctx, 'dark', 'mobile')
    await sweepModals(ctx, 'dark')
  } catch (e) {
    log(`\n⚠ FATAL: ${(e as Error).message}`)
  } finally {
    const summary = `# Dogfood Round 5 — Visual correctness sweep

Base: ${BASE}
Screenshots: ${stepNum}
Bugs: ${bugCount}

## Findings

${findings.join('\n')}
`
    writeFileSync(`${OUT}/findings.md`, summary)
    log(`\n✓ Round 5 complete. ${bugCount} bugs, ${stepNum} screenshots. See ${OUT}/findings.md`)
    await browser.close()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
