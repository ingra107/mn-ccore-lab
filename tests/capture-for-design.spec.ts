/**
 * Capture fresh page screenshots for Claude Design (2026-04-20).
 *
 * Hits every hero surface on live prod. The same file runs under two
 * Playwright projects (desktop / mobile) defined in
 * `playwright.config.design-capture.ts`. Mobile project sets a smaller
 * MOBILE_ONLY_SLUGS via env so only the most interesting pages are
 * captured at phone size.
 *
 * Output: `review/claude-design-<timestamp>/<device>-<slug>.png`
 */
import { test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'https://mn-ccore-lab.pages.dev'

const TS = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d+Z$/, '')
  .slice(0, 13)

const OUT_DIR = path.join('review', `claude-design-${TS}`)
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

interface PageCapture { slug: string; path: string }

const HERO_PAGES: PageCapture[] = [
  { slug: '00-home-public',           path: '/' },
  { slug: '01-dashboard',             path: '/dashboard' },
  { slug: '02-personal',              path: '/personal' },
  { slug: '03-my-tasks',              path: '/my-tasks' },
  { slug: '04-calendar',              path: '/calendar' },
  { slug: '05-deadlines',             path: '/deadlines' },
  { slug: '06-projects',              path: '/projects' },
  { slug: '07-project-detail',        path: '/projects/pf-v-sf-oxygenation-severity' },
  { slug: '08-manuscripts',           path: '/manuscripts' },
  { slug: '09-ideas',                 path: '/ideas' },
  { slug: '10-decisions',             path: '/decisions' },
  { slug: '11-digest',                path: '/digest' },
  { slug: '12-grants',                path: '/grants' },
  { slug: '13-meetings',              path: '/meetings' },
  { slug: '14-analytics',             path: '/analytics' },
  { slug: '15-pi-analytics',          path: '/pi/analytics' },
  { slug: '16-mentee-milestones',     path: '/mentee-milestones' },
  { slug: '17-pb-sector',             path: '/pb' },
  { slug: '18-settings',              path: '/settings' },
  { slug: '19-team-public',           path: '/team' },
  { slug: '20-team-member-portal',    path: '/portal/team/nick-ingraham' },
  { slug: '21-team-member-public',    path: '/team/nick-ingraham' },
  { slug: '22-publications',          path: '/publications' },
  { slug: '23-network',               path: '/network' },
  { slug: '24-pulse-kiosk',           path: '/pulse' },
]

const MOBILE_SLUGS = new Set([
  '01-dashboard',
  '03-my-tasks',
  '06-projects',
  '07-project-detail',
  '13-meetings',
  '24-pulse-kiosk',
])

const DEVICE = process.env.CAPTURE_DEVICE ?? 'desktop'
const PAGES = DEVICE === 'mobile'
  ? HERO_PAGES.filter(p => MOBILE_SLUGS.has(p.slug))
  : HERO_PAGES

/** Scroll the entire page top → bottom in 400px increments, pausing
 *  200ms between steps, to trigger any IntersectionObserver /
 *  `loading="lazy"` / virtualizer-based content that only renders on
 *  scroll. Then scroll back to the top so fullPage screenshots start
 *  from a clean state. */
async function scrollThroughEverything(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const step = 400
    const maxScroll = () =>
      Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      ) - window.innerHeight

    let y = 0
    let safety = 120 // cap at ~48,000 px just in case
    while (y < maxScroll() && safety-- > 0) {
      window.scrollTo(0, y)
      await sleep(180)
      y += step
    }
    // One last scroll to absolute bottom to catch any final lazy load.
    window.scrollTo(0, maxScroll())
    await sleep(300)
    window.scrollTo(0, 0)
    await sleep(200)
  })
}

for (const p of PAGES) {
  test(`${DEVICE} ${p.slug}`, async ({ page }) => {
    // Network page lazy-loads ~1.3MB three.js + reagraph WebGL — never
    // settles to networkidle. Use a softer wait for that one route.
    const waitMode = p.path === '/network' ? 'domcontentloaded' : 'networkidle'
    await page.goto(BASE + p.path, { waitUntil: waitMode })
    if (p.path === '/network') await page.waitForTimeout(4000)
    // Entry animations + initial fetch settle.
    await page.waitForTimeout(800)
    // Walk the full scroll height so lazy-loaded sections render before
    // the capture. Without this, fullPage screenshots miss anything
    // gated by IntersectionObserver / virtualizer (activity feeds,
    // year-bucket charts, large task/project lists, etc.).
    await scrollThroughEverything(page)
    await page.screenshot({
      path: path.join(OUT_DIR, `${DEVICE}-${p.slug}.png`),
      fullPage: true,
    })
  })
}
