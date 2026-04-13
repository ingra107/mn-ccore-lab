const { chromium } = require('playwright');

const PAGES = [
  '/', '/dashboard', '/my-tasks', '/personal', '/projects', '/manuscripts',
  '/grants', '/deadlines', '/meetings', '/team', '/ideas', '/decisions',
  '/research-digest', '/calendar', '/analytics', '/pi-analytics',
  '/search', '/settings', '/activity', '/publications'
];

const BASE = 'https://mn-ccore-lab.pages.dev';

async function measurePage(page, url) {
  let totalBytes = 0;
  let jsBytes = 0;
  const chunks = {};
  const apiCalls = [];

  const handler = (response) => {
    try {
      const u = response.url();
      const headers = response.headers();
      const cl = parseInt(headers['content-length'] || '0', 10);
      if (cl > 0) {
        totalBytes += cl;
        const ct = headers['content-type'] || '';
        if (ct.includes('javascript') || u.includes('.js')) {
          jsBytes += cl;
          const name = u.split('/').pop().split('?')[0];
          chunks[name] = cl;
        }
      }
      if (u.includes('/api/')) {
        apiCalls.push(u.replace(BASE, '').split('?')[0]);
      }
    } catch {}
  };

  page.on('response', handler);

  const t0 = Date.now();
  let err = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (e) {
    err = e.message.slice(0, 80);
  }
  const dclMs = Date.now() - t0;

  // Wait for main content to render — look for common React mount indicator
  await page.waitForTimeout(800);

  // Measure first content visible using heuristic: wait for h1/main/role=main to appear
  let firstContentMs = null;
  try {
    firstContentMs = await page.evaluate(() => {
      const fcp = performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint');
      return fcp ? Math.round(fcp.startTime) : null;
    });
  } catch {}

  // Wait a bit more for LCP to settle
  await page.waitForTimeout(500);

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paints = performance.getEntriesByType('paint');
    const fcp = paints.find(p => p.name === 'first-contentful-paint');
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    const lcp = lcpEntries.length ? lcpEntries[lcpEntries.length - 1].startTime : null;

    let cls = 0;
    try {
      const entries = performance.getEntriesByType('layout-shift') || [];
      for (const e of entries) if (!e.hadRecentInput) cls += e.value;
    } catch {}

    return {
      ttfb: Math.round(nav.responseStart - nav.startTime) || null,
      dcl: Math.round(nav.domContentLoadedEventEnd - nav.startTime) || null,
      fcp: fcp ? Math.round(fcp.startTime) : null,
      lcp: lcp ? Math.round(lcp) : null,
      cls: Math.round(cls * 1000) / 1000,
    };
  });

  page.off('response', handler);

  // Sort chunks by size desc, keep top 5
  const topChunks = Object.entries(chunks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n, s]) => `${n}:${Math.round(s/1024)}KB`);

  return {
    dclMs,
    ...metrics,
    jsKB: Math.round(jsBytes / 1024),
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

  // Warm up CF Worker
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1000);

  const results = {};

  for (const path of PAGES) {
    const url = BASE + path;
    process.stderr.write(`Measuring ${path}...\n`);

    // Cold: clear cache
    const client = await ctx.newCDPSession(page);
    try { await client.send('Network.clearBrowserCache'); } catch {}

    const cold = await measurePage(page, url);

    // Warm: no clear, re-navigate
    const warm = await measurePage(page, url);

    results[path] = { cold, warm };
    process.stderr.write(`  cold:dcl=${cold.dclMs}/fcp=${cold.fcp}/lcp=${cold.lcp}  warm:dcl=${warm.dclMs}/fcp=${warm.fcp}/lcp=${warm.lcp}  js=${warm.jsKB}KB api=${warm.apiCallCount}\n`);
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
