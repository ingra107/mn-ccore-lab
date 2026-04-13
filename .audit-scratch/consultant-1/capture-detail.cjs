const { chromium } = require('playwright');
const OUT = 'C:/Users/ingra/mn-ccore-lab/.audit-scratch/consultant-1';
const BASE = 'https://mn-ccore-lab.pages.dev';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE + '/dashboard');
  await page.evaluate(() => localStorage.setItem('mn-ccore-theme', 'dark'));

  // Projects list -> click first
  await page.goto(BASE + '/projects', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const projLink = await page.$('a[href^="/projects/"]');
  if (projLink) {
    const href = await projLink.getAttribute('href');
    console.log('project:', href);
    await page.goto(BASE + href, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/project-detail-dark.png`, fullPage: true });
  }

  // Meetings
  await page.goto(BASE + '/meetings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/meetings-split-dark.png`, fullPage: true });

  // Team member
  await page.goto(BASE + '/team', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const memberLink = await page.$('a[href^="/team/"]');
  if (memberLink) {
    const href = await memberLink.getAttribute('href');
    console.log('member:', href);
    await page.goto(BASE + href, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/member-dark.png`, fullPage: true });
  }

  // Task detail panel - click first task
  await page.goto(BASE + '/my-tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const taskRow = await page.$('[role="row"]');
  if (taskRow) {
    const title = await page.$('[role="row"] [role="gridcell"]');
    if (title) await title.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/task-detail-dark.png`, fullPage: false });
  }

  // Light versions
  await page.evaluate(() => localStorage.setItem('mn-ccore-theme', 'light'));
  await page.goto(BASE + '/projects', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const pl = await page.$('a[href^="/projects/"]');
  if (pl) {
    const href = await pl.getAttribute('href');
    await page.goto(BASE + href, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/project-detail-light.png`, fullPage: true });
  }

  await browser.close();
  console.log('done');
})();
