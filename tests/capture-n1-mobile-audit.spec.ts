/**
 * N1 mobile visual audit capture (2026-06-11 docket).
 *
 * Captures the docket's key surfaces across the phone viewports
 * (375/390/430), the 768-1023 tablet band edges, and a 1440 desktop
 * ride-along (shared with the N1b de-box sweep). Runs against an
 * ungated preview deploy (CAPTURE_BASE_URL) with the fake-auth cookie.
 *
 * Output: review/n1-mobile-audit-2026-06-11/<project>-<slug>[-cN].png
 * Top-of-viewport capture + scroll chunks (mobile fullPage stitching
 * duplicates sticky headers — same constraint as capture-for-design).
 */
import { test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { injectFakeAuth } from './helpers/capture-auth'

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://mn-ccore-lab.pages.dev'
const OUT_DIR = process.env.CAPTURE_OUT_DIR ?? path.join('review', 'n1-mobile-audit-2026-06-11')
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

// A real, data-rich task for the detail-panel deep link.
const TASK_ID = 'task_01KTWD8DDTHDE498FM00SFJTJ9'

interface Surface {
  slug: string
  path: string
  /** scroll-chunk captures below the fold */
  chunks: number
  /** post-load keyboard action */
  action?: 'quickadd'
  /** extra settle ms after load */
  settle?: number
}

const SURFACES: Surface[] = [
  { slug: 'today',             path: '/portal/dashboard',                                chunks: 2 },
  { slug: 'mt-list',           path: '/portal/my-tasks?view=list',                       chunks: 2 },
  { slug: 'mt-lanes',          path: '/portal/my-tasks?view=lanes',                      chunks: 2 },
  { slug: 'mt-columns',        path: '/portal/my-tasks?view=columns',                    chunks: 2 },
  { slug: 'task-panel',        path: `/portal/my-tasks?view=list&open=${TASK_ID}`,       chunks: 1, settle: 2500 },
  { slug: 'quick-add',         path: '/portal/my-tasks?view=list',                       chunks: 0, action: 'quickadd' },
  { slug: 'project-detail',    path: '/portal/projects/mn-ccore-lab-hub',                chunks: 3 },
  { slug: 'artifact-notfound', path: '/portal/artifacts/art_DOES_NOT_EXIST',             chunks: 0 },
  // N1b de-box sweep ride-alongs (data-page toolbars + dashboard interiors).
  { slug: 'projects',          path: '/portal/projects',                                 chunks: 1 },
  { slug: 'manuscripts',       path: '/portal/manuscripts',                              chunks: 1 },
  { slug: 'deadlines',         path: '/portal/deadlines',                                chunks: 1 },
  { slug: 'overview',          path: '/portal/overview',                                 chunks: 1 },
  { slug: 'ideas',             path: '/portal/ideas',                                    chunks: 1 },
  { slug: 'digest',            path: '/portal/digest',                                   chunks: 1 },
]

async function scrollThroughEverything(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const step = 400
    const maxScroll = () =>
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) -
      window.innerHeight
    let y = 0
    let safety = 120
    while (y < maxScroll() && safety-- > 0) {
      window.scrollTo(0, y)
      await sleep(120)
      y += step
    }
    window.scrollTo(0, maxScroll())
    await sleep(250)
    window.scrollTo(0, 0)
    await sleep(200)
  })
}

test.beforeEach(async ({ context }) => {
  await injectFakeAuth(context, BASE)
  // Deterministic dark theme (the primary scheme) for every capture.
  await context.addInitScript(() => {
    window.localStorage.setItem('mn-ccore-theme', 'dark')
  })
})

for (const s of SURFACES) {
  test(`n1 ${s.slug}`, async ({ page }, testInfo) => {
    const prefix = testInfo.project.name
    await page.goto(BASE + s.path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800 + (s.settle ?? 0))
    await scrollThroughEverything(page)

    if (s.action === 'quickadd') {
      await page.keyboard.press('q')
      await page.waitForTimeout(600)
    }

    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(200)
    await page.screenshot({ path: path.join(OUT_DIR, `${prefix}-${s.slug}.png`) })

    // Below-the-fold chunks (viewport-height steps with 80px overlap).
    for (let i = 1; i <= s.chunks; i++) {
      const moved = await page.evaluate((idx) => {
        const vh = window.innerHeight
        const target = idx * (vh - 80)
        const max =
          Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - vh
        if (target > max + 40) return false
        window.scrollTo(0, Math.min(target, max))
        return true
      }, i)
      if (!moved) break
      await page.waitForTimeout(350)
      await page.screenshot({ path: path.join(OUT_DIR, `${prefix}-${s.slug}-c${i}.png`) })
    }
  })
}
