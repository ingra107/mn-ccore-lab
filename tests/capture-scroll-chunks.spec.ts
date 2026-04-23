/**
 * Capture viewport-sized chunks of long pages so Claude Design can
 * review them as a stack of designer-sized frames instead of one
 * 5000+px fullPage blob.
 *
 * For each target page: scroll top → bottom in viewport-height steps,
 * take one screenshot per position, named `<slug>-ch<n>.png`.
 *
 * Capped at 8 chunks to bound runaway pages. Uses the same
 * auth + BASE + CAPTURE_BUNDLE env contract as capture-for-design.
 *
 * Runs under `playwright.config.design-capture.ts` (desktop project
 * only — mobile uses a different viewport).
 */
import { test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { P } from './helpers/paths'
import { injectFakeAuth } from './helpers/capture-auth'

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://mn-ccore-lab.pages.dev'
const TS = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d+Z$/, '')
  .slice(0, 13)
const OUT_DIR = path.join('review', process.env.CAPTURE_BUNDLE ?? `claude-design-${TS}`)
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

const VIEWPORT_H = 900
const MAX_CHUNKS = 8

interface Target { slug: string; path: string }

const TARGETS: Target[] = [
  { slug: '01-dashboard',           path: P.dashboard },
  { slug: '02-personal',            path: P.personal },
  { slug: '03-my-tasks',            path: P.myTasks },
  { slug: '06-projects',            path: P.projects },
  { slug: '07-project-detail',      path: P.project('pf-v-sf-oxygenation-severity') },
  { slug: '08-manuscripts',         path: P.manuscripts },
  { slug: '14-analytics',           path: P.analytics },
  { slug: '15-pi-analytics',        path: P.piAnalytics },
  { slug: '17-pb-sector',           path: P.pb },
  { slug: '35-trajectory-public',   path: P.publicTrajectory('nick-ingraham') },
  { slug: '36-trajectory-portal',   path: P.teamTrajectory('nick-ingraham') },
  { slug: '40-publication-detail',  path: P.publication('ingraham-2026-adhere-lpv') },
]

test.beforeEach(async ({ context }) => {
  await injectFakeAuth(context, BASE)
})

for (const t of TARGETS) {
  test(`chunks ${t.slug}`, async ({ page }) => {
    await page.goto(BASE + t.path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)

    // Trigger any lazy-loaded content by scrolling through first.
    await page.evaluate(async () => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const maxScroll = () =>
        Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight
      let y = 0
      let safety = 60
      while (y < maxScroll() && safety-- > 0) {
        window.scrollTo(0, y)
        await sleep(120)
        y += 400
      }
      window.scrollTo(0, 0)
      await sleep(200)
    })

    const pageHeight = await page.evaluate(() =>
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
    )
    const chunks = Math.min(Math.max(1, Math.ceil(pageHeight / VIEWPORT_H)), MAX_CHUNKS)

    for (let i = 0; i < chunks; i++) {
      const y = i * VIEWPORT_H
      await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y)
      await page.waitForTimeout(250)
      await page.screenshot({
        path: path.join(OUT_DIR, `desktop-${t.slug}-ch${i + 1}.png`),
        fullPage: false,
      })
    }
  })
}
