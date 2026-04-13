/* Misc tests: bulk toolbar via div checkbox, ShortcutHelp Esc */
const { chromium } = require('playwright');
const BASE = 'https://mn-ccore-lab.pages.dev';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.locator('select').first().selectOption('none');
  await page.waitForTimeout(500);

  // Click .task-row-checkbox div
  const cb = page.locator('.task-row-checkbox').first();
  const cbCount = await page.locator('.task-row-checkbox').count();
  console.log('checkbox divs:', cbCount);
  await cb.click({ force: true });
  await page.waitForTimeout(500);

  const bulk = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div, section'));
    for (const el of all) {
      const txt = (el.textContent || '').trim();
      if (/^\d+\s+selected/i.test(txt) && txt.length < 300) {
        const cs = getComputedStyle(el);
        return { found: true, opacity: cs.opacity, transform: cs.transform, text: txt.slice(0, 100) };
      }
    }
    return { found: false };
  });
  console.log('bulk toolbar at count=1:', JSON.stringify(bulk));

  // Test ShortcutHelp Escape thoroughly
  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('h1').first().click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(200);
  await page.keyboard.press('?');
  await page.waitForTimeout(500);
  const sh1 = await page.locator('[role="dialog"]').filter({ hasText: /shortcut|keyboard/i }).count();
  console.log('shortcut help open:', sh1);
  // Use Escape with focus inside modal
  const focusInModal = await page.evaluate(() => {
    const m = document.querySelector('[role="dialog"]');
    return m ? m.contains(document.activeElement) : false;
  });
  console.log('focus inside modal:', focusInModal);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  const sh2 = await page.locator('[role="dialog"]').filter({ hasText: /shortcut|keyboard/i }).count();
  console.log('after Escape:', sh2);

  // Test C key on /my-tasks more thoroughly
  await page.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('h1').first().click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('c');
  await page.waitForTimeout(800);
  const url = page.url();
  const dlg = await page.locator('[role="dialog"]').filter({ hasText: /Create|New Task/i }).count();
  console.log('after c:', { url, dlg });

  // /tasks?create=true direct navigation
  await page.goto(BASE + '/tasks?create=true', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const url2 = page.url();
  const dlg2 = await page.locator('[role="dialog"]').filter({ hasText: /Create|New Task/i }).count();
  console.log('direct /tasks?create=true:', { url2, dlg2 });

  await browser.close();
})();
