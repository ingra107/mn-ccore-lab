const { chromium } = require('playwright');
const OUT = 'C:/Users/ingra/mn-ccore-lab/.audit-scratch/round-1/consultant-1';
const BASE = 'https://mn-ccore-lab.pages.dev';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE + '/dashboard');
  await page.evaluate(() => localStorage.setItem('mn-ccore-theme', 'dark'));

  const shots = [
    ['manuscripts-detail', '/manuscripts'],
    ['tasks-detail', '/tasks'],
    ['dashboard-detail', '/dashboard'],
    ['decisions-detail', '/decisions'],
    ['ideas-detail', '/ideas'],
    ['meetings-detail', '/meetings'],
    ['settings-detail', '/settings'],
    ['search-detail', '/search'],
  ];
  for (const [name, url] of shots) {
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    // Crop top viewport at 1x scale
    await page.screenshot({ path: `${OUT}/${name}-top.png`, fullPage: false });
    console.log('ok', name);
  }
  await browser.close();
})();
