const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ extraHTTPHeaders: { 'X-Test-Mode': 'true' } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (/fonts\.g|websocket|hub-realtime|\/api\/version/i.test(t)) return;
      errors.push('console: ' + t.slice(0, 200));
    }
  });
  for (const p of ['/my-tasks', '/tasks', '/analytics']) {
    errors.length = 0;
    try {
      await page.goto('https://mn-ccore-lab.pages.dev' + p, { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(2000);
    } catch (e) { errors.push('goto: ' + e.message); }
    console.log(`\n=== ${p} ===`);
    if (errors.length === 0) console.log('  (clean)');
    errors.forEach(e => console.log('  ' + e));
  }
  await browser.close();
})();
