const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const res = {};
  await page.addInitScript(() => {
    try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch (e) {}
  });

  // Default then click compact button on /tasks
  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);

  // Try to find density buttons in DOM
  try {
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button'))
        .filter(b => /compact|default|relaxed|density/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + (b.innerText || '')))
        .map(b => ({ aria: b.getAttribute('aria-label'), title: b.title, text: (b.innerText || '').slice(0, 20) }));
    });
    res.densityButtons = buttons;
  } catch (e) { res.densityButtons = 'ERROR: ' + e.message; }

  // Read current row-height CSS var
  try {
    const cssVar = await page.evaluate(() => {
      const r = document.querySelector('[role="row"]');
      if (!r) return null;
      const cs = getComputedStyle(r);
      const root = getComputedStyle(document.documentElement);
      const docCs = getComputedStyle(document.body);
      return {
        rowHeight: cs.height,
        rowHeightVar: root.getPropertyValue('--row-height') || docCs.getPropertyValue('--row-height'),
        cellFontSize: root.getPropertyValue('--cell-font-size'),
      };
    });
    res.vars_default = cssVar;
  } catch (e) { res.vars_default = 'ERROR: ' + e.message; }

  // Set compact via localStorage keys used by hook, reload
  await page.evaluate(() => {
    // Try known localStorage keys
    localStorage.setItem('density', 'compact');
    localStorage.setItem('tableDensity', 'compact');
    localStorage.setItem('mn-ccore-density', 'compact');
    localStorage.setItem('table-density', 'compact');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  try {
    const cssVar = await page.evaluate(() => {
      const r = document.querySelector('[role="row"]');
      if (!r) return null;
      const cs = getComputedStyle(r);
      const root = getComputedStyle(document.documentElement);
      return {
        rowHeight: cs.height,
        rowHeightVar: root.getPropertyValue('--row-height'),
        cellFontSize: root.getPropertyValue('--cell-font-size'),
        bodyClasses: document.body.className,
      };
    });
    res.vars_compact = cssVar;
  } catch (e) { res.vars_compact = 'ERROR: ' + e.message; }
  await page.screenshot({ path: path.join(__dirname, 'tasks-compact-real.png'), fullPage: false });

  // Calc footer direct probe
  try {
    const footer = await page.evaluate(() => {
      // Search for text "X tasks • Y done" or similar pattern
      const all = Array.from(document.querySelectorAll('div, footer'));
      const match = all.find(el => {
        const t = el.innerText || '';
        return /\d+\s+tasks?/.test(t) && t.length < 200 && el.children.length < 15;
      });
      if (!match) return null;
      const cs = getComputedStyle(match);
      return { text: (match.innerText || '').slice(0, 150), bg: cs.backgroundColor, borderTop: cs.borderTopStyle + ' ' + cs.borderTopColor };
    });
    res.calcFooter = footer;
  } catch (e) { res.calcFooter = 'ERROR: ' + e.message; }

  // Deadlines real row probe
  await page.goto('https://mn-ccore-lab.pages.dev/deadlines', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);
  try {
    const dl = await page.evaluate(() => {
      // Deadlines uses TableContainer — grid rows
      const container = document.querySelector('.table-container');
      if (!container) return { err: 'no .table-container' };
      const rows = Array.from(container.querySelectorAll('[role="row"]'));
      return {
        count: rows.length,
        heights: rows.slice(0, 8).map(r => Math.round(r.getBoundingClientRect().height)),
      };
    });
    res.deadlines = dl;
  } catch (e) { res.deadlines = 'ERROR: ' + e.message; }

  await page.screenshot({ path: path.join(__dirname, 'deadlines-default.png'), fullPage: false });

  console.log(JSON.stringify(res, null, 2));
  await browser.close();
})();
