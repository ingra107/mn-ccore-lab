// Round-3 Fellow perspective audit
// Verifies: bottom tab bar (md:hidden), safe-area, transitions, PWA, mentee badges
import { chromium, devices } from 'playwright'

const SITE = 'https://mn-ccore-lab.pages.dev'
const results = {}

async function run() {
  const browser = await chromium.launch()

  // ---------- DESKTOP ----------
  const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const dp = await desktopCtx.newPage()
  const consoleErrors = []
  dp.on('pageerror', (e) => consoleErrors.push(String(e)))

  // Desktop: should NOT show bottom tab bar
  await dp.goto(`${SITE}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 })
  const desktopTabBar = await dp.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Primary navigation"]')
    if (!nav) return { exists: false }
    const cs = getComputedStyle(nav)
    const rect = nav.getBoundingClientRect()
    return {
      exists: true,
      display: cs.display,
      visible: rect.width > 0 && rect.height > 0 && cs.display !== 'none',
      rect: { w: rect.width, h: rect.height, top: rect.top },
    }
  })
  results.desktopTabBar = desktopTabBar

  // Manifest fetch
  const manifestResp = await dp.evaluate(async () => {
    const r = await fetch('/manifest.webmanifest')
    const txt = await r.text()
    let parsed = null
    try { parsed = JSON.parse(txt) } catch {}
    return { status: r.status, ct: r.headers.get('content-type'), parsed }
  })
  results.manifest = manifestResp

  // Meta tags
  const meta = await dp.evaluate(() => {
    const q = (sel) => document.querySelector(sel)
    return {
      viewport: q('meta[name="viewport"]')?.content,
      themeDark: q('meta[name="theme-color"][media*="dark"]')?.content,
      themeLight: q('meta[name="theme-color"][media*="light"]')?.content,
      appleCapable: q('meta[name="apple-mobile-web-app-capable"]')?.content,
      appleStatus: q('meta[name="apple-mobile-web-app-status-bar-style"]')?.content,
      manifestLink: q('link[rel="manifest"]')?.getAttribute('href'),
    }
  })
  results.meta = meta

  // Desktop first-paint-ish timing
  const desktopNav = await dp.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0]
    return {
      domContentLoaded: Math.round(n.domContentLoadedEventEnd),
      loadEvent: Math.round(n.loadEventEnd),
      responseEnd: Math.round(n.responseEnd),
    }
  })
  results.desktopNav = desktopNav

  // Mentee milestones page
  await dp.goto(`${SITE}/mentee-milestones`, { waitUntil: 'networkidle', timeout: 30000 })
  const mentee = await dp.evaluate(() => {
    const bodyText = document.body.innerText
    // Look for risk radar / risk badges / stalled / at-risk / on-track language
    const risks = [...document.querySelectorAll('*')].filter((el) => {
      const t = (el.textContent || '').trim().toLowerCase()
      return t && t.length < 40 && /at.?risk|stalled|on.?track|needs.?attention|risk/i.test(t) && el.children.length === 0
    })
    return {
      hasMilestonesHeading: /milestone/i.test(bodyText),
      riskTokenCount: risks.length,
      sampleTokens: risks.slice(0, 8).map((e) => e.textContent.trim()),
    }
  })
  results.menteeDesktop = mentee

  await desktopCtx.close()

  // ---------- MOBILE (iPhone 13) ----------
  const iphone = devices['iPhone 13']
  const mobileCtx = await browser.newContext({ ...iphone })
  const mp = await mobileCtx.newPage()

  await mp.goto(`${SITE}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 })
  const mobileNav = await mp.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0]
    return {
      domContentLoaded: Math.round(n.domContentLoadedEventEnd),
      loadEvent: Math.round(n.loadEventEnd),
    }
  })
  results.mobileNav = mobileNav

  // Mobile bottom tab bar presence
  const mobileTabBar = await mp.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Primary navigation"]')
    if (!nav) return { exists: false }
    const cs = getComputedStyle(nav)
    const rect = nav.getBoundingClientRect()
    const links = [...nav.querySelectorAll('a')]
    return {
      exists: true,
      display: cs.display,
      position: cs.position,
      visible: rect.width > 0 && rect.height > 0 && cs.display !== 'none',
      rect: { w: rect.width, h: rect.height, top: rect.top, bottom: rect.bottom },
      vw: window.innerWidth,
      vh: window.innerHeight,
      bg: cs.backgroundColor,
      borderTop: cs.borderTopWidth + ' ' + cs.borderTopStyle,
      paddingBottom: cs.paddingBottom,
      zIndex: cs.zIndex,
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
      tabCount: links.length,
      tabs: links.map((a) => ({
        label: a.getAttribute('aria-label'),
        href: a.getAttribute('href'),
        minH: getComputedStyle(a).minHeight,
        height: a.getBoundingClientRect().height,
        width: a.getBoundingClientRect().width,
        current: a.getAttribute('aria-current'),
      })),
    }
  })
  results.mobileTabBar = mobileTabBar

  // Check safe-area: confirm paddingBottom uses env() — not directly readable but we can check via CSS rule
  // Instead, check that the nav reserves space & that the body has bottom padding preventing content overlap
  const bodyPad = await mp.evaluate(() => {
    const main = document.querySelector('main') || document.body
    const cs = getComputedStyle(main)
    return { mainPadBottom: cs.paddingBottom, mainClass: main.className?.slice(0, 200) }
  })
  results.mobileBodyPad = bodyPad

  // Horizontal overflow check on dashboard
  const overflow = await mp.evaluate(() => {
    const doc = document.documentElement
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      overflow: doc.scrollWidth > doc.clientWidth,
    }
  })
  results.mobileOverflow = overflow

  // Nav latency: click Tasks tab, measure time-to-interactive-ish
  const t0 = Date.now()
  await mp.click('nav[aria-label="Primary navigation"] a[href="/my-tasks"]')
  await mp.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  const navMs = Date.now() - t0
  results.mobileClickToTasks = { ms: navMs, url: mp.url() }

  // Confirm active state updated
  const activeAfter = await mp.evaluate(() => {
    const links = [...document.querySelectorAll('nav[aria-label="Primary navigation"] a')]
    return links.map((a) => ({ href: a.getAttribute('href'), current: a.getAttribute('aria-current') }))
  })
  results.mobileActiveAfterClick = activeAfter

  // Navigate to projects via tab
  const t1 = Date.now()
  await mp.click('nav[aria-label="Primary navigation"] a[href="/projects"]')
  await mp.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  results.mobileClickToProjects = { ms: Date.now() - t1, url: mp.url() }

  // Mentee milestones on mobile
  await mp.goto(`${SITE}/mentee-milestones`, { waitUntil: 'networkidle', timeout: 30000 })
  const menteeM = await mp.evaluate(() => {
    const bodyText = document.body.innerText
    return {
      hasMilestonesHeading: /milestone/i.test(bodyText),
      hasRiskWord: /at.?risk|stalled|on.?track/i.test(bodyText),
      bodyLen: bodyText.length,
    }
  })
  results.menteeMobile = menteeM

  await mobileCtx.close()
  await browser.close()

  results.consoleErrors = consoleErrors.slice(0, 10)
  console.log(JSON.stringify(results, null, 2))
}

run().catch((e) => {
  console.error('AUDIT FAILED:', e)
  process.exit(1)
})
