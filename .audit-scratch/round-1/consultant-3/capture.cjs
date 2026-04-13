const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const BASE = 'https://mn-ccore-lab.pages.dev';

const PAGES = [
  { path: '/my-tasks', name: 'my-tasks' },
  { path: '/projects', name: 'projects' },
  { path: '/manuscripts', name: 'manuscripts' },
  { path: '/deadlines', name: 'deadlines' },
  { path: '/grants', name: 'grants' },
  { path: '/meetings', name: 'meetings' },
  { path: '/analytics', name: 'analytics' },
  { path: '/settings', name: 'settings' },
  { path: '/ideas', name: 'ideas' },
  { path: '/decisions', name: 'decisions' },
];

const DENSITIES = ['default', 'compact'];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

  // Prime localStorage once
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('mn-ccore-theme', 'dark');
    localStorage.setItem('hub-welcome-dismissed', 'true');
    localStorage.setItem('hub-signin-banner-dismissed', 'true');
  });

  const results = [];

  for (const density of DENSITIES) {
    await page.evaluate((d) => localStorage.setItem('hub-table-density', d), density);
    for (const p of PAGES) {
      try {
        await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(800);
        const file = path.join(OUT, `${p.name}-${density}.png`);
        await page.screenshot({ path: file, fullPage: false });

        // Measure row heights and column widths
        const metrics = await page.evaluate(() => {
          const tc = document.querySelector('.table-container');
          if (!tc) return { hasTable: false };
          const rows = tc.querySelectorAll('[role="row"], .task-row, .grid, [style*="grid-template-columns"]');
          const firstRow = tc.querySelector('[style*="grid-template-columns"]');
          const gtc = firstRow ? getComputedStyle(firstRow).gridTemplateColumns : null;
          const rowHeight = firstRow ? firstRow.getBoundingClientRect().height : null;
          const rowVar = getComputedStyle(document.documentElement).getPropertyValue('--row-height');
          const cellFont = getComputedStyle(document.documentElement).getPropertyValue('--cell-font-size');
          // Count visible rows
          const allRows = tc.querySelectorAll('[style*="grid-template-columns"]');
          return { hasTable: true, gtc, rowHeight, rowVar: rowVar.trim(), cellFont: cellFont.trim(), rowCount: allRows.length };
        });
        results.push({ page: p.name, density, metrics });
        console.log(`OK ${p.name} ${density}`, JSON.stringify(metrics));
      } catch (e) {
        console.log(`FAIL ${p.name} ${density}:`, e.message);
        results.push({ page: p.name, density, error: e.message });
      }
    }
  }

  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(results, null, 2));
  await browser.close();
})();
