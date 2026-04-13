const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTDIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

const BASE = 'https://mn-ccore-lab.pages.dev';

const portalPages = [
  '/dashboard', '/my-tasks', '/personal', '/projects', '/manuscripts',
  '/grants', '/deadlines', '/meetings', '/team', '/ideas', '/decisions',
  '/research-digest', '/calendar', '/analytics', '/search', '/settings', '/activity'
];
const publicPages = ['/', '/team', '/publications', '/contact'];
const allPages = [...portalPages, ...publicPages];

async function auditPage(page, url, label, width) {
  const result = { url, label, width, checks: {} };
  try {
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}

    // horizontal scroll
    const scroll = await page.evaluate(() => ({
      docW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
      bodyW: document.body.scrollWidth,
    }));
    result.checks.horizontalScroll = scroll.docW > scroll.winW + 2;
    result.checks.scroll = scroll;

    // touch target audit - sample clickable elements
    const touch = await page.evaluate(() => {
      const sel = 'button, a, [role="button"], [role="option"], input, select, textarea, [tabindex]:not([tabindex="-1"])';
      const els = Array.from(document.querySelectorAll(sel));
      const results = [];
      for (const el of els.slice(0, 200)) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') continue;
        if (rect.width < 44 || rect.height < 44) {
          results.push({
            tag: el.tagName.toLowerCase(),
            text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').slice(0, 40),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          });
        }
      }
      return { total: els.length, small: results.slice(0, 15), smallCount: results.length };
    });
    result.checks.touch = touch;

    // page height / overflow of any element
    const overflow = await page.evaluate(() => {
      const winW = window.innerWidth;
      const overflowing = [];
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const rect = el.getBoundingClientRect();
        if (rect.right > winW + 2 && rect.width < winW * 2 && rect.width > 50) {
          overflowing.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || '').toString().slice(0, 50),
            right: Math.round(rect.right),
            w: Math.round(rect.width),
          });
          if (overflowing.length > 5) break;
        }
      }
      return overflowing;
    });
    result.checks.overflowing = overflow;

    const screenshotName = `${label}-${url.replace(/\//g, '_') || 'home'}.png`.replace(/^_/, '');
    await page.screenshot({ path: path.join(OUTDIR, screenshotName), fullPage: false });
  } catch (e) {
    result.error = e.message.slice(0, 200);
  }
  return result;
}

(async () => {
  const browser = await chromium.launch();
  const results = { '375': [], '768': [] };

  // 375 iPhone
  {
    const iPhone = devices['iPhone 13'];
    const ctx = await browser.newContext({ ...iPhone });
    const page = await ctx.newPage();
    // set dark theme
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
    await page.evaluate(() => { try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch {} });
    for (const url of allPages) {
      const r = await auditPage(page, url, '375', 375);
      results['375'].push(r);
      console.log(`[375] ${url} scroll=${r.checks.horizontalScroll} small=${r.checks.touch?.smallCount} err=${r.error||''}`);
    }
    await ctx.close();
  }

  // 768 iPad
  {
    const ctx = await browser.newContext({
      viewport: { width: 768, height: 1024 },
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
    await page.evaluate(() => { try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch {} });
    for (const url of allPages) {
      const r = await auditPage(page, url, '768', 768);
      results['768'].push(r);
      console.log(`[768] ${url} scroll=${r.checks.horizontalScroll} small=${r.checks.touch?.smallCount} err=${r.error||''}`);
    }
    await ctx.close();
  }

  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));
  console.log('\nSaved results.json');
  await browser.close();
})();
