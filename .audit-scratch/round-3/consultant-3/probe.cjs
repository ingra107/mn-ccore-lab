// DOM probe: measure row heights on all data pages across 3 density modes
const { chromium } = require('playwright');

const BASE = 'https://mn-ccore-lab.pages.dev';
const DENSITIES = ['compact', 'default', 'relaxed'];
const EXPECTED = { compact: 36, default: 44, relaxed: 52 };

const PAGES = [
  { slug: 'tasks', url: '/tasks', rowSel: '.table-container [role="row"]:not([aria-rowindex="1"])' },
  { slug: 'my-tasks', url: '/my-tasks', rowSel: '.table-container [role="row"]:not([aria-rowindex="1"])' },
  { slug: 'projects', url: '/projects', rowSel: '.project-list-row' },
  { slug: 'manuscripts', url: '/manuscripts', rowSel: '.manuscript-list-row' },
  { slug: 'deadlines', url: '/deadlines', rowSel: '.deadline-list-row' },
  { slug: 'ideas', url: '/ideas', rowSel: '.table-container [role="row"]:not([aria-rowindex="1"])' },
  { slug: 'decisions', url: '/decisions', rowSel: '.table-container [role="row"]:not([aria-rowindex="1"])' },
  { slug: 'grants', url: '/grants', rowSel: '.table-container [role="row"]:not([aria-rowindex="1"])' },
];

async function measure(page, selector) {
  return page.evaluate((sel) => {
    const rows = Array.from(document.querySelectorAll(sel));
    if (!rows.length) return { count: 0, heights: [] };
    const heights = rows.slice(0, 15).map(r => Math.round(r.getBoundingClientRect().height));
    return { count: rows.length, heights };
  }, selector);
}

async function setDensity(page, density) {
  // Cycle density button (3 modes: compact, default, relaxed)
  await page.evaluate((target) => {
    localStorage.setItem('hub-table-density', target);
  }, density);
}

async function checkAriaSort(page) {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button.col-header, [role="columnheader"]'));
    const results = buttons.map(b => ({
      label: (b.textContent || '').trim().slice(0, 30),
      ariaSort: b.getAttribute('aria-sort') || b.querySelector('[aria-sort]')?.getAttribute('aria-sort') || 'MISSING',
      role: b.getAttribute('role') || b.tagName.toLowerCase(),
    }));
    return results;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const out = { generated: new Date().toISOString(), pages: {} };

  for (const p of PAGES) {
    out.pages[p.slug] = { modes: {}, ariaSort: [] };
    for (const density of DENSITIES) {
      try {
        await page.goto(BASE + p.url, { waitUntil: 'networkidle', timeout: 30000 });
        await setDensity(page, density);
        await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(800);
        const m = await measure(page, p.rowSel);
        out.pages[p.slug].modes[density] = {
          expected: EXPECTED[density],
          ...m,
          uniform: m.heights.length ? m.heights.every(h => h === m.heights[0]) : null,
          onTarget: m.heights.length ? m.heights.every(h => h === EXPECTED[density]) : null,
        };
      } catch (err) {
        out.pages[p.slug].modes[density] = { error: String(err).slice(0, 200) };
      }
    }
    // Aria-sort check (done once per page, at default density)
    try {
      out.pages[p.slug].ariaSort = await checkAriaSort(page);
    } catch (err) {
      out.pages[p.slug].ariaSort = [{ error: String(err).slice(0, 200) }];
    }
  }

  const fs = require('fs');
  fs.writeFileSync(
    require('path').join(__dirname, 'metrics.json'),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
