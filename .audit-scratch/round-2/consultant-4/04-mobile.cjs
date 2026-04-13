const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const mctx = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true });
  const m = await mctx.newPage();
  m.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE:', msg.text()); });
  await m.goto('https://mn-ccore-lab.pages.dev/my-tasks', { waitUntil: 'networkidle' });
  await m.waitForTimeout(4000);

  const state = await m.evaluate(() => ({
    scrollY: window.scrollY,
    innerHeight: window.innerHeight,
    rowCount: document.querySelectorAll('.task-grid-row').length,
    firstRowRect: (r => r ? { x: r.getBoundingClientRect().x, y: r.getBoundingClientRect().y, w: r.getBoundingClientRect().width, h: r.getBoundingClientRect().height } : null)(document.querySelector('.task-grid-row')),
  }));
  console.log('state', JSON.stringify(state));

  // Scroll the first row into view via scrollIntoView
  await m.evaluate(() => {
    const r = document.querySelector('.task-grid-row');
    if (r) r.scrollIntoView({ block: 'center' });
  });
  await m.waitForTimeout(500);
  const rect = await m.evaluate(() => {
    const r = document.querySelector('.task-grid-row');
    if (!r) return null;
    const b = r.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height, innerH: window.innerHeight };
  });
  console.log('after scroll:', JSON.stringify(rect));

  if (rect && rect.y >= 0 && rect.y < rect.innerH) {
    // Tap in middle-right of row to avoid status circle
    await m.touchscreen.tap(rect.x + rect.w * 0.55, rect.y + rect.h / 2);
    await m.waitForTimeout(900);
    const opened = (await m.$$('[role="dialog"]')).length > 0;
    console.log('TAP RESULT:', opened ? 'PASS' : 'FAIL');
    fs.writeFileSync(path.join(__dirname, '04-results.json'), JSON.stringify({ mobile_tap: opened ? 'PASS' : 'FAIL', rect }, null, 2));
  } else {
    console.log('NO VISIBLE ROW AFTER SCROLL');
    fs.writeFileSync(path.join(__dirname, '04-results.json'), JSON.stringify({ mobile_tap: 'SKIP', rect }, null, 2));
  }
  await browser.close();
})();
