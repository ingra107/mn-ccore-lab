// TEMP perf audit spec (overnight 2026-10-14). Delete after the run.
// Read-only: pass 1 uses injectRealAuth (aborts non-GET /api/*); pass 2
// (cache) uses a CDP Fetch guard that fails every non-GET /api/* request,
// because Playwright routing disables the HTTP cache.
import { test, type BrowserContext, type Page, type CDPSession } from '@playwright/test'
import { injectRealAuth, injectFakeAuth } from './helpers/capture-auth'
import * as fs from 'node:fs'

const BASE = 'https://mn-ccore-lab.pages.dev'
const DIR = 'C:/Users/ingra/Peripheral-Brain/Scratch/overnight-2026-10-14/perf/'
const PART = process.env.PERF_PART || '1'
const ONLY = process.env.PERF_ONLY
const OUT = DIR + 'static.part' + PART + (process.env.PERF_ONLY ? '-' + process.env.PERF_ONLY.replace(/[^a-z0-9]+/gi, '_') : '') + '.json'
const PARTS: Record<string, string[]> = {
  '1': ['/portal/dashboard', '/portal/my-tasks', '/portal/my-tasks?view=table', '/portal/projects', '@project'],
  '2': ['/portal/overview', '/portal/calendar', '/portal/meetings', '@meeting', '/portal/grants'],
  '3': ['/portal/manuscripts', '/portal/library', '/portal/team', '@member', '/portal/settings', '/portal/search'],
  '4': ['/', '/team', '/publications', '/pulse'],
  '5': [], '6': [],
}

type Req = {
  id: string; url: string; path: string; method: string; type: string; start: number
  headersAt?: number; end?: number; status?: number; transfer?: number; decoded: number
  fromDisk?: boolean; fromMem?: boolean; fromSW?: boolean; serverMs?: number; failed?: string
  cacheControl?: string; cfCache?: string; initiatorType?: string
}

function authHeaders(): Record<string, string> {
  return {
    'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID!,
    'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET!,
    'X-Test-Mode-Key': (process.env.HUB_TEST_MODE_KEY || process.env.TEST_MODE_KEY)!,
    'X-Test-User': process.env.TEST_USER_EMAIL || 'ingra107@umn.edu',
  }
}

async function recorder(page: Page) {
  const cdp: CDPSession = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  const reqs = new Map<string, Req>()
  let inflight = 0
  let lastActivity = Date.now()
  cdp.on('Network.requestWillBeSent', (e: any) => {
    if (e.request.url.startsWith('data:')) return
    const u = new URL(e.request.url)
    if (!reqs.has(e.requestId)) inflight++
    reqs.set(e.requestId, {
      id: e.requestId, url: e.request.url, path: u.pathname + u.search, method: e.request.method,
      type: e.type || '', start: e.timestamp * 1000, decoded: 0, initiatorType: e.initiator?.type,
    })
    lastActivity = Date.now()
  })
  cdp.on('Network.responseReceived', (e: any) => {
    const r = reqs.get(e.requestId); if (!r) return
    const t = e.response.timing
    r.status = e.response.status
    r.fromDisk = e.response.fromDiskCache; r.fromSW = e.response.fromServiceWorker
    r.fromMem = e.response.fromPrefetchCache
    if (t) {
      r.headersAt = (t.requestTime * 1000) + t.receiveHeadersEnd
      r.serverMs = Math.round(t.receiveHeadersStart - t.sendEnd)
    }
    const h = e.response.headers || {}
    const get = (k: string) => Object.entries(h).find(([kk]) => kk.toLowerCase() === k)?.[1] as string | undefined
    r.cacheControl = get('cache-control'); r.cfCache = get('cf-cache-status')
    r.type = e.type || r.type
  })
  cdp.on('Network.dataReceived', (e: any) => { const r = reqs.get(e.requestId); if (r) r.decoded += e.dataLength })
  cdp.on('Network.requestServedFromCache', (e: any) => { const r = reqs.get(e.requestId); if (r) r.fromMem = true })
  cdp.on('Network.loadingFinished', (e: any) => {
    const r = reqs.get(e.requestId); if (!r) return
    r.end = e.timestamp * 1000; r.transfer = e.encodedDataLength; inflight--; lastActivity = Date.now()
  })
  cdp.on('Network.loadingFailed', (e: any) => {
    const r = reqs.get(e.requestId); if (!r) return
    r.end = e.timestamp * 1000; r.failed = e.errorText; inflight--; lastActivity = Date.now()
  })
  return {
    cdp, reqs,
    async settle(maxMs = 25000, quietMs = 1200) {
      const t0 = Date.now()
      while (Date.now() - t0 < maxMs) {
        if (inflight <= 0 && Date.now() - lastActivity >= quietMs) return { settled: true, waited: Date.now() - t0 }
        await new Promise((r) => setTimeout(r, 100))
      }
      return { settled: false, waited: Date.now() - t0, inflight }
    },
  }
}

