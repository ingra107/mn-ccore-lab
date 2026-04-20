// New-team-member audit — desktop + mobile walkthrough of mn-ccore-lab.pages.dev
// Output: review/audit-newteammate/<ts>/<page>-<viewport>.png + findings.md
// Run: npx playwright test tests/audit-newteammate.spec.ts --reporter=list

import { test, expect, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const BASE = 'https://mn-ccore-lab.pages.dev'
const TS = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 12)
const OUT = path.join(process.cwd(), 'review', 'audit-newteammate', TS)
fs.mkdirSync(OUT, { recursive: true })

type Finding = {
  severity: 'P0' | 'P1' | 'P2' | 'P3' | 'INFO'
  area: string
  page: string
  viewport: 'desktop' | 'mobile'
  problem: string
  evidence: string
  fix?: string
}
const findings: Finding[] = []
const log = (f: Finding) => {
  findings.push(f)
  console.log(`[${f.severity}] ${f.area} (${f.viewport}/${f.page}): ${f.problem}`)
}

const PORTAL_PAGES = [
  '/dashboard',
  '/tasks',
  '/my-tasks',
  '/projects',
  '/meetings',
  '/personal',
  '/team',
  '/team/nick-ingraham',
  '/deadlines',
  '/ideas',
  '/decisions',
  '/calendar',
  '/analytics',
  '/settings',
]

const MOBILE_PAGES = ['/dashboard', '/tasks', '/projects', '/team']

async function shotPath(viewport: string, slug: string) {
  return path.join(OUT, `${viewport}-${slug.replace(/\//g, '_') || 'root'}.png`)
}

async function gotoAndWait(page: Page, url: string) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const text = m.text()
      // Filter noise
      if (text.includes('favicon') || text.includes('Failed to load resource: the server responded with a status of 404')) return
      errors.push(`console.error: ${text.slice(0, 200)}`)
    }
  })
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(1500) // settle anims, render skeletons
  return { status: resp?.status() ?? 0, errors }
}

test.describe.configure({ mode: 'serial' })

