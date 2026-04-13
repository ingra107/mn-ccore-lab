const { chromium } = require('playwright');
const path = require('path');
const OUT = 'C:/Users/ingra/mn-ccore-lab/.audit-scratch/consultant-5';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });

  const steps = [
    { name: '01-dashboard', url: '/dashboard' },
    { name: '02-tasks', url: '/tasks' },
    { name: '03-tasks-overdue', url: '/tasks?filter=overdue' },
    { name: '04-projects', url: '/projects' },
    { name: '05-meetings', url: '/meetings' },
    { name: '06-meeting-prep', url: '/meeting-prep' },
    { name: '07-personal', url: '/personal' },
    { name: '08-pi-analytics', url: '/pi-analytics' },
    { name: '09-mentee-milestones', url: '/mentee-milestones' },
    { name: '10-grants', url: '/grants' },
    { name: '11-manuscripts', url: '/manuscripts' },
    { name: '12-deadlines', url: '/deadlines' },
    { name: '13-deadline-cascade', url: '/deadline-cascade' },
    { name: '14-analytics', url: '/analytics' },
    { name: '15-decisions', url: '/decisions' },
    { name: '16-ideas', url: '/ideas' },
    { name: '17-team', url: '/team' },
    { name: '18-trajectory-nick', url: '/trajectory/nick' },
    { name: '19-member-nick', url: '/team/nick' },
  ];

  // Init dark mode
  await page.goto('https://mn-ccore-lab.pages.dev/dashboard');
  await page.evaluate(() => localStorage.setItem('mn-ccore-theme', 'dark'));
  await page.waitForTimeout(500);

  for (const s of steps) {
    try {
      await page.goto('https://mn-ccore-lab.pages.dev' + s.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, s.name + '.png'), fullPage: true });
      const h1 = await page.locator('h1').first().textContent().catch(() => '(no h1)');
      console.log(s.name, '->', (h1 || '').trim().slice(0, 80));
    } catch (e) {
      console.log(s.name, 'ERROR:', e.message.slice(0, 120));
    }
  }

  console.log('\n--- Console errors:', errs.length);
  errs.slice(0, 20).forEach(e => console.log(' ', e.slice(0, 200)));

  await browser.close();
})();
