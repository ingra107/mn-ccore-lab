const { chromium } = require('playwright');

const PAGES = [
  '/', '/dashboard', '/my-tasks', '/personal', '/projects', '/manuscripts',
  '/grants', '/deadlines', '/meetings', '/team', '/ideas', '/decisions',
  '/research-digest', '/calendar', '/analytics', '/pi-analytics',
  '/search', '/settings', '/activity', '/publications'
];

const BASE = 'https://mn-ccore-lab.pages.dev';

async function measureNavigation(page, url) {
  let totalBytes = 0;
  const chunkSizes = {};
  const apiCalls = [];

  const handler = async (response) => {
    try {
      const req = response.request();
      const u = req.url();
      const headers = response.headers();
      const cl = parseInt(headers['content-length'] || '0', 10);
      if (cl > 0) {
        totalBytes += cl;
        if (u.endsWith('.js') || u.includes('.js?')) {
          const name = u.split('/').pop().split('?')[0];
          chunkSizes[name] = cl;
        }
      }
      if (u.includes('/api/')) {
        apiCalls.push(u.replace(BASE, '').split('?')[0]);
      }
    } catch {}
  };

  page.on('response', handler);

  const t0 = Date.now();
  let navError = null;
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    navError = e.message.slice(0, 100);
  }
  const totalMs = Date.now() - t0;

  let metrics = {};
  try {
    metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const paints = performance.getEntriesByType('paint');
      const fcp = paints.find(p => p.name === 'first-contentful-paint');
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      const lcp = lcpEntries.length ? lcpEntries[lcpEntries.length - 1].startTime : null;

      // CLS
      let cls = 0;
      try {
        const entries = performance.getEntriesByType('layout-shift') || [];
        for (const e of entries) if (!e.hadRecentInput) cls += e.value;
      } catch {}

      return {
        ttfb: Math.round(nav.responseStart - nav.startTime) || null,
        dcl: Math.round(nav.domContentLoadedEventEnd - nav.startTime) || null,
        load: Math.round(nav.loadEventEnd - nav.startTime) || null,
        fcp: fcp ? Math.round(fcp.startTime) : null,
        lcp: lcp ? Math.round(lcp) : null,
        cls: Math.round(cls * 1000) / 1000,
      };
    });
  } catch {}

  page.off('response', handler);

  return {
    totalMs,
    ...metrics,
    bytes: totalBytes,
    chunkCount: Object.keys(chunkSizes).length,
    apiCalls: apiCalls.length,
    apiList: apiCalls,
    navError,
  };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const results = {};

  // Warm up: navigate to root so CF Worker is hot
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);

  for (const path of PAGES) {
    const url = BASE + path;
    process.stderr.write(`Measuring ${path}...\n`);

    // Cold: clear cache
    await ctx.clearCookies();
    const client = await ctx.newCDPSession(page);
    try { await client.send('Network.clearBrowserCache'); } catch {}
    try { await client.send('Network.clearBrowserCookies'); } catch {}

    const cold = await measureNavigation(page, url);

    // Warm: second navigation, cache intact
    const warm = await measureNavigation(page, url);

    results[path] = { cold, warm };
    process.stderr.write(`  cold=${cold.totalMs}ms warm=${warm.totalMs}ms lcp=${warm.lcp} bytes=${warm.bytes} api=${warm.apiCalls}\n`);
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
