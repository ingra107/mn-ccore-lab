// Debug why J/K doesn't focus on /tasks — maybe virtualizer + focus issue
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 200)); });
  await page.addInitScript(() => { try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch(e) {} });

  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1500);

  // What is the current view?
  const viewBtnText = await page.locator('[data-testid*="view"], button:has-text("List"), button:has-text("Board")').allTextContents().catch(() => []);
  console.log('view buttons:', viewBtnText);

  // Are there task-row elements?
  const rows = await page.locator('[data-testid^="task-row-"]').count();
  console.log('task-rows:', rows);

  // Is task-grid-row class present?
  const gridRows = await page.locator('.task-grid-row').count();
  console.log('task-grid-row class:', gridRows);

  // Initial focus
  const active = await page.evaluate(() => document.activeElement?.tagName + '/' + document.activeElement?.className?.slice(0, 40));
  console.log('initial active:', active);

  // Send J
  await page.keyboard.press('j');
  await page.waitForTimeout(300);

  const focusedCount = await page.locator('.task-row-focused').count();
  console.log('after J, focused rows:', focusedCount);

  // Try pressing J via evaluate directly dispatching on document
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
  });
  await page.waitForTimeout(300);
  const focusedCount2 = await page.locator('.task-row-focused').count();
  console.log('after dispatch, focused rows:', focusedCount2);

  // Hunt for useTaskKeyboardShortcuts state — inspect React via data attrs
  const hasListView = await page.locator('[class*="task-grid"]').count();
  console.log('task-grid elements:', hasListView);

  // Examine: what does View button say? Is it "Board" default?
  const currentView = await page.locator('[role="tab"][aria-selected="true"], [aria-pressed="true"]').allTextContents().catch(() => []);
  console.log('selected tab/toggle:', currentView);

  await page.screenshot({ path: 'C:/Users/ingra/mn-ccore-lab/.audit-scratch/consultant-4/04-tasks-view.png', fullPage: false });

  await browser.close();
})();
