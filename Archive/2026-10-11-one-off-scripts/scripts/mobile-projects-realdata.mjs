// Targeted real-data screenshot — Projects list rows at mobile widths via the
// vite dev (5173) + Miniflare (8787) stack. Verifies the stacked-card row
// treatment (Rule 15) renders with actual project rows, not just skeletons.
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = 'http://localhost:5173'
const OUT = 'review/mobile-sweep-0609/realdata'
fs.mkdirSync(OUT, { recursive: true })

function fakeAuthCookie(baseUrl) {
  const payload = { email: 'ingra107@umn.edu', name: 'Nicholas Ingraham', iat: Math.floor(Date.now() / 1000), exp: 9999999999 }
  const b64 = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return { name: 'CF_Authorization', value: `${b64(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${b64(JSON.stringify(payload))}.fake`, url: baseUrl, httpOnly: false, sameSite: 'Lax' }
}

const WIDTHS = [
  { name: '360', w: 360, h: 800, touch: true },
  { name: '768', w: 768, h: 1024, touch: true },
  { name: 'ipadL', w: 1024, h: 768, touch: true },
]

const browser = await chromium.launch()
for (const vp of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 768, hasTouch: vp.touch, reducedMotion: 'reduce' })
  await ctx.addCookies([fakeAuthCookie(BASE)])
  const page = await ctx.newPage()
  await page.goto(`${BASE}/portal/projects`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1200)
  // overflow probe
  const m = await page.evaluate(() => {
    const de = document.documentElement, body = document.body
    return { overflow: Math.max(de.scrollWidth, body.scrollWidth) - window.innerWidth }
  })
  console.log(`projects @ ${vp.name}: overflow ${m.overflow}px`)
  await page.screenshot({ path: `${OUT}/projects__${vp.name}.png`, fullPage: true })
  await ctx.close()
}
await browser.close()
console.log(`saved -> ${OUT}`)
