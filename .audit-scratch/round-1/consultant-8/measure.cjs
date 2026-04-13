const { chromium } = require('playwright');

const PAGES = [
  '/', '/dashboard', '/my-tasks', '/personal', '/projects', '/manuscripts',
  '/grants', '/deadlines', '/meetings', '/team', '/ideas', '/decisions',
  '/research-digest', '/calendar', '/analytics', '/pi-analytics',
  '/search', '/settings', '/activity', '/publications'
];
const BASE = 'https://mn-ccore-lab.pages.dev';

async function measurePage(page, client, url) {
  const chunks = {};
  let totalBytes = 0;
  let jsBytes = 0;
  let cssBytes = 0;
  let imgBytes = 0;
  let fontBytes = 0;
  const apiCalls = [];
  const fullChunks = {};

  const onResponse = async (response) => {
    try {
      const u = response.url();
      const req = response.request();
      const rtype = req.resourceType();

      let size = 0;
      const headers = response.headers();
      if (headers['content-length']) size = parseInt(headers['content-length'], 10);

      if (size === 0) {
        // Use CDP to get actual transfer size
        try {
          const body = await response.body();
          size = body.length;
        } catch {}
      }

      totalBytes += size;
      if (rtype === 'script' || u.endsWith('.js')) {
        jsBytes += size;
        const name = u.split('/').pop().split('?')[0];
        fullChunks[name] = (fullChunks[name] || 0) + size;
      } else if (rtype === 'stylesheet') {
        cssBytes += size;
      } else if (rtype === 'image') {
        imgBytes += size;
      } else if (rtype === 'font') {
        fontBytes += size;
      }

      if (u.includes('/api/')) {
        apiCalls.push(u.replace(BASE, '').split('?')[0]);
      }
    } catch {}
  };

  page.on('response', onResponse);

  // Inject LCP observer BEFORE navigation
  await page.addInitScript(() => {
    window.__lcp = null;
    window.__cls = 0;
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        window.__lcp = entries[entries.length - 1].startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });

      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
  });

  const t0 = Date.now();
  let err = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (e) { err = e.message.slice(0, 80); }
  const dclMs = Date.now() - t0;

  // Wait for content rendering + LCP to settle
  await page.waitForTimeout(1500);

  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const fcp = performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint');
    return {
      ttfb: Math.round(nav.responseStart - nav.startTime) || null,
      dcl: Math.round(nav.domContentLoadedEventEnd - nav.startTime) || null,
      fcp: fcp ? Math.round(fcp.startTime) : null,
      lcp: window.__lcp ? Math.round(window.__lcp) : null,
      cls: Math.round((window.__cls || 0) * 1000) / 1000,
    };
  });

  page.off('response', onResponse);

  const topChunks = Object.entries(fullChunks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n, s]) => ({ name: n, kb: Math.round(s / 1024) }));

  return {
    dclMs,
    ...m,
    jsKB: Math.round(jsBytes / 1024),
    cssKB: Math.round(cssBytes / 1024),
    imgKB: Math.round(imgBytes / 1024),
    fontKB: Math.round(fontBytes / 1024),
    totalKB: Math.round(totalBytes / 1024),
    topChunks,
    apiCallCount: apiCalls.length,
    apiCalls,
    err,
  };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const client = await ctx.newCDPSession(page);

  // Warm worker
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1000);

  const results = {};

  for (const path of PAGES) {
    const url = BASE + path;
    process.stderr.write(`Measuring ${path}...\n`);

    try { await client.send('Network.clearBrowserCache'); } catch {}
    const cold = await measurePage(page, client, url);
    const warm = await measurePage(page, client, url);

    results[path] = { cold, warm };
    process.stderr.write(`  cold:dcl=${cold.dclMs}/fcp=${cold.fcp}/lcp=${cold.lcp} js=${cold.jsKB}KB total=${cold.totalKB}KB  warm:dcl=${warm.dclMs}/fcp=${warm.fcp}/lcp=${warm.lcp} js=${warm.jsKB}KB api=${warm.apiCallCount}\n`);
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
