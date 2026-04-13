const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'X-Test-Mode': 'true' } });
  const page = await ctx.newPage();
  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  console.log('URL:', page.url());
  console.log('focused:', await page.evaluate(() => document.activeElement?.tagName + '/' + document.activeElement?.className?.slice?.(0,40)));
  await page.keyboard.press('c');
  await page.waitForTimeout(800);
  const modal = await page.$('[role="dialog"][aria-modal="true"]');
  console.log('dialog after c:', !!modal);
  const title = await page.$('text=Create New Task');
  console.log('title text found:', !!title);
  // Try again without X-Test-Mode
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await page2.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'load' });
  await page2.waitForTimeout(3000);
  await page2.keyboard.press('c');
  await page2.waitForTimeout(800);
  const modal2 = await page2.$('[role="dialog"][aria-modal="true"]');
  console.log('without X-Test-Mode, dialog after c:', !!modal2);
  await browser.close();
})();
