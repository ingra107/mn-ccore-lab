// Round 2 DOM probe — verify CalculationsRow footer token + global rules
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const results = {};

  async function probeMyTasks(theme) {
    await page.goto('https://mn-ccore-lab.pages.dev/my-tasks', { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(t => {
      localStorage.setItem('mn-ccore-theme', t);
      document.documentElement.classList.toggle('dark', t === 'dark');
    }, theme);
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    // Scroll to bottom of task grid
    await page.evaluate(() => {
      const tc = document.querySelector('.table-container');
      if (tc) tc.scrollTop = tc.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(500);

    const data = await page.evaluate(() => {
      const out = {};
      // Find calculations row: last row in table-container after tbody or a div with borderTop
      const candidates = Array.from(document.querySelectorAll('.table-container > div, .table-container div'))
        .filter(el => {
          const st = getComputedStyle(el);
          return st.borderTopWidth && parseFloat(st.borderTopWidth) > 0 && el.textContent.match(/total|complete|progress/i);
        });
      const calcRow = candidates[candidates.length - 1] || null;
      if (calcRow) {
        const st = getComputedStyle(calcRow);
        out.calcRow = {
          background: st.backgroundColor,
          borderTop: st.borderTopColor,
          text: calcRow.textContent.slice(0, 120),
        };
      } else {
        out.calcRow = null;
      }

      // CSS variable values
      const root = getComputedStyle(document.documentElement);
      out.vars = {
        'surface-1': root.getPropertyValue('--surface-1').trim(),
        'surface-2': root.getPropertyValue('--surface-2').trim(),
        'teal-hover': root.getPropertyValue('--teal-hover').trim(),
        'border-subtle': root.getPropertyValue('--border-subtle').trim(),
      };

      // Check personal-grid global rule applied
      const pg = document.querySelector('.personal-grid');
      if (pg && pg.firstElementChild) {
        out.personalGridChildMinWidth = getComputedStyle(pg.firstElementChild).minWidth;
      }

      // Row heights
      const rows = Array.from(document.querySelectorAll('.table-container [role="row"]')).slice(1, 4);
      out.rowHeights = rows.map(r => getComputedStyle(r).height);

      return out;
    });
    return data;
  }

  for (const theme of ['light', 'dark']) {
    try {
      results[theme] = await probeMyTasks(theme);
      await page.screenshot({
        path: `C:/Users/ingra/mn-ccore-lab/.audit-scratch/round-2/consultant-2/screenshots/my-tasks-${theme}.png`,
        fullPage: true,
      });
    } catch (e) {
      results[theme] = { error: e.message };
    }
  }

  // Personal page probe
  async function probePersonal(theme) {
    await page.goto('https://mn-ccore-lab.pages.dev/personal', { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(t => {
      localStorage.setItem('mn-ccore-theme', t);
      document.documentElement.classList.toggle('dark', t === 'dark');
    }, theme);
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    return await page.evaluate(() => {
      const pg = document.querySelector('.personal-grid');
      if (!pg) return { found: false };
      const kids = Array.from(pg.children).map(c => ({
        minWidth: getComputedStyle(c).minWidth,
        scrollWidth: c.scrollWidth,
        clientWidth: c.clientWidth,
        overflows: c.scrollWidth > c.clientWidth,
      }));
      return { found: true, kids };
    });
  }

  for (const theme of ['light', 'dark']) {
    try {
      results[`personal-${theme}`] = await probePersonal(theme);
    } catch (e) {
      results[`personal-${theme}`] = { error: e.message };
    }
  }

  fs.writeFileSync(
    'C:/Users/ingra/mn-ccore-lab/.audit-scratch/round-2/consultant-2/probe-results.json',
    JSON.stringify(results, null, 2)
  );
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
