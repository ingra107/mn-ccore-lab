// Round 3 verification probe — Page transitions, keyboard chords, empty voice,
// Lab Health Score, Mentee Risk, mobile tab bar, ActivityPage floor, Search top-align,
// MyTasks compact banner, Dashboard 2 strata.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const results = {};

  // =========================================================================
  // DARK
  // =========================================================================
  const ctxDark = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctxDark.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch(e){}
    try { localStorage.setItem('hub-signin-banner-dismissed', 'false'); } catch(e){}
  });

  const goto = async (url) => {
    try { await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); }
    catch(e) { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
    await page.waitForTimeout(1200);
  };

  // --- PageTransition wrapper present on all pages ---
  await goto('https://mn-ccore-lab.pages.dev/dashboard');
  results.pageTransition_dashboard = await page.evaluate(() => {
    // Find motion wrapper — has inline style with transform/opacity from framer
    const main = document.querySelector('main');
    if (!main) return 'no-main';
    // Walk first descendants for motion div
    const divs = Array.from(main.querySelectorAll('div')).slice(0, 5);
    return divs.map(d => ({
      cls: (d.className || '').toString().slice(0,50),
      hasTransform: !!d.style.transform,
      hasOpacity: d.style.opacity !== '',
      transform: d.style.transform || null,
      opacity: d.style.opacity || null,
    }));
  });

  // --- Lab Health Score on Dashboard ---
  results.labHealth = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    // Look for text containing health score pattern or "Lab health"
    const match = all.find(el =>
      /lab health|health score/i.test(el.innerText || '') &&
      el.children.length < 10 &&
      (el.innerText || '').length < 200
    );
    if (!match) return null;
    return { text: (match.innerText || '').slice(0, 160), tag: match.tagName };
  });

  // --- Dashboard permanent strata count ---
  results.dashboardStrata = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const children = [];
    const walk = (el, depth) => {
      if (depth > 3) return;
      for (const c of el.children) {
        const r = c.getBoundingClientRect();
        if (r.height > 20 && r.width > 600) {
          children.push({
            tag: c.tagName,
            cls: (c.className || '').toString().slice(0, 40),
            top: Math.round(r.top),
            height: Math.round(r.height),
          });
        }
        if (c.children.length > 0 && c.children.length < 10 && depth < 2) walk(c, depth + 1);
      }
    };
    walk(main, 0);
    return children.slice(0, 12);
  });

  await page.screenshot({ path: path.join(__dirname, 'dashboard-dark.png'), fullPage: false });

  // --- Ideas empty state voice ---
  await goto('https://mn-ccore-lab.pages.dev/ideas');
  results.ideasEmpty = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const match = all.find(el => /board is open|first idea|captured ideas?/i.test(el.innerText || '') && el.children.length < 5);
    return match ? (match.innerText || '').slice(0, 200) : null;
  });
  await page.screenshot({ path: path.join(__dirname, 'ideas-dark.png'), fullPage: false });

  // --- Search page top-aligned (no 50vh center) ---
  await goto('https://mn-ccore-lab.pages.dev/search');
  results.searchLayout = await page.evaluate(() => {
    // Find PageHeader and search input — compare their tops
    const h = document.querySelector('h1');
    const input = document.querySelector('input[type="text"]');
    if (!h || !input) return 'missing';
    const hr = h.getBoundingClientRect();
    const ir = input.getBoundingClientRect();
    return {
      h1Top: Math.round(hr.top),
      inputTop: Math.round(ir.top),
      vpHeight: window.innerHeight,
      // If h1 is in upper 1/3 of viewport, it's top-aligned
      topAligned: hr.top < window.innerHeight * 0.3,
    };
  });
  await page.screenshot({ path: path.join(__dirname, 'search-dark.png'), fullPage: false });

  // --- Calendar empty voice ---
  await goto('https://mn-ccore-lab.pages.dev/calendar');
  results.calendarEmpty = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const match = all.find(el => /nothing scheduled|no events|clear calendar|open week/i.test(el.innerText || '') && el.children.length < 5);
    return match ? (match.innerText || '').slice(0, 200) : null;
  });

  // --- ActivityPage SYS avatar floor (10px) ---
  await goto('https://mn-ccore-lab.pages.dev/activity');
  results.activityFontFloor = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const sizes = [];
    for (const el of all) {
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      if (fs > 0 && fs < 10 && (el.innerText || '').trim().length > 0 && (el.innerText || '').length < 100) {
        sizes.push({ fs, text: (el.innerText || '').slice(0, 30), tag: el.tagName });
      }
    }
    return {
      belowFloorCount: sizes.length,
      samples: sizes.slice(0, 5),
    };
  });
  await page.screenshot({ path: path.join(__dirname, 'activity-dark.png'), fullPage: false });

  // --- MyTasks compact sign-in banner ---
  await goto('https://mn-ccore-lab.pages.dev/my-tasks');
  results.myTasksBanner = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div'));
    const match = all.find(el => /Showing all lab tasks|Sign in.*@umn/i.test(el.innerText || '') && el.children.length < 10);
    if (!match) return 'not-found';
    const cs = getComputedStyle(match);
    const r = match.getBoundingClientRect();
    return {
      height: Math.round(r.height),
      bg: cs.backgroundColor,
      borderLeftColor: cs.borderLeftColor,
      borderLeftWidth: cs.borderLeftWidth,
    };
  });
  await page.screenshot({ path: path.join(__dirname, 'my-tasks-dark.png'), fullPage: false });

  // --- Mentee Risk Radar badges on mentee-milestones ---
  await goto('https://mn-ccore-lab.pages.dev/mentee-milestones');
  results.menteeRisk = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const match = all.filter(el => /silent|quiet/i.test(el.innerText || '') && el.innerText && el.innerText.length < 30 && el.children.length < 3);
    return match.slice(0, 3).map(el => ({ text: (el.innerText || '').slice(0, 40), tag: el.tagName }));
  });

  // --- Keyboard chord verification: press g then d, expect /dashboard ---
  await goto('https://mn-ccore-lab.pages.dev/my-tasks');
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('d');
  await page.waitForTimeout(800);
  results.chord_gd = page.url();

  // Test g + p = /projects
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('p');
  await page.waitForTimeout(800);
  results.chord_gp = page.url();

  // Test g + m = /meetings
  await page.keyboard.press('g');
  await page.waitForTimeout(100);
  await page.keyboard.press('m');
  await page.waitForTimeout(800);
  results.chord_gm = page.url();

  // --- ShortcutHelp shows chords ---
  await page.keyboard.press('?');
  await page.waitForTimeout(600);
  results.shortcutHelp = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const helpText = all.map(el => el.innerText || '').join(' ').slice(0, 5000);
    return {
      hasGD: /g\s*d/i.test(helpText) || helpText.includes('Dashboard'),
      hasGP: /g\s*p/i.test(helpText) || helpText.includes('Projects'),
      hasChordSection: /chord|navigat/i.test(helpText),
    };
  });

  await page.screenshot({ path: path.join(__dirname, 'shortcut-help-dark.png'), fullPage: false });

  await ctxDark.close();

  // =========================================================================
  // LIGHT
  // =========================================================================
  const ctxLight = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageL = await ctxLight.newPage();
  await pageL.addInitScript(() => {
    try { localStorage.setItem('mn-ccore-theme', 'light'); } catch(e){}
  });

  const gotoL = async (url) => {
    try { await pageL.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); }
    catch(e) { await pageL.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
    await pageL.waitForTimeout(1200);
  };

  const pagesToShoot = [
    ['dashboard', '/dashboard'],
    ['my-tasks', '/my-tasks'],
    ['tasks', '/tasks'],
    ['projects', '/projects'],
    ['personal', '/personal'],
    ['ideas', '/ideas'],
    ['search', '/search'],
    ['activity', '/activity'],
    ['meetings', '/meetings'],
  ];

  for (const [name, url] of pagesToShoot) {
    await gotoL('https://mn-ccore-lab.pages.dev' + url);
    await pageL.screenshot({ path: path.join(__dirname, `${name}-light.png`), fullPage: false });
  }

  await ctxLight.close();

  // =========================================================================
  // MOBILE (375x667) — MobileTabBar visible
  // =========================================================================
  const ctxMob = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const pageM = await ctxMob.newPage();
  await pageM.addInitScript(() => {
    try { localStorage.setItem('mn-ccore-theme', 'dark'); } catch(e){}
  });

  try { await pageM.goto('https://mn-ccore-lab.pages.dev/dashboard', { waitUntil: 'networkidle', timeout: 45000 }); }
  catch(e) { await pageM.goto('https://mn-ccore-lab.pages.dev/dashboard', { waitUntil: 'domcontentloaded', timeout: 45000 }); }
  await pageM.waitForTimeout(1500);

  results.mobileTabBar = await pageM.evaluate(() => {
    const navs = Array.from(document.querySelectorAll('nav'));
    const bottom = navs.find(n => {
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      return cs.position === 'fixed' && r.top > window.innerHeight / 2;
    });
    if (!bottom) return 'not-found';
    const r = bottom.getBoundingClientRect();
    const links = Array.from(bottom.querySelectorAll('a')).map(a => ({
      text: (a.innerText || '').slice(0, 20),
      href: a.getAttribute('href'),
    }));
    return { top: Math.round(r.top), height: Math.round(r.height), links };
  });

  await pageM.screenshot({ path: path.join(__dirname, 'mobile-dashboard.png'), fullPage: false });
  await ctxMob.close();

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})();
