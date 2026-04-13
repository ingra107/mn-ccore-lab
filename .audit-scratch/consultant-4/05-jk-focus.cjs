const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch(e) {} });

  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  // Is there any auto-focused input/search?
  const act1 = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    cls: document.activeElement?.className?.slice?.(0, 80) || '',
    id: document.activeElement?.id || '',
    placeholder: document.activeElement?.getAttribute?.('placeholder') || '',
  }));
  console.log('initial focus:', JSON.stringify(act1));

  // Try clicking empty area away from any input
  await page.locator('body').click({ position: { x: 10, y: 500 }, force: true });
  await page.waitForTimeout(200);

  const act2 = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    cls: document.activeElement?.className?.slice?.(0, 80) || '',
  }));
  console.log('after click:', JSON.stringify(act2));

  // Install a temporary keydown listener to see what's happening
  await page.evaluate(() => {
    window.__keyLog = [];
    document.addEventListener('keydown', (e) => {
      window.__keyLog.push({ key: e.key, target: (e.target).tagName, defaultPrevented: e.defaultPrevented });
    }, true);
  });

  await page.keyboard.press('j');
  await page.waitForTimeout(400);
  const log = await page.evaluate(() => window.__keyLog);
  console.log('keydown log:', JSON.stringify(log));

  const focused = await page.locator('.task-row-focused').count();
  console.log('focused rows after j:', focused);

  // Try clicking a row first THEN j
  await page.locator('[data-testid^="task-row-"]').first().click();
  await page.waitForTimeout(300);
  await page.keyboard.press('j');
  await page.waitForTimeout(400);
  const focused2 = await page.locator('.task-row-focused').count();
  console.log('focused after click+j:', focused2);

  // Look for focus index state via React DevTools - simpler: check if any row has tabIndex=0 and some visual marker
  const focusedRowsViaTabindex = await page.evaluate(() => {
    const rows = document.querySelectorAll('[data-testid^="task-row-"]');
    return Array.from(rows).map((r, i) => ({
      i,
      tabIndex: r.tabIndex,
      classes: r.className.slice(0, 60),
      focused: r.className.includes('task-row-focused'),
    })).slice(0, 5);
  });
  console.log('first 5 rows:', JSON.stringify(focusedRowsViaTabindex, null, 2));

  await browser.close();
})();
