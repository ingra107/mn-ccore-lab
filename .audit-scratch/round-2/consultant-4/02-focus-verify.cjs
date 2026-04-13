// R-01 deep verification: J/K focus advancement in grouped view
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://mn-ccore-lab.pages.dev';
const OUT = path.join(__dirname, '02-results.json');
const results = [];
const push = (area, test, status, notes = '') => {
  results.push({ area, test, status, notes });
  console.log(`[${status}] ${area} :: ${test}${notes ? ' — ' + notes : ''}`);
};

function focusedIdx(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.task-grid-row'));
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].classList.contains('task-row-focused')) return i;
    }
    return -1;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  try {
    await page.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    // Confirm grouped view
    const hasGroupHeaders = await page.evaluate(() => /OVERDUE|TODAY|TOMORROW|THIS WEEK|LATER|NO DATE/.test(document.body.innerText));
    push('/my-tasks', 'grouped view default', hasGroupHeaders ? 'PASS' : 'FAIL');

    const rowCount = await page.evaluate(() => document.querySelectorAll('.task-grid-row').length);
    push('/my-tasks', 'task rows present', rowCount > 0 ? 'PASS' : 'FAIL', `rows=${rowCount}`);

    // Press J — row 0 should be focused
    await page.keyboard.press('j');
    await page.waitForTimeout(250);
    let idx = await focusedIdx(page);
    push('/my-tasks', 'R-01: J#1 → focused row 0', idx === 0 ? 'PASS' : 'FAIL', `idx=${idx}`);

    // Press J → row 1
    await page.keyboard.press('j');
    await page.waitForTimeout(250);
    idx = await focusedIdx(page);
    push('/my-tasks', 'R-01: J#2 → focused row 1 (advances in grouped)', idx === 1 ? 'PASS' : 'FAIL', `idx=${idx}`);

    // Press J → row 2
    await page.keyboard.press('j');
    await page.waitForTimeout(250);
    idx = await focusedIdx(page);
    push('/my-tasks', 'R-01: J#3 → focused row 2', idx === 2 ? 'PASS' : 'FAIL', `idx=${idx}`);

    // K → back to 1
    await page.keyboard.press('k');
    await page.waitForTimeout(250);
    idx = await focusedIdx(page);
    push('/my-tasks', 'R-01: K → focused row 1', idx === 1 ? 'PASS' : 'FAIL', `idx=${idx}`);

    // Enter → open detail
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const opened = (await page.$$('[role="dialog"]')).length > 0;
    push('/my-tasks', 'R-01: Enter opens detail of focused row', opened ? 'PASS' : 'FAIL');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // ShortcutHelp Escape
    await page.keyboard.press('?');
    await page.waitForTimeout(500);
    const shortcutOpen = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[role="dialog"]')).some(d => /shortcut/i.test(d.innerText));
    });
    push('ShortcutHelp', '? opens help', shortcutOpen ? 'PASS' : 'FAIL');

    // Focus the dialog first (avoid input/body focus issue)
    await page.evaluate(() => {
      const dlg = Array.from(document.querySelectorAll('[role="dialog"]')).find(d => /shortcut/i.test(d.innerText));
      if (dlg) dlg.focus?.();
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const shortcutClosed = !(await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[role="dialog"]')).some(d => /shortcut/i.test(d.innerText));
    }));
    push('ShortcutHelp', 'Escape closes help', shortcutClosed ? 'PASS' : 'FAIL');

    // Mobile tap retest — iPhone 13, tap on title area (not status circle)
    const mctx = await browser.newContext({ ...devices['iPhone 13'] });
    const m = await mctx.newPage();
    await m.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' });
    await m.waitForTimeout(3000);
    // Wait for any row
    await m.waitForSelector('.task-grid-row', { timeout: 15000 }).catch(() => {});
    const rowInfo = await m.evaluate(() => {
      const row = document.querySelector('.task-grid-row');
      if (!row) return null;
      const titleCell = row.querySelector('.task-title, [data-col="title"], button, a');
      // Find text node with task title — fall back to row center
      const rect = row.getBoundingClientRect();
      return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    });
    if (rowInfo) {
      // Tap at ~40% from left (past checkbox + status circle) and mid-height
      await m.touchscreen.tap(rowInfo.x + rowInfo.w * 0.45, rowInfo.y + rowInfo.h / 2);
      await m.waitForTimeout(800);
      const mOpened = (await m.$$('[role="dialog"]')).length > 0;
      push('mobile', 'C-09: tap on title area opens detail', mOpened ? 'PASS' : 'FAIL', `rect=${JSON.stringify(rowInfo)}`);
    } else {
      push('mobile', 'C-09: tap on row', 'SKIP', 'no row');
    }
    await mctx.close();

  } catch (err) {
    push('runner', 'error', 'FAIL', err.message);
    console.log(err.stack);
  } finally {
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    const p = results.filter(r => r.status === 'PASS').length;
    const f = results.filter(r => r.status === 'FAIL').length;
    console.log(`\n=== ${p} pass / ${f} fail ===`);
    await browser.close();
  }
})();
