// Round 2 verification — targeted probes for:
// 1. Deadlines pill overlap (9c0df32)
// 2. WelcomeBanner stacking (0d7c41f)
// 3. ProjectDetail tab horizontal scroll (e962949)
// 4. Touch target sweep on /my-tasks (152db39)
// 5. Frontier observations: viewport meta, safe-area, theme-color, PWA, etc.

const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTDIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });
const BASE = 'https://mn-ccore-lab.pages.dev';

(async () => {
  const browser = await chromium.launch();
  const iPhone = devices['iPhone 13'];
  const ctx = await browser.newContext({ ...iPhone });
  const page = await ctx.newPage();
  const findings = { surprises: {}, touch: {}, frontier: {}, pages: {} };

  // Set dark theme
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
  await page.evaluate(() => { try { localStorage.setItem('mn-ccore-theme','dark'); } catch{} });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // ===== FRONTIER: meta tags (viewport, theme-color, manifest, apple-touch)
  findings.frontier.meta = await page.evaluate(() => {
    const get = (sel) => {
      const el = document.querySelector(sel);
      return el ? (el.getAttribute('content') || el.getAttribute('href') || true) : null;
    };
    return {
      viewport: get('meta[name="viewport"]'),
      themeColor: get('meta[name="theme-color"]'),
      appleMobileCapable: get('meta[name="apple-mobile-web-app-capable"]'),
      appleMobileStatusBar: get('meta[name="apple-mobile-web-app-status-bar-style"]'),
      appleTouchIcon: get('link[rel="apple-touch-icon"]'),
      manifest: get('link[rel="manifest"]'),
      colorScheme: get('meta[name="color-scheme"]'),
    };
  });

  // ===== FRONTIER: safe-area CSS usage
  findings.frontier.safeArea = await page.evaluate(() => {
    const sheets = Array.from(document.styleSheets);
    let count = 0;
    let samples = [];
    for (const sh of sheets) {
      try {
        for (const r of Array.from(sh.cssRules || [])) {
          const t = r.cssText || '';
          if (t.includes('safe-area-inset') || t.includes('env(safe-area')) {
            count++;
            if (samples.length < 3) samples.push(t.slice(0, 120));
          }
        }
      } catch {}
    }
    return { count, samples };
  });

  // ===== SURPRISE 1: Deadlines pill overlap
  await page.goto(BASE + '/deadlines', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  findings.surprises.deadlines = await page.evaluate(() => {
    // Find the urgent banner (has AlertTriangle icon, sticky top)
    const spans = Array.from(document.querySelectorAll('div'));
    // Look for a div that has an SVG + a title text + a "days" pill
    const winW = window.innerWidth;
    // Probe: find all divs with data attrs or classes that look like the banner
    const results = [];
    for (const el of document.querySelectorAll('div')) {
      const txt = (el.innerText || '').slice(0, 100);
      // Match urgent banner: has "days" text AND "AlertTriangle" (svg child)
      if (/\b\d+\s*days?\b/i.test(txt) && el.querySelector('svg')) {
        const rect = el.getBoundingClientRect();
        if (rect.width > winW * 0.6 && rect.width < winW + 5 && rect.height < 80 && rect.top < 400) {
          // Get children right edges
          const children = Array.from(el.children);
          const childData = children.map(c => ({
            tag: c.tagName.toLowerCase(),
            txt: (c.innerText || '').slice(0, 30),
            r: Math.round(c.getBoundingClientRect().right),
            l: Math.round(c.getBoundingClientRect().left),
            w: Math.round(c.getBoundingClientRect().width),
          }));
          results.push({
            winW,
            bannerRect: { w: Math.round(rect.width), h: Math.round(rect.height), l: Math.round(rect.left) },
            text: txt.slice(0,80),
            children: childData,
          });
          if (results.length >= 2) break;
        }
      }
    }
    return results;
  });
  await page.screenshot({ path: path.join(OUTDIR, 'r2-deadlines-375.png'), fullPage: false });

  // ===== SURPRISE 2: WelcomeBanner mobile stacking
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  findings.surprises.welcomeBanner = await page.evaluate(() => {
    // Dismiss dismissed state first — check localStorage
    // Look for h1 "Welcome" or similar heading in banner
    const banners = Array.from(document.querySelectorAll('div')).filter(el => {
      const t = el.innerText || '';
      return /welcome/i.test(t) && t.length < 400 && el.querySelector('button, svg');
    });
    if (!banners.length) return { present: false, note: 'no welcome banner (may be dismissed)' };
    const b = banners[0];
    const rect = b.getBoundingClientRect();
    const h1 = b.querySelector('h1,h2,h3');
    const h1Rect = h1 ? h1.getBoundingClientRect() : null;
    // Check if layout is stacked (flex-direction column)
    const cs = window.getComputedStyle(b);
    const inner = b.querySelector('div');
    const innerCs = inner ? window.getComputedStyle(inner) : null;
    return {
      present: true,
      bannerHeight: Math.round(rect.height),
      bannerWidth: Math.round(rect.width),
      bannerFlexDir: cs.flexDirection,
      innerFlexDir: innerCs ? innerCs.flexDirection : null,
      h1Height: h1Rect ? Math.round(h1Rect.height) : null,
      h1LineCount: h1 ? Math.round((h1Rect.height) / parseFloat(window.getComputedStyle(h1).lineHeight || 20)) : null,
      text: (b.innerText || '').slice(0, 200),
    };
  });
  await page.screenshot({ path: path.join(OUTDIR, 'r2-dashboard-welcome-375.png'), fullPage: false });

  // ===== SURPRISE 3: ProjectDetail tabs horizontal scroll
  await page.goto(BASE + '/projects', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const projectLink = await page.$eval('a[href^="/projects/"]', a => a.getAttribute('href')).catch(()=>null);
  if (projectLink) {
    await page.goto(BASE + projectLink, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    findings.surprises.projectTabs = await page.evaluate(() => {
      // Find tablist or strip of buttons
      const lists = Array.from(document.querySelectorAll('[role="tablist"], nav'));
      const winW = window.innerWidth;
      for (const l of lists) {
        const rect = l.getBoundingClientRect();
        if (rect.width > 200 && rect.width < winW + 5 && l.scrollWidth > l.clientWidth) {
          return {
            found: true,
            clientW: l.clientWidth,
            scrollW: l.scrollWidth,
            overflowX: window.getComputedStyle(l).overflowX,
            tabCount: l.querySelectorAll('button, a').length,
          };
        }
      }
      // Fallback: look for any scrolling container at the top
      const buttons = document.querySelectorAll('button');
      for (const b of buttons) {
        if (/overview|notes|tasks|literature|files/i.test(b.innerText || '')) {
          const parent = b.parentElement;
          if (parent) {
            return {
              found: true,
              parentTag: parent.tagName,
              clientW: parent.clientWidth,
              scrollW: parent.scrollWidth,
              overflowX: window.getComputedStyle(parent).overflowX,
              scrolls: parent.scrollWidth > parent.clientWidth,
              tabText: b.innerText.slice(0, 30),
            };
          }
        }
      }
      return { found: false };
    });
    await page.screenshot({ path: path.join(OUTDIR, 'r2-project-detail-375.png'), fullPage: false });
  }

  // ===== TOUCH TARGET sweep /my-tasks
  await page.goto(BASE + '/my-tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  findings.touch.myTasks = await page.evaluate(() => {
    const sel = 'button, a, [role="button"], select, input[type="checkbox"], .filter-chip';
    const els = Array.from(document.querySelectorAll(sel));
    let total = 0;
    let small = [];
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
      if (el.classList.contains('kbd-shortcut')) continue;
      total++;
      if (rect.width < 44 || rect.height < 44) {
        small.push({
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || el.getAttribute('aria-label') || '').slice(0, 30),
          cls: (el.className || '').toString().slice(0, 50),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        });
      }
    }
    return { total, smallCount: small.length, samples: small.slice(0, 20) };
  });

  // Same sweep on /tasks
  await page.goto(BASE + '/tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  findings.touch.tasks = await page.evaluate(() => {
    const sel = 'button, a, [role="button"], select, input[type="checkbox"], .filter-chip';
    const els = Array.from(document.querySelectorAll(sel));
    let total = 0, small = [];
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
      if (el.classList.contains('kbd-shortcut')) continue;
      total++;
      if (rect.width < 44 || rect.height < 44) {
        small.push({ tag: el.tagName.toLowerCase(), text: (el.innerText||'').slice(0,30), cls: (el.className||'').toString().slice(0,50), w: Math.round(rect.width), h: Math.round(rect.height) });
      }
    }
    return { total, smallCount: small.length, samples: small.slice(0, 15) };
  });

  // ===== FRONTIER: check for bottom nav, pull-to-refresh hints, drag sheets
  findings.frontier.nav = await page.evaluate(() => {
    // Bottom tab bar? Check for fixed bottom nav
    const fixedBottom = Array.from(document.querySelectorAll('nav, [role="navigation"], div')).filter(el => {
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return cs.position === 'fixed' && rect.bottom > window.innerHeight - 10 && rect.width > 200 && rect.height < 100;
    });
    return { fixedBottomNav: fixedBottom.length > 0 };
  });

  // Landscape probe
  await ctx.close();

  // ===== 768 iPad
  const ctx2 = await browser.newContext({
    viewport: { width: 768, height: 1024 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0)',
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await p2.evaluate(() => { try { localStorage.setItem('mn-ccore-theme','dark'); } catch{} });
  await p2.reload({ waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(2500);
  findings.pages['768-dashboard'] = await p2.evaluate(() => ({
    docW: document.documentElement.scrollWidth, winW: window.innerWidth,
  }));
  await p2.screenshot({ path: path.join(OUTDIR, 'r2-768-dashboard.png'), fullPage: false });

  await p2.goto(BASE + '/deadlines', { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(2500);
  await p2.screenshot({ path: path.join(OUTDIR, 'r2-768-deadlines.png'), fullPage: false });

  fs.writeFileSync(path.join(__dirname, 'findings.json'), JSON.stringify(findings, null, 2));
  console.log(JSON.stringify(findings, null, 2));
  await browser.close();
})();
