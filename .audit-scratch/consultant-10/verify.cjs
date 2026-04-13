const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'X-Test-Mode': 'true' } });
  const page = await ctx.newPage();

  for (const p of ['/dashboard', '/personal', '/analytics', '/settings']) {
    await page.goto('https://mn-ccore-lab.pages.dev' + p, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const headings = await page.evaluate(() => {
      const h1 = Array.from(document.querySelectorAll('h1')).map(h => h.textContent?.trim().slice(0, 40));
      const h2 = Array.from(document.querySelectorAll('h2')).map(h => h.textContent?.trim().slice(0, 40));
      return { h1, h2 };
    });
    console.log(`${p}: h1=${JSON.stringify(headings.h1)} h2count=${headings.h2.length}`);
  }

  // columnheader role check on /my-tasks
  await page.goto('https://mn-ccore-lab.pages.dev/my-tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const roles = await page.evaluate(() => {
    const columnheaders = document.querySelectorAll('[role="columnheader"]').length;
    const grid = document.querySelectorAll('[role="grid"]').length;
    const gridcell = document.querySelectorAll('[role="gridcell"]').length;
    const row = document.querySelectorAll('[role="row"]').length;
    const testIdTitles = document.querySelectorAll('[data-testid^="task-title-"]').length;
    return { columnheaders, grid, gridcell, row, testIdTitles };
  });
  console.log('\n/my-tasks ARIA:', JSON.stringify(roles));

  await browser.close();
})();
