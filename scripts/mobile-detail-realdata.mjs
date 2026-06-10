// Targeted real-data screenshots of detail pages at mobile widths.
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

const ROUTES = [
  ['projectdetail', '/portal/projects/ards_biomarker_pilot'],
  ['manuscripts', '/portal/manuscripts'],
  ['deadlines', '/portal/deadlines'],
  ['meetings', '/portal/meetings'],
]
const WIDTHS = [
  { name: '360', w: 360, h: 800 },
  { name: '768', w: 768, h: 1024 },
]

const browser = await chromium.launch()
for (const vp of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 768, hasTouch: true, reducedMotion: 'reduce' })
  await ctx.addCookies([fakeAuthCookie(BASE)])
  const page = await ctx.newPage()
  for (const [name, route] of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(1000)
    const m = await page.evaluate(() => {
      const de = document.documentElement, body = document.body
      const innerW = window.innerWidth
      const offenders = []
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect()
        if (r.right > innerW + 2 && r.width > 30 && r.width < 4000) offenders.push({ tag: el.tagName.toLowerCase(), cls: (typeof el.className === 'string' ? el.className.slice(0, 50) : ''), right: Math.round(r.right) })
      }
      offenders.sort((a, b) => b.right - a.right)
      return { overflow: Math.max(de.scrollWidth, body.scrollWidth) - innerW, offenders: offenders.slice(0, 3) }
    })
    const flag = m.overflow > 2 ? `OVERFLOW ${m.overflow}px ${JSON.stringify(m.offenders)}` : 'ok'
    console.log(`${name} @ ${vp.name}: ${flag}`)
    await page.screenshot({ path: `${OUT}/${name}__${vp.name}.png`, fullPage: false })
  }
  await ctx.close()
}
await browser.close()
console.log(`saved -> ${OUT}`)
