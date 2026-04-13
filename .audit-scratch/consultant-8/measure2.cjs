const { chromium } = require('playwright');

// Re-measure the 4 slow pages to understand the 10s issue
const SLOW_PAGES = ['/dashboard', '/projects', '/analytics', '/pi-analytics'];
const BASE = 'https://mn-ccore-lab.pages.dev';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Track long-lived requests
  const pending = new Map();
  page.on('request', r => pending.set(r, { url: r.url(), start: Date.now() }));
  page.on('requestfinished', r => pending.delete(r));
  page.on('requestfailed', r => pending.delete(r));

  // Warm the worker
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1000);

  for (const path of SLOW_PAGES) {
    const url = BASE + path;
    console.log(`\n=== ${path} ===`);

    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const dclMs = Date.now() - t0;

    // Wait 500ms then try to get LCP and FCP
    await page.waitForTimeout(500);

    const earlyMetrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const paints = performance.getEntriesByType('paint');
      const fcp = paints.find(p => p.name === 'first-contentful-paint');
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      const lcp = lcpEntries.length ? lcpEntries[lcpEntries.length - 1].startTime : null;
      return {
        ttfb: Math.round(nav.responseStart - nav.startTime) || null,
        dcl: Math.round(nav.domContentLoadedEventEnd - nav.startTime) || null,
        fcp: fcp ? Math.round(fcp.startTime) : null,
        lcp: lcp ? Math.round(lcp) : null,
      };
    });
    console.log(`  DCL (actual): ${dclMs}ms, metrics:`, earlyMetrics);

    // Now wait for networkidle and see what takes so long
    const t1 = Date.now();
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      console.log(`  networkidle reached after +${Date.now() - t1}ms`);
    } catch (e) {
      console.log(`  networkidle TIMEOUT after 15s`);
      // What's pending?
      const now = Date.now();
      const still = Array.from(pending.values())
        .filter(p => now - p.start > 1000)
        .map(p => ({ age: now - p.start, url: p.url.replace(BASE, '') }));
      console.log(`  Pending long requests:`, still.slice(0, 10));
    }
  }

  await browser.close();
})();
