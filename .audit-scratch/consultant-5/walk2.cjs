const { chromium } = require('playwright');
const OUT = 'C:/Users/ingra/mn-ccore-lab/.audit-scratch/consultant-5';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('https://mn-ccore-lab.pages.dev/dashboard');
  await page.evaluate(() => localStorage.setItem('mn-ccore-theme', 'dark'));

  // Try alt URLs
  const urls = [
    ['pi-analytics-alt', '/pi'],
    ['trajectory-real', '/trajectory/alex'],
    ['deadline-cascade-full', '/deadline-cascade'],
    ['analytics-full', '/analytics'],
    ['project-detail', '/projects'],
    ['task-detail-panel', '/tasks'],
  ];
  for (const [name, url] of urls) {
    try {
      await page.goto('https://mn-ccore-lab.pages.dev' + url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      if (name === 'project-detail') {
        // Click first project row
        const row = page.locator('table tr, [role="row"]').nth(2);
        if (await row.count()) { await row.click().catch(() => {}); await page.waitForTimeout(1000); }
      }
      if (name === 'task-detail-panel') {
        const title = page.locator('td button, td a').first();
        if (await title.count()) { await title.click().catch(() => {}); await page.waitForTimeout(1000); }
      }
      await page.screenshot({ path: OUT + '/' + name + '.png', fullPage: true });
      const h1 = await page.locator('h1').first().textContent().catch(() => '');
      console.log(name, '->', page.url(), '|', (h1 || '').slice(0, 60));
    } catch (e) {
      console.log(name, 'ERR', e.message.slice(0, 100));
    }
  }
  await browser.close();
})();
