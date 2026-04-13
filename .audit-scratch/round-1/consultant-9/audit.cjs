// Round 1 mobile audit — re-verify post-Phase 2 fixes
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://mn-ccore-lab.pages.dev';
const SCREEN_DIR = path.join(__dirname, 'screenshots');
fs.mkdirSync(SCREEN_DIR, { recursive: true });

const PAGES = [
  { name: 'home', url: '/' },
  { name: 'team-public', url: '/team' },
  { name: 'publications', url: '/publications' },
  { name: 'contact', url: '/contact' },
  { name: 'dashboard', url: '/dashboard' },
  { name: 'my-tasks', url: '/my-tasks' },
  { name: 'personal', url: '/personal' },
  { name: 'projects', url: '/projects' },
  { name: 'manuscripts', url: '/manuscripts' },
  { name: 'grants', url: '/grants' },
  { name: 'deadlines', url: '/deadlines' },
  { name: 'meetings', url: '/meetings' },
  { name: 'ideas', url: '/ideas' },
  { name: 'decisions', url: '/decisions' },
  { name: 'research-digest', url: '/research-digest' },
  { name: 'calendar', url: '/calendar' },
  { name: 'analytics', url: '/analytics' },
  { name: 'search', url: '/search' },
  { name: 'settings', url: '/settings' },
  { name: 'activity', url: '/activity' },
  { name: 'tasks', url: '/tasks' },
];

async function inspect(page, label, viewport) {
  // Wait for content
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(()=>{});
  await page.waitForTimeout(800);

  const dimensions = await page.evaluate(() => ({
    docWidth: document.documentElement.scrollWidth,
    winWidth: window.innerWidth,
    docHeight: document.documentElement.scrollHeight,
    winHeight: window.innerHeight,
  }));

  const horizontalScroll = dimensions.docWidth > dimensions.winWidth + 1;

  // Touch targets
  const touchInfo = await page.evaluate(() => {
    const SAMPLE_LIMIT = 200;
    const els = Array.from(document.querySelectorAll(
      'button, a[href], [role="button"], input[type="checkbox"], select, [role="tab"], [role="menuitem"]'
    )).slice(0, SAMPLE_LIMIT);
    let underFloor = 0;
    let header = 0;
    const violators = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // skip visually hidden a11y links
      const style = getComputedStyle(el);
      if (style.position === 'absolute' && (r.width < 4 || r.height < 4)) continue;
      if (r.width < 44 || r.height < 44) {
        underFloor++;
        // is in header?
        const inHeader = !!el.closest('header, [class*="PortalLayout"], [class*="header"]');
        if (inHeader) header++;
        if (violators.length < 12) {
          violators.push({
            tag: el.tagName,
            text: (el.innerText || el.getAttribute('aria-label') || '').slice(0, 30),
            w: Math.round(r.width),
            h: Math.round(r.height),
            inHeader,
          });
        }
      }
    }
    return { sampled: els.length, underFloor, header, violators };
  });

  // Element-level overflow check
  const overflows = await page.evaluate(() => {
    const w = window.innerWidth;
    const elements = document.querySelectorAll('h1, h2, h3, .truncate, [class*="title"]');
    let overflowing = 0;
    const samples = [];
    for (const el of elements) {
      const r = el.getBoundingClientRect();
      if (r.right > w + 1 && r.width > 50) {
        overflowing++;
        if (samples.length < 5) samples.push({ tag: el.tagName, text: el.innerText.slice(0, 50), right: Math.round(r.right) });
      }
    }
    return { overflowing, samples };
  });

  await page.screenshot({ path: path.join(SCREEN_DIR, `${label}-${viewport}.png`), fullPage: false });

  return { dimensions, horizontalScroll, touchInfo, overflows };
}

(async () => {
  const browser = await chromium.launch();
  const results = {};

  for (const viewport of ['375', '768']) {
    const device = viewport === '375' ? devices['iPhone 13'] : devices['iPad (gen 7)'];
    const ctx = await browser.newContext({ ...device });
    const page = await ctx.newPage();

    for (const p of PAGES) {
      const label = `${p.name}`;
      try {
        await page.goto(BASE + p.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const r = await inspect(page, label, viewport);
        results[`${viewport}:${p.name}`] = r;
        console.log(`[${viewport}] ${p.name}: hScroll=${r.horizontalScroll} headerSubFloor=${r.touchInfo.header} totalSubFloor=${r.touchInfo.underFloor} overflow=${r.overflows.overflowing}`);
      } catch (e) {
        console.log(`[${viewport}] ${p.name}: ERROR ${e.message}`);
        results[`${viewport}:${p.name}`] = { error: e.message };
      }
    }
    await ctx.close();
  }

  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(results, null, 2));
  await browser.close();
  console.log('DONE');
})();
