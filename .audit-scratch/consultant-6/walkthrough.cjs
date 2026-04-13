// Consultant 6: Research Operations Manager walkthrough
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const BASE = 'https://mn-ccore-lab.pages.dev';

const routes = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'meetings', path: '/meetings' },
  { name: 'deadlines', path: '/deadlines' },
  { name: 'personal', path: '/personal' },
  { name: 'team', path: '/team' },
  { name: 'manuscripts', path: '/manuscripts' },
  { name: 'ideas', path: '/ideas' },
  { name: 'decisions', path: '/decisions' },
  { name: 'analytics', path: '/analytics' },
  { name: 'pi-analytics', path: '/pi-analytics' },
  { name: 'tasks', path: '/tasks' },
  { name: 'projects', path: '/projects' },
  { name: 'mentee-milestones', path: '/mentee-milestones' },
  { name: 'calendar', path: '/calendar' },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Set dark theme before navigation
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.setItem('mn-ccore-theme', 'dark'));

  const notes = [];
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

  for (const r of routes) {
    try {
      const t0 = Date.now();
      await page.goto(BASE + r.path, { waitUntil: 'networkidle', timeout: 25000 });
      const elapsed = Date.now() - t0;
      await page.waitForTimeout(800);

      const info = await page.evaluate(() => {
        const h1 = document.querySelector('h1')?.innerText?.trim() || '';
        const h2s = [...document.querySelectorAll('h2')].slice(0, 6).map(e => e.innerText.trim()).filter(Boolean);
        const rowCount = document.querySelectorAll('[role="row"], tr, [data-testid*="row"]').length;
        const btnCount = document.querySelectorAll('button').length;
        const bodyText = document.body.innerText.slice(0, 1500);
        const emptyStates = [...document.querySelectorAll('*')]
          .filter(el => /no .* yet|no .* found|empty|nothing to/i.test(el.innerText?.slice(0, 60) || ''))
          .slice(0, 3).map(el => el.innerText.slice(0, 80));
        return { h1, h2s, rowCount, btnCount, emptyStates, bodyLen: bodyText.length, bodyPreview: bodyText };
      });

      await page.screenshot({ path: path.join(OUT, `${r.name}.png`), fullPage: false });
      notes.push({ route: r.path, loadMs: elapsed, ...info });
      console.log(`[OK] ${r.path} ${elapsed}ms — h1="${info.h1}" rows=${info.rowCount}`);
    } catch (e) {
      notes.push({ route: r.path, error: e.message.slice(0, 200) });
      console.log(`[ERR] ${r.path}: ${e.message.slice(0, 100)}`);
    }
  }

  // Deep dive: click into first meeting if available
  try {
    await page.goto(BASE + '/meetings', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const meetingLinks = await page.$$('a[href*="/meetings/"]');
    if (meetingLinks.length) {
      await meetingLinks[0].click();
      await page.waitForTimeout(1500);
      const detail = await page.evaluate(() => ({
        url: location.pathname,
        title: document.querySelector('h1,h2')?.innerText?.slice(0, 100),
        tabs: [...document.querySelectorAll('[role="tab"], button')].map(b => b.innerText.trim()).filter(t => t && t.length < 30).slice(0, 20),
        bodyPreview: document.body.innerText.slice(0, 1500),
      }));
      await page.screenshot({ path: path.join(OUT, 'meeting-detail.png'), fullPage: false });
      notes.push({ route: 'meeting-detail-click', ...detail });
    }
  } catch (e) {
    notes.push({ route: 'meeting-detail-click', error: e.message.slice(0, 200) });
  }

  // Personal page regulatory check
  try {
    await page.goto(BASE + '/personal', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const reg = await page.evaluate(() => {
      const bt = document.body.innerText;
      return {
        hasRegulatory: /regulatory|irb|expir/i.test(bt),
        hasOnboarding: /onboarding|welcome|get started/i.test(bt),
        sections: [...document.querySelectorAll('h2, h3')].map(e => e.innerText.trim()).slice(0, 15),
      };
    });
    notes.push({ route: 'personal-deep', ...reg });
  } catch (e) {}

  fs.writeFileSync(path.join(OUT, 'walkthrough-notes.json'), JSON.stringify({ notes, consoleErrors: consoleErrors.slice(0, 20) }, null, 2));
  await browser.close();
  console.log('\nDone. Notes saved.');
})();
