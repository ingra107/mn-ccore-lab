const { chromium } = require('playwright');
const fs = require('fs');

function wcag(rgba1, rgba2) {
  // rgba as [r,g,b]
  const lum = ([r, g, b]) => {
    const ch = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [L1, L2] = [lum(rgba1), lum(rgba2)].sort((a, b) => b - a);
  return ((L1 + 0.05) / (L2 + 0.05)).toFixed(2);
}
function parseRgb(s) {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map(x => parseFloat(x.trim()));
  return parts.slice(0, 3);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const results = {};

  const probe = async (route, theme, label) => {
    await page.goto('https://mn-ccore-lab.pages.dev' + route, { waitUntil: 'domcontentloaded' });
    await page.evaluate(t => {
      localStorage.setItem('mn-ccore-theme', t);
      document.documentElement.classList.toggle('dark', t === 'dark');
    }, theme);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    return await page.evaluate(() => {
      const grab = (sel, n = 0) => {
        const els = document.querySelectorAll(sel);
        const el = els[n];
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          sel,
          nth: n,
          count: els.length,
          bg: cs.backgroundColor,
          color: cs.color,
          border: cs.borderColor || cs.borderTopColor,
          boxShadow: cs.boxShadow.slice(0, 120),
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          opacity: cs.opacity,
        };
      };
      const body = getComputedStyle(document.body);
      return {
        body: { bg: body.backgroundColor, color: body.color },
        sidebar: grab('aside'),
        pageContent: grab('main'),
        card: grab('[class*="Card"], [class*="card"]', 0),
        tableRow: grab('table tbody tr, [role="row"]', 1),
        tableHeader: grab('thead th, [role="columnheader"]', 0),
        badge: grab('[class*="badge" i], [class*="pill" i]', 0),
        button: grab('button', 2),
        muted: grab('[class*="muted" i], [class*="label" i]', 0),
        input: grab('input[type="text"], input[type="search"]', 0),
      };
    });
  };

  results.tasks_light = await probe('/my-tasks', 'light', 'my-tasks-light');
  results.tasks_dark = await probe('/my-tasks', 'dark', 'my-tasks-dark');
  results.deadlines_light = await probe('/deadlines', 'light', 'deadlines-light');
  results.deadlines_dark = await probe('/deadlines', 'dark', 'deadlines-dark');
  results.publications_light = await probe('/publications', 'light', 'pubs-light');
  results.dashboard_light = await probe('/dashboard', 'light', 'dash-light');
  results.dashboard_dark = await probe('/dashboard', 'dark', 'dash-dark');

  // Contrast calcs
  for (const [k, v] of Object.entries(results)) {
    if (v && v.body) {
      const bg = parseRgb(v.body.bg);
      const fg = parseRgb(v.body.color);
      if (bg && fg) v.body.contrast = wcag(bg, fg);
    }
  }

  fs.writeFileSync(require('path').join(__dirname, 'screenshots', '_probe.json'), JSON.stringify(results, null, 2));
  await browser.close();
})();