const INIT = `
  window.__perf = { lcp: 0, cls: 0, longTasks: [], shifts: [] };
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true }) } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) { if (!e.hadRecentInput) { window.__perf.cls += e.value; window.__perf.shifts.push([Math.round(e.startTime), +e.value.toFixed(4)]) } } }).observe({ type: 'layout-shift', buffered: true }) } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.longTasks.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ type: 'longtask', buffered: true }) } catch (e) {}
`

function summarize(reqs: Map<string, Req>, navStart: number) {
  const all = [...reqs.values()].filter((r) => r.start >= navStart - 5).sort((a, b) => a.start - b.start)
  const rel = (x?: number) => (x == null ? null : Math.round(x - navStart))
  const rows = all.map((r) => ({
    path: r.path.length > 160 ? r.path.slice(0, 160) + '...' : r.path, method: r.method, type: r.type, status: r.status ?? null,
    start: rel(r.start), headers: rel(r.headersAt), end: rel(r.end), serverMs: r.serverMs ?? null,
    transfer: r.transfer ?? null, decoded: r.decoded, failed: r.failed ?? null,
    cache: r.fromDisk ? 'disk' : r.fromMem ? 'mem' : r.fromSW ? 'sw' : 'net', cacheControl: r.cacheControl ?? null, cf: r.cfCache ?? null,
    initiator: r.initiatorType ?? null,
  }))
  // predecessor heuristic: a request whose start falls within 40ms after another request's end
  const withPred = rows.map((r, i) => {
    let pred: number | null = null; let best = -1
    rows.forEach((o, j) => {
      if (j === i || o.end == null || r.start == null) return
      if (o.end <= r.start + 2 && r.start - o.end <= 40 && o.end > best) { best = o.end; pred = j }
    })
    return { ...r, pred }
  })
  const depth = (i: number, seen = new Set<number>()): number => {
    const p = withPred[i].pred; if (p == null || seen.has(p)) return 0
    seen.add(p); return 1 + depth(p, seen)
  }
  const chain = (i: number): string[] => {
    const out: string[] = []; let k: number | null = i; const seen = new Set<number>()
    while (k != null && !seen.has(k)) { seen.add(k); out.unshift(`${withPred[k].path.split('?')[0]}@${withPred[k].start}-${withPred[k].end}`); k = withPred[k].pred }
    return out
  }
  const api = withPred.map((r, i) => ({ r, i })).filter(({ r }) => r.path.startsWith('/api/'))
  const js = withPred.filter((r) => r.type === 'Script')
  const css = withPred.filter((r) => r.type === 'Stylesheet')
  const sum = (a: typeof rows, k: 'transfer' | 'decoded') => a.reduce((s, r) => s + (r[k] || 0), 0)
  const counts = new Map<string, number>()
  for (const { r } of api) counts.set(r.path, (counts.get(r.path) || 0) + 1)
  const lastApi = api.reduce<null | { r: any; i: number }>((m, x) => (!m || (x.r.end ?? 0) > (m.r.end ?? 0) ? x : m), null)
  return {
    requests: withPred,
    js: { count: js.length, transfer: sum(js, 'transfer'), decoded: sum(js, 'decoded'), chunks: js.map((r) => ({ path: r.path, transfer: r.transfer, decoded: r.decoded, start: r.start, end: r.end })) },
    css: { count: css.length, transfer: sum(css, 'transfer'), decoded: sum(css, 'decoded'), files: css.map((r) => ({ path: r.path, transfer: r.transfer, decoded: r.decoded })) },
    api: api.map(({ r, i }) => ({ path: r.path, status: r.status, start: r.start, headers: r.headers, end: r.end, serverMs: r.serverMs, transfer: r.transfer, decoded: r.decoded, depth: depth(i), failed: r.failed })),
    duplicates: [...counts.entries()].filter(([, n]) => n > 1).map(([p, n]) => ({ path: p, n })),
    lastApiEnd: lastApi?.r.end ?? null,
    criticalChain: lastApi ? chain(lastApi.i) : [],
    lastJsEnd: js.reduce((m, r) => Math.max(m, r.end || 0), 0),
  }
}

