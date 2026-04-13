const { chromium, devices } = require('playwright');
const path = require('path');
const OUTDIR = path.join(__dirname, 'screenshots');
const BASE = 'https://mn-ccore-lab.pages.dev';

(async () => {
  const browser = await chromium.launch();
  const iPhone = devices['iPhone 13'];
  const ctx = await browser.newContext({ ...iPhone });
  const page = await ctx.newPage();
  await page.goto(BASE + '/deadlines', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.setItem('mn-ccore-theme','dark'); } catch{} });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const info = await page.evaluate(() => {
    // find AlertTriangle svg, walk up to container
    const svgs = Array.from(document.querySelectorAll('svg'));
    const found = [];
    for (const svg of svgs) {
      const parent = svg.parentElement;
      if (!parent) continue;
      const classes = (parent.className || '').toString();
      if (!/rounded-lg|border/.test(classes)) continue;
      // check it has a pill (rounded-full) child
      const pill = parent.querySelector('.rounded-full');
      if (!pill) continue;
      const title = parent.querySelector('.truncate');
      const pr = parent.getBoundingClientRect();
      const svgR = svg.getBoundingClientRect();
      const titleR = title ? title.getBoundingClientRect() : null;
      const pillR = pill.getBoundingClientRect();
      found.push({
        parentClass: classes,
        parentRect: { l: Math.round(pr.left), r: Math.round(pr.right), w: Math.round(pr.width), h: Math.round(pr.height) },
        svgR: { l: Math.round(svgR.left), r: Math.round(svgR.right) },
        titleR: titleR ? { l: Math.round(titleR.left), r: Math.round(titleR.right), w: Math.round(titleR.width) } : null,
        titleText: title ? (title.innerText || '').slice(0, 60) : null,
        titleClass: title ? (title.className || '').toString() : null,
        pillR: { l: Math.round(pillR.left), r: Math.round(pillR.right), w: Math.round(pillR.width) },
        pillText: pill.innerText,
        overlap: titleR ? (titleR.right > pillR.left) : null,
        winW: window.innerWidth,
      });
    }
    return found;
  });
  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: path.join(OUTDIR, 'r2-deadlines-banner.png'), fullPage: false, clip: { x: 0, y: 0, width: 375, height: 400 } });
  await browser.close();
})();
