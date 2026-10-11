// Mobile coherence sweep (P2-6, 2026-06-09). Frontend-layout-only.
// Renders portal routes against `vite preview` with a client-side fake-auth
// cookie (useAuth reads CF_Authorization with no sig check). API calls 404 on
// preview, so data pages render skeleton/empty/error states — sufficient for
// LAYOUT checks: horizontal overflow, clipping, nav state, touch targets.
//
// Usage: node scripts/mobile-sweep.mjs <tag>   (tag = before|after)
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const TAG = process.argv[2] || 'run'
const BASE = process.env.SWEEP_BASE || 'http://localhost:4173'
const OUT = `review/mobile-sweep-0609/${TAG}`
fs.mkdirSync(OUT, { recursive: true })

const WIDTHS = [
  { name: '360', w: 360, h: 800 },
  { name: '390', w: 390, h: 844 },
  { name: '768', w: 768, h: 1024 },
  { name: 'ipadL', w: 1024, h: 768 },
]

const ROUTES = [
  ['today', '/portal/dashboard'],
  ['mytasks', '/portal/my-tasks'],
  ['projects', '/portal/projects'],
  ['manuscripts', '/portal/manuscripts'],
  ['deadlines', '/portal/deadlines'],
  ['meetings', '/portal/meetings'],
  ['calendar', '/portal/calendar'],
  ['settings', '/portal/settings'],
  ['personal', '/portal/personal'],
  ['activity', '/portal/activity'],
  ['search', '/portal/search'],
  ['overview', '/portal/overview'],
  ['menteeMilestones', '/portal/mentee-milestones'],
]

function fakeAuthCookie(baseUrl) {
  const payload = { email: 'ingra107@umn.edu', name: 'Nicholas Ingraham', iat: Math.floor(Date.now() / 1000), exp: 9999999999 }
  const b64 = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const token = `${b64(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64(JSON.stringify(payload))}.fake`
  return { name: 'CF_Authorization', value: token, url: baseUrl, httpOnly: false, sameSite: 'Lax' }
}

const results = []

const browser = await chromium.launch()
for (const vp of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: 1,
    isMobile: vp.w < 768,
    hasTouch: vp.w <= 1024,
    reducedMotion: 'reduce',
  })
  await ctx.addCookies([fakeAuthCookie(BASE)])
  const page = await ctx.newPage()

  for (const [name, route] of ROUTES) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(600)
      // Measure horizontal overflow: scrollWidth vs viewport innerWidth
      const metrics = await page.evaluate(() => {
        const de = document.documentElement
        const body = document.body
        const scrollW = Math.max(de.scrollWidth, body.scrollWidth)
        const innerW = window.innerWidth
        // Find the widest offending elements (scrollWidth > viewport by >2px)
        const offenders = []
        const all = document.querySelectorAll('*')
        for (const el of all) {
          const r = el.getBoundingClientRect()
          if (r.right > innerW + 2 && r.width > 30 && r.width < 4000) {
            offenders.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.className && typeof el.className === 'string') ? el.className.slice(0, 60) : '',
              right: Math.round(r.right),
              width: Math.round(r.width),
            })
          }
        }
        // dedupe top 5 by right edge
        offenders.sort((a, b) => b.right - a.right)
        return { scrollW, innerW, overflow: scrollW - innerW, offenders: offenders.slice(0, 5) }
      })
      const flag = metrics.overflow > 2 ? 'H-OVERFLOW' : 'ok'
      results.push({ route: name, width: vp.name, overflow: metrics.overflow, flag, offenders: metrics.offenders })
      const fname = `${OUT}/${name}__${vp.name}.png`
      await page.screenshot({ path: fname, fullPage: false })
    } catch (e) {
      results.push({ route: name, width: vp.name, error: String(e).slice(0, 120) })
    }
  }
  await ctx.close()
}
await browser.close()

fs.writeFileSync(`${OUT}/_overflow-report.json`, JSON.stringify(results, null, 2))

// Console summary
console.log(`\n=== Mobile sweep [${TAG}] — horizontal-overflow report ===`)
const bad = results.filter((r) => r.flag === 'H-OVERFLOW' || r.error)
if (bad.length === 0) {
  console.log('No horizontal overflow detected on any route × width.')
} else {
  for (const r of bad) {
    if (r.error) { console.log(`  ${r.route} @ ${r.width}: ERROR ${r.error}`); continue }
    console.log(`  ${r.route} @ ${r.width}: overflow ${r.overflow}px`)
    for (const o of r.offenders) console.log(`      <${o.tag} class="${o.cls}"> right=${o.right} w=${o.width}`)
  }
}
console.log(`\nScreenshots + JSON: ${OUT}`)
