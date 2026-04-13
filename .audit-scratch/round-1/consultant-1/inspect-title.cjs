const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('https://mn-ccore-lab.pages.dev/dashboard');
  await page.evaluate(() => localStorage.setItem('mn-ccore-theme', 'dark'));
  await page.goto('https://mn-ccore-lab.pages.dev/tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Find first task title and read its computed style
  const titleStyle = await page.evaluate(() => {
    const el = document.querySelector('[data-testid^="task-title-"]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color, lineHeight: cs.lineHeight };
  });
  console.log('Task title computed:', JSON.stringify(titleStyle));

  // Also check a metadata cell color/size in same row
  const metaStyle = await page.evaluate(() => {
    const rows = document.querySelectorAll('.task-grid-row');
    if (!rows.length) return null;
    const projectCell = rows[0].querySelectorAll('div, span');
    // try to find smaller metadata
    let result = [];
    rows[0].querySelectorAll('span').forEach((s) => {
      const cs = getComputedStyle(s);
      if (parseFloat(cs.fontSize) <= 13 && s.textContent && s.textContent.trim().length < 30) {
        result.push({ text: s.textContent.trim().slice(0, 25), fontSize: cs.fontSize, fontWeight: cs.fontWeight, opacity: cs.opacity });
      }
    });
    return result.slice(0, 8);
  });
  console.log('Row spans:', JSON.stringify(metaStyle, null, 2));

  await browser.close();
})();
