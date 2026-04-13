// Consultant 7 — fellow perspective, Round 2 verify
const { chromium, devices } = require('playwright');

const BASE = 'https://mn-ccore-lab.pages.dev';
const PATHS = ['/', '/dashboard', '/tasks', '/my-tasks', '/personal', '/projects', '/meetings'];

async function audit(label, contextOptions) {
  const browser = await chromium.launch();
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const results = { label, pages: {}, console: [] };
  page.on('pageerror', e => results.console.push({ t: 'pageerror', msg: e.message }));
  page.on('console', m => { if (m.type() === 'error') results.console.push({ t: 'console', msg: m.text() }); });

  for (const p of PATHS) {
    const url = BASE + p;
    const pageData = { url };
    try {
      const t0 = Date.now();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1200);
      pageData.load_ms = Date.now() - t0;

      // Overflow check — widest descendant
      const overflow = await page.evaluate(() => {
        const vw = window.innerWidth;
        let max = 0, el = null;
        document.querySelectorAll('*').forEach(n => {
          const r = n.getBoundingClientRect();
          if (r.right > max) { max = r.right; el = n.tagName + (n.className && typeof n.className === 'string' ? '.' + n.className.split(' ').slice(0,2).join('.') : ''); }
        });
        return { vw, max: Math.round(max), widest: el, overflow: max > vw + 2 };
      });
      pageData.overflow = overflow;

      // Touch target audit
      const controls = await page.evaluate(() => {
        const sel = 'button, select, a, input, [role="button"], .filter-chip, .inline-link';
        const all = Array.from(document.querySelectorAll(sel));
        let total = 0, under44 = 0, min = 9999;
        for (const c of all) {
          const r = c.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          total++;
          const d = Math.min(r.width, r.height);
          if (d < min) min = d;
          if (d < 44) under44++;
        }
        return { total, under44, min: Math.round(min) };
      });
      pageData.controls = controls;

      // WelcomeBanner lines (dashboard only)
      if (p === '/dashboard' || p === '/') {
        pageData.welcomeBanner = await page.evaluate(() => {
          const b = document.querySelector('[class*="welcome" i], [class*="WelcomeBanner" i]');
          if (!b) return null;
          const r = b.getBoundingClientRect();
          const style = getComputedStyle(b);
          const lineH = parseFloat(style.lineHeight) || 20;
          return { height: Math.round(r.height), lines: Math.round(r.height / lineH), width: Math.round(r.width) };
        });
      }

      // Screenshot
      await page.screenshot({ path: `.audit-scratch/round-2/consultant-7/${label}-${p.replace(/\//g,'_') || 'home'}.png`, fullPage: false });
    } catch (e) {
      pageData.error = e.message;
    }
    results.pages[p] = pageData;
  }

  await browser.close();
  return results;
}

(async () => {
  const desktop = await audit('desktop', { viewport: { width: 1440, height: 900 } });
  const mobile = await audit('mobile', { ...devices['iPhone 13'] });
  console.log(JSON.stringify({ desktop, mobile }, null, 2));
})();
