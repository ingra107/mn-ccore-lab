const { chromium } = require('playwright');
const path = require('path');

const OUT = 'C:/Users/ingra/mn-ccore-lab/.audit-scratch/consultant-1';
const BASE = 'https://mn-ccore-lab.pages.dev';

const pages = [
  ['dashboard', '/dashboard'],
  ['my-tasks', '/my-tasks'],
  ['personal', '/personal'],
  ['projects', '/projects'],
  ['manuscripts', '/manuscripts'],
  ['grants', '/grants'],
  ['deadlines', '/deadlines'],
  ['meetings', '/meetings'],
  ['team', '/team'],
  ['ideas', '/ideas'],
  ['decisions', '/decisions'],
  ['research-digest', '/research-digest'],
  ['calendar', '/calendar'],
  ['analytics', '/analytics'],
  ['search', '/search'],
  ['settings', '/settings'],
  ['activity', '/activity'],
  ['home', '/'],
  ['public-team', '/team-public'],
  ['publications', '/publications'],
  ['contact', '/contact'],
];

(async () => {
  const browser = await chromium.launch();
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    // Set theme first on a known page
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => localStorage.setItem('mn-ccore-theme', t), theme);

    for (const [name, url] of pages) {
      try {
        await page.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${OUT}/${name}-${theme}.png`, fullPage: true });
        console.log(`ok ${name}-${theme}`);
      } catch (e) {
        console.log(`FAIL ${name}-${theme}: ${e.message}`);
      }
    }
    await context.close();
  }
  await browser.close();
})();