test('new-team-member desktop walkthrough', async ({ browser }) => {
  test.setTimeout(600_000)
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  })
  const page = await ctx.newPage()

  for (const route of PORTAL_PAGES) {
    const url = `${BASE}${route}`
    const { status, errors } = await gotoAndWait(page, url)
    const slug = route.slice(1) || 'root'
    const png = await shotPath('desktop', slug)
    try {
      await page.screenshot({ path: png, fullPage: true })
    } catch (e: any) {
      // fullPage can fail on huge pages; fall back
      await page.screenshot({ path: png })
    }

    if (status >= 400) {
      log({
        severity: 'P0',
        area: 'page-load',
        page: route,
        viewport: 'desktop',
        problem: `HTTP ${status} on portal route`,
        evidence: png,
      })
    }
    for (const e of errors.slice(0, 5)) {
      log({
        severity: 'P1',
        area: 'console',
        page: route,
        viewport: 'desktop',
        problem: e,
        evidence: png,
      })
    }

    // --- Surface checks ---
    // 1. Loading-forever
    const loadingTextCount = await page.getByText(/^loading\.{0,3}$/i).count()
    if (loadingTextCount > 0) {
      log({
        severity: 'P1',
        area: 'empty-state',
        page: route,
        viewport: 'desktop',
        problem: `"Loading..." text still visible after 1.5s settle (count=${loadingTextCount})`,
        evidence: png,
      })
    }

    // 2. Raw nulls / undefined leaking
    const nullLeak = await page
      .locator('body')
      .innerText()
      .then((t) => /\b(undefined|null,null|NaN)\b/.test(t))
      .catch(() => false)
    if (nullLeak) {
      log({
        severity: 'P1',
        area: 'data-leak',
        page: route,
        viewport: 'desktop',
        problem: 'Raw "undefined" / "null" / "NaN" text in DOM',
        evidence: png,
      })
    }

    // 3. JetBrains Mono creeping into content (rule: code only)
    const monoOutsideKbd = await page.evaluate(() => {
      const out: { tag: string; sample: string }[] = []
      document.querySelectorAll('p, span, div, td, h1, h2, h3, h4, button, a').forEach((el) => {
        const cs = getComputedStyle(el as Element)
        if (/JetBrains|Mono/i.test(cs.fontFamily) && (el as HTMLElement).innerText?.trim().length > 1) {
          if ((el as Element).closest('kbd, pre, code')) return
          out.push({ tag: el.tagName, sample: (el as HTMLElement).innerText.trim().slice(0, 60) })
        }
      })
      return out.slice(0, 5)
    })
    for (const m of monoOutsideKbd) {
      log({
        severity: 'P2',
        area: 'typography',
        page: route,
        viewport: 'desktop',
        problem: `JetBrains Mono on <${m.tag}>: "${m.sample}" (rule: monospace for <kbd> only)`,
        evidence: png,
      })
    }

    // 4. Below-0.30 opacity on readable text
    const lowOpacity = await page.evaluate(() => {
      const out: { tag: string; opacity: string; sample: string }[] = []
      document
        .querySelectorAll('p, span, div, td, button, a, h1, h2, h3, h4, label')
        .forEach((el) => {
          const cs = getComputedStyle(el as Element)
          const op = parseFloat(cs.opacity)
          const txt = (el as HTMLElement).innerText?.trim()
          if (op > 0 && op < 0.3 && txt && txt.length > 1) {
            // Skip if the element is non-visible
            const rect = (el as HTMLElement).getBoundingClientRect()
            if (rect.width === 0 || rect.height === 0) return
            out.push({ tag: el.tagName, opacity: cs.opacity, sample: txt.slice(0, 50) })
          }
        })
      return out.slice(0, 3)
    })
    for (const lo of lowOpacity) {
      log({
        severity: 'P2',
        area: 'typography',
        page: route,
        viewport: 'desktop',
        problem: `Opacity ${lo.opacity} < 0.30 on readable text <${lo.tag}>: "${lo.sample}"`,
        evidence: png,
      })
    }

    // 5. Touch-target audit (only flag interactive < 44 if mobile, but record always)
    // skip on desktop

    // 6. Inline-edit affordance — look for ▾ or aria role for combobox in tables
    if (['/tasks', '/my-tasks', '/projects', '/deadlines', '/ideas', '/decisions'].includes(route)) {
      const tableExists = await page.locator('table, [role="table"], [data-testid*="grid"]').count()
      const dropdownAffordance = await page
        .locator('text=▾, [aria-haspopup="listbox"], [data-testid*="inline-select"]')
        .count()
      if (tableExists > 0 && dropdownAffordance === 0) {
        log({
          severity: 'P1',
          area: 'inline-edit',
          page: route,
          viewport: 'desktop',
          problem: 'Data-page table present but no visible ▾ / inline-edit affordance found',
          evidence: png,
        })
      }
    }

    // 7. Loading skeletons that never resolve into real content (header missing)
    const headerCount = await page.locator('h1, h2, [data-testid="page-header"]').count()
    if (headerCount === 0) {
      log({
        severity: 'P1',
        area: 'page-header',
        page: route,
        viewport: 'desktop',
        problem: 'No <h1>/<h2>/PageHeader found',
        evidence: png,
      })
    }
  }

  // Specific deeper checks on /tasks
  await gotoAndWait(page, `${BASE}/tasks`)
  // J/K nav check
  const beforeFocus = await page.evaluate(() => document.activeElement?.tagName ?? '')
  await page.keyboard.press('j')
  await page.waitForTimeout(150)
  const afterFocus = await page.evaluate(
    () => (document.activeElement as HTMLElement)?.getAttribute('data-task-id') ?? document.activeElement?.tagName ?? ''
  )
  if (beforeFocus === afterFocus) {
    // Could be that the page needs a click first — try J after focusing a row
    await page.keyboard.press('Tab')
    await page.keyboard.press('j')
    await page.waitForTimeout(150)
    const afterTab = await page.evaluate(
      () => (document.activeElement as HTMLElement)?.getAttribute('data-task-id') ?? document.activeElement?.tagName ?? ''
    )
    if (afterTab === beforeFocus) {
      log({
        severity: 'P2',
        area: 'keyboard',
        page: '/tasks',
        viewport: 'desktop',
        problem: 'J keyboard nav had no observable focus shift on /tasks',
        evidence: 'manual probe',
      })
    }
  }

  // Cmd+K palette
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
  await page.waitForTimeout(300)
  const paletteOpen = await page.locator('[role="dialog"], [aria-modal="true"]').count()
  const palettePng = path.join(OUT, 'desktop-cmdk-palette.png')
  await page.screenshot({ path: palettePng })
  if (paletteOpen === 0) {
    log({
      severity: 'P1',
      area: 'keyboard',
      page: '/tasks',
      viewport: 'desktop',
      problem: 'Ctrl/Cmd+K did not open command palette',
      evidence: palettePng,
    })
  }
  await page.keyboard.press('Escape')

  await ctx.close()
})

