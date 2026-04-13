const { chromium, devices } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();

  // Projects overflow detail
  await page.goto('https://mn-ccore-lab.pages.dev/projects', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const overflowDetail = await page.evaluate(() => {
    const vw = window.innerWidth;
    const bad = [];
    document.querySelectorAll('*').forEach(n => {
      const r = n.getBoundingClientRect();
      if (r.right > vw + 2 && r.width < vw * 3) {
        bad.push({
          tag: n.tagName,
          cls: (typeof n.className === 'string' ? n.className : '').slice(0, 80),
          text: (n.textContent || '').trim().slice(0, 40),
          right: Math.round(r.right),
          width: Math.round(r.width),
          left: Math.round(r.left)
        });
      }
    });
    return bad.slice(0, 15);
  });
  console.log('PROJECTS OVERFLOW:', JSON.stringify(overflowDetail, null, 2));

  // Dashboard welcome banner
  await page.goto('https://mn-ccore-lab.pages.dev/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const banner = await page.evaluate(() => {
    // Search for "good morning" or "welcome" text nodes
    const candidates = [];
    document.querySelectorAll('h1, h2, h3, div').forEach(n => {
      const t = (n.textContent || '').toLowerCase();
      if ((t.includes('morning') || t.includes('afternoon') || t.includes('evening') || t.includes('welcome')) && t.length < 200) {
        const r = n.getBoundingClientRect();
        const ch = n.children.length;
        candidates.push({ tag: n.tagName, text: n.textContent.trim().slice(0, 100), h: Math.round(r.height), w: Math.round(r.width), children: ch });
      }
    });
    return candidates.slice(0, 5);
  });
  console.log('\nWELCOME BANNER:', JSON.stringify(banner, null, 2));

  // Home page "circle" element
  await page.goto('https://mn-ccore-lab.pages.dev/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const circleIssue = await page.evaluate(() => {
    const vw = window.innerWidth;
    const bad = [];
    document.querySelectorAll('circle, svg, [class*="hero"]').forEach(n => {
      const r = n.getBoundingClientRect();
      if (r.right > vw + 2) {
        bad.push({ tag: n.tagName, cls: (typeof n.className === 'string' ? n.className : n.className?.baseVal || '').slice(0, 60), right: Math.round(r.right), w: Math.round(r.width) });
      }
    });
    return bad.slice(0, 5);
  });
  console.log('\nHOME CIRCLE:', JSON.stringify(circleIssue, null, 2));

  await browser.close();
})();