async function measure(context: BrowserContext, url: string) {
  const page = await context.newPage()
  await page.addInitScript(INIT)
  const rec = await recorder(page)
  const wall0 = Date.now()
  let navErr: string | null = null
  await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch((e) => { navErr = String(e).slice(0, 200) })
  const settle = await rec.settle()
  const docReq = [...rec.reqs.values()].find((r) => r.type === 'Document')
  const navStart = docReq?.start ?? 0
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime
    return { ttfb: n ? Math.round(n.responseStart) : null, dcl: n ? Math.round(n.domContentLoadedEventEnd) : null, load: n ? Math.round(n.loadEventEnd) : null, fcp: fcp ? Math.round(fcp) : null, perf: (window as any).__perf, finalUrl: location.href, h1: document.querySelector('h1')?.textContent?.trim().slice(0, 80) ?? null }
  }).catch((e) => ({ error: String(e) }))
  const s = summarize(rec.reqs, navStart)
  await rec.cdp.detach().catch(() => {})
  return { page, result: { url, navErr, settle, wallMs: Date.now() - wall0, nav, ...s } }
}

const PORTAL = [
  '/portal/dashboard', '/portal/my-tasks', '/portal/my-tasks?view=table', '/portal/projects', '@project',
  '/portal/overview', '/portal/calendar', '/portal/meetings', '@meeting', '/portal/grants', '/portal/manuscripts',
  '/portal/library', '/portal/team', '@member', '/portal/settings', '/portal/search',
]
const PUBLIC = ['/', '/team', '/publications', '/pulse']

