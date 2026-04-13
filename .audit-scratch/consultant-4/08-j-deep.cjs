const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch(e) {} });
  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);

  // Wait for task-grid-row to definitely render
  await page.waitForSelector('.task-grid-row', { timeout: 10000 });

  // Check rendered count
  let rows = await page.locator('.task-grid-row').count();
  console.log('rows:', rows);

  // focus body explicitly
  await page.evaluate(() => document.body.focus());

  // Press j via keyboard.down/up
  await page.keyboard.down('j');
  await page.keyboard.up('j');
  await page.waitForTimeout(800);

  let focused = await page.locator('.task-row-focused').count();
  console.log('after j (down/up):', focused);

  // Try lowercase + direct page.press
  await page.press('body', 'j');
  await page.waitForTimeout(600);
  focused = await page.locator('.task-row-focused').count();
  console.log('after page.press j:', focused);

  // Manually trigger handler via keydown on document
  await page.evaluate(() => {
    const ev = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
  });
  await page.waitForTimeout(500);
  focused = await page.locator('.task-row-focused').count();
  console.log('after manual dispatch:', focused);

  // Check if there is an onFocusIndex flow: clicking a row will setFocusedTaskIndex
  const firstRow = page.locator('.task-grid-row').first();
  await firstRow.click();
  await page.waitForTimeout(400);

  focused = await page.locator('.task-row-focused').count();
  console.log('after row click:', focused);

  // NOW press j to see if it advances
  await page.keyboard.press('j');
  await page.waitForTimeout(400);
  focused = await page.locator('.task-row-focused').count();
  console.log('after click+j:', focused);

  // Escape closes detail panel if it's open
  const detailOpen = await page.locator('text=Overview').first().isVisible().catch(() => false);
  console.log('detail panel open after row click:', detailOpen);

  await browser.close();
})();
