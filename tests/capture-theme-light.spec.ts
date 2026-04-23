/**
 * Capture light-mode variants of 8 key pages so Claude Design can
 * compare dark/light pairs side-by-side. Dark versions come from
 * capture-for-design.spec.ts — this spec only emits light.
 *
 * Theme is controlled via localStorage `mn-ccore-theme` (see
 * src/hooks/useDarkMode.ts). addInitScript seeds the value before
 * app boot so first paint is light.
 */
import { test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { P } from './helpers/paths'
import { injectFakeAuth } from './helpers/capture-auth'

// colorScheme=light flips prefers-color-scheme → useDarkMode's
// `getInitialMode()` returns 'system' (no localStorage) and
// `getSystemPreference()` resolves to light, so `.dark` class is not
// added. Simpler + more reliable than addInitScript ordering with
// localStorage injection.
test.use({ colorScheme: 'light' })

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://mn-ccore-lab.pages.dev'
const TS = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d+Z$/, '')
  .slice(0, 13)
const OUT_DIR = path.join('review', process.env.CAPTURE_BUNDLE ?? `claude-design-${TS}`)
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

interface Target { slug: string; path: string }

const TARGETS: Target[] = [
  { slug: '01-dashboard',        path: P.dashboard },
  { slug: '03-my-tasks',         path: P.myTasks },
  { slug: '06-projects',         path: P.projects },
  { slug: '07-project-detail',   path: P.project('pf-v-sf-oxygenation-severity') },
  { slug: '08-manuscripts',      path: P.manuscripts },
  { slug: '11-digest',           path: P.digest },
  { slug: '14-analytics',        path: P.analytics },
  { slug: '18-settings',         path: P.settings },
]

test.beforeEach(async ({ context }) => {
  await injectFakeAuth(context, BASE)
})

for (const t of TARGETS) {
  test(`light ${t.slug}`, async ({ page }) => {
    await page.goto(BASE + t.path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    // Scroll through for lazy-load content.
    await page.evaluate(async () => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const maxScroll = () =>
        Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight
      let y = 0
      let safety = 80
      while (y < maxScroll() && safety-- > 0) {
        window.scrollTo(0, y)
        await sleep(150)
        y += 400
      }
      window.scrollTo(0, 0)
      await sleep(200)
    })
    await page.screenshot({
      path: path.join(OUT_DIR, `desktop-light-${t.slug}.png`),
      fullPage: true,
    })
  })
}