test('new-team-member mobile walkthrough', async ({ browser }) => {
  test.setTimeout(300_000)
  // Pixel 5 emulation
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 851 },
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    reducedMotion: 'reduce',
  })
  const page = await ctx.newPage()

  for (const route of MOBILE_PAGES) {
    const url = `${BASE}${route}`
    const { status, errors } = await gotoAndWait(page, url)
    const slug = route.slice(1) || 'root'
    const png = await shotPath('mobile', slug)
    try {
      await page.screenshot({ path: png, fullPage: true })
    } catch {
      await page.screenshot({ path: png })
    }

    if (status >= 400) {
      log({
        severity: 'P0',
        area: 'page-load',
        page: route,
        viewport: 'mobile',
        problem: `HTTP ${status}`,
        evidence: png,
      })
    }
    for (const e of errors.slice(0, 5)) {
      log({
        severity: 'P1',
        area: 'console',
        page: route,
        viewport: 'mobile',
        problem: e,
        evidence: png,
      })
    }

    // Viewport overflow check
    const overflow = await page.evaluate(() => {
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }
    })
    if (overflow.scrollWidth > overflow.clientWidth + 4) {
      log({
        severity: 'P1',
        area: 'mobile-overflow',
        page: route,
        viewport: 'mobile',
        problem: `Horizontal overflow: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}`,
        evidence: png,
      })
    }

    // Touch-target audit
    const smallTargets = await page.evaluate(() => {
      const out: { tag: string; w: number; h: number; sample: string }[] = []
      document
        .querySelectorAll('button, a, [role="button"], input[type=checkbox], [data-testid*="picker"]')
        .forEach((el) => {
          const r = (el as HTMLElement).getBoundingClientRect()
          if (r.width === 0 || r.height === 0) return
          if (r.width < 44 || r.height < 44) {
            out.push({
              tag: el.tagName,
              w: Math.round(r.width),
              h: Math.round(r.height),
              sample: ((el as HTMLElement).innerText || (el as HTMLElement).getAttribute('aria-label') || '').slice(
                0,
                40
              ),
            })
          }
        })
      // Dedup similar
      const seen = new Set<string>()
      return out
        .filter((x) => {
          const k = `${x.tag}-${x.w}x${x.h}-${x.sample}`
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
        .slice(0, 8)
    })
    for (const st of smallTargets) {
      log({
        severity: 'P2',
        area: 'mobile-touch',
        page: route,
        viewport: 'mobile',
        problem: `Touch target ${st.w}x${st.h}px <${st.tag}> "${st.sample}" (< 44px floor)`,
        evidence: png,
      })
    }

    // Bottom tab bar present?
    const tabBar = await page.locator('[data-testid="mobile-tab-bar"], nav[aria-label*="mobile" i]').count()
    if (tabBar === 0 && route !== '/' && !route.includes('/team/')) {
      log({
        severity: 'P2',
        area: 'mobile-nav',
        page: route,
        viewport: 'mobile',
        problem: 'No mobile tab bar locator found (data-testid="mobile-tab-bar")',
        evidence: png,
      })
    }
  }

  await ctx.close()
})

test.afterAll(async () => {
  const md: string[] = []
  md.push(`# New-team-member audit — ${TS}`)
  md.push(`Base: ${BASE}\nGenerated: ${new Date().toISOString()}\n`)
  const groups = ['P0', 'P1', 'P2', 'P3', 'INFO'] as const
  for (const g of groups) {
    const items = findings.filter((f) => f.severity === g)
    if (!items.length) continue
    md.push(`\n## ${g} (${items.length})`)
    for (const f of items) {
      md.push(
        `- **[${f.area}]** ${f.viewport} \`${f.page}\` — ${f.problem}${f.fix ? `\n  - fix: ${f.fix}` : ''}\n  - evidence: ${f.evidence}`
      )
    }
  }
  fs.writeFileSync(path.join(OUT, 'findings.md'), md.join('\n'))
  console.log(`\n=== Audit done. ${findings.length} findings. Output: ${OUT}`)
})
