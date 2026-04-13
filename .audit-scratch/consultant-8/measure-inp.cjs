const { chromium } = require('playwright');
const BASE = 'https://mn-ccore-lab.pages.dev';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Warm up
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Test sidebar nav click latency (common interaction)
  const navTargets = [
    ['dashboard', '/my-tasks'],
    ['my-tasks', '/projects'],
    ['projects', '/manuscripts'],
    ['manuscripts', '/deadlines'],
  ];

  for (const [from, to] of navTargets) {
    await page.goto(BASE + '/' + from, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Find and click sidebar link to `to`
    const link = page.locator(`a[href="${to}"]`).first();
    const visible = await link.isVisible().catch(() => false);
    if (!visible) {
      console.log(`${from} -> ${to}: link not visible`);
      continue;
    }

    const t0 = Date.now();
    await link.click();
    // Wait for URL change
    try {
      await page.waitForURL(BASE + to, { timeout: 5000 });
    } catch {}
    const navMs = Date.now() - t0;

    // Wait for first content
    await page.waitForTimeout(200);
    const fcp = await page.evaluate(() => {
      const e = performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint');
      return e ? Math.round(e.startTime) : null;
    });

    console.log(`${from} -> ${to}: nav=${navMs}ms`);
  }

  // Test in-page interactions on /my-tasks: click first status pill
  await page.goto(BASE + '/my-tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Click a button and measure response time via requestAnimationFrame
  const clickLatency = await page.evaluate(async () => {
    const btn = document.querySelector('button');
    if (!btn) return null;
    const t0 = performance.now();
    btn.click();
    await new Promise(r => requestAnimationFrame(r));
    return Math.round(performance.now() - t0);
  });
  console.log('my-tasks first button click rAF:', clickLatency + 'ms');

  await browser.close();
})();
