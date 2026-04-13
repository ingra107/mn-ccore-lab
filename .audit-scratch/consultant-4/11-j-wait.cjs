const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch(e) {} });
  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(3000); // Extra wait

  const rowCount = await page.locator('.task-grid-row').count();
  console.log('rows after 3s:', rowCount);

  // Click header area first (sometimes seen to "arm" keyboard focus)
  await page.locator('.task-grid-header').first().click().catch(() => {});
  await page.waitForTimeout(300);

  // Check active
  console.log('active after header click:', await page.evaluate(() => document.activeElement?.tagName));

  // Try pressing j
  await page.keyboard.press('j');
  await page.waitForTimeout(500);
  let focused = await page.locator('.task-row-focused').count();
  console.log('after j:', focused);

  // Try Space (should trigger togglePeek → which requires focusedIndex setting too)
  await page.keyboard.press(' ');
  await page.waitForTimeout(600);
  const peekOpen = await page.locator('[class*="peek"], [role="dialog"]').count();
  console.log('after Space, peek-like elements:', peekOpen);

  // Try pressing Enter
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const detailOpen = await page.locator('button:has-text("Overview")').first().isVisible().catch(() => false);
  console.log('detail after Enter:', detailOpen);

  // Now try toggling filter with F
  await page.keyboard.press('Escape');
  await page.keyboard.press('f');
  await page.waitForTimeout(400);
  // Check for filter panel
  const filters = await page.locator('text=/Filter/').count();
  console.log('F → filter elements:', filters);

  // Finally: Press C to open create modal
  await page.keyboard.press('c');
  await page.waitForTimeout(600);
  const createOpen = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);
  console.log('C → create modal:', createOpen);

  await browser.close();
})();
