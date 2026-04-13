// Residual checks: ShortcutHelp Escape + mobile tap with scroll
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://mn-ccore-lab.pages.dev';
const OUT = path.join(__dirname, '03-results.json');
const results = [];
const push = (a, t, s, n = '') => { results.push({ area: a, test: t, status: s, notes: n }); console.log(`[${s}] ${a} :: ${t}${n ? ' — ' + n : ''}`); };

(async () => {
  const browser = await chromium.launch({ headless: true });

  // === ShortcutHelp ===
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Use Shift+/ (the "?" sequence) — but simpler: open via the Press F tooltip if exists, else fire via keyboard
  await page.keyboard.down('Shift');
  await page.keyboard.press('Slash');
  await page.keyboard.up('Shift');
  await page.waitForTimeout(700);
  let shortcutOpen = await page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"]')).some(d => /Keyboard Shortcuts|shortcut/i.test(d.innerText)));
  push('ShortcutHelp', '? opens help (retry via Shift+Slash)', shortcutOpen ? 'PASS' : 'FAIL');

  if (shortcutOpen) {
    // Press Escape directly
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    const stillOpen = await page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"]')).some(d => /Keyboard Shortcuts|shortcut/i.test(d.innerText)));
    push('ShortcutHelp', 'Escape closes help', !stillOpen ? 'PASS' : 'FAIL', `stillOpen=${stillOpen}`);
  }
  await ctx.close();

  // === Mobile tap (iPhone 13) ===
  const mctx = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true });
  const m = await mctx.newPage();
  await m.goto(`${BASE}/my-tasks`, { waitUntil: 'networkidle' });
  await m.waitForTimeout(3500);
  // Scroll page down a bit to ensure list is in viewport
  await m.evaluate(() => window.scrollTo(0, 200));
  await m.waitForTimeout(500);

  const rowInfo = await m.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.task-grid-row'));
    // find first row that's within viewport
    for (const r of rows) {
      const rect = r.getBoundingClientRect();
      if (rect.y >= 0 && rect.y < window.innerHeight - 30 && rect.width > 0) {
        return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
      }
    }
    return null;
  });

  if (rowInfo) {
    // Tap ~ 50% across, vertical center
    const tx = rowInfo.x + rowInfo.w * 0.55;
    const ty = rowInfo.y + rowInfo.h / 2;
    await m.touchscreen.tap(tx, ty);
    await m.waitForTimeout(800);
    const opened = (await m.$$('[role="dialog"]')).length > 0;
    push('mobile', 'C-09: tap on title opens detail', opened ? 'PASS' : 'FAIL', `at=(${Math.round(tx)},${Math.round(ty)}) rect=${JSON.stringify(rowInfo)}`);
  } else {
    push('mobile', 'C-09: tap on title opens detail', 'SKIP', 'no in-viewport row');
  }
  await mctx.close();

  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  const p = results.filter(r => r.status === 'PASS').length;
  const f = results.filter(r => r.status === 'FAIL').length;
  console.log(`\n=== ${p} pass / ${f} fail ===`);
  await browser.close();
})();
