const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch(e){} });
  await page.goto('https://mn-ccore-lab.pages.dev/dashboard', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2500);
  const strata = await page.evaluate(() => {
    // Walk deeper to find actual vertical strata
    const main = document.querySelector('main') || document.body;
    const out = [];
    function walk(el, depth=0) {
      if (depth > 4) return;
      for (const c of el.children) {
        const r = c.getBoundingClientRect();
        if (r.height > 8 && r.top < 950) {
          out.push({
            depth,
            tag: c.tagName,
            cls: (c.className.toString ? c.className.toString() : '').slice(0, 80),
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
            h: Math.round(r.height),
            text: (c.innerText || '').slice(0, 50).replace(/\n/g, ' | ')
          });
          if (c.children.length > 0 && c.children.length <= 8) walk(c, depth+1);
        }
      }
    }
    walk(main);
    return out;
  });
  console.log(JSON.stringify(strata, null, 2));
  await browser.close();
})();
