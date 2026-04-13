// Consultant 3 Round 2 — data density probe
const { chromium } = require('playwright');
const path = require('path');

const SITE = 'https://mn-ccore-lab.pages.dev';
const OUT = __dirname;

const PAGES = [
  { slug: 'my-tasks', path: '/my-tasks' },
  { slug: 'projects', path: '/projects' },
  { slug: 'manuscripts', path: '/manuscripts' },
  { slug: 'deadlines', path: '/deadlines' },
  { slug: 'grants', path: '/grants' },
  { slug: 'ideas', path: '/ideas' },
  { slug: 'decisions', path: '/decisions' },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  const results = {};

  await page.addInitScript(() => {
    try {
      localStorage.setItem('mn-ccore-theme', 'dark');
      localStorage.setItem('table-density', 'default');
    } catch (e) {}
  });

  // --- Tasks: H-01 title vs row-cell typography comparison ---
  await page.goto(`${SITE}/tasks`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);
  try {
    const title = page.locator('[data-testid^="task-title-"]').first();
    await title.waitFor({ state: 'visible', timeout: 10000 });
    const titleStyle = await title.evaluate(el => {
      const cs = getComputedStyle(el);
      return { fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color, letterSpacing: cs.letterSpacing };
    });
    const row = await page.evaluate(() => {
      const title = document.querySelector('[data-testid^="task-title-"]');
      if (!title) return null;
      const row = title.closest('[role="row"]');
      if (!row) return null;
      const cs = getComputedStyle(row);
      const cells = Array.from(row.querySelectorAll('[role="gridcell"]')).slice(0, 6).map(c => {
        const ccs = getComputedStyle(c);
        return { text: (c.innerText || '').slice(0, 25), fontSize: ccs.fontSize, fontWeight: ccs.fontWeight, opacity: ccs.opacity };
      });
      return { rowHeight: cs.height, rowLineHeight: cs.lineHeight, cells };
    });
    results.H01_title = titleStyle;
    results.H01_row = row;
  } catch (e) { results.H01_title = 'ERROR: ' + e.message; }

  // --- Calculations footer check ---
  try {
    const footer = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('div'));
      const match = els.find(el => /tasks?\s*(•|·)/i.test(el.innerText || '') && el.children.length < 12 && el.offsetHeight < 50);
      if (!match) return null;
      const cs = getComputedStyle(match);
      return { text: (match.innerText || '').slice(0, 80), bg: cs.backgroundColor, borderTop: cs.borderTop };
    });
    results.calcFooter = footer;
  } catch (e) { results.calcFooter = 'ERROR: ' + e.message; }

  await page.screenshot({ path: path.join(OUT, 'tasks-default.png'), fullPage: false });

  // Compact density variant
  await page.evaluate(() => localStorage.setItem('table-density', 'compact'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  try {
    const compactRow = await page.evaluate(() => {
      const row = document.querySelector('[data-testid^="task-title-"]')?.closest('[role="row"]');
      if (!row) return null;
      return { height: getComputedStyle(row).height };
    });
    results.H01_row_compact = compactRow;
  } catch (e) { results.H01_row_compact = 'ERROR: ' + e.message; }
  await page.screenshot({ path: path.join(OUT, 'tasks-compact.png'), fullPage: false });

  // Reset to default density
  await page.evaluate(() => localStorage.setItem('table-density', 'default'));

  // --- Per-page row-height probes ---
  for (const p of PAGES) {
    await page.goto(`${SITE}${p.path}`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);
    try {
      const probe = await page.evaluate(() => {
        const selectors = [
          '[role="row"][aria-rowindex]',
          '[role="row"]',
          '.project-list-row',
          '.manuscript-list-row',
          '.table-container > div',
        ];
        for (const sel of selectors) {
          const rows = document.querySelectorAll(sel);
          if (rows.length >= 2) {
            // skip header
            const sample = Array.from(rows).slice(0, 6);
            const heights = sample.map(r => Math.round(r.getBoundingClientRect().height));
            const first = sample[1] || sample[0];
            const cs = getComputedStyle(first);
            return { selector: sel, count: rows.length, heights, lineHeight: cs.lineHeight, boxSizing: cs.boxSizing };
          }
        }
        return null;
      });
      results[p.slug] = probe;
    } catch (e) { results[p.slug] = 'ERROR: ' + e.message; }
    await page.screenshot({ path: path.join(OUT, `${p.slug}-default.png`), fullPage: false });
  }

  // --- Grants STATUS column sort verify ---
  await page.goto(`${SITE}/grants`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);
  try {
    const statusHeader = await page.evaluate(() => {
      const headers = Array.from(document.querySelectorAll('[role="columnheader"], button'));
      const match = headers.find(h => /^STATUS$/i.test((h.innerText || '').trim()));
      if (!match) return null;
      return { text: match.innerText, ariaSort: match.getAttribute('aria-sort') };
    });
    results.grantsStatusHeader = statusHeader;
  } catch (e) { results.grantsStatusHeader = 'ERROR: ' + e.message; }

  // --- Decisions page row density visual ---
  await page.goto(`${SITE}/decisions`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);
  try {
    const decisionsProbe = await page.evaluate(() => {
      const container = document.querySelector('.table-container');
      if (!container) return null;
      const rows = Array.from(container.querySelectorAll('[role="row"]')).slice(0, 6);
      return rows.map(r => ({
        aria: r.getAttribute('aria-rowindex'),
        h: Math.round(r.getBoundingClientRect().height),
      }));
    });
    results.decisionsRows = decisionsProbe;
  } catch (e) { results.decisionsRows = 'ERROR: ' + e.message; }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
