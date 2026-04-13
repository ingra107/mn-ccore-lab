const { chromium } = require('playwright');
const path = require('path');
const OUT = __dirname;

const PAGES = [
  { name: 'activity', path: '/activity' },
  { name: 'digest', path: '/research-digest' },
  { name: 'personal', path: '/personal' },
  { name: 'decisions', path: '/decisions' },
  { name: 'search', path: '/search' },
  { name: 'settings', path: '/settings' },
  { name: 'my-tasks', path: '/my-tasks' },
  { name: 'ideas', path: '/ideas' },
  { name: 'manuscripts', path: '/manuscripts' },
  { name: 'projects', path: '/projects' },
  { name: 'meetings', path: '/meetings' },
];

(async () => {
  const browser = await chromium.launch();
  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.addInitScript((t) => { try { localStorage.setItem('mn-ccore-theme', t); } catch(e){} }, theme);
    for (const p of PAGES) {
      try {
        await page.goto('https://mn-ccore-lab.pages.dev' + p.path, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(OUT, `${p.name}-${theme}.png`), fullPage: false });
        console.log('OK', p.name, theme);
      } catch (e) {
        console.log('ERR', p.name, theme, e.message);
      }
    }
    await ctx.close();
  }
  await browser.close();
})();