test('hub static perf audit', async ({ browser }) => {
  test.setTimeout(30 * 60_000)
  const out: any = { base: BASE, ranAt: new Date().toISOString(), routes: {}, discovered: {}, blockedWrites: [], ttfb: {}, cache: {} }
  const discover: Record<string, { from: string; sel: RegExp }> = {
    '@project': { from: '/portal/projects', sel: /^\/portal\/projects\/[^/?#]+$/ },
    '@meeting': { from: '/portal/meetings', sel: /^\/portal\/meetings\/[^/?#]+$/ },
    '@member': { from: '/portal/team', sel: /^\/portal\/team\/[^/?#]+$/ },
  }
  const links: Record<string, string[]> = {}
  const apiSeen = new Set<string>()

  // PASS 1: cold load per route, fresh context each (routing => cache off, so every load is cold)
  for (const r of (ONLY ? ONLY.split(',') : PARTS[PART])) {
    let path = r
    if (r.startsWith('@')) {
      const d = discover[r]; const cand = (links[d.from] || []).filter((h) => d.sel.test(h) && !/\/(new|prep|trajectory)$/.test(h))
      if (!cand.length) { out.routes[r] = { error: 'no link found on ' + d.from }; continue }
      path = cand[0]; out.discovered[r] = path
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const blocked = await injectRealAuth(context, BASE)
    const { page, result } = await measure(context, BASE + path)
    if (PORTAL.includes(r) && !r.startsWith('@')) {
      links[r.split('?')[0]] = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href') || '')).catch(() => [])
    }
    for (const a of result.api) if (a.status === 200) apiSeen.add(a.path)
    out.routes[r] = result; out.blockedWrites.push(...blocked.map((b) => `${r}: ${b}`))
    console.log(`${r} -> js ${result.js.decoded} css ${result.css.decoded} api ${result.api.length} lastApi ${result.lastApiEnd} settle ${JSON.stringify(result.settle)} h1=${(result.nav as any).h1}`)
    await context.close()
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1))
  }

  // PASS 2: TTFB x3 per GET endpoint, node fetch (time to headers), median
  const H = authHeaders()
  if (PART === '5') for (const f of ['1','2','3','4']) { try { const j = JSON.parse(fs.readFileSync(DIR + 'static.part' + f + '.json', 'utf-8')); for (const x of Object.values(j.routes) as any[]) for (const a of x.api ?? []) if (a.status === 200) apiSeen.add(a.path); for (const x of Object.values(j.routes) as any[]) for (const c of x.js?.chunks ?? []) out.routes['_chunk'] ??= { js: { chunks: [c] } } } catch {} }
  const sample = [...apiSeen]
  // static baselines: html, an asset (Pages Function path), favicon (plain static)
  const firstAsset = Object.values(out.routes).flatMap((x: any) => x.js?.chunks ?? []).map((c: any) => c.path)[0]
  const targets = [...sample, '/favicon.svg', firstAsset, '/portal/dashboard'].filter(Boolean)
  if (PART === '5') for (const p of targets) {
    const times: number[] = []; const totals: number[] = []; let status = 0; let bytes = 0
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now()
      const res = await fetch(BASE + p, { headers: H, redirect: 'manual' })
      const t1 = performance.now()
      const buf = await res.arrayBuffer()
      times.push(t1 - t0); totals.push(performance.now() - t0); status = res.status; bytes = buf.byteLength
    }
    const med = (a: number[]) => Math.round([...a].sort((x, y) => x - y)[1])
    out.ttfb[p] = { status, bytes, ttfbMedian: med(times), totalMedian: med(totals), ttfbAll: times.map(Math.round) }
  }

  // PASS 3: cache. No Playwright routing (it disables the HTTP cache); a CDP Fetch guard fails non-GET /api/*.
  if (PART === '6') {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await injectFakeAuth(context, BASE)
    await context.setExtraHTTPHeaders(H)
    const page = await context.newPage()
    const guard = await context.newCDPSession(page)
    const blocked: string[] = []
    await guard.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] })
    guard.on('Fetch.requestPaused', async (e: any) => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(e.request.method)) await guard.send('Fetch.continueRequest', { requestId: e.requestId }).catch(() => {})
      else { blocked.push(`${e.request.method} ${e.request.url}`); await guard.send('Fetch.failRequest', { requestId: e.requestId, errorReason: 'BlockedByClient' }).catch(() => {}) }
    })
    await page.addInitScript(INIT)
    const rec = await recorder(page)
    const step = async (label: string, fn: () => Promise<unknown>) => {
      rec.reqs.clear()
      const t0 = Date.now()
      await fn()
      const settle = await rec.settle()
      const rs = [...rec.reqs.values()]
      const assets = rs.filter((x) => x.path.startsWith('/assets/'))
      const apis = rs.filter((x) => x.path.startsWith('/api/'))
      out.cache[label] = {
        wallMs: Date.now() - t0 - (settle.settled ? 1200 : 0), settle,
        assets: { n: assets.length, fromCache: assets.filter((x) => x.fromDisk || x.fromMem).length, net: assets.filter((x) => !(x.fromDisk || x.fromMem)).map((x) => x.path), cacheControl: assets[0]?.cacheControl ?? null },
        api: apis.map((x) => ({ path: x.path, status: x.status, cache: x.fromDisk ? 'disk' : x.fromMem ? 'mem' : 'net', ms: x.end && x.start ? Math.round(x.end - x.start) : null, cc: x.cacheControl ?? null })),
        doc: rs.filter((x) => x.type === 'Document').map((x) => ({ path: x.path, cache: x.fromDisk ? 'disk' : 'net', cc: x.cacheControl ?? null, ms: x.end ? Math.round(x.end - x.start) : null })),
      }
    }
    await step('cold /portal/dashboard', () => page.goto(BASE + '/portal/dashboard', { waitUntil: 'load' }))
    await step('reload /portal/dashboard', () => page.reload({ waitUntil: 'load' }))
    await step('hard-goto /portal/projects', () => page.goto(BASE + '/portal/projects', { waitUntil: 'load' }))
    // SPA navigation: click a nav link (client-side), time to settle
    for (const [label, href] of [['spa -> /portal/my-tasks', '/portal/my-tasks'], ['spa -> /portal/dashboard', '/portal/dashboard'], ['spa -> /portal/my-tasks (again)', '/portal/my-tasks'], ['spa -> /portal/meetings', '/portal/meetings'], ['spa -> /portal/calendar', '/portal/calendar']] as const) {
      await step(label, async () => {
        const link = page.locator(`a[href="${href}"]`).first()
        if (await link.count()) await link.click()
        else await page.evaluate((h) => { history.pushState({}, '', h); dispatchEvent(new PopStateEvent('popstate')) }, href)
      })
    }
    out.cache.blockedWrites = blocked
    out.cache.serviceWorker = await page.evaluate(async () => ({ supported: 'serviceWorker' in navigator, regs: 'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope) : [], controller: !!navigator.serviceWorker?.controller }))
    await context.close()
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 1))
  console.log('wrote', OUT)
})
