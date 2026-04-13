const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['/', 'home'],
  ['/dashboard', 'dashboard'],
  ['/my-tasks', 'my-tasks'],
  ['/personal', 'personal'],
  ['/projects', 'projects'],
  ['/manuscripts', 'manuscripts'],
  ['/grants', 'grants'],
  ['/deadlines', 'deadlines'],
  ['/meetings', 'meetings'],
  ['/team', 'team'],
  ['/ideas', 'ideas'],
  ['/decisions', 'decisions'],
  ['/research-digest', 'research-digest'],
  ['/calendar', 'calendar'],
  ['/analytics', 'analytics'],
  ['/pi-analytics', 'pi-analytics'],
  ['/search', 'search'],
  ['/settings', 'settings'],
  ['/activity', 'activity'],
  ['/publications', 'publications'],
  ['/contact', 'contact'],
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGERR', e.message));

  // Capture computed-style contrast samples from dashboard light+dark
  const styleSamples = {};

  for (const [route, slug] of PAGES) {
    for (const theme of ['light', 'dark']) {
      const file = path.join(OUT, `${slug}-${theme}.png`);
      try {
        await page.goto('https://mn-ccore-lab.pages.dev' + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.evaluate(t => {
          localStorage.setItem('mn-ccore-theme', t);
          document.documentElement.classList.toggle('dark', t === 'dark');
        }, theme);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1800);
        await page.screenshot({ path: file, fullPage: true });
        console.log('OK', slug, theme);
      } catch (e) {
        console.log('ERR', slug, theme, e.message.slice(0, 120));
      }
    }
  }

  // Sample key CSS variables resolved in both themes from dashboard
  for (const theme of ['light', 'dark']) {
    await page.goto('https://mn-ccore-lab.pages.dev/dashboard', { waitUntil: 'domcontentloaded' });
    await page.evaluate(t => {
      localStorage.setItem('mn-ccore-theme', t);
      document.documentElement.classList.toggle('dark', t === 'dark');
    }, theme);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    styleSamples[theme] = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const keys = ['--ink','--cream','--page-bg','--muted','--gold','--teal','--teal-subtle','--maroon','--orange','--green','--border-subtle','--border-default','--border-strong','--surface-1','--surface-2','--surface-3','--sidebar-bg','--ink-label','--ink-hint','--hover-subtle','--hover-light','--gold-emphasis','--teal-emphasis'];
      const out = {};
      for (const k of keys) out[k] = cs.getPropertyValue(k).trim();
      // Sample a few real DOM elements too
      const body = getComputedStyle(document.body);
      out.__bodyBg = body.backgroundColor;
      out.__bodyColor = body.color;
      const sidebar = document.querySelector('aside, nav[role="navigation"], [class*="sidebar" i]');
      if (sidebar) {
        const sb = getComputedStyle(sidebar);
        out.__sidebarBg = sb.backgroundColor;
        out.__sidebarColor = sb.color;
      }
      return out;
    });
  }
  fs.writeFileSync(path.join(OUT, '_samples.json'), JSON.stringify(styleSamples, null, 2));
  await browser.close();
})();
