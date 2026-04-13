const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch(e) {} });
  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  // Look for specific view indicators
  const listExists = await page.locator('.task-grid-header').count();
  const boardExists = await page.locator('[class*="TaskBoard"], [class*="task-board"]').count();
  console.log('list header:', listExists, 'board:', boardExists);

  // Click every row to check tabIndex + data-index structure
  const dataIndex = await page.locator('[data-index]').count();
  console.log('data-index wrappers:', dataIndex);

  // Look at virtualizer height — virtualizer renders rows inside absolute parent
  const virtuContainer = await page.evaluate(() => {
    const grid = document.querySelector('[role="grid"]');
    if (!grid) return null;
    const children = Array.from(grid.children).map(c => ({
      tag: c.tagName, cls: (c.className || '').slice(0, 60),
      style: (c.getAttribute('style') || '').slice(0, 100),
    }));
    return { childCount: grid.children.length, sample: children.slice(0, 10) };
  });
  console.log('grid structure:', JSON.stringify(virtuContainer, null, 2));

  // Press j and look at TaskGridView's React internals via probing innerHTML changes
  const before = await page.locator('.task-row-focused').count();
  await page.keyboard.press('j');
  await page.waitForTimeout(500);
  const after = await page.locator('.task-row-focused').count();
  console.log('focused before/after:', before, after);

  // Is there a SavedViewsBar with an input that might be intercepting?
  const inputs = await page.locator('input').count();
  console.log('inputs on page:', inputs);

  const placeholders = await page.locator('input').evaluateAll(els => els.map(e => e.placeholder));
  console.log('input placeholders:', placeholders);

  // Check: after pressing j, is focusedIndex state visible anywhere in the DOM?
  const anyActive = await page.evaluate(() => {
    const els = document.querySelectorAll('[class*="focus"]');
    return Array.from(els).map(e => e.className).slice(0, 5);
  });
  console.log('focus-related classes on page:', anyActive);

  await browser.close();
})();
