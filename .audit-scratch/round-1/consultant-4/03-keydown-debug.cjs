/* Debug: why aren't j/k/?/n keys reaching handlers in production? */
const { chromium } = require('playwright');
const BASE = 'https://mn-ccore-lab.pages.dev';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Capture console errors
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERR:', msg.text()); });

  await page.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // Install a capture-phase listener so we see EVERY keydown reaching document
  await page.evaluate(() => {
    window.__keys = [];
    document.addEventListener('keydown', (e) => {
      window.__keys.push({
        key: e.key,
        target: (e.target && e.target.tagName) || 'null',
        targetCls: (e.target && e.target.className && e.target.className.toString().slice(0, 60)) || '',
        defaultPrevented: e.defaultPrevented,
        timeStamp: Math.round(e.timeStamp),
      });
    }, true);
  });

  // Click somewhere safe (not on a task row)
  await page.locator('body').click({ position: { x: 1200, y: 100 } });
  await page.waitForTimeout(200);

  await page.keyboard.press('j');
  await page.waitForTimeout(150);
  await page.keyboard.press('k');
  await page.waitForTimeout(150);
  await page.keyboard.press('n');
  await page.waitForTimeout(150);
  await page.keyboard.press('Shift+/');
  await page.waitForTimeout(150);
  await page.keyboard.press('?');
  await page.waitForTimeout(150);

  const data = await page.evaluate(() => ({
    keys: window.__keys,
    activeTag: document.activeElement && document.activeElement.tagName,
    activeCls: document.activeElement && document.activeElement.className && document.activeElement.className.toString().slice(0, 60),
    rowCount: document.querySelectorAll('.task-grid-row, [role="row"]').length,
    focusedRowCount: document.querySelectorAll('.task-row-focused').length,
  }));

  console.log(JSON.stringify(data, null, 2));

  // Check if useTaskKeyboardShortcuts handler is even attached by triggering via dispatchEvent
  const dispatched = await page.evaluate(() => {
    const ev = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  console.log('JS dispatch j defaultPrevented:', dispatched);
  await page.waitForTimeout(300);
  const focusedAfterJS = await page.locator('.task-row-focused').count();
  console.log('focused after JS dispatch:', focusedAfterJS);

  // Test the same on /ideas
  await page.goto(BASE + '/ideas', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    window.__keys = [];
    document.addEventListener('keydown', (e) => window.__keys.push({ key: e.key, prevented: e.defaultPrevented }), true);
  });
  await page.locator('body').click({ position: { x: 1200, y: 100 } });
  await page.keyboard.press('n');
  await page.waitForTimeout(300);
  const ideasKeys = await page.evaluate(() => window.__keys);
  console.log('IDEAS keys after n:', JSON.stringify(ideasKeys));
  // After capture, check defaultPrevented (which should be true if React handler ran)
  const ideasOverlay = await page.evaluate(() => {
    const fixed = Array.from(document.querySelectorAll('div')).filter(d => {
      const cs = getComputedStyle(d);
      return cs.position === 'fixed' && d.querySelector('input, textarea');
    });
    return fixed.map(d => ({ cls: d.className.toString().slice(0, 60), op: getComputedStyle(d).opacity }));
  });
  console.log('Ideas overlays:', JSON.stringify(ideasOverlay));

  await browser.close();
})();
