// shoot-public.mjs -- screenshot every public page, light/dark x 1440/375,
// against the built dist/ with /api proxied to prod (live data, no auth).
//   npx vite build && node scripts/shoot-public.mjs [outDir] [pageFilter]
import { preview } from 'vite'
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const out = process.argv[2] || 'review/s68'
const only = process.argv[3]
fs.mkdirSync(out, { recursive: true })
const server = await preview({
  preview: { port: 5231, strictPort: true, proxy: { '/api': { target: 'https://mn-ccore-lab.pages.dev', changeOrigin: true, secure: true } } },
})
const base = 'http://localhost:5231'
const pages = {
  home: '/', team: '/team', publications: '/publications', pubdetail: null,
  nick: '/nick', nate: '/nate', network: '/network', contact: '/contact', join: '/join', member: '/team/nick-ingraham',
}
const browser = await chromium.launch()
// resolve one real publication id for the detail page
const probe = await (await fetch('https://mn-ccore-lab.pages.dev/api/publications')).json()
const pub = probe.data.find(p => p.status === 'Published' && p.abstract) ?? probe.data[0]
pages.pubdetail = `/publications/${pub.id}`
for (const [name, url] of Object.entries(pages)) {
  if (only && only !== name) continue
  for (const theme of ['light', 'dark']) for (const w of [1440, 375]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w === 1440 ? 900 : 812 }, reducedMotion: 'reduce' })
    await ctx.addInitScript(t => localStorage.setItem('mn-ccore-theme', t), theme)
    const p = await ctx.newPage()
    p.on('pageerror', e => console.log('PAGEERROR', name, e.message.slice(0, 200)))
    await p.goto(base + url, { waitUntil: 'load', timeout: 60000 }).catch(e => console.log('goto', name, e.message.slice(0, 80)))
    // a canvas page never goes idle: wait for the API calls, but only so long
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    await p.waitForTimeout(1200)
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 100)) } window.scrollTo(0, 0) })
    await p.waitForTimeout(1200)
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (overflow > 0) console.log('HSCROLL', name, theme, w, overflow)
    await p.screenshot({ path: `${out}/${name}-${theme}-${w}.png`, fullPage: true })
    await ctx.close()
  }
}
await browser.close(); await new Promise(r => server.httpServer.close(r))
