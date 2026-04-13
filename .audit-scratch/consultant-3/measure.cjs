const { chromium } = require('playwright');

const BASE = 'https://mn-ccore-lab.pages.dev';
const PAGES = [
  { path: '/my-tasks', name: 'my-tasks', rowSel: '.task-grid-row' },
  { path: '/projects', name: 'projects', rowSel: '.project-list-row' },
  { path: '/manuscripts', name: 'manuscripts', rowSel: '.manuscript-list-row' },
  { path: '/deadlines', name: 'deadlines', rowSel: null },
  { path: '/grants', name: 'grants', rowSel: null },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('mn-ccore-theme', 'dark');
    localStorage.setItem('hub-signin-banner-dismissed', 'true');
    localStorage.setItem('hub-welcome-dismissed', 'true');
  });

  for (const density of ['default', 'compact', 'relaxed']) {
    await page.evaluate((d) => localStorage.setItem('hub-table-density', d), density);
    console.log('\n=== DENSITY:', density, '===');
    for (const p of PAGES) {
      await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(700);
      const data = await page.evaluate((sel) => {
        const rh = getComputedStyle(document.documentElement).getPropertyValue('--row-height').trim();
        const rpy = getComputedStyle(document.documentElement).getPropertyValue('--row-padding-y').trim();
        const cfs = getComputedStyle(document.documentElement).getPropertyValue('--cell-font-size').trim();
        // Look for density class wrappers
        const wrappers = document.querySelectorAll('.density-compact, .density-relaxed');
        const wrapperRH = wrappers.length ? getComputedStyle(wrappers[0]).getPropertyValue('--row-height').trim() : 'no-wrapper';
        // Measure first visible row
        let rowH = null;
        if (sel) {
          const row = document.querySelector(sel);
          if (row) rowH = row.getBoundingClientRect().height;
        } else {
          // fallback: find first grid-template-columns element in table-container
          const tc = document.querySelector('.table-container');
          if (tc) {
            const rows = Array.from(tc.querySelectorAll('[style*="grid-template-columns"]'));
            // skip header
            if (rows.length > 1) rowH = rows[1].getBoundingClientRect().height;
          }
        }
        return { rh, rpy, cfs, wrapperRH, rowH };
      }, p.rowSel);
      console.log(`  ${p.name}:`, JSON.stringify(data));
    }
  }
  await browser.close();
})();
