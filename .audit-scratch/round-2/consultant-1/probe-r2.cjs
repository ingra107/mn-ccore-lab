// Round 2 verification probe — H-01 title + Dashboard strata + Settings
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const results = {};

  // Force dark theme
  await page.addInitScript(() => {
    try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch(e){}
  });

  // --- 1. H-01: TaskGridView title typography on /tasks ---
  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);
  try {
    const title = await page.locator('[data-testid^="task-title-"]').first();
    await title.waitFor({ state: 'visible', timeout: 10000 });
    const titleStyle = await title.evaluate(el => {
      const cs = getComputedStyle(el);
      return {
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        color: cs.color,
        letterSpacing: cs.letterSpacing,
        lineHeight: cs.lineHeight
      };
    });
    results.H01_title = titleStyle;
    // Compare to a metadata cell in same row
    const row = await title.locator('xpath=ancestor::*[@role="row"][1]').first();
    const cellStyles = await row.evaluate(r => {
      const cells = Array.from(r.querySelectorAll('[role="gridcell"]'));
      return cells.slice(0, 6).map(c => {
        const cs = getComputedStyle(c);
        return { text: c.innerText.slice(0, 30), fontSize: cs.fontSize, fontWeight: cs.fontWeight, opacity: cs.opacity };
      });
    });
    results.H01_rowCells = cellStyles;
  } catch (e) {
    results.H01_title = 'ERROR: ' + e.message;
  }

  // --- 2. Dashboard strata count above first card row ---
  await page.goto('https://mn-ccore-lab.pages.dev/dashboard', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);
  try {
    // Find first .grid element inside <main>
    const layout = await page.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      const rect = main.getBoundingClientRect();
      // Walk direct children of main's first content wrapper
      const firstGrid = main.querySelector('.grid');
      const gridTop = firstGrid ? firstGrid.getBoundingClientRect().top : null;
      const directChildren = Array.from(main.querySelectorAll(':scope > *, :scope > * > *')).slice(0, 20).map(el => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, cls: el.className.toString().slice(0,60), top: Math.round(r.top), height: Math.round(r.height) };
      });
      return { mainTop: Math.round(rect.top), firstGridTop: gridTop ? Math.round(gridTop) : null, directChildren };
    });
    results.dashboardStrata = layout;
  } catch (e) {
    results.dashboardStrata = 'ERROR: ' + e.message;
  }
  await page.screenshot({ path: require('path').join(__dirname, 'dashboard-dark.png'), fullPage: false });

  // --- 3. Settings team directory link ---
  await page.goto('https://mn-ccore-lab.pages.dev/settings', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);
  try {
    const teamLink = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('a, button'));
      const matches = all.filter(el => /team directory|team roster|manage team|view team/i.test(el.innerText || ''));
      return matches.map(el => ({ tag: el.tagName, href: el.getAttribute('href') || null, text: (el.innerText || '').slice(0, 60) }));
    });
    results.settingsTeamLink = teamLink;
  } catch (e) {
    results.settingsTeamLink = 'ERROR: ' + e.message;
  }
  await page.screenshot({ path: require('path').join(__dirname, 'settings-dark.png'), fullPage: true });

  // --- 4. Calculations footer background check ---
  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(1500);
  try {
    const footer = await page.evaluate(() => {
      // Look for calculations footer (count row)
      const els = Array.from(document.querySelectorAll('*'));
      const match = els.find(el => /\d+\s*tasks?\s*(•|·)/i.test(el.innerText || '') && el.children.length < 10);
      if (!match) return null;
      const cs = getComputedStyle(match);
      return { text: match.innerText.slice(0, 80), bg: cs.backgroundColor, color: cs.color };
    });
    results.calculationsFooter = footer;
  } catch (e) {
    results.calculationsFooter = 'ERROR: ' + e.message;
  }

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
