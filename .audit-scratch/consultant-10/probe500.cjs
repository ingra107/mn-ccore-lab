const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'X-Test-Mode': 'true' } });
  const page = await ctx.newPage();
  const fails = [];
  page.on('response', (r) => {
    if (r.status() >= 500) fails.push(`${r.status()} ${r.url()}`);
  });
  for (const path of ['/dashboard', '/tasks', '/personal', '/projects', '/meetings', '/settings']) {
    fails.length = 0;
    await page.goto('https://mn-ccore-lab.pages.dev' + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    console.log(`\n${path}:`);
    if (fails.length === 0) console.log('  (none)');
    fails.forEach(f => console.log('  ' + f));
  }
  await browser.close();
})();
