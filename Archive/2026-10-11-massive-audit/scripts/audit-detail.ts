/**
 * r7f detail: scroll the Home page and scan at multiple scroll positions
 * to catch the lazy-revealed element axe sees in B-visual.
 */
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'
import { loadAuth, browserHeaders } from './massive-audit/lib/auth'

const BASE = process.env.MASSIVE_AUDIT_BASE || 'https://mn-ccore-lab.pages.dev'

async function main() {
  const auth = loadAuth()
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'dark',
    extraHTTPHeaders: browserHeaders(auth),
  })
  await ctx.addInitScript((t: string) => {
    try { localStorage.setItem('mn-ccore-theme', t) } catch {}
  }, 'dark')

  const page = await ctx.newPage()
  console.log('nav /')
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(600)

  // Scroll through in 600px steps.
  const height = await page.evaluate(() => document.body.scrollHeight)
  console.log(`page height: ${height}px`)

  for (let y = 0; y < height; y += 600) {
    await page.evaluate((pos) => window.scrollTo(0, pos), y)
    await page.waitForTimeout(300)
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const ccOnly = axe.violations.filter((v) => v.id === 'color-contrast')
    const nodes = ccOnly.flatMap((v) => v.nodes.map((n) => ({
      target: n.target,
      html: n.html.slice(0, 300),
      message: n.any.map((a) => a.message).join(' | '),
    })))
    if (nodes.length) {
      console.log(`\n  scroll y=${y} — ${nodes.length} node(s):`)
      nodes.forEach((n, i) => console.log(`    [${i + 1}] ${n.target.join(' > ')}\n        ${n.html.slice(0, 200)}\n        ${n.message}`))
    } else {
      console.log(`  scroll y=${y} — 0 nodes`)
    }
  }

  await browser.close()
}

main().catch((e) => {
  console.error(`FATAL: ${e.message}`)
  process.exit(1)
})
