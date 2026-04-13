const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
  
  await page.addInitScript(() => {
    try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch {}
  });
  
  const t0 = Date.now();
  await page.goto('https://mn-ccore-lab.pages.dev/my-tasks', { waitUntil: 'domcontentloaded', timeout: 45000 });
  const t1 = Date.now();
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  const t2 = Date.now();
  console.log(`DOMContentLoaded ${t1-t0}ms, networkIdle ${t2-t0}ms`);
  
  const rowCount = await page.locator('[role="row"]').count();
  console.log(`rows role=row: ${rowCount}`);
  const gridExists = await page.locator('[role="grid"]').count();
  console.log(`grid count: ${gridExists}`);
  
  // Screenshot for sanity
  await page.screenshot({ path: 'C:/Users/ingra/mn-ccore-lab/.audit-scratch/consultant-4/01-mytasks.png' });
  console.log('logs:', logs.slice(0, 20).join('\n  '));
  await browser.close();
})();
