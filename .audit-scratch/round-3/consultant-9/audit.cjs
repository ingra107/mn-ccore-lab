const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTDIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

const BASE = 'https://mn-ccore-lab.pages.dev';

const portalPages = [
  '/dashboard', '/my-tasks', '/personal', '/projects', '/manuscripts',
  '/grants', '/deadlines', '/meetings', '/team', '/ideas', '/decisions',
  '/calendar', '/analytics', '/search', '/settings', '/activity'
];
const publicPages = ['/', '/publications', '/contact'];
const allPages = [...portalPages, ...publicPages];

async function auditPage(page, url, label) {
  const result = { url, label, checks: {} };
  try {
    await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1200);
    try { await page.waitForLoadState('networkidle', { timeout: 6000 }); } catch {}

    const data = await page.evaluate(() => {
      const winW = window.innerWidth;
      const docW = document.documentElement.scrollWidth;
      const hasTabBar = !!document.querySelector('nav[aria-label="Primary navigation"]');
      let tabBarInfo = null;
      if (hasTabBar) {
        const el = document.querySelector('nav[aria-label="Primary navigation"]');
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        tabBarInfo = {
          bottom: Math.round(r.bottom),
          top: Math.round(r.top),
          height: Math.round(r.height),
          display: cs.display,
          visibility: cs.visibility,
          position: cs.position,
          paddingBottom: cs.paddingBottom,
          zIndex: cs.zIndex,
          tabs: el.querySelectorAll('a[aria-label]').length,
        };
      }
      // overflowing elements
      const overflowing = [];
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const rect = el.getBoundingClientRect();
        if (rect.right > winW + 2 && rect.width < winW * 2 && rect.width > 60) {
          overflowing.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || '').toString().slice(0, 60),
            right: Math.round(rect.right),
          });
          if (overflowing.length > 5) break;
        }
      }
      // touch target sweep
      const sel = 'button, a, [role="button"], input, select';
      const els = Array.from(document.querySelectorAll(sel));
      const small = [];
      for (const el of els.slice(0, 300)) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') continue;
        if (rect.width < 44 || rect.height < 44) {
          small.push({
            tag: el.tagName.toLowerCase(),
            text: (el.innerText || el.getAttribute('aria-label') || '').slice(0, 30),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          });
        }
      }
      return {
        winW, docW,
        horizontalScroll: docW > winW + 2,
        hasTabBar, tabBarInfo,
        overflowing,
        smallCount: small.length,
        smallSample: small.slice(0, 6),
      };
    });
    result.checks = data;

    // Screenshot
    const name = `${label}-${(url.replace(/\//g, '_') || 'home')}.png`.replace(/^_/, '');
    await page.screenshot({ path: path.join(OUTDIR, name), fullPage: false });
  } catch (e) {
    result.error = e.message.slice(0, 200);
  }
  return result;
}

async function pwaCheck(page) {
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  const html = await page.content();
  const pwa = {
    viewportFitCover: /viewport-fit=cover/i.test(html),
    themeColorDark: /theme-color"[^>]*content="[^"]*"[^>]*media="\(prefers-color-scheme: dark\)/i.test(html) ||
                    /theme-color"[^>]*media="\(prefers-color-scheme: dark\)"[^>]*content=/i.test(html),
    themeColorLight: /theme-color"[^>]*media="\(prefers-color-scheme: light\)/i.test(html),
    appleCapable: /apple-mobile-web-app-capable/i.test(html),
    appleStatusBar: /apple-mobile-web-app-status-bar-style/i.test(html),
    manifestLink: /rel="manifest"/i.test(html),
  };
  // Fetch manifest
  try {
    const mRes = await page.request.get(BASE + '/manifest.webmanifest');
    pwa.manifestStatus = mRes.status();
    if (mRes.ok()) {
      const mJson = await mRes.json();
      pwa.manifest = {
        name: mJson.name,
        short_name: mJson.short_name,
        display: mJson.display,
        theme_color: mJson.theme_color,
        background_color: mJson.background_color,
        start_url: mJson.start_url,
        iconCount: (mJson.icons || []).length,
      };
    }
  } catch (e) { pwa.manifestError = e.message.slice(0, 100); }
  // safe-area-inset usage in live CSS
  const safeAreaUsage = await page.evaluate(() => {
    const sheets = Array.from(document.styleSheets);
    let count = 0;
    for (const sheet of sheets) {
      try {
        const rules = sheet.cssRules || [];
        for (const rule of rules) {
          if (rule.cssText && /safe-area-inset/i.test(rule.cssText)) count++;
        }
      } catch {}
    }
    return count;
  });
  pwa.safeAreaInsetCssRules = safeAreaUsage;
  return pwa;
}

(async () => {
  const browser = await chromium.launch();
  const results = { pwa: null, '375': [], '768': [] };

  // 375 iPhone 13
  const iPhone = devices['iPhone 13'];
  const ctx1 = await browser.newContext({ ...iPhone });
  const page1 = await ctx1.newPage();
  await page1.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
  await page1.evaluate(() => { try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch {} });

  results.pwa = await pwaCheck(page1);
  console.log('PWA:', JSON.stringify(results.pwa, null, 2));

  for (const url of allPages) {
    const r = await auditPage(page1, url, '375');
    results['375'].push(r);
    console.log(`[375] ${url} scroll=${r.checks.horizontalScroll} tabBar=${r.checks.hasTabBar} small=${r.checks.smallCount} err=${r.error||''}`);
  }
  await ctx1.close();

  // 768 iPad
  const ctx2 = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page2 = await ctx2.newPage();
  await page2.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
  await page2.evaluate(() => { try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch {} });

  for (const url of allPages) {
    const r = await auditPage(page2, url, '768');
    results['768'].push(r);
    console.log(`[768] ${url} scroll=${r.checks.horizontalScroll} tabBar=${r.checks.hasTabBar} small=${r.checks.smallCount} err=${r.error||''}`);
  }
  await ctx2.close();

  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));
  console.log('\nSaved results.json');
  await browser.close();
})();
