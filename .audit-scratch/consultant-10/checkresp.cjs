const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'X-Test-Mode': 'true' } });
  const page = await ctx.newPage();
  const bad = [];
  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
  });
  for (const p of ['/my-tasks', '/tasks', '/analytics']) {
    bad.length = 0;
    await page.goto('https://mn-ccore-lab.pages.dev' + p, { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(2500);
    console.log(`\n=== ${p} ===`);
    if (bad.length === 0) console.log('  (clean)');
    bad.forEach(b => console.log('  ' + b));
  }
  await browser.close();
})();
