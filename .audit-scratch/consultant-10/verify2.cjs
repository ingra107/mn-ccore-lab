const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'X-Test-Mode': 'true' } });
  const page = await ctx.newPage();
  await page.goto('https://mn-ccore-lab.pages.dev/my-tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => {
    const bodyHTML = document.body.innerHTML;
    const hasEmptyState = /empty|no tasks|create first/i.test(document.body.textContent || '');
    const buttons = document.querySelectorAll('button').length;
    const taskRows = document.querySelectorAll('[data-testid^="task-row-"]').length;
    const allTestIds = Array.from(document.querySelectorAll('[data-testid]')).slice(0, 10).map(e => e.getAttribute('data-testid'));
    const groupHeaders = document.querySelectorAll('.group-header, [class*="groupHeader"]').length;
    return { hasEmptyState, buttons, taskRows, allTestIds, bodyLen: bodyHTML.length };
  });
  console.log(JSON.stringify(info, null, 2));

  // Test without X-Test-Mode (prod DB)
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await page2.goto('https://mn-ccore-lab.pages.dev/my-tasks', { waitUntil: 'domcontentloaded' });
  await page2.waitForTimeout(4000);
  const info2 = await page2.evaluate(() => {
    const columnheaders = document.querySelectorAll('[role="columnheader"]').length;
    const grid = document.querySelectorAll('[role="grid"]').length;
    const row = document.querySelectorAll('[role="row"]').length;
    const taskRows = document.querySelectorAll('[data-testid^="task-row-"]').length;
    const taskTitles = document.querySelectorAll('[data-testid^="task-title-"]').length;
    return { columnheaders, grid, row, taskRows, taskTitles };
  });
  console.log('\n/my-tasks WITHOUT X-Test-Mode:', JSON.stringify(info2));
  await browser.close();
})();
