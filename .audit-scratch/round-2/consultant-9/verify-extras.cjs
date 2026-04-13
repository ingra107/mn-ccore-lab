const { chromium, devices } = require('playwright');
const path = require('path');
const OUTDIR = path.join(__dirname, 'screenshots');
const BASE = 'https://mn-ccore-lab.pages.dev';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.setItem('mn-ccore-theme','dark'); } catch{} });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // 1) tap hamburger, screenshot mobile menu
  const hamburger = await page.$('button[aria-label*="menu" i], button[aria-label*="navigation" i], header button:first-of-type');
  if (hamburger) {
    await hamburger.tap().catch(()=>{});
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUTDIR, 'r2-mobile-menu-open.png'), fullPage: false });
    // check overlay
    const overlay = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('nav, aside, [role="dialog"]'));
      for (const el of all) {
        const cs = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (cs.position === 'fixed' && rect.width > 200 && rect.height > 400) {
          return { tag: el.tagName, cls: (el.className||'').toString().slice(0,80), w: Math.round(rect.width), h: Math.round(rect.height), left: Math.round(rect.left) };
        }
      }
      return null;
    });
    console.log('menu overlay:', JSON.stringify(overlay));
  }

  // 2) Open quick capture (tap + Task button)
  await page.goto(BASE + '/my-tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const newTask = await page.$('button:has-text("New"), button[aria-label*="new" i]');
  if (newTask) {
    await newTask.tap().catch(()=>{});
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUTDIR, 'r2-create-task-modal.png'), fullPage: false });
    const modal = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      if (!d) return null;
      const rect = d.getBoundingClientRect();
      const cs = window.getComputedStyle(d);
      return { w: Math.round(rect.width), h: Math.round(rect.height), top: Math.round(rect.top), left: Math.round(rect.left), maxW: cs.maxWidth, bg: cs.background.slice(0,40) };
    });
    console.log('task modal:', JSON.stringify(modal));
  }

  // 3) Landscape orientation
  await ctx.close();
  const ctxL = await browser.newContext({
    viewport: { width: 844, height: 390 }, // iPhone 13 landscape
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0)',
    deviceScaleFactor: 3,
    isMobile: true, hasTouch: true,
  });
  const pL = await ctxL.newPage();
  await pL.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await pL.evaluate(() => { try { localStorage.setItem('mn-ccore-theme','dark'); } catch{} });
  await pL.reload({ waitUntil: 'domcontentloaded' });
  await pL.waitForTimeout(2500);
  await pL.screenshot({ path: path.join(OUTDIR, 'r2-landscape-dashboard.png'), fullPage: false });

  await browser.close();
})();
